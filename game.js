/* bessagoncc / deadzone — lightweight WebGL prototype */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const boot=$('boot'),hud=$('hud'),status=$('netstatus');
let renderer,scene,camera,clock,player,car,carBody,carWheels=[],remoteMeshes=new Map(),bullets=[],enemies=[],pickups=[],obstacles=[];
let keys={},locked=false,inCar=false,started=false,roomId='',peer=null,connections=[],isHost=false,solo=false,currentName='driver';
const lobbyNames=new Map();
const mobile={enabled:false,moveX:0,moveY:0,lookId:null,lookX:0,lookY:0,stickId:null,fire:false};
let yaw=0,pitch=0,health=100,kills=0,fireCooldown=0,respawnTimer=0,toastTimer=0,lastBroadcast=0,spawnClock=0;
let score=500,roundNumber=1,roundTime=180,roundBreak=0,weaponIndex=0,viewModel=null,buildMode=false,buildType=0,buildRotation=0,buildPreview=null;const buildPieces=[];
const weapons=[{name:'SIDEARM',damage:1,cooldown:.22,range:48,color:0xd5ff56},{name:'ASSAULT RIFLE',damage:1,cooldown:.095,range:65,color:0xffc857},{name:'HEAVY SHOTGUN',damage:2,cooldown:.62,range:25,color:0xff8855}];
const buildTypes=[{name:'BARRICADE',cost:100,w:2,h:1.6,d:.35},{name:'FLOOR',cost:150,w:2,h:.18,d:2},{name:'TALL WALL',cost:200,w:2,h:2.8,d:.35}];
const peersState=new Map();
const ARENA=42;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mat(color,rough=.85,metal=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal})}
const mats={ground:mat(0x30332c),wall:mat(0x62665b),dark:mat(0x22241f),accent:mat(0xd5ff56,.5),car:mat(0xb5c0a2,.45,.25),tire:mat(0x171916),glass:mat(0x3a514b,.25,.25),enemy:mat(0xc65e42,.6),bullet:mat(0xd5ff56,.35),crate:mat(0x77705c)};
function box(parent,w,h,d,material,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=true;parent.add(m);return m}
function makeViewModel(){
 if(viewModel){camera.remove(viewModel);viewModel=null}
 viewModel=new THREE.Group();viewModel.name='first-person-viewmodel';
 const skin=mat(0xb98564,.9),sleeve=mat(0x33382f,.9),dark=mat(0x191c19,.55,.25),metal=mat(0x747c70,.45,.45),glow=mat(0xd5ff56,.35,.1);
 // Sleeves, forearms and angular gloves stay parented to the camera like a proper FPS viewmodel.
 const leftSleeve=box(viewModel,.19,.25,.34,sleeve,-.3,-.29,-.47);leftSleeve.rotation.z=-.24;
 const rightSleeve=box(viewModel,.2,.24,.34,sleeve,.3,-.28,-.48);rightSleeve.rotation.z=.2;
 box(viewModel,.15,.14,.25,skin,-.25,-.24,-.65);
 box(viewModel,.15,.14,.25,skin,.24,-.22,-.65);
 const gun=new THREE.Group();gun.name='held-weapon';viewModel.add(gun);
 if(weaponIndex===0){
  box(gun,.16,.18,.48,dark,.13,-.14,-.79);
  box(gun,.12,.09,.25,metal,.13,-.055,-.99);
  box(gun,.11,.2,.13,dark,.13,-.29,-.68);
  box(gun,.045,.035,.045,glow,.13,-.04,-.78);
 }else if(weaponIndex===1){
  box(gun,.19,.19,.72,dark,.12,-.14,-.85);
  box(gun,.1,.09,.39,metal,.12,-.07,-1.31);
  box(gun,.13,.22,.18,dark,.12,-.32,-.72);
  box(gun,.17,.2,.24,dark,.12,-.29,-.91);
  box(gun,.05,.035,.1,glow,.12,-.025,-.88);
  box(gun,.07,.08,.18,metal,.12,-.18,-1.2);
 }else{
  box(gun,.23,.2,.62,dark,.12,-.14,-.85);
  box(gun,.17,.1,.48,metal,.12,-.07,-1.27);
  box(gun,.16,.24,.2,dark,.12,-.32,-.74);
  box(gun,.19,.2,.24,dark,.12,-.3,-.92);
  box(gun,.06,.04,.1,glow,.12,-.02,-.88);
 }
 viewModel.userData={gun,baseY:-.29};
 camera.add(viewModel);
}
function updateHud(){
 $('score').textContent=String(score).padStart(5,'0');
 $('round').textContent=String(roundNumber).padStart(2,'0');
 const m=Math.floor(roundTime/60),s=Math.floor(roundTime%60);
 $('roundtimer').textContent=(roundBreak>0?'NEXT WAVE ':'TIME ')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
 $('weapon').textContent=buildMode?'BUILD · '+buildTypes[buildType].name:weapons[weaponIndex].name;
 $('buildstatus').textContent=buildMode?'BUILD MODE · Z/X/C SELECT · R ROTATE · CLICK PLACE':'B · BUILD MODE';
}
function addBuildPiece(type,x,z,rotation,replicated=false){
 const spec=buildTypes[type];if(!spec||!scene)return;
 const material=mat(type===0?0x8d9b79:type===1?0x777b72:0x656f60,.8,.12);
 const mesh=box(scene,spec.w,spec.h,spec.d,material,x,type===1?-.04:spec.h/2,z);
 mesh.rotation.y=rotation;mesh.userData={w:spec.w,d:spec.d,build:true,type};
 buildPieces.push(mesh);obstacles.push(mesh);
 if(!replicated){connections.forEach(c=>{if(c.open)c.send({type:'build',pieceType:type,x,z,rotation})})}
 return mesh;
}
function updateBuildPreview(){
 if(!buildMode||!buildPreview||!camera)return;
 const dir=new THREE.Vector3();camera.getWorldDirection(dir);
 const p=camera.position.clone().addScaledVector(dir,5);
 const x=Math.round(p.x/2)*2,z=Math.round(p.z/2)*2,spec=buildTypes[buildType];
 buildPreview.position.set(x,buildType===1?-.04:spec.h/2,z);buildPreview.rotation.y=buildRotation;
 buildPreview.material.color.set(score>=spec.cost?0xd5ff56:0xff5548);
}
function toggleBuild(){
 buildMode=!buildMode;
 if(buildMode){
  if(!buildPreview){const s=buildTypes[buildType];buildPreview=new THREE.Mesh(new THREE.BoxGeometry(s.w,s.h,s.d),new THREE.MeshBasicMaterial({color:0xd5ff56,wireframe:true,transparent:true,opacity:.8}));scene.add(buildPreview)}
  showToast('BUILD MODE · SELECT A PIECE');
 }else{if(buildPreview)buildPreview.visible=false;showToast(weapons[weaponIndex].name+' EQUIPPED')}
 updateHud();
}
function chooseBuildType(i){
 buildType=(i+buildTypes.length)%buildTypes.length;
 if(buildPreview){scene.remove(buildPreview);buildPreview.geometry.dispose();buildPreview=null}
 if(buildMode){const s=buildTypes[buildType];buildPreview=new THREE.Mesh(new THREE.BoxGeometry(s.w,s.h,s.d),new THREE.MeshBasicMaterial({color:0xd5ff56,wireframe:true,transparent:true,opacity:.8}));scene.add(buildPreview);updateBuildPreview()}
 updateHud();
}
function placeBuildPiece(){
 if(!buildMode||!buildPreview)return;
 const spec=buildTypes[buildType],x=buildPreview.position.x,z=buildPreview.position.z;
 if(score<spec.cost){showToast('NEED '+spec.cost+' SCORE TO BUILD');return}
 if(Math.hypot(x-player.pos.x,z-player.pos.z)<2.2){showToast('TOO CLOSE TO BUILD');return}
 if(Math.hypot(x,z)>40){showToast('OUTSIDE BUILD AREA');return}
 score-=spec.cost;addBuildPiece(buildType,x,z,buildRotation);updateHud();showToast(spec.name+' BUILT · -'+spec.cost);
}

