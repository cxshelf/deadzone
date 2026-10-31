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
let score=500,roundNumber=1,roundTime=180,roundBreak=0,weaponIndex=0,viewModel=null,buildMode=false,buildType=0,buildRotation=0,buildPreview=null;const buildPieces=[];let hurtShake=0,jumpVelocity=0,groundY=0,fireAnim=0,footstepTimer=0,engineSoundTimer=0;const playerHeight=1.68;
let audioCtx=null,masterGain=null,soundEnabled=true,noiseBuffer=null;
let ammo=[12,30,6],reloadT=0,reloadMax=1,recoil=0,flashT=0,swayX=0,swayY=0,dead=false,deaths=0,protect=0,pvp=false,pveState='break',pveTimer=4,toSpawn=0,spawnT=0,boardT=0,parts=[],dying=[],sprintOn=false,carBeacon=null,curMap='yard',mapSeed=1,mapObjs=[],voting=false,voteT=0,votes={},myVote=null,matchStarted=false,lastTally={yard:0,store:0,dealer:0};const floorTex={},pvpScores={},PVP_TARGET=15;
function initAudio(){if(!soundEnabled)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;if(!audioCtx){audioCtx=new AC();masterGain=audioCtx.createGain();masterGain.gain.value=.48;masterGain.connect(audioCtx.destination);const n=Math.floor(audioCtx.sampleRate*.35);noiseBuffer=audioCtx.createBuffer(1,n,audioCtx.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<n;i++)data[i]=Math.random()*2-1}if(audioCtx.state==='suspended')audioCtx.resume()}catch(e){console.warn('Audio unavailable',e)}}
function playSound(type){if(!soundEnabled)return;initAudio();if(!audioCtx||!masterGain)return;const t=audioCtx.currentTime;const noise=(duration,volume,cutoff=3000)=>{const src=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();src.buffer=noiseBuffer;filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,t);filter.frequency.exponentialRampToValueAtTime(Math.max(120,cutoff*.22),t+duration);gain.gain.setValueAtTime(Math.max(.0001,volume),t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);src.connect(filter);filter.connect(gain);gain.connect(masterGain);src.start(t);src.stop(t+duration)};const tone=(freq,end,duration,volume=.12,wave='sine',delay=0)=>{const o=audioCtx.createOscillator(),gain=audioCtx.createGain();o.type=wave;o.frequency.setValueAtTime(freq,t+delay);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+delay+duration);gain.gain.setValueAtTime(.0001,t+delay);gain.gain.linearRampToValueAtTime(volume,t+delay+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+delay+duration);o.connect(gain);gain.connect(masterGain);o.start(t+delay);o.stop(t+delay+duration+.015)};switch(type){case'fire':noise(weaponIndex===2?.22:.12,weaponIndex===2?.34:.23,weaponIndex===0?4200:2600);tone(weaponIndex===2?105:weaponIndex===1?145:190,48,weaponIndex===2?.19:.1,.23,'sawtooth');tone(weaponIndex===0?1100:weaponIndex===1?780:420,180,.045,.075,'square',.005);break;case'hit':tone(680,280,.09,.15,'triangle');noise(.045,.09,2200);break;case'kill':tone(520,780,.13,.13,'sine');tone(780,1100,.18,.12,'sine',.09);break;case'enemy-fire':noise(.12,.12,1800);tone(130,65,.1,.12,'sawtooth');break;case'damage':noise(.25,.2,800);tone(105,45,.25,.22,'sawtooth');break;case'jump':tone(220,440,.15,.1,'triangle');noise(.09,.06,1100);break;case'pickup':tone(660,880,.11,.12,'sine');tone(880,1320,.16,.1,'sine',.08);break;case'build':noise(.1,.14,900);tone(115,65,.12,.16,'triangle');break;case'switch':tone(900,620,.045,.08,'square');tone(620,880,.06,.07,'square',.05);break;case'car-on':tone(75,125,.3,.18,'sawtooth');tone(130,185,.2,.08,'triangle',.12);break;case'car-off':tone(160,55,.25,.12,'sawtooth');break;case'step':noise(.055,.045,480);tone(85,55,.045,.035,'triangle');break;case'ui':tone(540,700,.06,.06,'sine');break;case'error':tone(220,130,.15,.1,'square');break;}}
function toneCarEngine(){if(!soundEnabled||!audioCtx)return;const t=audioCtx.currentTime,o=audioCtx.createOscillator(),gain=audioCtx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(48+Math.min(95,Math.abs(car?.userData?.speed||0)*4),t);o.frequency.exponentialRampToValueAtTime(38+Math.min(65,Math.abs(car?.userData?.speed||0)*3),t+.18);gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(.045,t+.025);gain.gain.exponentialRampToValueAtTime(.0001,t+.22);o.connect(gain);gain.connect(masterGain);o.start(t);o.stop(t+.23)}
function toggleSound(){soundEnabled=!soundEnabled;if(soundEnabled){initAudio();playSound('ui')}const b=$('sound-toggle');if(b){b.textContent=soundEnabled?'SOUND ON':'SOUND OFF';b.setAttribute('aria-pressed',String(soundEnabled))}}
const weapons=[{name:'SIDEARM',damage:1,edmg:1,pd:26,mag:12,pellets:1,spread:.004,kick:.7,rl:1,cooldown:.22,range:60,color:0xd5ff56},{name:'ASSAULT RIFLE',damage:1,edmg:1,pd:15,mag:30,pellets:1,spread:.012,kick:.45,rl:1.5,cooldown:.095,range:90,color:0xffc857},{name:'HEAVY SHOTGUN',damage:2,edmg:.7,pd:11,mag:6,pellets:7,spread:.06,kick:1.6,rl:2.1,cooldown:.7,range:34,color:0xff8855}];
const buildTypes=[{name:'BARRICADE',cost:100,w:2,h:1.6,d:.35},{name:'FLOOR',cost:150,w:2,h:.18,d:2},{name:'TALL WALL',cost:200,w:2,h:2.8,d:.35}];
const peersState=new Map();
const ARENA=42;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mat(color,rough=.85,metal=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal})}
const mats={ground:mat(0x30332c),wall:mat(0x62665b),dark:mat(0x22241f),accent:mat(0xd5ff56,.5),car:mat(0xb5c0a2,.45,.25),tire:mat(0x171916),glass:mat(0x3a514b,.25,.25),enemy:mat(0xc65e42,.6),bullet:mat(0xd5ff56,.35),crate:mat(0x77705c)};
function box(parent,w,h,d,material,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function makeViewModel(){
 if(viewModel){camera.remove(viewModel);viewModel=null}
 viewModel=new THREE.Group();viewModel.name='first-person-viewmodel';
 const skin=mat(0xb98564,.9),sleeve=mat(0x33382f,.9),dark=mat(0x191c19,.55,.25),metal=mat(0x747c70,.45,.45),glow=mat(0xd5ff56,.35,.1);
 // Sleeves, forearms and angular gloves stay parented to the camera like a proper FPS viewmodel.
 const leftSleeve=box(viewModel,.22,.28,.4,sleeve,-.34,-.34,-.48);leftSleeve.rotation.z=-.28;
 const rightSleeve=box(viewModel,.23,.29,.42,sleeve,.35,-.32,-.5);rightSleeve.rotation.z=.2;
 box(viewModel,.16,.15,.24,skin,-.24,-.24,-.66);
 box(viewModel,.16,.15,.24,skin,.25,-.22,-.67);
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
 const flash=new THREE.Mesh(new THREE.PlaneGeometry(.36,.36),new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending}));flash.position.set(weaponIndex===0?.13:.12,-.07,weaponIndex===0?-1.08:-1.55);flash.visible=false;gun.add(flash);
 viewModel.scale.setScalar(1.22);viewModel.traverse(o=>{o.castShadow=false});viewModel.userData={gun,flash,leftSleeve,rightSleeve,baseY:-.27,baseX:0};
 camera.add(viewModel);
}
function updateHud(){
 $('score').textContent=String(score).padStart(5,'0');
 if(pvp){$('lbl-round').textContent='FRAGS';$('round').textContent=String(pvpScores[currentName]||0).padStart(2,'0');$('lbl-timer').textContent='FIRST TO '+PVP_TARGET;const top=Object.entries(pvpScores).sort((a,b)=>b[1]-a[1])[0];$('roundtimer').textContent=top?top[0].slice(0,8).toUpperCase()+' '+top[1]:'--'}
 else{const br=pveState==='break';$('lbl-round').textContent='ROUND';$('round').textContent=String(roundNumber).padStart(2,'0');$('lbl-timer').textContent=br?'NEXT ROUND':'HOSTILES';$('roundtimer').textContent=br?String(Math.max(0,Math.ceil(pveTimer))).padStart(2,'0')+'S':String(toSpawn+enemies.length).padStart(2,'0')}
 const w=weapons[weaponIndex];
 $('weapon').textContent=buildMode?'BUILD · '+buildTypes[buildType].name:w.name+' '+(reloadT>0?'RELOADING':ammo[weaponIndex]+'/'+w.mag);
 $('buildstatus').textContent=buildMode?'BUILD MODE · Z/X/C SELECT · R ROTATE · CLICK PLACE':'B · BUILD MODE';
}
function addBuildPiece(type,x,z,rotation,replicated=false){
 const spec=buildTypes[type];if(!spec||!scene)return;
 const material=mat(type===0?0x8d9b79:type===1?0x777b72:0x656f60,.8,.12);
 const mesh=box(scene,spec.w,spec.h,spec.d,material,x,type===1?-.04:spec.h/2,z);
 mesh.rotation.y=rotation;const hp=Math.max(3,Math.round(spec.w*spec.h*spec.d*2));mesh.userData={w:spec.w,d:spec.d,h:spec.h,hp,maxHp:hp,build:true,cover:true,type};
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
 if(score<spec.cost){playSound('error');showToast('NEED '+spec.cost+' SCORE TO BUILD');return}
 if(Math.hypot(x-player.pos.x,z-player.pos.z)<2.2){showToast('TOO CLOSE TO BUILD');return}
 if(Math.hypot(x,z)>78){showToast('OUTSIDE BUILD AREA');return}
 score-=spec.cost;playSound('build');addBuildPiece(buildType,x,z,buildRotation);updateHud();showToast(spec.name+' BUILT · -'+spec.cost);
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
 bind('mobile-fire',()=>{initAudio();if(buildMode)placeBuildPiece();else fire()});
 bind('mobile-weapon',()=>switchWeapon((weaponIndex+1)%weapons.length));
 bind('mobile-build',()=>toggleBuild());bind('mobile-place',()=>{if(buildMode)placeBuildPiece();else toggleBuild()});bind('mobile-jump',()=>{initAudio();if(!inCar&&groundY<=0&&jumpVelocity===0){jumpVelocity=6.3;playSound('jump')}});bind('mobile-car',()=>toggleCar());bind('mobile-controls-help',()=>toggleControls());bind('mobile-sprint',()=>setSprint(!sprintOn));
 }