function toggleControls(){const p=$('controls-panel');if(p)p.classList.toggle('hidden')}
function setupMobileControls(){
 const root=$('mobile-controls'),stick=$('mobile-stick'),knob=$('mobile-knob');if(!root||!stick||!knob)return;
 mobile.enabled=('ontouchstart' in window)||navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches;
 if(!mobile.enabled)return;root.classList.remove('hidden');$('crossnote').classList.add('hidden');
 const moveStick=e=>{const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,rad=r.width*.34,len=Math.hypot(dx,dy),scale=len>rad?rad/len:1;mobile.moveX=clamp(dx*scale/rad,-1,1);mobile.moveY=clamp(dy*scale/rad,-1,1);knob.style.transform='translate('+dx*scale+'px,'+dy*scale+'px)'};
 stick.addEventListener('pointerdown',e=>{e.preventDefault();mobile.stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e)});
 stick.addEventListener('pointermove',e=>{if(e.pointerId===mobile.stickId){e.preventDefault();moveStick(e)}});
 const releaseStick=e=>{if(e.pointerId===mobile.stickId){mobile.stickId=null;mobile.moveX=mobile.moveY=0;knob.style.transform='translate(0,0)'}};stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
 renderer.domElement.style.touchAction='none';
 renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.clientX<innerWidth*.48&&e.clientY>innerHeight*.45)return; if(e.pointerType==='touch'){mobile.lookId=e.pointerId;mobile.lookX=e.clientX;mobile.lookY=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId)}});
 renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&e.pointerId===mobile.lookId){const dx=e.clientX-mobile.lookX,dy=e.clientY-mobile.lookY;yaw-=dx*.006;pitch=clamp(pitch-dy*.006,-1.25,1.25);mobile.lookX=e.clientX;mobile.lookY=e.clientY;e.preventDefault()} });
 const releaseLook=e=>{if(e.pointerId===mobile.lookId)mobile.lookId=null};renderer.domElement.addEventListener('pointerup',releaseLook);renderer.domElement.addEventListener('pointercancel',releaseLook);
 const bind=(id,fn)=>{const el=$(id);if(!el)return;el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fn(e)});};
 bind('mobile-fire',()=>{if(buildMode)placeBuildPiece();else fire()});
 bind('mobile-weapon',()=>switchWeapon((weaponIndex+1)%weapons.length));
 bind('mobile-build',()=>toggleBuild());bind('mobile-place',()=>{if(buildMode)placeBuildPiece();else toggleBuild()});bind('mobile-car',()=>toggleCar());bind('mobile-controls-help',()=>toggleControls());
 }