function showToast(t){$('toast').textContent=t;$('toast').classList.add('show');toastTimer=2}
function setup(){
 scene=new THREE.Scene();scene.background=makeSky();scene.fog=new THREE.Fog(0xc4cdc2,70,240);
 camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,.08,420);scene.add(camera);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;document.body.appendChild(renderer.domElement);renderer.domElement.style.position='absolute';renderer.domElement.style.inset='0';renderer.domElement.style.zIndex='0';
 scene.add(new THREE.HemisphereLight(0xe5e9df,0x34382e,2.2));const sun=new THREE.DirectionalLight(0xffe5bd,2.4);sun.position.set(-50,80,30);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);const sc=sun.shadow.camera;sc.left=-95;sc.right=95;sc.top=95;sc.bottom=-95;sc.near=1;sc.far=220;sun.shadow.bias=-.0005;scene.add(sun);
 mats.ground.map=makeGroundTex();mats.ground.color.set(0xffffff);const ground=new THREE.Mesh(new THREE.PlaneGeometry(320,320),mats.ground);ground.receiveShadow=true;ground.rotation.x=-Math.PI/2;ground.position.y=-.06;scene.add(ground);
 buildMap('yard',pvp?1:1+Math.floor(Math.random()*1e9));
 // Player starts at origin; camera is eye-level first-person
 player={pos:new THREE.Vector3(0,0,8),vel:new THREE.Vector3(),health:100,fire:0};
 createCar(5,2,-5);
 makeScenery();
 for(let i=0;i<10;i++)spawnPickup();
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
 carBeacon=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,40,8,1,true),new THREE.MeshBasicMaterial({color:0xd5ff56,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));scene.add(carBeacon);
 scene.add(car);
}
function spawnEnemy(boss){
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
 let p;do{p=new THREE.Vector3((Math.random()-.5)*150,0,(Math.random()-.5)*150)}while(p.distanceTo(player.pos)<32);
 g.position.copy(p);const hp=(3+Math.floor(Math.random()*3)+Math.floor(roundNumber*.6))*(boss?5:1),healthBar=makeHealthBar(hp,hp),arms=[];healthBar.position.y=2.35;g.add(healthBar);g.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.type==='BoxGeometry'&&o.geometry.parameters.height===.56)arms.push(o)});g.userData={hp,maxHp:hp,healthBar,fire:.7+Math.random()*1.5,speed:(1.4+Math.random()*1.2+Math.min(roundNumber*.12,2))*(boss?.7:1),boss:!!boss,arms,shootTime:0,rifle};g.rotation.order='YXZ';if(boss){g.scale.setScalar(1.55);g.traverse(o=>{if(o.isMesh&&o.material===mats.enemy)o.material=mat(0x8a1f1f,.5)})}scene.add(g);enemies.push(g);
}
function makeHealthBar(hp,maxHp){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=48;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(12,14,11,.82)';ctx.fillRect(0,0,256,48);ctx.strokeStyle='#f1f0e8';ctx.strokeRect(2,2,252,44);ctx.fillStyle='#d5ff56';ctx.fillRect(6,6,244*clamp(hp/maxHp,0,1),36);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.scale.set(1.25,.24,1);sprite.userData={canvas,ctx,tex,last:hp};return sprite}
function refreshHealthBar(sprite,hp,maxHp){if(!sprite||sprite.userData.last===hp)return;const {canvas,ctx,tex}=sprite.userData;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='rgba(12,14,11,.82)';ctx.fillRect(0,0,256,48);ctx.strokeStyle='#f1f0e8';ctx.strokeRect(2,2,252,44);ctx.fillStyle=hp/maxHp>.5?'#d5ff56':hp/maxHp>.25?'#ffc857':'#ff5548';ctx.fillRect(6,6,244*clamp(hp/maxHp,0,1),36);tex.needsUpdate=true;sprite.userData.last=hp}
function spawnPickup(px,pz){const g=new THREE.Group();const core=new THREE.Mesh(new THREE.OctahedronGeometry(.48),mats.accent);g.add(core);g.position.set(px!==undefined?px:(Math.random()-.5)*140,.8,pz!==undefined?pz:(Math.random()-.5)*140);g.userData={type:Math.random()<.7?'health':'boost',phase:Math.random()*5};scene.add(g);pickups.push(g)}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75))}
let pendingJoinConn=null;
function start(mode){
 if(started)return;
 solo=mode==='solo';isHost=mode==='host';pvp=isHost&&!!$('mode')&&$('mode').value==='pvp';
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
 boot.classList.add('hidden');hud.classList.remove('hidden');if(pvp)setPvp(true);
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
 const held=new THREE.Group();g.add(held);const tag=makeNameTag(name||'guest',hex);tag.position.y=2.18;g.add(tag);const healthBar=makeHealthBar(100,100);healthBar.position.y=2.48;g.add(healthBar);if(pvp){tag.material.depthTest=true;healthBar.material.depthTest=true}g.rotation.order='YXZ';scene.add(g);
 const r={first:true,seen:performance.now(),tx:0,tz:0,tyaw:0,dead:false,inCar:false,mesh:g,name:name||'guest',tag,healthBar,color:hex,held,weapon:-1};remoteMeshes.set(id,r);updateRemoteWeapon(r,0);
}
function updateRemoteWeapon(r,index){if(!r||r.weapon===index)return;r.weapon=index;r.held.clear();const dark=mat(0x20231f,.65,.2),metal=mat(0x858b7c,.45,.4),glow=mat(0xd5ff56,.35,.1);if(index===0){box(r.held,.13,.15,.38,dark,.35,.95,-.27);box(r.held,.08,.07,.18,metal,.35,1,-.52)}else if(index===1){box(r.held,.15,.15,.66,dark,.35,.95,-.3);box(r.held,.08,.08,.38,metal,.35,1,-.72);box(r.held,.12,.2,.16,dark,.35,.78,-.24)}else{box(r.held,.19,.17,.58,dark,.35,.95,-.28);box(r.held,.15,.09,.36,metal,.35,1,-.7);box(r.held,.12,.18,.16,dark,.35,.78,-.22)}box(r.held,.04,.03,.06,glow,.35,1.05,-.42)}
function removeRemote(id){const r=remoteMeshes.get(id);if(r){scene.remove(r.mesh);if(r.carMesh)scene.remove(r.carMesh);remoteMeshes.delete(id)}peersState.delete(id)}
function makeTracer(pos,dir,color){
 const end=pos.clone().add(dir.clone().multiplyScalar(28)),geom=new THREE.BufferGeometry().setFromPoints([pos,end]);const line=new THREE.Line(geom,new THREE.LineBasicMaterial({color,transparent:true,opacity:.75}));scene.add(line);bullets.push({mesh:line,life:.07});
}
function update(dt){
 fireCooldown=Math.max(0,fireCooldown-dt);fireAnim=Math.max(0,fireAnim-dt);hurtShake=Math.max(0,hurtShake-dt*2.8);if(!inCar&&keys.Space&&groundY<=0&&jumpVelocity===0){jumpVelocity=6.3;playSound('jump')};if(!inCar&&(jumpVelocity!==0||groundY>0)){groundY+=jumpVelocity*dt;jumpVelocity-=18*dt;if(groundY<=0){groundY=0;jumpVelocity=0}}
 roundLogic(dt);stepState(dt);updateFx(dt);remoteSmooth(dt);
 updateHud();if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show')}
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 if(inCar){
  const accel=clamp((keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-(mobile.enabled?mobile.moveY:0),-1,1),steer=clamp((keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+(mobile.enabled?mobile.moveX:0),-1,1);
  car.userData.speed=(car.userData.speed||0)+accel*dt*18;car.userData.speed*=Math.pow(keys.Space ? 0.91 : 0.985, dt * 60);car.userData.speed=clamp(car.userData.speed,-9,23);
  car.rotation.y-=steer*dt*(.8+Math.abs(car.userData.speed)*.045)*(car.userData.speed<0?-1:1);
  const f=new THREE.Vector3(-Math.sin(car.rotation.y),0,-Math.cos(car.rotation.y));car.position.addScaledVector(f,car.userData.speed*dt);
  for(const o of obstacles){const w=o.userData.w/2+1.3,d=o.userData.d/2+1.3,q=o.position;if(Math.abs(car.position.x-q.x)<w&&Math.abs(car.position.z-q.z)<d){const dx=Math.abs(car.position.x-q.x)/w,dz=Math.abs(car.position.z-q.z)/d;if(dx>dz)car.position.x=q.x+(Math.sign(car.position.x-q.x)||1)*w;else car.position.z=q.z+(Math.sign(car.position.z-q.z)||1)*d;car.userData.speed*=-.35}}car.position.x=clamp(car.position.x,-80,80);car.position.z=clamp(car.position.z,-80,80);
  carWheels.forEach(w=>w.rotation.x+=car.userData.speed*dt*2);if(Math.abs(car.userData.speed)>2){engineSoundTimer-=dt;if(engineSoundTimer<=0){toneCarEngine();engineSoundTimer=.65}}
  player.pos.set(car.position.x,0,car.position.z);yaw=car.rotation.y;
  camera.position.set(car.position.x,1.28,car.position.z);camera.rotation.order='YXZ';camera.rotation.set(0,yaw,0);if(viewModel)viewModel.visible=false;
  $('speed').textContent=Math.round(Math.abs(car.userData.speed)*7)+' KM/H';$('weapon').textContent='VEHICLE';
 }else{
  let move=new THREE.Vector3();if(keys.KeyW)move.add(forward);if(keys.KeyS)move.sub(forward);if(keys.KeyD)move.add(right);if(keys.KeyA)move.sub(right);if(mobile.enabled){move.addScaledVector(forward,-mobile.moveY);move.addScaledVector(right,mobile.moveX)}if(dead||voting)move.set(0,0,0);if(move.lengthSq())move.normalize();
  if(sprintOn&&!move.lengthSq())setSprint(false);const spd=((keys.ShiftLeft||keys.ShiftRight||sprintOn)&&!buildMode)?15:10;player.vel.x+=(move.x*spd-player.vel.x)*Math.min(1,dt*12);player.vel.z+=(move.z*spd-player.vel.z)*Math.min(1,dt*12);
  player.pos.addScaledVector(player.vel,dt);if(player.vel.length()>.8&&groundY<=0){footstepTimer-=dt;if(footstepTimer<=0){playSound('step');footstepTimer=.38}}else footstepTimer=0;player.pos.x=clamp(player.pos.x,-81,81);player.pos.z=clamp(player.pos.z,-81,81);
  camera.position.set(player.pos.x,(dead?.5:playerHeight)+groundY,player.pos.z);if(hurtShake>0){camera.position.x+=(Math.random()-.5)*hurtShake*.24;camera.position.y+=(Math.random()-.5)*hurtShake*.18}camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,dead?.6:0);
  animViewModel(dt);
  $('speed').textContent='ON FOOT';
 }
 // Simple collision resolution against cover boxes.
 if(!inCar){for(const o of obstacles){const p=o.position,w=o.userData.w/2+.4,d=o.userData.d/2+.4;if(Math.abs(player.pos.x-p.x)<w&&Math.abs(player.pos.z-p.z)<d){const dx=Math.abs(player.pos.x-p.x)/w,dz=Math.abs(player.pos.z-p.z)/d;if(dx>dz)player.pos.x=p.x+Math.sign(player.pos.x-p.x)*w;else player.pos.z=p.z+Math.sign(player.pos.z-p.z)*d}}}
 // Enemies pursue, raise rifles when shooting, and are blocked by cover.
 enemies.forEach(e=>{e.position.y=Math.abs(Math.sin(clock.elapsedTime*7+e.id))*.06;const d=new THREE.Vector3(player.pos.x-e.position.x,0,player.pos.z-e.position.z),len=d.length();if(len>2.8){d.normalize();e.position.addScaledVector(d,e.userData.speed*dt);e.rotation.y=Math.atan2(-d.x,-d.z)}e.userData.fire-=dt;if(e.userData.shootTime>0){e.userData.shootTime-=dt;e.userData.arms.forEach(a=>a.rotation.x=-.65);e.userData.rifle.position.z=-.16}else{e.userData.arms.forEach(a=>a.rotation.x=0);e.userData.rifle.position.z=-.28}if(e.userData.fire<=0&&len<26&&!dead){e.userData.fire=1.1+Math.random()*1.2;e.userData.shootTime=.22;const muzzle=e.position.clone().add(new THREE.Vector3(-Math.sin(e.rotation.y)*.7,1.05,-Math.cos(e.rotation.y)*.7)),aim=new THREE.Vector3(player.pos.x,1.35,player.pos.z).sub(muzzle).normalize();makeTracer(muzzle,aim,0xff8855);const block=new THREE.Raycaster(muzzle,aim,0,len).intersectObjects(obstacles.filter(o=>o.visible&&o.userData&&o.userData.hp>0),false)[0];playSound('enemy-fire');if(!block&&Math.random()<.42)hitPlayer(5+Math.min(roundNumber,8)+(e.userData.boss?9:0),'a raider')}});
 pickups.forEach(p=>{p.rotation.y+=dt*1.5;p.position.y=.8+Math.sin(clock.elapsedTime*2+p.userData.phase)*.16;if(p.position.distanceTo(new THREE.Vector3(player.pos.x,.8,player.pos.z))<1.6){if(p.userData.type==='health'){health=Math.min(100,health+25);$('health').textContent=health;$('healthbar').style.width=health+'%';playSound('pickup');showToast('VITALS +25')}else{if(inCar)car.userData.speed=Math.min(25,(car.userData.speed||0)+8);else player.vel.multiplyScalar(1.8);playSound('pickup');showToast('BOOST CHARGED')}scene.remove(p);pickups=pickups.filter(x=>x!==p);spawnPickup()}});
 bullets.forEach(b=>{b.life-=dt;if(b.life<=0){scene.remove(b.mesh);b.dead=true}});bullets=bullets.filter(b=>!b.dead);
 {const cd=Math.round(Math.hypot(player.pos.x-car.position.x,player.pos.z-car.position.z));$('hint').textContent=inCar?'E · EXIT VEHICLE':cd<5?'E · ENTER VEHICLE':'CAR '+cd+'M · FOLLOW GREEN BEAM'}$('health').textContent=health;$('healthbar').style.width=health+'%';
 updateBuildPreview();if(buildPreview)buildPreview.visible=buildMode;
 broadcast(dt);
}
const send=m=>{connections.forEach(c=>{if(c.open)c.send(m)})};
function makeSky(){const c=document.createElement('canvas');c.width=2;c.height=256;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#4f7fb8');gr.addColorStop(.6,'#a9c4d6');gr.addColorStop(1,'#cfd8cc');g.fillStyle=gr;g.fillRect(0,0,2,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function makeGroundTex(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#3b4034';g.fillRect(0,0,256,256);for(let i=0;i<2600;i++){g.fillStyle=Math.random()<.5?'rgba(20,24,16,.22)':'rgba(120,130,100,.14)';g.fillRect(Math.random()*256,Math.random()*256,1+Math.random()*3,1+Math.random()*3)}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(70,70);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
function makeScenery(){
 const hm=mat(0x56624f,1),rk=mat(0x6d7164,.95);
 for(let i=0;i<30;i++){const a=i/30*Math.PI*2+Math.random()*.2,r=125+Math.random()*50,h=14+Math.random()*34,w=22+Math.random()*26,m=new THREE.Mesh(new THREE.ConeGeometry(w,h,5+Math.floor(Math.random()*3)),hm);m.position.set(Math.sin(a)*r,h/2-1,Math.cos(a)*r);m.rotation.y=Math.random()*6;scene.add(m)}
 for(let i=0;i<40;i++){const side=Math.random()<.5,o=(Math.random()<.5?-1:1)*(90+Math.random()*25),u=(Math.random()-.5)*230,s=1+Math.random()*3,m=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),rk);m.position.set(side?o:u,s*.4,side?u:o);m.rotation.set(Math.random()*3,Math.random()*3,0);m.castShadow=true;scene.add(m)}
}
function wireConn(c,name){
 connections.push(c);
 const sendHello=()=>{if(c.open)c.send({type:'hello',name:currentName,pvp,pos:{x:player.pos.x,z:player.pos.z},car:inCar,weapon:weaponIndex});showToast('PLAYER CONNECTED');if(isHost&&pvp){if(voting)c.send({type:'vote-start',t:voteT});else if(matchStarted)c.send({type:'map',map:curMap,seed:mapSeed})}};
 c.on('open',sendHello);if(c.open)sendHello();
 c.on('data',d=>{
  if(!d||typeof d!=='object')return;
  const id=isHost?c.peer:(d.from||c.peer);
  if(isHost&&['state','shot','build','hit','kill'].includes(d.type))connections.forEach(o=>{if(o!==c&&o.open)o.send({...d,from:id})});
  if(d.type==='state'&&d.pos){ensureRemote(id,d.name);const r=remoteMeshes.get(id);if(r){r.seen=performance.now();r.tx=+d.pos.x||0;r.tz=+d.pos.z||0;r.tyaw=+d.yaw||0;r.dead=!!d.dead;r.inCar=!!d.inCar;r.car=d.car;if(Number.isFinite(d.health))refreshHealthBar(r.healthBar,d.health,100);updateRemoteWeapon(r,Number.isInteger(d.weapon)?d.weapon:0);if(r.first){r.first=false;r.mesh.position.set(r.tx,0,r.tz);r.mesh.rotation.y=r.tyaw}}}
  if(d.type==='reject'){showToast(d.reason||'NAME ALREADY IN USE');status.textContent=d.reason||'NAME ALREADY IN USE';if(!isHost)$('roomlabel').textContent='JOIN REJECTED';c.close();return}
  if(d.type==='shot'&&d.pos&&d.dir)makeTracer(new THREE.Vector3(d.pos.x,d.pos.y,d.pos.z),new THREE.Vector3(d.dir.x,d.dir.y,d.dir.z),0xff8855);
  if(d.type==='build'&&Number.isInteger(d.pieceType))addBuildPiece(d.pieceType,d.x,d.z,d.rotation||0,true);
  if(d.type==='hit'&&peer&&d.to===peer.id)hitPlayer(Math.min(120,Number(d.dmg)||0),String(d.by||'a player').slice(0,16));
  if(d.type==='kill')registerKill(String(d.killer).slice(0,16),String(d.victim).slice(0,16));
  if(d.type==='vote'&&isHost&&voting&&MAPS[d.map]){votes[c.peer]=d.map;sendTally()}
  if(!isHost&&d.type==='tally'){lastTally=d.c||lastTally;showVote()}
  if(!isHost&&d.type==='vote-start'){voting=true;voteT=+d.t||12;myVote=null;lastTally={yard:0,store:0,dealer:0};inCar=false;document.exitPointerLock&&document.exitPointerLock();showVote()}
  if(!isHost&&d.type==='map'&&MAPS[d.map])applyMap(d.map,+d.seed||1);
  if(d.type==='hello'){
   const incoming=String(d.name||'guest').trim().slice(0,16),normalized=incoming.toLowerCase();
   if(isHost){const used=[currentName.toLowerCase(),...Array.from(lobbyNames.values()).map(n=>n.toLowerCase())];if(used.includes(normalized)){c.send({type:'reject',reason:'CALLSIGN ALREADY IN USE IN THIS LOBBY'});c.close();return}lobbyNames.set(c.peer,incoming);if(pvp&&!voting&&!matchStarted)startVote()}
   else if(d.pvp&&!pvp)setPvp(true);
   ensureRemote(c.peer,incoming);
  }
 });
 c.on('close',()=>{connections=connections.filter(x=>x!==c);lobbyNames.delete(c.peer);removeRemote(c.peer)});
}
function broadcast(dt){
 lastBroadcast+=dt;if(lastBroadcast<.05)return;lastBroadcast=0;if(!peer)return;
 send({type:'state',name:currentName,weapon:weaponIndex,pos:{x:player.pos.x,z:player.pos.z},yaw,health,inCar,dead,car:inCar?{x:car.position.x,z:car.position.z,rot:car.rotation.y}:null});
}
function remoteSmooth(dt){
 const now=performance.now(),k=Math.min(1,dt*16);
 remoteMeshes.forEach((r,id)=>{
  if(!r.first&&now-r.seen>6000){removeRemote(id);return}
  const m=r.mesh;m.position.x+=(r.tx-m.position.x)*k;m.position.z+=(r.tz-m.position.z)*k;
  m.rotation.y+=Math.atan2(Math.sin(r.tyaw-m.rotation.y),Math.cos(r.tyaw-m.rotation.y))*k;
  m.rotation.x+=((r.dead?1.5:0)-m.rotation.x)*Math.min(1,dt*6);
  if(r.inCar&&r.car&&car){if(!r.carMesh){r.carMesh=car.clone(true);scene.add(r.carMesh)}r.carMesh.visible=true;r.carMesh.position.set(+r.car.x||0,0,+r.car.z||0);r.carMesh.rotation.y=+r.car.rot||0}else if(r.carMesh)r.carMesh.visible=false;m.visible=!r.inCar;r.tag.visible=!r.dead;r.healthBar.visible=!r.dead;
 });
}
function fire(){
 initAudio();if(fireCooldown>0||(!locked&&!mobile.enabled)||buildMode||dead||voting||reloadT>0)return;
 const w=weapons[weaponIndex];
 if(ammo[weaponIndex]<=0){reload();return}
 ammo[weaponIndex]--;fireCooldown=w.cooldown;fireAnim=.14;recoil=Math.min(1.6,recoil+w.kick);flashT=.05;playSound('fire');
 pitch=clamp(pitch+w.kick*.006,-1.35,1.35);yaw+=(Math.random()-.5)*w.kick*.004;
 const base=new THREE.Vector3();camera.getWorldDirection(base);const origin=camera.position.clone();
 for(let i=0;i<w.pellets;i++){const dir=base.clone();dir.x+=(Math.random()-.5)*w.spread*2;dir.y+=(Math.random()-.5)*w.spread*2;dir.z+=(Math.random()-.5)*w.spread*2;dir.normalize();shootRay(origin,dir,w)}
 send({type:'shot',pos:{x:origin.x,y:origin.y,z:origin.z},dir:{x:base.x,y:base.y,z:base.z}});
 if(ammo[weaponIndex]<=0)reload();
}
function reload(){if(reloadT>0||dead||ammo[weaponIndex]>=weapons[weaponIndex].mag)return;reloadT=reloadMax=weapons[weaponIndex].rl;playSound('switch')}
function shootRay(origin,dir,w){
 makeTracer(origin,dir,w.color);
 const ray=new THREE.Raycaster(origin,dir,0,w.range);
 const sh=ray.intersectObjects(obstacles.filter(o=>o.visible&&o.userData&&o.userData.hp>0),false)[0];
 const et=[],rt=[];enemies.forEach(e=>e.traverse(o=>{if(o.isMesh)et.push(o)}));
 if(pvp)remoteMeshes.forEach(r=>{if(!r.dead&&r.mesh.visible)r.mesh.traverse(o=>{if(o.isMesh)rt.push(o)})});
 const eh=ray.intersectObjects(et,false)[0],ph=rt.length?ray.intersectObjects(rt,false)[0]:null;
 const best=[sh,eh,ph].filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];if(!best)return;
 const top=o=>{while(o.parent&&o.parent!==scene)o=o.parent;return o};
 if(best===sh){
  const wall=sh.object;burst(sh.point,4,0xd9d2a8,2.5);
  if(!pvp){if(!wall.userData.own){wall.material=wall.material.clone();wall.userData.own=true}wall.userData.hp-=w.damage*(w.pellets>1?.5:1);const ratio=clamp(wall.userData.hp/wall.userData.maxHp,0,1);wall.material.color.lerp(new THREE.Color(0x181916),(1-ratio)*.25);if(wall.userData.hp<=0){scene.remove(wall);obstacles=obstacles.filter(o=>o!==wall);const bi=buildPieces.indexOf(wall);if(bi>=0)buildPieces.splice(bi,1);showToast('COVER DESTROYED')}}
 }else if(best===eh){
  const e=top(eh.object);if(!enemies.includes(e))return;
  const head=(eh.point.y-e.position.y)/e.scale.y>1.35;
  e.userData.hp-=w.edmg*(head?2:1);playSound('hit');burst(eh.point,head?7:4,0xff5a3c,3);hitmark(false);
  refreshHealthBar(e.userData.healthBar,Math.max(0,e.userData.hp),e.userData.maxHp);
  e.position.addScaledVector(dir.clone().setY(0).normalize(),.12);
  if(e.userData.hp<=0)killEnemy(e,eh.point,head);
 }else{
  const t=top(ph.object);let tid=null;remoteMeshes.forEach((r,id)=>{if(r.mesh===t)tid=id});if(tid===null)return;
  const head=ph.point.y>1.32,dmg=Math.round(w.pd*(head?1.8:1));
  burst(ph.point,5,0xff3b30,3);hitmark(false);playSound('hit');send({type:'hit',to:tid,dmg,by:currentName});
 }
}
function hitmark(k){const h=$('hitmark');if(!h)return;h.className='';void h.offsetWidth;h.className=k?'on kill':'on'}
const pm={};let _pg=null;
function burst(pos,n,color,sp){
 if(!scene)return;_pg=_pg||new THREE.BoxGeometry(.09,.09,.09);const m0=pm[color]||(pm[color]=new THREE.MeshBasicMaterial({color}));
 for(let i=0;i<n&&parts.length<260;i++){const m=new THREE.Mesh(_pg,m0);m.position.copy(pos);scene.add(m);parts.push({m,life:.5+Math.random()*.5,v:new THREE.Vector3((Math.random()-.5)*sp,Math.random()*sp*.9,(Math.random()-.5)*sp)})}
}
function killEnemy(e,pt,head){
 enemies=enemies.filter(x=>x!==e);if(e.userData.healthBar)e.remove(e.userData.healthBar);
 dying.push({e,t:0,spin:(Math.random()-.5)*2.4});
 burst(pt||e.position.clone().setY(1.2),head?24:16,0xff5a3c,6);
 const boss=e.userData.boss,pts=boss?500:head?150:100;kills++;score+=pts;$('kills').textContent=String(kills).padStart(3,'0');
 playSound('kill');hitmark(true);showToast(boss?'BOSS DOWN +500':head?'HEADSHOT +'+pts:'TARGET DOWN +'+pts);
 if(pickups.length<12&&Math.random()<(boss?1:.3))spawnPickup(e.position.x,e.position.z);
}
function updateFx(dt){
 for(const d of dying){d.t+=dt;const e=d.e;e.rotation.x=Math.min(1.5,d.t*4.5);if(d.t<.4)e.rotation.y+=d.spin*dt;if(d.t>1.4)e.position.y=-(d.t-1.4)*1.1;if(d.t>2.6){scene.remove(e);d.done=true}}
 dying=dying.filter(d=>!d.done);
 for(const p of parts){p.life-=dt;p.v.y-=14*dt;p.m.position.addScaledVector(p.v,dt);p.m.rotation.x+=dt*8;if(p.m.position.y<.04){p.m.position.y=.04;p.v.multiplyScalar(.3)}if(p.life<=0){scene.remove(p.m);p.dead=true}else p.m.scale.setScalar(Math.min(1,p.life*2.5))}
 parts=parts.filter(p=>!p.dead);
}
function roundLogic(dt){
 if(pvp)return;
 if(pveState==='break'){pveTimer-=dt;if(pveTimer<=0){pveState='active';toSpawn=4+roundNumber*3;spawnT=0;if(roundNumber%5===0){spawnEnemy(true);toSpawn--;showToast('ROUND '+roundNumber+' · BOSS INBOUND')}else showToast('ROUND '+roundNumber+' · '+toSpawn+' HOSTILES')}}
 else{
  spawnT-=dt;if(toSpawn>0&&spawnT<=0&&enemies.length<5+roundNumber*1.5){spawnEnemy();toSpawn--;spawnT=1.1}
  if(toSpawn<=0&&enemies.length===0){pveState='break';pveTimer=9;const b=roundNumber*100;score+=b;health=Math.min(100,health+30);showToast('ROUND '+roundNumber+' CLEARED · +'+b);roundNumber++;spawnPickup();spawnPickup()}
 }
}
function stepState(dt){
 if(protect>0)protect-=dt;
 if(dead){respawnTimer-=dt;if(respawnTimer<=0)respawn()}
 if(reloadT>0){reloadT-=dt;if(reloadT<=0){reloadT=0;ammo[weaponIndex]=weapons[weaponIndex].mag;playSound('pickup')}}
 if(inCar&&Math.abs(car.userData.speed||0)>7)for(const e of enemies.slice())if(e.position.distanceTo(car.position)<2.6){e.userData.hp=0;killEnemy(e,e.position.clone().setY(1),false)}
 boardT-=dt;if(boardT<=0){boardT=.6;renderBoard()}if(carBeacon&&car){carBeacon.position.set(car.position.x,20,car.position.z);carBeacon.visible=!inCar}if(voting){voteT-=dt;$('vote-timer').textContent=Math.max(0,Math.ceil(voteT));if(isHost&&voteT<=0)resolveVote()}
}
function animViewModel(dt){
 const vm=viewModel;if(!vm)return;vm.visible=!dead;
 const t=clock.elapsedTime,sp=player.vel.length(),moving=sp>.4&&groundY<=0,rate=sp>11?13:9,u=vm.userData;
 recoil=Math.max(0,recoil-dt*6);flashT=Math.max(0,flashT-dt);swayX*=Math.pow(.02,dt);swayY*=Math.pow(.02,dt);
 const rl=reloadT>0?Math.sin((1-reloadT/reloadMax)*Math.PI):0;
 vm.position.x=u.baseX+(moving?Math.cos(t*rate*.5)*.012:Math.sin(t*1.5)*.002)-swayX*.8;
 vm.position.y=u.baseY+(moving?-Math.abs(Math.sin(t*rate*.5))*.02:Math.sin(t*1.6)*.004)+swayY*.8-rl*.18;
 vm.rotation.z=-swayX*2.2+rl*.25;vm.rotation.x=rl*.5;
 vm.rotation.y+=((sp>11?-.15:0)-vm.rotation.y)*Math.min(1,dt*8);
 u.gun.position.z=recoil*.07;u.gun.rotation.x=-recoil*.12;
 if(u.flash){u.flash.visible=flashT>0;u.flash.rotation.z=Math.random()*6.28;u.flash.scale.setScalar(.7+Math.random()*.7)}
 const tf=sp>11?86:78;if(Math.abs(camera.fov-tf)>.05){camera.fov+=(tf-camera.fov)*Math.min(1,dt*8);camera.updateProjectionMatrix()}
}
function renderBoard(){
 const b=$('board');if(!b)return;b.classList.toggle('on',pvp);if(!pvp)return;
 const names=new Set([currentName]);remoteMeshes.forEach(r=>names.add(r.name));Object.keys(pvpScores).forEach(n=>names.add(n));
 b.textContent=[...names].map(n=>[n,pvpScores[n]||0]).sort((a,b)=>b[1]-a[1]).map(([n,k])=>n.slice(0,12).padEnd(13)+String(k).padStart(2)).join('\n');
}
function setPvp(v){
 pvp=v;if(!v)return;if(curMap==='yard'&&!matchStarted&&scene)buildMap('yard',1);
 enemies.forEach(e=>scene.remove(e));enemies=[];dying.forEach(d=>scene.remove(d.e));dying=[];
 remoteMeshes.forEach(r=>{r.tag.material.depthTest=true;r.healthBar.material.depthTest=true});
 const p=pickSpawn();player.pos.set(p.x,0,p.z);yaw=Math.atan2(p.x,p.z);
 const rl=$('roomlabel');if(!/PVP/.test(rl.textContent))rl.textContent+=' · PVP';
 showToast('PVP · FIRST TO '+PVP_TARGET+' FRAGS');renderBoard();updateHud();
}
function registerKill(killer,victim){
 pvpScores[killer]=(pvpScores[killer]||0)+1;pvpScores[victim]=pvpScores[victim]||0;
 if(killer===currentName){kills++;$('kills').textContent=String(kills).padStart(3,'0');playSound('kill');hitmark(true)}
 showToast(killer.toUpperCase()+' ▸ '+victim.toUpperCase());
 if(pvpScores[killer]>=PVP_TARGET){showToast('MATCH OVER · '+killer.toUpperCase()+' WINS');setTimeout(()=>{for(const k in pvpScores)pvpScores[k]=0;showToast('NEW MATCH · FIRST TO '+PVP_TARGET);if(isHost)startVote()},5000)}
 renderBoard();
}
function pickSpawn(){
 if(!pvp)return{x:(Math.random()-.5)*10,z:10};
 const pts=SPAWNS[curMap]||SPAWNS.yard;let best=pts[0],bd=-1;
 pts.forEach(p=>{let md=1e9;remoteMeshes.forEach(r=>{md=Math.min(md,Math.hypot(r.mesh.position.x-p[0],r.mesh.position.z-p[1]))});md+=Math.random()*15;if(md>bd){bd=md;best=p}});
 return{x:best[0],z:best[1]};
}
function hitPlayer(n=8,by){
 if(dead||voting||protect>0||!started)return;
 playSound('damage');health=Math.max(0,health-n);hurtShake=Math.min(1,hurtShake+.65);
 const h=$('hurt');h.classList.remove('damage-flash');void h.offsetWidth;h.classList.add('damage-flash');
 if(health<=0)die(by);
}
function die(by){
 dead=true;respawnTimer=3;deaths++;inCar=false;reloadT=0;
 if(pvp){const killer=by||'the arena';registerKill(killer,currentName);send({type:'kill',killer,victim:currentName})}
 showToast(by?'ELIMINATED BY '+by.toUpperCase():'YOU DIED');
}
function respawn(){
 dead=false;health=100;protect=2.5;jumpVelocity=0;groundY=0;player.vel.set(0,0,0);ammo=weapons.map(w=>w.mag);
 const p=pickSpawn();player.pos.set(p.x,0,p.z);yaw=Math.atan2(p.x,p.z);pitch=0;playSound('pickup');showToast('REDEPLOYED');
}

let _rs=1;const rnd=()=>{_rs=(_rs*1664525+1013904223)>>>0;return _rs/4294967296};
const MAPS={yard:'THE YARD',store:'MEGA MARKET',dealer:'AUTO PLAZA'};
const SPAWNS={yard:[[-62,-62],[62,-62],[-62,62],[62,62],[0,-72],[0,72],[-72,0],[72,0],[-28,28],[28,-28],[0,0]],store:[[0,-72],[0,-45],[0,-10],[0,25],[0,60],[0,78],[-42,-45],[42,-45],[-42,-9],[42,-9],[-42,27],[42,27]],dealer:[[-76,-76],[76,-76],[-76,76],[76,76],[0,-76],[0,76],[-30,0],[30,0],[-76,0],[76,0]]};
const CARSPOT={yard:[5,-5],store:[0,34],dealer:[36,2]};
function solid(x,z,w,h,d,m,ry){const o=box(scene,w,h,d,m,x,h/2,z);if(ry)o.rotation.y=ry;o.userData={w:ry?d:w,d:ry?w:d,hp:9999,maxHp:9999,cover:true};obstacles.push(o);return o}
function deco(x,y,z,w,h,d,m){return box(scene,w,h,d,m,x,y,z)}
function perim(h,m){for(const g of[-1,1]){solid(0,g*84,168,h,1,m);solid(g*84,0,1,h,168,m)}}
function staticCar(x,z,color,side){const w=side?4.8:2.4,d=side?2.4:4.8;solid(x,z,w,1,d,mat(color,.35,.4));deco(x,1.4,z,side?2.5:1.9,.75,side?1.9:2.5,mats.glass)}
function makeFloor(n){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
 if(n==='store'){g.fillStyle='#d8d6cc';g.fillRect(0,0,128,128);g.fillStyle='#c4c3b8';g.fillRect(0,0,64,64);g.fillRect(64,64,64,64);g.strokeStyle='rgba(60,60,50,.3)';g.strokeRect(0,0,128,128)}
 else{g.fillStyle='#2e3033';g.fillRect(0,0,128,128);for(let i=0;i<500;i++){g.fillStyle=Math.random()<.5?'rgba(0,0,0,.25)':'rgba(255,255,255,.06)';g.fillRect(Math.random()*128,Math.random()*128,2,2)}}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;const r=n==='store'?80:50;t.repeat.set(r,r);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
function buildYard(){
// Arena floor markings
 for(let i=-9;i<=9;i++){const line=new THREE.Mesh(new THREE.BoxGeometry(164,.015,.035),mat(i===0?0x777b68:0x42463d));line.position.set(0,.01,i*8);scene.add(line);const line2=new THREE.Mesh(new THREE.BoxGeometry(.035,.015,164),mat(0x42463d));line2.position.set(i*8,.011,0);scene.add(line2)}
 // Low perimeter walls
 for(let i=-1;i<=1;i+=2){box(scene,168,3,1,mats.wall,0,1.5,i*84);box(scene,1,3,168,mats.wall,i*84,1.5,0)}
 // Cover, crates, barriers
 // Generate a different cover layout every session, avoiding the spawn area.
 const placements=[],used=[];for(let i=0;i<85;i++){let x,z,tries=0;do{x=Math.round((Math.random()*148-74)/2)*2;z=Math.round((Math.random()*148-74)/2)*2;tries++}while(tries<30&&(Math.hypot(x,z)<10||used.some(p=>Math.hypot(p.x-x,p.z-z)<5)));if(Math.hypot(x,z)<10||used.some(p=>Math.hypot(p.x-x,p.z-z)<5))continue;const w=[2,3,4,5,6][Math.floor(Math.random()*5)],d=[2,3,4,5][Math.floor(Math.random()*4)],h=[1.5,2,2.5,3][Math.floor(Math.random()*4)];used.push({x,z});placements.push([x,z,w,h,d])}placements.forEach(([x,z,w,h,d],i)=>{const o=box(scene,w,h,d,i%3===0?mats.crate:mats.wall,x,h/2,z),hp=Math.ceil(w*d*h/3);o.userData={w,d,hp,maxHp:hp,cover:true};obstacles.push(o)});
 for(const o of scene.children){if(o.isMesh&&o.geometry&&o.geometry.type==='BoxGeometry'&&o.position.y===1.5&&(Math.abs(o.position.x)===84||Math.abs(o.position.z)===84)){o.userData={w:o.geometry.parameters.width,d:o.geometry.parameters.depth,hp:80,maxHp:80,cover:true};obstacles.push(o)}}
 // lamps and little industrial details
 for(let i=0;i<16;i++){let a=i*Math.PI/8,x=Math.sin(a)*60,z=Math.cos(a)*60;const pole=box(scene,.22,4,.22,mats.dark,x,2,z);box(scene,.7,.14,.7,mats.accent,x,4.1,z)}
 
}
function buildStore(){
 const shelf=mat(0xb7bcc4,.6,.3),cols=[0xd94b3d,0x3da35d,0xf0c230,0x3c7bd9,0xe07b39,0x9b59b6].map(c=>mat(c,.7)),box_=mat(0xb08a58,.9),cnt=mat(0x2f4f6f,.6),frz=mat(0xcfe8f0,.35,.2),cart=mat(0x8c9096,.5,.5);
 perim(9,mat(0xd8d2c0,.9));
 for(let x=-72;x<=72;x+=12){if(x===0)continue;for(let k=0;k<4;k++){const z=-63+36*k,c=cols[((x+72)/12+k*2)%6];solid(x,z,3.2,3.4,26,shelf);deco(x-1.7,1.2,z,.25,.6,25,c);deco(x+1.7,2.3,z,.25,.6,25,cols[((x+72)/12+k*2+1)%6])}}
 for(let x=-54;x<=54;x+=18){solid(x,72,7,1.1,2.4,cnt);deco(x,1.2,72,6,.1,.9,mats.dark)}
 for(let z=-60;z<=60;z+=24){solid(-80,z,3,2.2,18,frz);solid(80,z,3,2.2,18,frz)}
 [[-5,-27,4,3],[5,-1,4,3],[-5,50,5,3.4],[5,15,4,2.6],[4,-58,4,3]].forEach(([x,z,s,h])=>solid(x,z,s,h,s,box_));
 for(let i=0;i<26;i++){const x=(2*Math.floor(rnd()*12)-11)*6,z=(rnd()-.5)*130;solid(x,z,1.4,1,2,cart)}
 for(let i=0;i<10;i++){const a=i/10*Math.PI*2;deco(Math.sin(a)*70,6,Math.cos(a)*70,3,.2,3,mat(0xfff6d8,.2))}
}
function buildDealer(){
 const glass=new THREE.MeshStandardMaterial({color:0x8fd0e0,transparent:true,opacity:.35,roughness:.1,metalness:.3}),pad=mat(0x555a5e),tire=mat(0x141414),lift=mat(0xd9a521,.5,.3),pal=[0xc0392b,0x2c6fbb,0xe8e8e8,0x222222,0xf1c40f,0x2e9e5b,0xe67e22];
 perim(6,mat(0x7b8088,.9));
 [[-13,-16],[13,-16],[-13,16],[13,16]].forEach(([x,z])=>solid(x,z,18,5,1,glass));
 [[-22,-9.5],[-22,9.5],[22,-9.5],[22,9.5]].forEach(([x,z])=>solid(x,z,1,5,13,glass));
 [[-9,-6],[9,-6],[-9,6],[9,6]].forEach(([x,z],i)=>{deco(x,.15,z,6,.3,9,pad);staticCar(x,z,pal[i],0)});
 for(const zr of[-44,-62,44,62])for(let x=-66;x<=66;x+=12){if(rnd()<.18)continue;staticCar(x,zr,pal[Math.floor(rnd()*7)],0)}
 for(let z=-12;z<=12;z+=12){solid(-56,z,5,.4,7,lift);deco(-58.2,2,z,.4,4,.4,lift);deco(-53.8,2,z,.4,4,.4,lift)}
 for(let i=0;i<14;i++){const x=(rnd()-.5)*120,z=(rnd()-.5)*120;if(Math.abs(x)<26&&Math.abs(z)<20||Math.abs(x)>50&&Math.abs(z)<16)continue;solid(x,z,1.6,1.4,1.6,tire)}
 for(let i=0;i<14;i++){const a=i/14*Math.PI*2;deco(Math.sin(a)*74,2.5,Math.cos(a)*74,.25,5,.25,mats.dark);deco(Math.sin(a)*74,5.1,Math.cos(a)*74,.9,.15,.9,mats.accent)}
}
function clearMap(){mapObjs.forEach(o=>scene.remove(o));buildPieces.forEach(o=>scene.remove(o));obstacles=obstacles.filter(o=>!mapObjs.includes(o)&&!buildPieces.includes(o));buildPieces.length=0;mapObjs=[]}
function buildMap(name,seed){
 if(!floorTex.yard)floorTex.yard=mats.ground.map;
 clearMap();curMap=name;_rs=((seed||mapSeed||1)>>>0)||1;
 if(!floorTex[name])floorTex[name]=makeFloor(name);
 mats.ground.map=floorTex[name];mats.ground.needsUpdate=true;
 const before=new Set(scene.children),R=Math.random;Math.random=rnd;
 try{(name==='store'?buildStore:name==='dealer'?buildDealer:buildYard)()}finally{Math.random=R}
 mapObjs=scene.children.filter(c=>!before.has(c));
 if(car){const s=CARSPOT[name];car.position.set(s[0],0,s[1]);car.rotation.y=-.5;car.userData.speed=0}
}
function setSprint(v){sprintOn=v;const b=$('mobile-sprint');if(b)b.classList.toggle('active',v)}
function toggleCar(){
 if(!car||dead||voting)return;
 const d=Math.hypot(player.pos.x-car.position.x,player.pos.z-car.position.z);
 if(!inCar){if(d<5){playSound('car-on');inCar=true;car.userData.speed=0;showToast('VEHICLE ACQUIRED · W/S DRIVE · A/D STEER')}else showToast('CAR IS '+Math.round(d)+'M AWAY · FOLLOW THE GREEN BEAM')}
 else{playSound('car-off');inCar=false;player.pos.x=car.position.x+Math.cos(car.rotation.y)*2.4;player.pos.z=car.position.z-Math.sin(car.rotation.y)*2.4;showToast('ON FOOT')}
}
function tally(){const c={yard:0,store:0,dealer:0};Object.values(votes).forEach(m=>{if(c[m]!==undefined)c[m]++});return c}
function sendTally(){lastTally=tally();send({type:'tally',c:lastTally});showVote()}
function showVote(){
 const v=$('vote');if(!v)return;v.classList.toggle('hidden',!voting);if(!voting)return;
 for(const m in MAPS){$('vc-'+m).textContent=lastTally[m]||0;v.querySelector('[data-map='+m+']').classList.toggle('mine',myVote===m)}
 $('vote-timer').textContent=Math.max(0,Math.ceil(voteT));
}
function startVote(){voting=true;voteT=12;votes={};myVote=null;lastTally={yard:0,store:0,dealer:0};if(inCar)inCar=false;document.exitPointerLock&&document.exitPointerLock();send({type:'vote-start',t:voteT});showVote();showToast('VOTE FOR THE NEXT MAP')}
function castVote(m){if(!voting||!MAPS[m])return;myVote=m;playSound('ui');if(isHost){votes.host=m;sendTally()}else{send({type:'vote',map:m});showVote()}}
function resolveVote(){
 const c=tally(),max=Math.max(...Object.values(c)),top=Object.keys(c).filter(m=>c[m]===max);
 const map=top[Math.floor(Math.random()*top.length)],seed=1+Math.floor(Math.random()*1e9);
 send({type:'map',map,seed});applyMap(map,seed);
}
function applyMap(name,seed){
 voting=false;matchStarted=true;mapSeed=seed;inCar=false;mapObjs.length||0;buildMap(name,seed);
 for(const k in pvpScores)pvpScores[k]=0;showVote();respawn();showToast('MAP · '+MAPS[name]+' · FIRST TO '+PVP_TARGET);renderBoard();updateHud();
}

function animate(){requestAnimationFrame(animate);if(!started)return;const dt=Math.min(clock.getDelta(),.04);update(dt);renderer.render(scene,camera)}
function switchWeapon(i){reloadT=0;playSound('switch');weaponIndex=(i+weapons.length)%weapons.length;makeViewModel();updateHud();showToast(weapons[weaponIndex].name+' EQUIPPED')}
document.addEventListener('keydown',e=>{if((e.code==='ControlLeft'||e.code==='ControlRight')&&started&&!e.repeat)setSprint(!sprintOn);if(e.code==='Space'&&started&&!inCar){e.preventDefault();if(groundY<=0&&jumpVelocity===0)jumpVelocity=6.3}keys[e.code]=true;if(e.code==='KeyE'&&started)toggleCar();if(!started)return;if(voting&&/^Digit[123]$/.test(e.code)){castVote(['yard','store','dealer'][+e.code.slice(5)-1]);return}if(e.code==='Equal'||e.code==='NumpadAdd'){toggleControls();e.preventDefault()}if(e.code==='Digit1')switchWeapon(0);if(e.code==='Digit2')switchWeapon(1);if(e.code==='Digit3')switchWeapon(2);if(e.code==='KeyB')toggleBuild();if(buildMode&&e.code==='KeyZ')chooseBuildType(0);if(buildMode&&e.code==='KeyX')chooseBuildType(1);if(buildMode&&e.code==='KeyC')chooseBuildType(2);if(buildMode&&e.code==='KeyR'){buildRotation+=Math.PI/4;updateBuildPreview()}if(!buildMode&&e.code==='KeyR')reload();if(e.code==='Escape')document.exitPointerLock?.()});
document.addEventListener('keyup',e=>keys[e.code]=false);
document.addEventListener('mousemove',e=>{if(locked){swayX=clamp(swayX+e.movementX*.00022,-.05,.05);swayY=clamp(swayY+e.movementY*.00022,-.05,.05);yaw-=e.movementX*.0022;pitch=clamp(pitch-e.movementY*.0022,-1.35,1.35)}});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer?.domElement;$('crossnote').style.display=locked?'none':'block'});
document.addEventListener('mousedown',e=>{if(!started||voting)return;if(!locked){renderer.domElement.requestPointerLock?.();return}if(e.button===0){if(buildMode)placeBuildPiece();else fire()}});
$('host').addEventListener('click',()=>{initAudio();start('host')});$('join').addEventListener('click',()=>{initAudio();start('join')});$('solo').addEventListener('click',()=>{initAudio();start('solo')});$('sound-toggle')?.addEventListener('click',toggleSound);
$('leave').addEventListener('click',()=>{if(peer)peer.destroy();location.reload()});
$('close-controls')?.addEventListener('click',toggleControls);document.querySelectorAll('#vote button').forEach(b=>b.addEventListener('click',()=>castVote(b.dataset.map)));
})();