function showToast(t){$('toast').textContent=t;$('toast').classList.add('show');toastTimer=2}
function setup(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x9ba49b);scene.fog=new THREE.Fog(0x9ba49b,38,95);
 camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,.08,160);
 renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;document.body.appendChild(renderer.domElement);renderer.domElement.style.position='absolute';renderer.domElement.style.inset='0';renderer.domElement.style.zIndex='0';
 scene.add(new THREE.HemisphereLight(0xe5e9df,0x34382e,2.2));const sun=new THREE.DirectionalLight(0xffe5bd,2);sun.position.set(-20,35,15);scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(120,120),mats.ground);ground.rotation.x=-Math.PI/2;ground.position.y=-.06;scene.add(ground);
 // Arena floor markings
 for(let i=-4;i<=4;i++){const line=new THREE.Mesh(new THREE.BoxGeometry(84,.015,.035),mat(i===0?0x777b68:0x42463d));line.position.set(0,.01,i*8);scene.add(line);const line2=new THREE.Mesh(new THREE.BoxGeometry(.035,.015,84),mat(0x42463d));line2.position.set(i*8,.011,0);scene.add(line2)}
 // Low perimeter walls
 for(let i=-1;i<=1;i+=2){box(scene,88,3,1,mats.wall,0,1.5,i*44);box(scene,1,3,88,mats.wall,i*44,1.5,0)}
 // Cover, crates, barriers
 const placements=[[-13,-12,4,2,2],[10,-16,3,2,5],[-21,4,2,2,7],[18,8,4,2,2],[-3,20,6,2,2],[3,-3,2,2,7],[25,-25,5,2,2],[-27,-26,4,2,2],[27,27,4,2,2],[-28,26,3,2,5]];
 placements.forEach(([x,z,w,h,d],i)=>{let o=box(scene,w,h,d,i%3===0?mats.crate:mats.wall,x,h/2,z);o.userData={w,d};obstacles.push(o)});
 // lamps and little industrial details
 for(let i=0;i<8;i++){let a=i*Math.PI/4,x=Math.sin(a)*35,z=Math.cos(a)*35;const pole=box(scene,.22,4,.22,mats.dark,x,2,z);box(scene,.7,.14,.7,mats.accent,x,4.1,z)}
 // Player starts at origin; camera is eye-level first-person
 player={pos:new THREE.Vector3(0,0,8),vel:new THREE.Vector3(),health:100,fire:0};
 createCar(5,2,-5);
 for(let i=0;i<5;i++)spawnEnemy();
 for(let i=0;i<4;i++)spawnPickup();
 clock=new THREE.Clock();makeViewModel();updateHud();window.addEventListener('resize',resize);animate();
}
function createCar(x,y,z){
 // Procedural low-poly rally car: body, hood, cabin, glass, bumpers, lamps and detailed wheels.
 car=new THREE.Group();car.position.set(x,0,z);car.rotation.y=-.5;
 carBody=new THREE.Group();car.add(carBody);
 const rubber=mat(0x171916,.95),metal=mat(0x73796e,.42,.55),light=mat(0xf4f0cb,.3,.1);
 box(carBody,2.2,.48,4.35,mats.car,0,.62,0);
 box(carBody,1.82,.22,1.35,mat(0x929d87,.55,.15),0,.92,-1.38);
 box(carBody,1.72,.2,1.1,mats.dark,0,.91,1.48);
 box(carBody,1.48,.67,1.82,mats.glass,0,1.23,-.1);
 box(carBody,1.5,.1,1.88,mats.dark,0,1.58,-.1);
 // Front/rear bumpers and front grille.
 box(carBody,2.22,.2,.2,metal,0,.43,-2.17);
 box(carBody,2.22,.2,.2,metal,0,.43,2.17);
 box(carBody,.72,.23,.045,mats.dark,0,.63,-2.19);
 for(const sx of [-1,1]){
  box(carBody,.34,.17,.1,light,sx*.77,.76,-2.19);
  box(carBody,.32,.15,.1,mats.enemy,sx*.77,.73,2.19);
  box(carBody,.08,.18,1.18,mats.dark,sx*.94,1.03,-.05);
  box(carBody,.08,.18,1.18,mats.dark,sx*.94,1.03,1.03);
  box(carBody,.12,.12,.72,mat(0x8c9580,.5,.2),sx*.83,1.64,-.06);
 }
 // Hood vents, roof detail and a rear utility rack.
 for(let i=0;i<4;i++)box(carBody,.06,.025,.46,mats.dark,(i-1.5)*.17,.994,-1.42);
 box(carBody,1.18,.09,.28,metal,0,1.68,1.25);
 box(carBody,.12,.22,.12,mats.accent,-.72,.78,-2.21);
 box(carBody,.12,.22,.12,mats.accent,.72,.78,-2.21);
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const wheelGroup=new THREE.Group();
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.28,10),rubber);
  tire.rotation.z=Math.PI/2;wheelGroup.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.3,8),metal);
  hub.rotation.z=Math.PI/2;hub.position.x=sx*.015;wheelGroup.add(hub);
  wheelGroup.position.set(sx*1.12,.4,sz*1.28);car.add(wheelGroup);carWheels.push(wheelGroup);
 }
 scene.add(car);
}
function spawnEnemy(){
 // Handmade low-poly raider model assembled from simple meshes (no external asset download).
 const g=new THREE.Group();
 const armor=mat(0x62685c,.8),cloth=mat(0x343a34,.95),skin=mat(0xb88d70,.9),visor=mat(0xd5ff56,.3,.15),gunmat=mat(0x20231f,.65,.2);
 box(g,.62,.76,.38,cloth,0,.88,0);
 box(g,.7,.55,.43,mats.enemy,0,1.02,-.015);
 box(g,.28,.2,.12,armor,0,1.08,-.245);
 box(g,.43,.12,.22,armor,0,.66,0);
 // Head, helmet and luminous visor.
 const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.245,1),skin);head.position.set(0,1.58,0);g.add(head);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.27,7,5,0,Math.PI*2,0,Math.PI*.62),armor);helmet.position.set(0,1.68,0);g.add(helmet);
 box(g,.3,.075,.06,visor,0,1.59,-.23);
 // Shoulder pads, arms, gloves, legs and boots.
 for(const sx of [-1,1]){
  const shoulder=new THREE.Mesh(new THREE.IcosahedronGeometry(.19,0),armor);shoulder.position.set(sx*.43,1.22,0);g.add(shoulder);
  const arm=box(g,.19,.56,.2,cloth,sx*.45,.88,-.015);arm.rotation.z=-sx*.12;
  box(g,.2,.16,.22,gunmat,sx*.45,.57,-.015);
  box(g,.25,.12,.35,armor,sx*.19,.25,0);
  box(g,.27,.16,.39,gunmat,sx*.19,.12,-.025);
 }
 // Compact rifle across the chest.
 const rifle=box(g,.16,.15,.8,gunmat,.25,.91,-.28);rifle.rotation.x=-.08;
 box(g,.1,.1,.42,armor,.25,.81,-.23);
 // Small pack and belt pouches.
 box(g,.5,.56,.2,armor,0,1.02,.25);
 for(const sx of [-1,1])box(g,.14,.2,.12,mats.dark,sx*.25,.75,-.23);
 let p;do{p=new THREE.Vector3((Math.random()-.5)*68,0,(Math.random()-.5)*68)}while(p.length()<12);
 g.position.copy(p);g.userData={hp:3,fire:1+Math.random()*2,speed:1.4+Math.random()*1.2};scene.add(g);enemies.push(g);
}
function spawnPickup(){const g=new THREE.Group();const core=new THREE.Mesh(new THREE.OctahedronGeometry(.48),mats.accent);g.add(core);g.position.set((Math.random()-.5)*62,.8,(Math.random()-.5)*62);g.userData={type:Math.random()<.7?'health':'boost',phase:Math.random()*5};scene.add(g);pickups.push(g)}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.35))}
let pendingJoinConn=null;
function start(mode){
 if(started)return;
 solo=mode==='solo';isHost=mode==='host';
 roomId=$('room').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,24);
 currentName=($('callsign').value.trim()||'driver').slice(0,16);
 if(mode==='host'&&!roomId)roomId='run-'+Math.random().toString(36).slice(2,7);
 if(mode!=='solo'&&!roomId){status.textContent=mode==='join'?'ENTER A ROOM CODE TO JOIN.':'ROOM CODE REQUIRED.';return}
 if(!window.THREE){status.textContent='3D ENGINE DID NOT LOAD. Refresh the page; if it repeats, check your connection or disable content blockers.';return}
 if(mode!=='solo'&&!window.Peer){status.textContent='NETWORK LIBRARY FAILED TO LOAD · REFRESH OR CHECK YOUR CONNECTION';return}
 if(mode==='host'){
  status.textContent='CHECKING ROOM CODE…';
  try{peer=new Peer('bessa-'+roomId+'-host',{debug:1})}catch(err){peer=null;status.textContent='ROOM CODE COULD NOT BE RESERVED · TRY ANOTHER';return}
  peer.on('open',()=>launchGame(mode));
  peer.on('error',e=>{if(!started){status.textContent='ROOM CODE ALREADY IN USE OR UNAVAILABLE · CHOOSE ANOTHER CODE';if(peer){peer.destroy();peer=null}}else console.warn('deadzone network:',e)});
  return;
 }
 if(mode==='join'){
  status.textContent='CHECKING FOR HOST…';
  try{peer=new Peer({debug:1})}catch(err){status.textContent='NETWORK START FAILED · TRY AGAIN';return}
  let finished=false;
  const fail=message=>{if(finished)return;finished=true;status.textContent=message;if(peer){peer.destroy();peer=null}};
  const timeout=setTimeout(()=>fail('HOST NOT FOUND · CHECK THE ROOM CODE AND MAKE SURE THE HOST IS ONLINE'),10000);
  peer.on('open',()=>{const c=peer.connect('bessa-'+roomId+'-host',{reliable:true,serialization:'json'});pendingJoinConn=c;
   c.on('open',()=>{if(finished)return;finished=true;clearTimeout(timeout);launchGame(mode)});
   c.on('error',()=>{clearTimeout(timeout);fail('COULD NOT CONNECT · ROOM DOES NOT EXIST OR IS UNAVAILABLE')});
   c.on('close',()=>{if(!started)fail('HOST DISCONNECTED BEFORE JOINING')});
  });
  peer.on('error',e=>{if(!finished){clearTimeout(timeout);fail('ROOM LOOKUP FAILED · '+(e.type||'NETWORK ERROR').toUpperCase())}});
  return;
 }
 launchGame(mode);
}
function launchGame(mode){
 if(started)return;
 try{setup()}catch(err){
  console.error('deadzone startup failed:',err);
  status.textContent='GAME START FAILED: '+(err&&err.message?err.message:'unknown error')+'. Refresh and try again.';
  if(renderer&&renderer.domElement){renderer.domElement.remove();renderer=null}
  if(peer&&isHost){peer.destroy();peer=null}
  return;
 }
 started=true;
 setupMobileControls();
 $('roomlabel').textContent=solo?'SOLO SESSION':(isHost?'HOST · ':'JOIN · ')+roomId;
 boot.classList.add('hidden');hud.classList.remove('hidden');
 if(!solo)connectRoom(mode);
 $('crossnote').textContent='CLICK TO CAPTURE MOUSE';
}
function connectRoom(mode){
 if(!window.Peer){
  showToast('NETWORK LIBRARY FAILED · SOLO STILL WORKS');
  $('roomlabel').textContent=(isHost?'HOST':'JOIN')+' · NETWORK LIBRARY FAILED';
  return;
 }
 const name=currentName;
 status.textContent='CONNECTING TO ROOM SERVICE…';
 if(!peer){showToast('NETWORK SESSION UNAVAILABLE');return}
 let didOpen=false;const handleOpen=()=>{if(didOpen)return;didOpen=true;
  if(isHost){
   status.textContent='ROOM OPEN · CODE: '+roomId;
   $('roomlabel').textContent='HOST · '+roomId;
   showToast('ROOM OPEN · SHARE CODE '+roomId);
  }else{
   if(pendingJoinConn){wireConn(pendingJoinConn,name);pendingJoinConn=null}
  }
 };
 peer.on('open',handleOpen);if(peer.open)handleOpen();
 peer.on('connection',c=>{if(isHost)wireConn(c,name)});
 peer.on('error',e=>{
  console.warn('deadzone network:',e);
  if(isHost&&e&&(/unavailable-id|taken/i.test(e.type||''))){showToast('ROOM CODE ALREADY IN USE');status.textContent='ROOM CODE ALREADY IN USE · CHOOSE ANOTHER CODE';$('roomlabel').textContent='ROOM CODE IN USE';}
  const type=e&&e.type?e.type:'network error';
  showToast(isHost?'ROOM COULD NOT OPEN · '+type:'CONNECTION FAILED · '+type);
  $('roomlabel').textContent=(isHost?'HOST ERROR · ':'JOIN ERROR · ')+type.toUpperCase();
 });
}
function wireConn(c,name){
 connections.push(c);
 c.on('open',()=>{c.send({type:'hello',name:currentName, pos:{x:player.pos.x,z:player.pos.z},car:inCar,weapon:weaponIndex});showToast('PLAYER CONNECTED')});
 c.on('data',d=>{
  if(!d||typeof d!=='object')return;
  if(d.type==='state'){peersState.set(c.peer,{...d,seen:performance.now()});ensureRemote(c.peer,d.name);updateRemoteWeapon(remoteMeshes.get(c.peer),Number.isInteger(d.weapon)?d.weapon:0)}
  if(d.type==='reject'){showToast(d.reason||'NAME ALREADY IN USE');status.textContent=d.reason||'NAME ALREADY IN USE';if(!isHost){$('roomlabel').textContent='JOIN REJECTED';}c.close();return}
  if(d.type==='shot'&&d.pos)makeTracer(d.pos,d.dir,0xd5ff56);
  if(d.type==='build'&&Number.isInteger(d.pieceType))addBuildPiece(d.pieceType,d.x,d.z,d.rotation||0,true);
  if(d.type==='hello'){
   const incoming=String(d.name||'guest').trim().slice(0,16),normalized=incoming.toLowerCase();
   if(isHost){const used=[currentName.toLowerCase(),...Array.from(lobbyNames.values()).map(n=>n.toLowerCase())];if(used.includes(normalized)){c.send({type:'reject',reason:'CALLSIGN ALREADY IN USE IN THIS LOBBY'});c.close();return}lobbyNames.set(c.peer,incoming)}
   ensureRemote(c.peer,incoming);
  }
 });
 c.on('close',()=>{connections=connections.filter(x=>x!==c);lobbyNames.delete(c.peer);removeRemote(c.peer)});
}
function makeNameTag(name,color){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
 ctx.fillStyle='rgba(12,14,11,.82)';ctx.fillRect(8,18,496,92);ctx.strokeStyle='#'+color.toString(16).padStart(6,'0');ctx.lineWidth=5;ctx.strokeRect(10,20,492,88);
 ctx.font='bold 42px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f3f4ed';ctx.fillText(String(name||'guest').slice(0,16),256,65,460);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.scale.set(2.5,.62,1);sprite.position.y=2.18;return sprite;
}
function ensureRemote(id,name){
 if(remoteMeshes.has(id)){const r=remoteMeshes.get(id);if(name&&r.name!==name){r.name=name;r.mesh.remove(r.tag);r.tag=makeNameTag(name,r.color);r.mesh.add(r.tag)}return}
 const color=new THREE.Color().setHSL(Math.random(),.55,.52),hex=color.getHex(),g=new THREE.Group(),uniform=mat(hex,.85),skin=mat(0xb98564,.9),dark=mat(0x20231f,.75);
 box(g,.62,.78,.38,uniform,0,.91,0);box(g,.24,.22,.23,uniform,-.42,.99,0);box(g,.24,.22,.23,uniform,.42,.99,0);
 const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.24,1),skin);head.position.y=1.55;g.add(head);box(g,.2,.55,.2,uniform,-.2,.42,0);box(g,.2,.55,.2,uniform,.2,.42,0);
 const held=new THREE.Group();g.add(held);const tag=makeNameTag(name||'guest',hex);g.add(tag);scene.add(g);
 const r={mesh:g,name:name||'guest',tag,color:hex,held,weapon:-1};remoteMeshes.set(id,r);updateRemoteWeapon(r,0);
}
function updateRemoteWeapon(r,index){if(!r||r.weapon===index)return;r.weapon=index;r.held.clear();const dark=mat(0x20231f,.65,.2),metal=mat(0x858b7c,.45,.4),glow=mat(0xd5ff56,.35,.1);if(index===0){box(r.held,.13,.15,.38,dark,.35,.95,-.27);box(r.held,.08,.07,.18,metal,.35,1,-.52)}else if(index===1){box(r.held,.15,.15,.66,dark,.35,.95,-.3);box(r.held,.08,.08,.38,metal,.35,1,-.72);box(r.held,.12,.2,.16,dark,.35,.78,-.24)}else{box(r.held,.19,.17,.58,dark,.35,.95,-.28);box(r.held,.15,.09,.36,metal,.35,1,-.7);box(r.held,.12,.18,.16,dark,.35,.78,-.22)}box(r.held,.04,.03,.06,glow,.35,1.05,-.42)}
function removeRemote(id){const r=remoteMeshes.get(id);if(r){scene.remove(r.mesh);remoteMeshes.delete(id)}peersState.delete(id)}
function broadcast(dt){
 lastBroadcast+=dt;if(lastBroadcast<.075)return;lastBroadcast=0;
 if(!peer)return;
 const state={type:'state',name:currentName,weapon:weaponIndex,pos:{x:player.pos.x,z:player.pos.z},yaw,health,inCar,car:inCar?{x:car.position.x,z:car.position.z,rot:car.rotation.y}:null};
 connections.forEach(c=>{if(c.open)c.send(state)});
 for(const [id,s] of peersState){const r=remoteMeshes.get(id);if(r&&s.pos){r.mesh.position.set(s.pos.x,0,s.pos.z);r.mesh.rotation.y=s.yaw||0;updateRemoteWeapon(r,Number.isInteger(s.weapon)?s.weapon:0);if(s.car)r.mesh.visible=false;else r.mesh.visible=true}}
}
function fire(){
 if(fireCooldown>0||!locked||buildMode)return;const weapon=weapons[weaponIndex];fireCooldown=weapon.cooldown;
 const dir=new THREE.Vector3();camera.getWorldDirection(dir);
 const origin=camera.position.clone();makeTracer(origin,dir,weapon.color);
 // Raycast enemies for responsive hitscan combat.
 const ray=new THREE.Raycaster(origin,dir,0,weapon.range),targets=[];enemies.forEach(e=>e.traverse(o=>{if(o.isMesh)targets.push(o)}));
 const hit=ray.intersectObjects(targets,false)[0];
 if(hit){const enemy=enemies.find(e=>{let o=hit.object;while(o&&o.parent!==e)o=o.parent;return o===e});if(enemy){enemy.userData.hp-=weapon.damage;if(enemy.userData.hp<=0){scene.remove(enemy);enemies=enemies.filter(e=>e!==enemy);spawnEnemy();kills++;score+=100;$('kills').textContent=String(kills).padStart(3,'0');updateHud();showToast('TARGET DOWN +100');if(Math.random()<.6)spawnPickup()}}}
 connections.forEach(c=>{if(c.open)c.send({type:'shot',pos:{x:origin.x,y:origin.y,z:origin.z},dir:{x:dir.x,y:dir.y,z:dir.z}})});
}
function makeTracer(pos,dir,color){
 const end=pos.clone().add(dir.clone().multiplyScalar(28)),geom=new THREE.BufferGeometry().setFromPoints([pos,end]);const line=new THREE.Line(geom,new THREE.LineBasicMaterial({color,transparent:true,opacity:.75}));scene.add(line);bullets.push({mesh:line,life:.07});
}
function hitPlayer(){health=Math.max(0,health-8);$('health').textContent=health;$('healthbar').style.width=health+'%';$('hurt').style.opacity='.8';setTimeout(()=>$('hurt').style.opacity='0',100);if(health<=0){health=100;player.pos.set((Math.random()-.5)*10,0,10);player.vel.set(0,0,0);showToast('REDEPLOYED')}}
function update(dt){
 fireCooldown=Math.max(0,fireCooldown-dt);
 if(roundBreak>0){roundBreak=Math.max(0,roundBreak-dt);if(roundBreak===0){roundNumber++;roundTime=180;const wave=2+roundNumber;for(let i=0;i<wave;i++)spawnEnemy();score+=roundNumber*50;showToast('ROUND '+roundNumber+' · WAVE INBOUND');updateHud()}}else{roundTime-=dt;if(roundTime<=0){roundTime=0;roundBreak=8;score+=roundNumber*100;showToast('ROUND CLEAR · BONUS +'+(roundNumber*100));updateHud()}}
 updateHud();if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show')}
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 if(inCar){
  const accel=(keys.KeyW?1:0)-(keys.KeyS?1:0),steer=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  car.userData.speed=(car.userData.speed||0)+accel*dt*18;car.userData.speed*=Math.pow(keys.Space ? 0.91 : 0.985, dt * 60);car.userData.speed=clamp(car.userData.speed,-9,23);
  car.rotation.y-=steer*dt*(.8+Math.abs(car.userData.speed)*.045)*(car.userData.speed<0?-1:1);
  const f=new THREE.Vector3(-Math.sin(car.rotation.y),0,-Math.cos(car.rotation.y));car.position.addScaledVector(f,car.userData.speed*dt);
  car.position.x=clamp(car.position.x,-40,40);car.position.z=clamp(car.position.z,-40,40);
  carWheels.forEach(w=>w.rotation.x+=car.userData.speed*dt*2);
  player.pos.set(car.position.x,0,car.position.z);yaw=car.rotation.y;
  camera.position.set(car.position.x,1.28,car.position.z);camera.rotation.order='YXZ';camera.rotation.set(0,yaw,0);if(viewModel)viewModel.visible=false;
  $('speed').textContent=Math.round(Math.abs(car.userData.speed)*7)+' KM/H';$('weapon').textContent='VEHICLE';
 }else{
  let move=new THREE.Vector3();if(keys.KeyW)move.add(forward);if(keys.KeyS)move.sub(forward);if(keys.KeyD)move.add(right);if(keys.KeyA)move.sub(right);if(mobile.enabled){move.addScaledVector(forward,-mobile.moveY);move.addScaledVector(right,mobile.moveX)}if(move.lengthSq())move.normalize();
  player.vel.x+=(move.x*10-player.vel.x)*Math.min(1,dt*12);player.vel.z+=(move.z*10-player.vel.z)*Math.min(1,dt*12);
  player.pos.addScaledVector(player.vel,dt);player.pos.x=clamp(player.pos.x,-41,41);player.pos.z=clamp(player.pos.z,-41,41);
  camera.position.set(player.pos.x,1.68,player.pos.z);camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);
  if(viewModel){viewModel.visible=true;viewModel.position.y=viewModel.userData.baseY+Math.sin(clock.elapsedTime*10)*.008*(player.vel.length()>.4?1:0);}
  $('speed').textContent='ON FOOT';
 }
 // Simple collision resolution against cover boxes.
 if(!inCar){for(const o of obstacles){const p=o.position,w=o.userData.w/2+.4,d=o.userData.d/2+.4;if(Math.abs(player.pos.x-p.x)<w&&Math.abs(player.pos.z-p.z)<d){const dx=Math.abs(player.pos.x-p.x)/w,dz=Math.abs(player.pos.z-p.z)/d;if(dx>dz)player.pos.x=p.x+Math.sign(player.pos.x-p.x)*w;else player.pos.z=p.z+Math.sign(player.pos.z-p.z)*d}}}
 // Enemies pursue and shoot; keep AI cheap and deterministic.
 enemies.forEach(e=>{const d=new THREE.Vector3(player.pos.x-e.position.x,0,player.pos.z-e.position.z),len=d.length();if(len>2.8){d.normalize();e.position.addScaledVector(d,e.userData.speed*dt);e.rotation.y=Math.atan2(-d.x,-d.z)}e.userData.fire-=dt;if(e.userData.fire<=0&&len<22){e.userData.fire=1.1+Math.random()*1.2;if(Math.random()<.24)hitPlayer()}});
 pickups.forEach(p=>{p.rotation.y+=dt*1.5;p.position.y=.8+Math.sin(clock.elapsedTime*2+p.userData.phase)*.16;if(p.position.distanceTo(new THREE.Vector3(player.pos.x,.8,player.pos.z))<1.6){if(p.userData.type==='health'){health=Math.min(100,health+25);$('health').textContent=health;$('healthbar').style.width=health+'%';showToast('VITALS +25')}else{if(inCar)car.userData.speed=Math.min(25,(car.userData.speed||0)+8);else player.vel.multiplyScalar(1.8);showToast('BOOST CHARGED')}scene.remove(p);pickups=pickups.filter(x=>x!==p);spawnPickup()}});
 bullets.forEach(b=>{b.life-=dt;if(b.life<=0){scene.remove(b.mesh);b.dead=true}});bullets=bullets.filter(b=>!b.dead);
 $('hint').textContent=inCar?'E · EXIT VEHICLE':'E · ENTER VEHICLE';$('health').textContent=health;$('healthbar').style.width=health+'%';
 updateBuildPreview();if(buildPreview)buildPreview.visible=buildMode;
 broadcast(dt);
}
function animate(){requestAnimationFrame(animate);if(!started)return;const dt=Math.min(clock.getDelta(),.04);update(dt);renderer.render(scene,camera)}
function switchWeapon(i){weaponIndex=(i+weapons.length)%weapons.length;makeViewModel();updateHud();showToast(weapons[weaponIndex].name+' EQUIPPED')}
function toggleCar(){if(!car)return;if(!inCar&&player.pos.distanceTo(new THREE.Vector3(car.position.x,0,car.position.z))<4){inCar=true;car.userData.speed=0;showToast('VEHICLE ACQUIRED')}else if(inCar){inCar=false;player.pos.x=car.position.x+Math.cos(car.rotation.y)*2;player.pos.z=car.position.z-Math.sin(car.rotation.y)*2;showToast('ON FOOT')}}
document.addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyE'&&started)toggleCar();if(!started)return;if(e.code==='Equal'||e.code==='NumpadAdd'){toggleControls();e.preventDefault()}if(e.code==='Digit1')switchWeapon(0);if(e.code==='Digit2')switchWeapon(1);if(e.code==='Digit3')switchWeapon(2);if(e.code==='KeyB')toggleBuild();if(buildMode&&e.code==='KeyZ')chooseBuildType(0);if(buildMode&&e.code==='KeyX')chooseBuildType(1);if(buildMode&&e.code==='KeyC')chooseBuildType(2);if(buildMode&&e.code==='KeyR'){buildRotation+=Math.PI/4;updateBuildPreview()}if(e.code==='Escape')document.exitPointerLock?.()});
document.addEventListener('keyup',e=>keys[e.code]=false);
document.addEventListener('mousemove',e=>{if(locked){yaw-=e.movementX*.0022;pitch=clamp(pitch-e.movementY*.0022,-1.35,1.35)}});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer?.domElement;$('crossnote').style.display=locked?'none':'block'});
document.addEventListener('mousedown',e=>{if(!started)return;if(!locked){renderer.domElement.requestPointerLock?.();return}if(e.button===0){if(buildMode)placeBuildPiece();else fire()}});
$('host').addEventListener('click',()=>start('host'));$('join').addEventListener('click',()=>start('join'));$('solo').addEventListener('click',()=>start('solo'));
$('leave').addEventListener('click',()=>{if(peer)peer.destroy();location.reload()});
$('close-controls')?.addEventListener('click',toggleControls);
})();
