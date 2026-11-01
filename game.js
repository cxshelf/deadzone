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
let ammo=[12,30,6,40,0],reloadT=0,reloadMax=1,recoil=0,flashT=0,swayX=0,swayY=0,dead=false,deaths=0,protect=0,pvp=false,pveState='break',pveTimer=4,toSpawn=0,spawnT=0,boardT=0,parts=[],dying=[],sprintOn=false,carBeacon=null,curMap='yard',mapSeed=1,mapObjs=[],voting=false,voteT=0,votes={},myVote=null,matchStarted=false,lastTally={yard:0,store:0,dealer:0,water:0,port:0,site:0};const floorTex={},pvpScores={},PVP_TARGET=15;
function initAudio(){if(!soundEnabled)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;if(!audioCtx){audioCtx=new AC();masterGain=audioCtx.createGain();masterGain.gain.value=.48;masterGain.connect(audioCtx.destination);const n=Math.floor(audioCtx.sampleRate*.35);noiseBuffer=audioCtx.createBuffer(1,n,audioCtx.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<n;i++)data[i]=Math.random()*2-1}if(audioCtx.state==='suspended')audioCtx.resume()}catch(e){console.warn('Audio unavailable',e)}}
function playSound(type){if(!soundEnabled)return;initAudio();if(!audioCtx||!masterGain)return;const t=audioCtx.currentTime;const noise=(duration,volume,cutoff=3000)=>{const src=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();src.buffer=noiseBuffer;filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,t);filter.frequency.exponentialRampToValueAtTime(Math.max(120,cutoff*.22),t+duration);gain.gain.setValueAtTime(Math.max(.0001,volume),t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);src.connect(filter);filter.connect(gain);gain.connect(masterGain);src.start(t);src.stop(t+duration)};const tone=(freq,end,duration,volume=.12,wave='sine',delay=0)=>{const o=audioCtx.createOscillator(),gain=audioCtx.createGain();o.type=wave;o.frequency.setValueAtTime(freq,t+delay);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+delay+duration);gain.gain.setValueAtTime(.0001,t+delay);gain.gain.linearRampToValueAtTime(volume,t+delay+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+delay+duration);o.connect(gain);gain.connect(masterGain);o.start(t+delay);o.stop(t+delay+duration+.015)};switch(type){case'fire':noise(weaponIndex===2?.22:.12,weaponIndex===2?.34:.23,weaponIndex===0?4200:2600);tone(weaponIndex===2?105:weaponIndex===1?145:190,48,weaponIndex===2?.19:.1,.23,'sawtooth');tone(weaponIndex===0?1100:weaponIndex===1?780:420,180,.045,.075,'square',.005);break;case'hit':tone(680,280,.09,.15,'triangle');noise(.045,.09,2200);break;case'kill':tone(520,780,.13,.13,'sine');tone(780,1100,.18,.12,'sine',.09);break;case'enemy-fire':noise(.12,.12,1800);tone(130,65,.1,.12,'sawtooth');break;case'damage':noise(.25,.2,800);tone(105,45,.25,.22,'sawtooth');break;case'jump':tone(220,440,.15,.1,'triangle');noise(.09,.06,1100);break;case'pickup':tone(660,880,.11,.12,'sine');tone(880,1320,.16,.1,'sine',.08);break;case'build':noise(.1,.14,900);tone(115,65,.12,.16,'triangle');break;case'switch':tone(900,620,.045,.08,'square');tone(620,880,.06,.07,'square',.05);break;case'car-on':tone(75,125,.3,.18,'sawtooth');tone(130,185,.2,.08,'triangle',.12);break;case'car-off':tone(160,55,.25,.12,'sawtooth');break;case'step':noise(.055,.045,480);tone(85,55,.045,.035,'triangle');break;case'ui':tone(540,700,.06,.06,'sine');break;case'error':tone(220,130,.15,.1,'square');break;}}
function toneCarEngine(){if(!soundEnabled||!audioCtx)return;const t=audioCtx.currentTime,o=audioCtx.createOscillator(),gain=audioCtx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(48+Math.min(95,Math.abs(car?.userData?.speed||0)*4),t);o.frequency.exponentialRampToValueAtTime(38+Math.min(65,Math.abs(car?.userData?.speed||0)*3),t+.18);gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(.045,t+.025);gain.gain.exponentialRampToValueAtTime(.0001,t+.22);o.connect(gain);gain.connect(masterGain);o.start(t);o.stop(t+.23)}
function toggleSound(){soundEnabled=!soundEnabled;if(soundEnabled){initAudio();playSound('ui')}const b=$('sound-toggle');if(b){b.textContent=soundEnabled?'SOUND ON':'SOUND OFF';b.setAttribute('aria-pressed',String(soundEnabled))}}
const weapons=[{name:'SIDEARM',damage:1,edmg:1,pd:26,mag:12,pellets:1,spread:.004,kick:.7,rl:1,cooldown:.22,range:60,color:0xd5ff56},{name:'ASSAULT RIFLE',damage:1,edmg:1,pd:15,mag:30,pellets:1,spread:.012,kick:.45,rl:1.5,cooldown:.095,range:90,color:0xffc857},{name:'HEAVY SHOTGUN',damage:2,edmg:.7,pd:11,mag:6,pellets:7,spread:.06,kick:1.6,rl:2.1,cooldown:.7,range:34,color:0xff8855},{name:'AUTO SMG',damage:1,edmg:.7,pd:9,mag:40,pellets:1,spread:.025,kick:.28,rl:1.6,cooldown:.06,range:70,color:0x7fd6ff,auto:true},{name:'KNIFE',melee:true,damage:999,edmg:999,pd:999,mag:0,pellets:1,spread:0,kick:0,rl:0,cooldown:.5,range:2.8,color:0xffffff}];
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
 const skin=mat(SKIN[charCfg.skin],.9),sleeve=mat(OUTFIT[charCfg.color],.9),dark=mat(0x191c19,.55,.25),metal=mat(0x747c70,.45,.45),glow=mat(0xd5ff56,.35,.1);
 // Sleeves, forearms and angular gloves stay parented to the camera like a proper FPS viewmodel.
 const leftSleeve=box(viewModel,.22,.28,.4,sleeve,-.34,-.34,-.48);leftSleeve.rotation.z=-.28;
 const rightSleeve=box(viewModel,.23,.29,.42,sleeve,.35,-.32,-.5);rightSleeve.rotation.z=.2;
 box(viewModel,.16,.15,.24,skin,-.24,-.24,-.66);
 box(viewModel,.16,.15,.24,skin,.25,-.22,-.67);
 const gun=new THREE.Group();gun.name='held-weapon';viewModel.add(gun);
 buildGun(weaponIndex,gun);
 const flash=new THREE.Mesh(new THREE.PlaneGeometry(.36,.36),new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending}));flash.position.set(weaponIndex===0?.13:.12,-.07,weaponIndex===0?-1.08:weaponIndex===3?-1.38:-1.55);flash.visible=false;gun.add(flash);
 viewModel.scale.setScalar(1.22);viewModel.traverse(o=>{o.castShadow=false});viewModel.userData={gun,flash,leftSleeve,rightSleeve,baseY:-.27,baseX:0};
 camera.add(viewModel);
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
 bind('mobile-build',()=>toggleBuild());bind('mobile-place',()=>{if(buildMode)placeBuildPiece();else toggleBuild()});bind('mobile-jump',()=>{initAudio();if(!inCar&&groundY<=floorY+.02&&jumpVelocity===0){jumpVelocity=6.3;playSound('jump')}});bind('mobile-car',()=>toggleCar());bind('mobile-controls-help',()=>toggleControls());bind('mobile-sprint',()=>setSprint(!sprintOn));bind('mobile-emote',()=>toggleEmote());bind('mobile-chat',()=>openChat());{const f=$('mobile-fire');f.addEventListener('pointerdown',()=>{holdFire=true});['pointerup','pointercancel'].forEach(t=>f.addEventListener(t,()=>{holdFire=false}))}
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
 const rubber=mat(0x171916,.95),metal=mat(0x73796e,.42,.55),light=mat(0xf4f0cb,.3,.1),tailMat=mat(0xc0392b,.4),glowM=new THREE.MeshBasicMaterial({color:0x35e8ff,transparent:true,opacity:.35,depthWrite:false}),flashM=(c)=>new THREE.MeshBasicMaterial({color:c});car.userData.tail=tailMat;light.emissive.setHex(0x665a2a);
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
  box(carBody,.32,.15,.1,tailMat,sx*.77,.73,2.19);
  box(carBody,.08,.18,1.18,mats.dark,sx*.94,1.03,-.05);
  box(carBody,.08,.18,1.18,mats.dark,sx*.94,1.03,1.03);
  box(carBody,.12,.12,.72,mat(0x8c9580,.5,.2),sx*.83,1.64,-.06);
 }
 // Hood vents, roof detail and a rear utility rack.
 for(let i=0;i<4;i++)box(carBody,.06,.025,.46,mats.dark,(i-1.5)*.17,.994,-1.42);
 box(carBody,1.18,.09,.28,metal,0,1.68,1.25);
 box(carBody,.12,.22,.12,mats.accent,-.72,.78,-2.21);
 box(carBody,.12,.22,.12,mats.accent,.72,.78,-2.21);
 // Extra detail: spoiler, mirrors, stripes, plates, exhaust, flares, light bar, interior and headlight beams.
 for(const sx of [-1,1]){
  box(carBody,.1,.36,.1,metal,sx*.7,1.0,1.95);box(carBody,.06,.3,.5,mats.dark,sx*1.0,1.2,2.0);
  box(carBody,.1,.14,.2,mats.dark,sx*1.04,1.12,-.62);box(carBody,.14,.05,.05,mats.dark,sx*.98,1.06,-.62);
  box(carBody,.04,.05,.18,metal,sx*1.11,.86,.35);box(carBody,.02,.42,.02,mats.dark,sx*1.11,.82,-.22);box(carBody,.02,.42,.02,mats.dark,sx*1.11,.82,.95);
  box(carBody,.18,.12,1.0,mats.dark,sx*1.13,.74,-1.28);box(carBody,.18,.12,1.0,mats.dark,sx*1.13,.74,1.28);
  const ex=new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.3,8),metal);ex.rotation.x=Math.PI/2;ex.position.set(sx*.55,.32,2.25);carBody.add(ex);
  const beam=new THREE.Mesh(new THREE.ConeGeometry(1.3,7,10,1,true),new THREE.MeshBasicMaterial({color:0xfff2b0,transparent:true,opacity:.08,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));beam.rotation.x=Math.PI/2;beam.position.set(sx*.77,.8,-5.7);carBody.add(beam);
 }
 box(carBody,2.0,.08,.45,mats.dark,0,1.22,2.0);box(carBody,.28,.012,1.35,mat(0xffffff,.5),0,.995,-1.38);box(carBody,.28,.012,1.9,mat(0xffffff,.5),0,1.635,-.1);
 box(carBody,.5,.14,.03,mat(0xf2f2ee,.6),0,.55,-2.2);box(carBody,.5,.14,.03,mat(0xf2f2ee,.6),0,.55,2.2);
 box(carBody,1.1,.1,.2,mats.dark,0,1.72,-.7);box(carBody,.3,.08,.16,flashM(0xff3322),-.4,1.79,-.7);box(carBody,.3,.08,.16,flashM(0x2266ff),.4,1.79,-.7);
 box(carBody,1.3,.18,.35,mats.dark,0,.98,-.78);box(carBody,2.0,.02,4.0,glowM,0,.12,0);
 const swh=new THREE.Mesh(new THREE.TorusGeometry(.17,.022,6,14),mats.dark);swh.position.set(0,1.0,-.62);swh.rotation.x=-.5;carBody.add(swh);car.userData.sw=swh;
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const wheelGroup=new THREE.Group();
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.28,10),rubber);
  tire.rotation.z=Math.PI/2;wheelGroup.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.3,8),metal);
  hub.rotation.z=Math.PI/2;hub.position.x=sx*.015;wheelGroup.add(hub);
  wheelGroup.rotation.order='YXZ';wheelGroup.userData.front=sz<0;wheelGroup.position.set(sx*1.12,.4,sz*1.28);car.add(wheelGroup);carWheels.push(wheelGroup);
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
 g.legs=[];for(const sx of [-1,1]){
  const shoulder=new THREE.Mesh(new THREE.IcosahedronGeometry(.19,0),armor);shoulder.position.set(sx*.43,1.22,0);g.add(shoulder);
  const arm=box(g,.19,.56,.2,cloth,sx*.45,.88,-.015);arm.rotation.z=-sx*.12;
  box(g,.2,.16,.22,gunmat,sx*.45,.57,-.015);
  {const leg=new THREE.Group();leg.position.set(sx*.19,.5,0);g.add(leg);g.legs.push(leg);box(leg,.2,.3,.2,cloth,0,-.15,0);box(leg,.25,.12,.35,armor,0,-.25,0);box(leg,.27,.16,.39,gunmat,0,-.38,-.025)}
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
 const cs=($('callsign').value.trim()||'driver').slice(0,16);
 if(acct||!fbOK()||!db){startInner(mode);return}
 status.textContent='CHECKING CALLSIGN…';
 db.collection('usernames').doc(cs.toLowerCase()).get().then(d=>{if(d.exists)status.textContent='THAT CALLSIGN BELONGS TO AN ACCOUNT · SIGN IN OR PICK ANOTHER';else startInner(mode)}).catch(()=>startInner(mode));
}
function startInner(mode){
 if(started)return;
 solo=mode==='solo';isHost=mode==='host';ctf=isHost&&!!$('mode')&&$('mode').value==='ctf';pvp=isHost&&!!$('mode')&&($('mode').value==='pvp'||ctf);
 roomId=$('room').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,24);
 currentName=acct?acct.username:($('callsign').value.trim()||'driver').slice(0,16);
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
   c.on('open',()=>{if(finished)return;c.send({type:'hello',name:currentName,pvp:false});
    c.on('data',d=>{if(finished||!d||typeof d!=='object')return;
     if(d.type==='reject'){clearTimeout(timeout);fail(String(d.reason||'CALLSIGN ALREADY IN USE').toUpperCase());try{c.close()}catch(e){}}
     else if(d.type==='accepted'){finished=true;clearTimeout(timeout);pvp=!!d.pvp;ctf=!!d.ctf;launchGame(mode)}});
   });
   c.on('error',()=>{clearTimeout(timeout);fail('COULD NOT CONNECT · ROOM DOES NOT EXIST OR IS UNAVAILABLE')});
   c.on('close',()=>{if(!started)fail('HOST DISCONNECTED BEFORE JOINING')});
  });
  peer.on('error',e=>{if(!finished){clearTimeout(timeout);fail(e.type==='peer-unavailable'?'ROOM NOT FOUND · CHECK THE CODE AND TRY AGAIN':'ROOM LOOKUP FAILED · '+(e.type||'NETWORK ERROR').toUpperCase())}});
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
 const r={first:true,seen:performance.now(),tx:0,tz:0,tyaw:0,dead:false,inCar:false,mesh:g,name:name||'guest',tag,healthBar,color:hex,held,weapon:-1};remoteMeshes.set(id,r);setAvatar(r,Object.assign(defaultChar(),{hat:0}));updateRemoteWeapon(r,0);
}
function removeRemote(id){const r=remoteMeshes.get(id);if(r){scene.remove(r.mesh);if(r.carMesh)scene.remove(r.carMesh);remoteMeshes.delete(id)}peersState.delete(id)}
function makeTracer(pos,dir,color){
 const end=pos.clone().add(dir.clone().multiplyScalar(28)),geom=new THREE.BufferGeometry().setFromPoints([pos,end]);const line=new THREE.Line(geom,new THREE.LineBasicMaterial({color,transparent:true,opacity:.75}));scene.add(line);bullets.push({mesh:line,life:.07});
}
function update(dt){
 fireCooldown=Math.max(0,fireCooldown-dt);fireAnim=Math.max(0,fireAnim-dt);hurtShake=Math.max(0,hurtShake-dt*2.8);if(!inCar){floorY=floorAt(player.pos.x,player.pos.z,groundY);if(keys.Space&&groundY<=floorY+.02&&jumpVelocity===0){jumpVelocity=6.3;playSound('jump')}
  if(jumpVelocity!==0||groundY>floorY+.001){groundY+=jumpVelocity*dt;jumpVelocity-=18*dt;if(groundY<=floorY){groundY=floorY;jumpVelocity=0}}else groundY=floorY;
  const air=groundY>floorY+.03;if(wasAir&&!air){landT=.25;playSound('step')}wasAir=air}
 roundLogic(dt);stepState(dt);updateFx(dt);remoteSmooth(dt);
 updateHud();if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show')}
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 if(inCar){
  const accel=clamp((keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-(mobile.enabled?mobile.moveY:0),-1,1),steer=clamp((keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+(mobile.enabled?mobile.moveX:0),-1,1);
  car.userData.speed=(car.userData.speed||0)+accel*dt*18;car.userData.speed*=Math.pow(keys.Space ? 0.91 : 0.985, dt * 60);car.userData.speed=clamp(car.userData.speed,-9,23);
  car.rotation.y-=steer*dt*(.8+Math.abs(car.userData.speed)*.045)*(car.userData.speed<0?-1:1);
  const f=new THREE.Vector3(-Math.sin(car.rotation.y),0,-Math.cos(car.rotation.y));car.position.addScaledVector(f,car.userData.speed*dt);
  for(const o of obstacles){const uo=oy(o);if(uo.y0>1.2||uo.top<.45)continue;const w=o.userData.w/2+1.3,d=o.userData.d/2+1.3,q=o.position;if(Math.abs(car.position.x-q.x)<w&&Math.abs(car.position.z-q.z)<d){const dx=Math.abs(car.position.x-q.x)/w,dz=Math.abs(car.position.z-q.z)/d;if(dx>dz)car.position.x=q.x+(Math.sign(car.position.x-q.x)||1)*w;else car.position.z=q.z+(Math.sign(car.position.z-q.z)||1)*d;car.userData.speed*=-.35}}car.position.x=clamp(car.position.x,-80,80);car.position.z=clamp(car.position.z,-80,80);
  carWheels.forEach(w=>{w.rotation.x+=car.userData.speed*dt*2;if(w.userData.front)w.rotation.y+=(-steer*.5-w.rotation.y)*Math.min(1,dt*10)});{const ks=Math.min(1,dt*6);carBody.rotation.z+=(-steer*Math.min(1,Math.abs(car.userData.speed)/18)*.07-carBody.rotation.z)*ks;carBody.rotation.x+=(accel*-.03-carBody.rotation.x)*ks;if(car.userData.sw)car.userData.sw.rotation.z+=(-steer*1.6-car.userData.sw.rotation.z)*Math.min(1,dt*10);if(car.userData.tail)car.userData.tail.emissive.setHex(((accel<0&&car.userData.speed>.5)||keys.Space)?0xff2a1a:0x2a0500)}if(Math.abs(car.userData.speed)>2){engineSoundTimer-=dt;if(engineSoundTimer<=0){toneCarEngine();engineSoundTimer=.65}}
  player.pos.set(car.position.x,0,car.position.z);yaw=car.rotation.y;
  camera.position.set(car.position.x,1.28,car.position.z);camera.rotation.order='YXZ';camera.rotation.set(0,yaw,0);if(viewModel)viewModel.visible=false;
  $('speed').textContent=Math.round(Math.abs(car.userData.speed)*7)+' KM/H';$('weapon').textContent='VEHICLE';
 }else{
  let move=new THREE.Vector3();if(keys.KeyW)move.add(forward);if(keys.KeyS)move.sub(forward);if(keys.KeyD)move.add(right);if(keys.KeyA)move.sub(right);if(mobile.enabled){move.addScaledVector(forward,-mobile.moveY);move.addScaledVector(right,mobile.moveX)}if(dead||voting||emoteOpen)move.set(0,0,0);if(move.lengthSq())move.normalize();
  if(sprintOn&&!move.lengthSq())setSprint(false);const spd=((keys.ShiftLeft||keys.ShiftRight||sprintOn)&&!buildMode)?15:10;player.vel.x+=(move.x*spd-player.vel.x)*Math.min(1,dt*12);player.vel.z+=(move.z*spd-player.vel.z)*Math.min(1,dt*12);
  player.pos.addScaledVector(player.vel,dt);if(player.vel.length()>.8&&groundY<=floorY+.02){footstepTimer-=dt;if(footstepTimer<=0){playSound('step');footstepTimer=.38}}else footstepTimer=0;player.pos.x=clamp(player.pos.x,-81,81);player.pos.z=clamp(player.pos.z,-81,81);
  camera.position.set(player.pos.x,(dead?.5:playerHeight)+groundY,player.pos.z);if(hurtShake>0){camera.position.x+=(Math.random()-.5)*hurtShake*.24;camera.position.y+=(Math.random()-.5)*hurtShake*.18}camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,dead?.6:0);
  animViewModel(dt);
  $('speed').textContent='ON FOOT';
 }
 // Simple collision resolution against cover boxes.
 if(!inCar){for(const o of obstacles){const u=oy(o);if(groundY>=u.top-.6||groundY+1.75<=u.y0)continue;const p=o.position,w=o.userData.w/2+.4,d=o.userData.d/2+.4;if(Math.abs(player.pos.x-p.x)<w&&Math.abs(player.pos.z-p.z)<d){const dx=Math.abs(player.pos.x-p.x)/w,dz=Math.abs(player.pos.z-p.z)/d;if(dx>dz)player.pos.x=p.x+Math.sign(player.pos.x-p.x)*w;else player.pos.z=p.z+Math.sign(player.pos.z-p.z)*d}}}
 // Enemies pursue, raise rifles when shooting, and are blocked by cover.
 enemies.forEach(e=>{e.position.y=Math.abs(Math.sin(clock.elapsedTime*7+e.id))*.06;{const sw=Math.sin(clock.elapsedTime*9+e.id)*.7;if(e.legs){e.legs[0].rotation.x=sw;e.legs[1].rotation.x=-sw}e.rotation.z=Math.sin(clock.elapsedTime*4.5+e.id)*.05}const d=new THREE.Vector3(player.pos.x-e.position.x,0,player.pos.z-e.position.z),len=d.length();if(len>2.8){d.normalize();e.position.addScaledVector(d,e.userData.speed*dt);e.rotation.y=Math.atan2(-d.x,-d.z)}e.userData.fire-=dt;if(e.userData.shootTime>0){e.userData.shootTime-=dt;e.userData.arms.forEach(a=>a.rotation.x=-.65);e.userData.rifle.position.z=-.16}else{e.userData.arms.forEach(a=>a.rotation.x=0);e.userData.rifle.position.z=-.28}if(e.userData.fire<=0&&len<26&&!dead){e.userData.fire=1.1+Math.random()*1.2;e.userData.shootTime=.22;const muzzle=e.position.clone().add(new THREE.Vector3(-Math.sin(e.rotation.y)*.7,1.05,-Math.cos(e.rotation.y)*.7)),aim=new THREE.Vector3(player.pos.x,1.35,player.pos.z).sub(muzzle).normalize();makeTracer(muzzle,aim,0xff8855);const block=new THREE.Raycaster(muzzle,aim,0,len).intersectObjects(obstacles.filter(o=>o.visible&&o.userData&&o.userData.hp>0),false)[0];playSound('enemy-fire');if(!block&&Math.random()<.42)hitPlayer(5+Math.min(roundNumber,8)+(e.userData.boss?9:0),'a raider')}});
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
 const sendHello=()=>{if(c.open)c.send({type:'hello',name:currentName,pvp,pos:{x:player.pos.x,z:player.pos.z},car:inCar,weapon:weaponIndex});showToast('PLAYER CONNECTED');};
 c.on('open',sendHello);if(c.open)sendHello();
 c.on('data',d=>{
  if(!d||typeof d!=='object')return;
  const id=isHost?c.peer:(d.from||c.peer);
  if(isHost&&['state','shot','build','hit','kill','emote'].includes(d.type))connections.forEach(o=>{if(o!==c&&o.open)o.send({...d,from:id})});
  if(d.type==='state'&&d.pos){ensureRemote(id,d.name);const r=remoteMeshes.get(id);if(r){r.seen=performance.now();r.tx=+d.pos.x||0;r.tz=+d.pos.z||0;r.ty=+d.pos.y||0;r.tyaw=+d.yaw||0;r.dead=!!d.dead;r.inCar=!!d.inCar;r.car=d.car;if(typeof d.ch==='string'&&d.ch.length<40&&r.chStr!==d.ch){r.chStr=d.ch;r.tm=ctf?teamOf.get(r.name):undefined;setAvatar(r,parseChar(d.ch),r.tm)}if(Number.isFinite(d.health))refreshHealthBar(r.healthBar,d.health,100);updateRemoteWeapon(r,Number.isInteger(d.weapon)?d.weapon:0);if(r.first){r.first=false;r.mesh.position.set(r.tx,0,r.tz);r.mesh.rotation.y=r.tyaw}}}
  if(d.type==='reject'){showToast(d.reason||'NAME ALREADY IN USE');status.textContent=d.reason||'NAME ALREADY IN USE';if(!isHost)$('roomlabel').textContent='JOIN REJECTED';c.close();return}
  if(d.type==='shot'&&d.pos&&d.dir)makeTracer(new THREE.Vector3(d.pos.x,d.pos.y,d.pos.z),new THREE.Vector3(d.dir.x,d.dir.y,d.dir.z),0xff8855);
  if(d.type==='build'&&Number.isInteger(d.pieceType))addBuildPiece(d.pieceType,d.x,d.z,d.rotation||0,true);
  if(d.type==='hit'&&peer&&d.to===peer.id)hitPlayer(Math.min(120,Number(d.dmg)||0),String(d.by||'a player').slice(0,16));
  if(d.type==='kill')registerKill(String(d.killer).slice(0,16),String(d.victim).slice(0,16));
  if(d.type==='emote')showRemoteEmote(id,d.k);
  if(!isHost&&d.type==='flags'&&Array.isArray(d.f)&&d.f.length===2&&Array.isArray(d.sc)){flags=d.f.map(f=>({s:+f.s|0,by:String(f.by||'').slice(0,16),x:+f.x||0,y:+f.y||0,z:+f.z||0}));ctfScore=[+d.sc[0]|0,+d.sc[1]|0]}
  if(!isHost&&d.type==='ctf-ev')showToast(String(d.txt||'').slice(0,60));
  if(!isHost&&d.type==='teams'&&d.t&&typeof d.t==='object'){teamOf=new Map(Object.entries(d.t).map(([k,v])=>[k,+v?1:0]));myTeam=teamOf.get(currentName)||0;refreshTeams()}
  if(d.type==='vote'&&isHost&&voting&&MAPS[d.map]){votes[c.peer]=d.map;sendTally()}
  if(!isHost&&d.type==='tally'){lastTally=d.c||lastTally;showVote()}
  if(!isHost&&d.type==='vote-start'){voting=true;voteT=+d.t||12;myVote=null;lastTally={yard:0,store:0,dealer:0,water:0,port:0,site:0};inCar=false;document.exitPointerLock&&document.exitPointerLock();showVote()}
  if(!isHost&&d.type==='map'&&MAPS[d.map])applyMap(d.map,+d.seed||1);
  if(d.type==='hello'){
   const incoming=String(d.name||'guest').trim().slice(0,16),normalized=incoming.toLowerCase();
   if(isHost){const used=[currentName.toLowerCase(),...Array.from(lobbyNames.entries()).filter(e=>e[0]!==c.peer).map(e=>e[1].toLowerCase())];if(used.includes(normalized)){c.send({type:'reject',reason:'CALLSIGN ALREADY IN USE IN THIS LOBBY'});c.close();return}const had=lobbyNames.has(c.peer);lobbyNames.set(c.peer,incoming);if(!had){c.send({type:'accepted',pvp,ctf});assignTeams();if(pvp){if(voting)c.send({type:'vote-start',t:voteT});else if(matchStarted)c.send({type:'map',map:curMap,seed:mapSeed});else startVote()}}}
   else if(d.pvp&&!pvp)setPvp(true);
   ensureRemote(c.peer,incoming);
  }
 });
 c.on('close',()=>{connections=connections.filter(x=>x!==c);lobbyNames.delete(c.peer);removeRemote(c.peer);assignTeams()});
}
function broadcast(dt){
 lastBroadcast+=dt;if(lastBroadcast<.05)return;lastBroadcast=0;if(!peer)return;
 send({type:'state',name:currentName,ch:myCh,weapon:weaponIndex,pos:{x:player.pos.x,z:player.pos.z,y:groundY},yaw,health,inCar,dead,car:inCar?{x:car.position.x,z:car.position.z,rot:car.rotation.y}:null});
}
function remoteSmooth(dt){
 const now=performance.now(),k=Math.min(1,dt*16);
 remoteMeshes.forEach((r,id)=>{
  if(!r.first&&now-r.seen>6000){removeRemote(id);return}
  const m=r.mesh;m.position.x+=(r.tx-m.position.x)*k;m.position.z+=(r.tz-m.position.z)*k;
  m.rotation.y+=Math.atan2(Math.sin(r.tyaw-m.rotation.y),Math.cos(r.tyaw-m.rotation.y))*k;
  m.rotation.x+=((r.dead?1.5:0)-m.rotation.x)*Math.min(1,dt*6);if(r.emote){r.emote.t-=dt;r.emote.sp.position.y=3.1+Math.sin(now/200)*.08;if(r.emote.t<=0){m.remove(r.emote.sp);r.emote=null}}r.by=(r.by||0)+((r.ty||0)-(r.by||0))*k;m.position.y=r.by+(r.emote&&!r.dead?Math.abs(Math.sin(now/120))*.18:0);
  {const P=r.body&&r.body.userData.parts;if(P){const v=Math.min(1,Math.hypot(r.tx-m.position.x,r.tz-m.position.z)*16/7),ph=now/110,sw=Math.sin(ph)*.8*v;P.lL.rotation.x=sw;P.lR.rotation.x=-sw;P.aL.rotation.x=-sw*.8;P.aR.rotation.x=-1.2+sw*.15;r.body.position.y=Math.abs(Math.sin(ph))*.04*v;if(r.emote&&!r.dead){P.aL.rotation.z=-2.6+Math.sin(now/90)*.4;P.aL.rotation.x=0}else P.aL.rotation.z=0}}
  if(r.inCar&&r.car&&car){if(!r.carMesh){r.carMesh=car.clone(true);scene.add(r.carMesh)}r.carMesh.visible=true;r.carMesh.position.set(+r.car.x||0,0,+r.car.z||0);r.carMesh.rotation.y=+r.car.rot||0}else if(r.carMesh)r.carMesh.visible=false;m.visible=!r.inCar;r.tag.visible=!r.dead;r.healthBar.visible=!r.dead;
 });
}
function reload(){if(reloadT>0||dead||ammo[weaponIndex]>=weapons[weaponIndex].mag)return;reloadT=reloadMax=weapons[weaponIndex].rl;playSound('switch')}
function shootRay(origin,dir,w){
 if(!w.melee)makeTracer(origin,dir,w.color);
 const ray=new THREE.Raycaster(origin,dir,0,w.range);
 const sh=ray.intersectObjects(obstacles.filter(o=>o.visible&&o.userData&&o.userData.hp>0),false)[0];
 const et=[],rt=[];enemies.forEach(e=>e.traverse(o=>{if(o.isMesh)et.push(o)}));
 if(pvp)remoteMeshes.forEach(r=>{if(!r.dead&&r.mesh.visible&&!(ctf&&teamOf.get(r.name)===myTeam))r.mesh.traverse(o=>{if(o.isMesh)rt.push(o)})});
 const eh=ray.intersectObjects(et,false)[0],ph=rt.length?ray.intersectObjects(rt,false)[0]:null;
 const best=[sh,eh,ph].filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];if(!best)return;
 const top=o=>{while(o.parent&&o.parent!==scene)o=o.parent;return o};
 if(best===sh){
  const wall=sh.object;burst(sh.point,4,0xd9d2a8,2.5);
  if(!pvp&&!w.melee){if(!wall.userData.own){wall.material=wall.material.clone();wall.userData.own=true}wall.userData.hp-=w.damage*(w.pellets>1?.5:1);const ratio=clamp(wall.userData.hp/wall.userData.maxHp,0,1);wall.material.color.lerp(new THREE.Color(0x181916),(1-ratio)*.25);if(wall.userData.hp<=0){scene.remove(wall);obstacles=obstacles.filter(o=>o!==wall);const bi=buildPieces.indexOf(wall);if(bi>=0)buildPieces.splice(bi,1);showToast('COVER DESTROYED')}}
 }else if(best===eh){
  const e=top(eh.object);if(!enemies.includes(e))return;
  const head=(eh.point.y-e.position.y)/e.scale.y>1.35;
  e.userData.hp-=w.edmg*(head?2:1);playSound('hit');burst(eh.point,head?7:4,0xff5a3c,3);hitmark(false);
  refreshHealthBar(e.userData.healthBar,Math.max(0,e.userData.hp),e.userData.maxHp);
  e.position.addScaledVector(dir.clone().setY(0).normalize(),.12);
  if(e.userData.hp<=0)killEnemy(e,eh.point,head);
 }else{
  const t=top(ph.object);let tid=null;remoteMeshes.forEach((r,id)=>{if(r.mesh===t)tid=id});if(tid===null)return;
  const head=ph.point.y-t.position.y>1.32,dmg=Math.round(w.pd*(head?1.8:1));
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
 if(emoteCD>0)emoteCD-=dt;ctfHost(dt);ctfFrame();if(holdFire&&weapons[weaponIndex].auto&&!buildMode)fire();boardT-=dt;if(boardT<=0){boardT=.6;renderBoard()}if(carBeacon&&car){carBeacon.position.set(car.position.x,20,car.position.z);carBeacon.visible=!inCar}if(voting){voteT-=dt;$('vote-timer').textContent=Math.max(0,Math.ceil(voteT));if(isHost&&voteT<=0)resolveVote()}
}
function animViewModel(dt){
 const vm=viewModel;if(!vm)return;vm.visible=!dead;
 const t=clock.elapsedTime,sp=player.vel.length(),moving=sp>.4&&groundY<=floorY+.02,rate=sp>11?13:9,u=vm.userData;
 recoil=Math.max(0,recoil-dt*6);flashT=Math.max(0,flashT-dt);swayX*=Math.pow(.02,dt);swayY*=Math.pow(.02,dt);
 const rl=reloadT>0?Math.sin((1-reloadT/reloadMax)*Math.PI):0;
 vm.position.x=u.baseX+(moving?Math.cos(t*rate*.5)*.012:Math.sin(t*1.5)*.002)-swayX*.8;
 vm.position.y=u.baseY+(moving?-Math.abs(Math.sin(t*rate*.5))*.02:Math.sin(t*1.6)*.004)+swayY*.8-rl*.18;
 vm.rotation.z=-swayX*2.2+rl*.25;vm.rotation.x=rl*.5;
 vm.rotation.y+=((sp>11?-.15:0)-vm.rotation.y)*Math.min(1,dt*8);
 u.gun.position.z=recoil*.07;u.gun.rotation.x=-recoil*.12;u.gun.position.x=0;u.gun.rotation.y=0;u.gun.rotation.z=0;
 if(drawT>0){drawT=Math.max(0,drawT-dt);const q=drawT/.4;vm.position.y-=q*q*.45;vm.rotation.x+=q*.8}
 if(landT>0){landT=Math.max(0,landT-dt);vm.position.y-=Math.sin(landT/.25*Math.PI)*.07}
 if(groundY>floorY+.05)vm.position.y+=.03;if(sp>11&&moving)vm.rotation.x+=.12;
 if(knifeT>0){knifeT=Math.max(0,knifeT-dt);const p=1-knifeT/.32,sn=Math.sin(p*Math.PI);u.gun.rotation.set(-sn*.5,sn*.5,-sn*1.3);u.gun.position.x=-sn*.28;u.gun.position.z=-sn*.25}
 if(u.flash){u.flash.visible=flashT>0;u.flash.rotation.z=Math.random()*6.28;u.flash.scale.setScalar(.7+Math.random()*.7)}
 const tf=sp>11?86:78;if(Math.abs(camera.fov-tf)>.05){camera.fov+=(tf-camera.fov)*Math.min(1,dt*8);camera.updateProjectionMatrix()}
}
function setPvp(v){
 pvp=v;if(!v)return;if(curMap==='yard'&&!matchStarted&&scene)buildMap('yard',1);if(ctf){ctfReset();ctfBuildObjs()}
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
 if(!ctf&&pvpScores[killer]>=PVP_TARGET){showToast('MATCH OVER · '+killer.toUpperCase()+' WINS');setTimeout(()=>{for(const k in pvpScores)pvpScores[k]=0;showToast('NEW MATCH · FIRST TO '+PVP_TARGET);if(isHost)startVote()},5000)}
 renderBoard();
}
function pickSpawn(){
 if(!pvp)return{x:(Math.random()-.5)*10,z:10};
 if(ctf){const T=(TEAMSPAWN[curMap]||TEAMSPAWN.yard)[myTeam?'blue':'red'],q=T[Math.floor(Math.random()*T.length)];return{x:q[0],z:q[1]}}
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
function solid(x,z,w,h,d,m,ry){const o=box(scene,w,h,d,m,x,h/2,z);if(ry)o.rotation.y=ry;o.userData={w:ry?d:w,d:ry?w:d,hp:9999,maxHp:9999,cover:true};obstacles.push(o);return o}
function deco(x,y,z,w,h,d,m){return box(scene,w,h,d,m,x,y,z)}
function perim(h,m){for(const g of[-1,1]){solid(0,g*84,168,h,1,m);solid(g*84,0,1,h,168,m)}}
function staticCar(x,z,color,side){const w=side?4.8:2.4,d=side?2.4:4.8;solid(x,z,w,1,d,mat(color,.35,.4));deco(x,1.4,z,side?2.5:1.9,.75,side?1.9:2.5,mats.glass)}
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
function clearMap(){mapObjs.forEach(o=>scene.remove(o));buildPieces.forEach(o=>scene.remove(o));obstacles=obstacles.filter(o=>!mapObjs.includes(o)&&!buildPieces.includes(o));buildPieces.length=0;mapObjs=[]}
function setSprint(v){sprintOn=v;const b=$('mobile-sprint');if(b)b.classList.toggle('active',v)}
function toggleCar(){
 if(!car||dead||voting)return;
 const d=Math.hypot(player.pos.x-car.position.x,player.pos.z-car.position.z);
 if(!inCar){if(d<5){playSound('car-on');inCar=true;car.userData.speed=0;showToast('VEHICLE ACQUIRED · W/S DRIVE · A/D STEER')}else showToast('CAR IS '+Math.round(d)+'M AWAY · FOLLOW THE GREEN BEAM')}
 else{playSound('car-off');inCar=false;player.pos.x=car.position.x+Math.cos(car.rotation.y)*2.4;player.pos.z=car.position.z-Math.sin(car.rotation.y)*2.4;showToast('ON FOOT')}
}
function tally(){const c=emptyTally();Object.values(votes).forEach(m=>{if(c[m]!==undefined)c[m]++});return c}
function sendTally(){lastTally=tally();send({type:'tally',c:lastTally});showVote()}
function showVote(){
 const v=$('vote');if(!v)return;v.classList.toggle('hidden',!voting);if(!voting)return;
 for(const m in MAPS){$('vc-'+m).textContent=lastTally[m]||0;v.querySelector('[data-map='+m+']').classList.toggle('mine',myVote===m)}
 $('vote-timer').textContent=Math.max(0,Math.ceil(voteT));
}
function startVote(){voting=true;voteT=12;votes={};myVote=null;lastTally={yard:0,store:0,dealer:0,water:0,port:0,site:0};if(inCar)inCar=false;document.exitPointerLock&&document.exitPointerLock();send({type:'vote-start',t:voteT});showVote();showToast('VOTE FOR THE NEXT MAP')}
function castVote(m){if(!voting||!MAPS[m])return;myVote=m;playSound('ui');if(isHost){votes.host=m;sendTally()}else{send({type:'vote',map:m});showVote()}}
function resolveVote(){
 const c=tally(),max=Math.max(...Object.values(c)),top=Object.keys(c).filter(m=>c[m]===max);
 const map=top[Math.floor(Math.random()*top.length)],seed=1+Math.floor(Math.random()*1e9);
 send({type:'map',map,seed});applyMap(map,seed);
}
function applyMap(name,seed){
 voting=false;matchStarted=true;mapSeed=seed;inCar=false;buildMap(name,seed);ctfReset();ctfBuildObjs();if(isHost){assignTeams();ctfBroadcast()}
 for(const k in pvpScores)pvpScores[k]=0;showVote();respawn();showToast('MAP · '+MAPS[name]+' · FIRST TO '+PVP_TARGET);renderBoard();updateHud();
}

let holdFire=false,emoteCD=0,emoteOpen=false,emoteEdit=false,emoteSel=0;
const EMOTES={wave:['👋','Wave'],thumb:['👍','Nice'],laugh:['😂','Haha'],gg:['GG','GG'],angry:['😡','Mad'],cry:['😭','Sad'],think:['🤔','Hmm'],skull:['💀','Dead'],fire:['🔥','Fire'],dance:['🕺','Dance'],eyes:['👀','Watching'],target:['🎯','Aimbot?'],clown:['🤡','Clown'],heart:['❤️','Love']};
const EDEFAULT=['wave','thumb','laugh','gg','angry','cry','skull','fire'],EKEY='deadzone.emotes.v1';
const evalid=k=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(EMOTES,k);
let slots=EDEFAULT.slice();
try{const v=JSON.parse(localStorage.getItem(EKEY)||'null');if(Array.isArray(v)&&v.length===8&&v.every(evalid))slots=v}catch(e){}
function saveSlots(){try{localStorage.setItem(EKEY,JSON.stringify(slots))}catch(e){}saveProfile({emotes:slots})}
function emoteSprite(k){
 const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),e=EMOTES[k][0];
 g.fillStyle='rgba(12,14,11,.78)';g.beginPath();g.arc(64,64,60,0,7);g.fill();g.strokeStyle='#d5ff56';g.lineWidth=4;g.stroke();g.textAlign='center';g.textBaseline='middle';
 if(/^[A-Za-z]/.test(e)){g.font='bold 48px sans-serif';g.fillStyle='#f3f4ed'}else g.font='64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
 g.fillText(e,64,70);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true}));sp.scale.set(1.1,1.1,1);return sp;
}
function showRemoteEmote(id,k){
 const r=remoteMeshes.get(id);if(!r||!evalid(k))return;
 if(r.emote)r.mesh.remove(r.emote.sp);const sp=emoteSprite(k);sp.position.y=3.1;r.mesh.add(sp);r.emote={sp,t:3};emoteBy.set(r.name,{k,until:performance.now()+4000});renderBoard();
}
function useEmote(k){
 if(!evalid(k)||dead||voting||emoteCD>0)return;emoteCD=1.5;playSound('ui');
 const p=$('emote-pop');p.textContent=EMOTES[k][0];p.classList.remove('on');void p.offsetWidth;p.classList.add('on');
 send({type:'emote',k});emoteBy.set(currentName,{k,until:performance.now()+4000});renderBoard();closeEmote(true);
}
function renderEmote(){
 const w=$('emote-wheel'),lib=$('emote-lib');w.textContent='';lib.textContent='';
 slots.forEach((k,i)=>{
  const b=document.createElement('button'),a=i/8*Math.PI*2-Math.PI/2;b.className='emote-slot'+(emoteEdit&&i===emoteSel?' sel':'');
  b.style.left=(50+Math.cos(a)*37)+'%';b.style.top=(50+Math.sin(a)*37)+'%';b.type='button';b.textContent=EMOTES[k][0];
  const sm=document.createElement('small');sm.textContent=EMOTES[k][1];b.appendChild(sm);
  b.addEventListener('pointerup',ev=>{ev.preventDefault();if(emoteEdit){emoteSel=i;renderEmote()}else useEmote(k)});w.appendChild(b);
 });
 const h=document.createElement('div');h.id='emote-hint';h.textContent=emoteEdit?'Pick a slot, then an emote':'Tap an emote or press 1–8';w.appendChild(h);
 lib.classList.toggle('hidden',!emoteEdit);$('emote-reset').classList.toggle('hidden',!emoteEdit);$('emote-edit').textContent=emoteEdit?'Done':'Customize';
 if(emoteEdit)Object.keys(EMOTES).forEach(k=>{const b=document.createElement('button');b.type='button';b.textContent=EMOTES[k][0];b.title=EMOTES[k][1];b.addEventListener('pointerup',ev=>{ev.preventDefault();slots[emoteSel]=k;emoteSel=(emoteSel+1)%8;saveSlots();renderEmote()});lib.appendChild(b)});
}
function openEmote(){if(!started||dead||voting)return;emoteOpen=true;holdFire=false;renderEmote();$('emote').classList.remove('hidden');document.exitPointerLock&&document.exitPointerLock()}
function closeEmote(relock){emoteOpen=false;emoteEdit=false;$('emote').classList.add('hidden');if(relock&&!mobile.enabled&&renderer){try{renderer.domElement.requestPointerLock()}catch(e){}}}
function toggleEmote(){emoteOpen?closeEmote(false):openEmote()}
function initEmotes(){
 $('emote-edit').addEventListener('pointerup',e=>{e.preventDefault();emoteEdit=!emoteEdit;emoteSel=0;renderEmote()});
 $('emote-reset').addEventListener('pointerup',e=>{e.preventDefault();slots=EDEFAULT.slice();saveSlots();renderEmote()});
 $('emote-close').addEventListener('pointerup',e=>{e.preventDefault();closeEmote(true)});
 document.addEventListener('mouseup',e=>{if(e.button===0)holdFire=false});window.addEventListener('blur',()=>{holdFire=false});
}

const SKIN=[0xf1c9a5,0xe0ac82,0xc68642,0x8d5524,0x5c3a21,0xffdbac],OUTFIT=[0x62685c,0xc65e42,0x3b6ea5,0x2f7d5b,0x7a4aa8,0x222222,0xd5a021,0xb83a5b],HAIRC=[0x1b1b1b,0x5a3825,0xb5651d,0xe8c872,0xc0392b,0x7f5bd6,0x2e9edb,0xdddddd];
const CATS=[['hair','Hair',['None','Short','Spiky','Mohawk','Long','Afro']],['hairc','Hair color',['Black','Brown','Ginger','Blonde','Red','Purple','Blue','Silver']],['hat','Hat',['None','Cap','Beanie','Cowboy','Top hat','Crown']],['glasses','Eyewear',['None','Shades','Visor']],['chain','Chain',['None','Gold chain','Silver chain','Double chain','Pendant']],['shoes','Shoes',['Boots','White sneakers','Red sneakers','Gold shoes','Barefoot']],['skin','Skin tone',['Light','Fair','Tan','Brown','Deep','Pale']],['color','Outfit',['Olive','Rust','Blue','Green','Purple','Black','Gold','Rose']]];
const defaultChar=()=>({hair:1,hairc:1,hat:0,glasses:0,chain:0,shoes:0,skin:1,color:Math.floor(Math.random()*OUTFIT.length)});
const enc=c=>CATS.map(x=>c[x[0]]|0).join('.');
function parseChar(s){const p=String(s).split('.'),o={};CATS.forEach(([k,,opts],i)=>{const v=parseInt(p[i],10);o[k]=Number.isFinite(v)?Math.max(0,Math.min(opts.length-1,v)):0});return o}
let charCfg=defaultChar(),myCh=enc(charCfg),acct=null,fauth=null,db=null,chatUnsub=null,chatLines=[],chatOpen=false,lastChat=0,signingUp=false,prev=null;
const EDOM='@deadzone.user',fbOK=()=>!!(window.firebase&&firebase.auth&&firebase.firestore&&window.FIREBASE_CONFIG&&!String(FIREBASE_CONFIG.apiKey||'PASTE').includes('PASTE'));
function saveProfile(p){if(acct&&db)db.collection('users').doc(acct.uid).set(p,{merge:true}).catch(e=>console.warn('profile save failed',e))}
async function loadProfile(){const d=await db.collection('users').doc(acct.uid).get();if(d.exists){const p=d.data();if(p.username)acct.username=String(p.username);if(Array.isArray(p.emotes)&&p.emotes.length===8&&p.emotes.every(evalid))slots=p.emotes;if(typeof p.char==='string')charCfg=parseChar(p.char)}myCh=enc(charCfg)}
function updateAcctUI(){
 const on=!!acct;$('acct-name').textContent=on?acct.username:'GUEST';
 ['acct-char','acct-out'].forEach(i=>$(i).classList.toggle('hidden',!on));$('acct-in').classList.toggle('hidden',on);
 $('callsign').classList.toggle('hidden',on);$('callsign-lbl').classList.toggle('hidden',on);$('chat').classList.remove('hidden');
 if(!fbOK()){$('acct-in').textContent='Accounts not set up';$('acct-in').disabled=true}
}
async function afterLogin(u){acct={uid:u.uid,username:String(u.email||'player').split('@')[0]};try{await loadProfile()}catch(e){console.warn(e)}updateAcctUI();startChat()}
function afterLogout(){acct=null;updateAcctUI()}
function authErr(e){const c=(e&&e.code)||'';if(c==='auth/email-already-in-use')return'That username is taken.';if(/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c))return'Wrong username or password.';if(c==='auth/weak-password')return'Password needs at least 6 characters.';if(c==='auth/too-many-requests')return'Too many attempts. Try again later.';if(c==='auth/network-request-failed')return'Network problem. Try again.';if(c==='auth/operation-not-allowed')return'Email/Password sign-in is not enabled in Firebase yet.';return'Something went wrong ('+(c||'unknown')+').'}
async function doAuth(create){
 const name=$('auth-user').value.trim(),pw=$('auth-pass').value,err=$('auth-err');err.textContent='';
 if(!/^[A-Za-z0-9_]{3,16}$/.test(name)){err.textContent='Username: 3–16 letters, numbers or underscores.';return}
 if(pw.length<6){err.textContent='Password needs at least 6 characters.';return}
 const l=name.toLowerCase(),btns=[$('auth-go'),$('auth-new')];btns.forEach(b=>b.disabled=true);
 try{
  if(create){
   signingUp=true;const cred=await fauth.createUserWithEmailAndPassword(l+EDOM,pw);
   await db.collection('usernames').doc(l).set({uid:cred.user.uid});
   await db.collection('users').doc(cred.user.uid).set({username:name,lname:l,emotes:slots,char:enc(charCfg)});
   signingUp=false;await afterLogin(cred.user);
  }else await fauth.signInWithEmailAndPassword(l+EDOM,pw);
  $('auth').classList.add('hidden');$('auth-pass').value='';
 }catch(e){signingUp=false;err.textContent=authErr(e)}
 finally{btns.forEach(b=>b.disabled=false)}
}
function renderChat(){
 const log=$('chat-log');if(!log)return;log.textContent='';const now=Date.now();
 chatLines.slice(-(chatOpen?20:6)).forEach(l=>{if(!chatOpen&&now-l.ts>12000)return;const p=document.createElement('div'),b=document.createElement('b');b.textContent=l.u+' ';p.appendChild(b);p.appendChild(document.createTextNode(l.text));log.appendChild(p)});
}
function stopChat(){if(chatUnsub){chatUnsub();chatUnsub=null}chatLines=[];renderChat()}
function startChat(){stopChat();chatUnsub=db.collection('chat').orderBy('ts','desc').limit(30).onSnapshot(s=>{chatLines=s.docs.map(d=>{const x=d.data({serverTimestamps:'estimate'});return{u:String(x.u||'?'),text:String(x.text||''),ts:x.ts&&x.ts.toMillis?x.ts.toMillis():Date.now()}}).reverse();renderChat()},e=>console.warn('chat',e))}
function openChat(){if(!acct){showToast('SIGN IN TO SEND MESSAGES');return}if(chatOpen)return;chatOpen=true;holdFire=false;const i=$('chat-input');i.classList.remove('hidden');i.value='';renderChat();document.exitPointerLock&&document.exitPointerLock();i.focus()}
function closeChat(relock){chatOpen=false;const i=$('chat-input');i.classList.add('hidden');i.blur();renderChat();if(relock&&!mobile.enabled&&started&&renderer){try{renderer.domElement.requestPointerLock()}catch(e){}}}
function sendChat(){const t=$('chat-input').value.trim().slice(0,200);if(t&&acct&&Date.now()-lastChat>800){lastChat=Date.now();db.collection('chat').add({u:acct.username,uid:acct.uid,text:t,ts:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>showToast('MESSAGE NOT SENT'))}closeChat(true)}
function refreshPrev(){if(prev.av)prev.s.remove(prev.av);prev.av=buildAvatar(charCfg);prev.s.add(prev.av)}
function prevLoop(){if($('charedit').classList.contains('hidden'))return;prev.av.rotation.y+=.012;prev.r.render(prev.s,prev.cam);requestAnimationFrame(prevLoop)}
function renderCharRows(){
 const box_=$('char-rows');box_.textContent='';
 CATS.forEach(([k,n,opts])=>{
  const row=document.createElement('div'),lab=document.createElement('span'),val=document.createElement('b'),step=d=>{const b=document.createElement('button');b.type='button';b.textContent=d<0?'◀':'▶';b.setAttribute('aria-label',(d<0?'Previous ':'Next ')+n);b.addEventListener('click',()=>{charCfg[k]=(charCfg[k]+d+opts.length)%opts.length;val.textContent=opts[charCfg[k]];refreshPrev()});return b};
  row.className='char-row';lab.textContent=n;val.textContent=opts[charCfg[k]];row.append(lab,step(-1),val,step(1));box_.appendChild(row);
 });
}
function openChar(){
 $('charedit').classList.remove('hidden');renderCharRows();
 if(!prev){const r=new THREE.WebGLRenderer({antialias:true,alpha:true});r.setSize(220,280);r.setPixelRatio(Math.min(devicePixelRatio,2));$('char-prev').appendChild(r.domElement);const s=new THREE.Scene();s.add(new THREE.HemisphereLight(0xffffff,0x555555,2.2));const dl=new THREE.DirectionalLight(0xffffff,1.5);dl.position.set(2,4,3);s.add(dl);const cam=new THREE.PerspectiveCamera(35,220/280,.1,50);cam.position.set(0,1.05,5.2);cam.lookAt(0,1,0);prev={r,s,cam,av:null}}
 refreshPrev();prevLoop();
}
function initAccounts(){
 const on=(id,fn)=>$(id).addEventListener('click',fn);
 on('acct-in',()=>{$('auth-err').textContent='';$('auth').classList.remove('hidden');$('auth-user').focus()});
 on('auth-cancel',()=>$('auth').classList.add('hidden'));on('auth-go',()=>doAuth(false));on('auth-new',()=>doAuth(true));
 on('acct-out',()=>{if(fauth)fauth.signOut()});on('acct-char',openChar);on('char-close',()=>$('charedit').classList.add('hidden'));
 on('char-save',()=>{myCh=enc(charCfg);saveProfile({char:myCh});$('charedit').classList.add('hidden');status.textContent='CHARACTER SAVED'});
 $('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendChat()}else if(e.key==='Escape')closeChat(false)});
 setInterval(renderChat,1500);updateAcctUI();
 if(!fbOK())return;
 try{firebase.initializeApp(FIREBASE_CONFIG);fauth=firebase.auth();db=firebase.firestore();startChat();fauth.onAuthStateChanged(u=>{if(signingUp)return;u?afterLogin(u):afterLogout()})}catch(e){console.warn('firebase init failed',e);$('acct-in').textContent='Accounts unavailable';$('acct-in').disabled=true}
}

// ===== batching, platforms and map data =====
const MAPS={yard:'THE YARD',store:'MEGA MARKET',dealer:'AUTO PLAZA',water:'SPLASH ZONE',port:'CARGO PORT',site:'BUILD SITE'};
const VC=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8}),VB=new THREE.MeshBasicMaterial({vertexColors:true}),VT=new THREE.MeshStandardMaterial({vertexColors:true,transparent:true,opacity:.62,roughness:.15,metalness:.1});
function mkBatch(){
 const bk={s:{mt:VC,p:[],n:[],u:[],c:[]},b:{mt:VB,p:[],n:[],u:[],c:[]},t:{mt:VT,p:[],n:[],u:[],c:[]}},Q=new THREE.Quaternion(),E=new THREE.Euler(0,0,0,'YXZ'),V=new THREE.Vector3(),S=new THREE.Vector3(1,1,1),M=new THREE.Matrix4(),C=new THREE.Color();
 const add=(geo,x,y,z,col,rot,k)=>{
  const g=geo.index?geo.toNonIndexed():geo;
  if(Array.isArray(rot))E.set(rot[0]||0,rot[1]||0,rot[2]||0);else E.set(0,rot||0,0);
  Q.setFromEuler(E);V.set(x,y,z);M.compose(V,Q,S);g.applyMatrix4(M);
  const o=bk[k||'s'],n=g.attributes.position.count;C.set(col===undefined?0xffffff:col);
  o.p.push(g.attributes.position.array);o.n.push(g.attributes.normal.array);o.u.push(g.attributes.uv.array);
  const ca=new Float32Array(n*3);for(let i=0;i<n;i++){ca[i*3]=C.r;ca[i*3+1]=C.g;ca[i*3+2]=C.b}o.c.push(ca);
 };
 const cat=(a,Ty)=>{let l=0;a.forEach(x=>l+=x.length);const r=new Float32Array(l);let i=0;a.forEach(x=>{r.set(x,i);i+=x.length});return r};
 return{
  box:(w,h,d,x,y,z,c,r,k)=>add(new THREE.BoxGeometry(w,h,d),x,y,z,c,r,k),
  cyl:(rad,h,x,y,z,c,r,k,seg)=>add(new THREE.CylinderGeometry(rad,rad,h,seg||8),x,y,z,c,r,k),
  cone:(rad,h,x,y,z,c,r,k,seg)=>add(new THREE.ConeGeometry(rad,h,seg||6),x,y,z,c,r,k),
  sph:(rad,x,y,z,c,k)=>add(new THREE.SphereGeometry(rad,8,6),x,y,z,c,0,k),
  flush(){for(const k in bk){const o=bk[k];if(!o.p.length)continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(cat(o.p),3));g.setAttribute('normal',new THREE.BufferAttribute(cat(o.n),3));g.setAttribute('uv',new THREE.BufferAttribute(cat(o.u),2));g.setAttribute('color',new THREE.BufferAttribute(cat(o.c),3));const m=new THREE.Mesh(g,o.mt);m.castShadow=k!=='t';m.receiveShadow=true;scene.add(m)}}
 };
}
function elev(x,y0,z,w,h,d,m,ry){const o=box(scene,w,h,d,m,x,y0+h/2,z);if(ry)o.rotation.y=ry;o.userData={w:ry?d:w,d:ry?w:d,hp:9999,maxHp:9999,cover:true};obstacles.push(o);return o}
let keep=[];
const ok=(x,z,r)=>keep.every(k=>Math.hypot(x-k[0],z-k[1])>k[2]+(r||0)),rr=(a,b)=>a+rnd()*(b-a),pick=a=>a[Math.floor(rnd()*a.length)];
function scat(n,r,fn,lim){lim=lim||76;let t=0,i=0;while(i<n&&t++<n*25){const x=rr(-lim,lim),z=rr(-lim,lim);if(ok(x,z,r)){fn(x,z,i);i++}}}
// A raised deck with four legs, rails and a straight staircase. dir = direction of travel up the stairs: 0:+x 1:-x 2:+z 3:-z.
function tower(B,x,z,H,dir,w,d,m,col){
 const n=Math.round(H/.5),dx=[1,-1,0,0][dir],dz=[0,0,1,-1][dir],al=dir<2,run=1.1,sw=3.2,ex=x-dx*w/2,ez=z-dz*d/2;
 elev(x,H-.4,z,w,.4,d,m);
 for(const a of[-1,1])for(const b of[-1,1])elev(x+a*(w/2-.4),0,z+b*(d/2-.4),.7,H-.4,.7,m);
 for(let i=0;i<n;i++){const cx=ex-dx*(n-.5-i)*run,cz=ez-dz*(n-.5-i)*run;elev(cx,0,cz,al?run:sw,(i+1)*.5,al?sw:run,m);if(i%3===0)keep.push([cx,cz,3.4])}
 keep.push([x,z,Math.max(w,d)/2+3]);
 B.box(w+.5,.22,d+.5,x,H+.11,z,col);
 for(const s of[-1,1]){if(!(al&&Math.sign(ex-x)===s))B.box(.14,1.1,d,x+s*w/2,H+.7,z,col);if(!(!al&&Math.sign(ez-z)===s))B.box(w,1.1,.14,x,H+.7,z+s*d/2,col)}
 B.cyl(1.3,.12,x,H+.06,z,0xffffff);
}
const lamp=(B,x,z,h,col)=>{B.cyl(.12,h,x,h/2,z,0x3a3d38);B.box(.9,.18,.35,x,h,z,col||0xfff0b8,0,'b')};
function pine(B,x,z,s){s=s||1;B.cyl(.28*s,2.2*s,x,1.1*s,z,0x5a3d26);for(let i=0;i<3;i++)B.cone((2.1-i*.5)*s,2.4*s,x,(2.8+i*1.5)*s,z,pick([0x2f6b3a,0x3a7d44,0x275d33]),0,null,7)}
function palm(B,x,z){const t=rr(-.15,.15);B.cyl(.22,6.2,x,3.1,z,0x8a6a3f,[t,0,t*.6]);for(let i=0;i<7;i++){const a=i/7*6.283,tx=x+Math.sin(a)*1.5+t*5,tz=z+Math.cos(a)*1.5;B.box(.8,.07,3.3,tx,6.3,tz,pick([0x2f9e44,0x3dbb5a,0x278a3b]),[.45,a,0])}B.sph(.3,x+t*6,6.1,z,0x6b4a2b)}
function reserve(name){keep=[];(SPAWNS[name]||[]).forEach(p=>keep.push([p[0],p[1],5]));['red','blue'].forEach(t=>((TEAMSPAWN[name]||{})[t]||[]).forEach(p=>keep.push([p[0],p[1],4])))}
const SPAWNS={
 yard:[[-62,-62],[62,-62],[-62,62],[62,62],[0,-72],[0,72],[-72,0],[72,0],[-28,28],[28,-28],[0,0]],
 store:[[0,-45],[0,-10],[0,27],[0,54],[-42,-45],[42,-45],[-42,-9],[42,-9],[-42,27],[42,27],[-78,-78],[78,78]],
 dealer:[[-76,-76],[76,-76],[-76,76],[76,76],[0,-76],[0,76],[-30,0],[30,0],[-76,0],[76,0]],
 water:[[-76,-20],[76,20],[-20,-76],[20,76],[-76,76],[76,-76],[0,-40],[0,40],[-40,0],[40,0]],
 port:[[-76,0],[76,0],[0,-76],[0,60],[-30,-30],[30,30],[-30,30],[30,-30],[-76,-76],[76,76]],
 site:[[-76,0],[76,0],[0,-76],[0,76],[-30,-30],[30,30],[-30,30],[30,-30],[-76,-40],[76,40]]};
const TEAMSPAWN={
 yard:{red:[[-60,-50],[-50,-62],[-58,-76],[-44,-58]],blue:[[60,50],[50,62],[58,76],[44,58]]},
 store:{red:[[-42,-45],[42,-45],[-30,-45],[30,-45]],blue:[[-42,27],[42,27],[-30,27],[30,27]]},
 dealer:{red:[[-76,-10],[-76,-50],[-60,-20],[-76,-76]],blue:[[76,10],[76,50],[60,20],[76,76]]},
 water:{red:[[-76,-50],[-50,-76],[-76,-76],[-40,-60]],blue:[[76,50],[50,76],[76,76],[40,60]]},
 port:{red:[[-76,-50],[-50,-76],[-76,-76],[-60,-50]],blue:[[76,50],[50,76],[76,76],[60,50]]},
 site:{red:[[-76,-40],[-76,-70],[-50,-76],[-45,-50]],blue:[[76,40],[76,70],[50,76],[45,50]]}};
const FLAGSPOT={yard:{red:[-70,7,-70],blue:[70,7,70]},store:{red:[0,6,-75],blue:[0,6,75]},dealer:{red:[-72,7,-30],blue:[72,7,30]},water:{red:[-62,9,-62],blue:[62,9,62]},port:{red:[-68,8,-68],blue:[68,8,68]},site:{red:[-62,8,-55],blue:[62,8,55]}};
const CARSPOT={yard:[5,-5],store:[0,34],dealer:[36,2],water:[0,40],port:[0,-10],site:[0,10]};

function yardDetail(){
 const B=mkBatch();reserve('yard');
 const wall=mat(0x62665b,.9);
 tower(B,-70,-70,7,1,8,8,wall,0xd9453a);tower(B,70,70,7,0,8,8,wall,0x3b78d9);tower(B,70,-70,5,1,6,6,wall,0x8a8f80);tower(B,-70,70,5,0,6,6,wall,0x8a8f80);
 for(let i=0;i<48;i++){const s=Math.floor(i/12),t=((i%12)+rnd()*.6)/12*150-75,e=79+rnd()*2,x=s<2?t:(s===2?-e:e),z=s===0?-e:s===1?e:t;if(ok(x,z,6))pine(B,x,z,.8+rnd()*.7)}
 scat(190,0,(x,z)=>{B.cone(.18,.5+rnd()*.4,x,.25,z,pick([0x4f8a3c,0x5c9a45,0x3f7a35]),0,null,4)});
 scat(26,1,(x,z)=>B.box(rr(2,6),.03,rr(2,6),x,.02,z,pick([0x4a3f2c,0x55472f,0x3a3a30]),rnd()*3));
 scat(34,2,(x,z)=>{const c=pick([0xc0392b,0x2c6fbb,0x2e9e5b,0xd5a021]);B.cyl(.45,1.1,x,.55,z,c);B.cyl(.47,.08,x,.4,z,0x222222);B.cyl(.47,.08,x,.85,z,0x222222)});
 scat(16,2,(x,z)=>{for(let i=0;i<3;i++)B.cyl(.55,.3,x,.15+i*.3,z,0x161616)});
 scat(14,2,(x,z)=>{const a=rnd()*3;for(let i=0;i<5;i++)for(let r=0;r<2;r++)B.box(1.1,.32,.5,x+Math.cos(a)*(i-2)*1.05,.18+r*.3,z-Math.sin(a)*(i-2)*1.05,0xcfb98a,a)});
 scat(22,2,(x,z)=>B.box(rr(.8,2.2),rr(.6,1.4),rr(.8,2.2),x,.4,z,pick([0x777a72,0x6b6f66,0x85887e]),[rnd(),rnd()*3,rnd()*.5]));
 for(let i=0;i<18;i++){const a=i/18*6.283;const x=Math.sin(a)*62,z=Math.cos(a)*62;if(ok(x,z,3))lamp(B,x,z,6.5)}
 for(let i=-8;i<=8;i++){B.box(.5,.03,3,i*9,.02,-83,0xffd23f);B.box(.5,.03,3,i*9,.02,83,0xffd23f)}
 B.flush();
}
function buildStore(){
 const B=mkBatch(),shelf=mat(0xb7bcc4,.6,.3),cnt=mat(0x2f4f6f,.6),frz=mat(0xcfe8f0,.35,.2),box_=mat(0xb08a58,.9),wall=mat(0xd8d2c0,.9),cart=mat(0x8c9096,.5,.5),pil=mat(0xe9e6da,.8);
 perim(9,wall);reserve('store');
 const PC=[0xd94b3d,0x3da35d,0xf0c230,0x3c7bd9,0xe07b39,0x9b59b6,0xf5f5f0,0x2ec4b6];
 tower(B,0,-75,6,3,20,8,wall,0xd9453a);tower(B,0,75,6,2,20,8,wall,0x3b78d9);
 for(let x=-72;x<=72;x+=12){if(x===0)continue;const ci=(x+72)/12;for(let k=0;k<4;k++){const z=-63+36*k;solid(x,z,3.2,3.4,26,shelf);
  for(const sd of[-1,1])for(let lv=0;lv<3;lv++)for(let i=0;i<10;i++)B.box(.5+rnd()*.35,.55,1.7,x+sd*1.5,.65+lv*.95,z-11.5+i*2.55,PC[(ci+k+i+lv)%8]);
  B.box(3.4,.18,26.2,x,3.5,z,0xdddddd);for(const sd of[-1,1])B.box(.1,.8,26,x+sd*1.66,3.9,z,PC[(ci+k)%8])}
  B.box(3,1,.18,x,6.4,-76,PC[ci%8],0);B.box(3.2,1.2,.1,x,6.4,-76.1,0x222222);B.cyl(.04,2.5,x,7.7,-76,0x444444);}
 for(let z=-72;z<=72;z+=24){B.box(168,.6,.6,0,9.2,z,0x555a60);for(let x=-72;x<=72;x+=24)B.box(.6,.6,24,x,9.2,0,0x555a60)}
 for(let x=-72;x<=72;x+=12)for(let z=-66;z<=66;z+=22){B.cyl(.03,.8,x,8.7,z,0x333333);B.box(.7,.12,2.6,x,8.25,z,0xfffbe8,0,'b')}
 for(const x of[-54,-36,-18,18,36,54]){solid(x,64,7,1.1,2.4,cnt);B.box(6,.12,.9,x,1.15,64,0x222222);B.box(.8,.7,.6,x+2.5,1.5,63.8,0x333b44);B.box(.55,.4,.05,x+2.5,1.9,63.5,0x66ffcc,0,'b');B.box(.2,2.2,.2,x+3.6,1.1,66,0x555555);B.box(1.6,.5,.12,x,3.2,66,0x2f9e44);for(let i=0;i<5;i++)B.box(.35,.3,.3,x-2+i*.7,1.4,65.2,pick(PC))}
 for(let z=-60;z<=60;z+=24){solid(-80,z,3,2.2,18,frz);solid(80,z,3,2.2,18,frz);for(const sx of[-1,1]){B.box(.15,2.6,18,sx*78.4,3.2,z,0x9fe3ff,0,'b');for(let i=0;i<7;i++)B.box(.9,.5,.9,sx*79.2,1.2+(i%3)*.7,z-7.5+i*2.5,pick(PC))}}
 for(const [x,z] of[[-60,-80],[-44,-80],[-28,-80]]){B.box(5,1,2,x,.5,z,0x7a5230);for(let i=0;i<14;i++)B.sph(.28,x-2+(i%7)*.66,1.15+(i>6?.45:0),z-.4+(i>6?.6:0),pick([0xd94b3d,0x3da35d,0xf0c230,0xe07b39]))}
 [[-5,-27,4,3],[5,-1,4,3],[-5,50,5,3.4],[5,15,4,2.6],[4,-58,4,3]].forEach(([x,z,s,h])=>{if(!(Math.abs(x)<2&&z<-50)){solid(x,z,s,h,s,box_);B.box(s+.1,.1,s+.1,x,h*.5,z,0x8a6a3f);B.box(s*.6,.12,s*.6,x,h+.06,z,0xd9d0b8)}});
 for(const [x,z] of[[-9,-20],[9,-34],[-9,40],[9,5],[-9,-55]])for(let i=0;i<4;i++)B.box(.9,.8,1.6,x+i*1.0,.5,z,0x8c9096,.1*i);
 for(let i=0;i<26;i++){const x=(2*Math.floor(rnd()*12)-11)*6,z=rr(-65,65);if(ok(x,z,2)&&Math.abs(x)>8)solid(x,z,1.4,1,2,cart)}
 for(let z=-70;z<=70;z+=7){B.box(.3,.02,3,0,.02,z,0xe0c040);B.box(1.4,.02,.3,0,.02,z+3.5,0xe0c040,.4)}
 for(const px of[-8,8])for(let z=-60;z<=60;z+=24){B.cyl(.55,9,px,4.5,z,0xe9e6da,0,null,10);B.cyl(.7,.4,px,.2,z,0x999488,0,null,10)}
 B.flush();
}
function buildDealer(){
 const B=mkBatch(),glass=new THREE.MeshStandardMaterial({color:0x8fd0e0,transparent:true,opacity:.35,roughness:.1,metalness:.3}),pad=mat(0x555a5e),tire=mat(0x141414),lift=mat(0xd9a521,.5,.3),wall=mat(0x7b8088,.9),pal=[0xc0392b,0x2c6fbb,0xe8e8e8,0x222222,0xf1c40f,0x2e9e5b,0xe67e22,0x8e44ad];
 const car=(x,z,c,side)=>{solid(x,z,side?4.8:2.4,.95,side?2.4:4.8,mat(c,.35,.4));B.box(side?2.5:1.9,.75,side?1.9:2.5,x,1.35,z,0x1c2a30);B.box(side?.3:2.5,.12,side?2.5:.3,x,1.0,z,0xffffff);for(const a of[-1,1])for(const b of[-1,1])B.cyl(.4,.3,x+(side?a*1.6:b*1.05),.4,z+(side?b*1.05:a*1.6),0x111111,[0,0,1.5708]);B.box(.4,.1,.08,x,.75,z+(side?0:2.42),0xfff3c0,0,'b')};
 perim(6,wall);reserve('dealer');
 tower(B,-72,-30,7,1,8,8,wall,0xd9453a);tower(B,72,30,7,0,8,8,wall,0x3b78d9);
 [[-13,-16],[13,-16],[-13,16],[13,16]].forEach(([x,z])=>{solid(x,z,18,5,1,glass);B.box(18.2,.3,1.2,x,5.1,z,0xdddddd);for(let i=0;i<5;i++)B.box(.15,5,1.1,x-8+i*4,2.5,z,0xdddddd)});
 [[-22,-9.5],[-22,9.5],[22,-9.5],[22,9.5]].forEach(([x,z])=>{solid(x,z,1,5,13,glass);B.box(1.2,.3,13.2,x,5.1,z,0xdddddd)});
 B.box(46,.3,34,0,5.45,0,0xe8e8e8,0,'t');for(const x of[-9,9])B.box(5,.5,.3,x*1,5.8,-17,0xd9453a);
 [[-9,-6],[9,-6],[-9,6],[9,6]].forEach(([x,z],i)=>{B.box(6.4,.3,9.4,x,.15,z,0xd9d9d9);B.cyl(3.2,.2,x,.4,z,0x444444);car(x,z,pal[i],0)});
 for(const zr of[-44,-62,44,62])for(let x=-66;x<=66;x+=12){if(rnd()<.2)continue;car(x,zr,pick(pal),0);B.box(.12,.03,5.2,x-6,.02,zr,0xffffff);B.box(.12,.03,5.2,x+6,.02,zr,0xffffff)}
 for(let z=-12;z<=12;z+=12){solid(-56,z,5,.4,7,lift);for(const sx of[-2.2,2.2]){B.box(.4,4.2,.4,-56+sx,2.3,z-2.8,0xd9a521);B.box(.4,4.2,.4,-56+sx,2.3,z+2.8,0xd9a521)}B.box(5,.3,.4,-56,4.4,z-2.8,0x333333)}
 for(let i=0;i<14;i++){const x=rr(-60,60),z=rr(-60,60);if(!(Math.abs(x)<28&&Math.abs(z)<22)&&!(Math.abs(x)>50&&Math.abs(z)<16)&&Math.abs(z)>34&&ok(x,z,2)){solid(x,z,1.6,1.4,1.6,tire);B.cyl(.7,.3,x,.2,z,0x1b1b1b);B.cyl(.7,.3,x,.6,z,0x1b1b1b);B.cyl(.7,.3,x,1,z,0x1b1b1b)}}
 for(let i=0;i<14;i++){const a=i/14*6.283,x=Math.sin(a)*74,z=Math.cos(a)*74;lamp(B,x,z,5.5,0xfff0b8);B.box(.1,2.2,.1,x+.5,6.5,z,0x666666);B.box(1.3,.9,.05,x+1.15,7.2,z,pick(pal))}
 for(const [x,z] of[[-18,-30],[18,-30],[-18,30],[18,30]]){B.box(7,.5,2,x,.25,z,0x6b6f66);for(let i=0;i<6;i++)B.sph(.5+rnd()*.25,x-2.8+i*1.12,.9,z,pick([0x2f7d3a,0x3a8d45]))}
 B.box(1.2,9,1.2,0,4.5,-90+8,0xdddddd);B.box(7,3,.4,0,8.5,-82,0xd9453a);B.box(6.2,.8,.45,0,8.9,-82,0xffffff);
 for(let i=0;i<9;i++)B.cyl(.07,5,-40+i*10,2.5,-26.5,0xdddddd),B.box(1.1,.8,.04,-39.4+i*10,4.6,-26.5,pick(pal));
 for(let i=0;i<10;i++)B.sph(.55,-15+i*3.3,6.8+Math.sin(i*.9)*.4,-17.8,pick(pal));
 B.flush();
}
function buildWater(){
 const B=mkBatch(),wall=mat(0x2d8fc4,.7),conc=mat(0xe8dfc8,.9),cab=[0xf08c3a,0x2ec4b6,0xe24a8b,0xf5d547],roofs=[0xf08c3a,0x2ec4b6,0xe24a8b,0xf5d547];
 perim(7,wall);reserve('water');
 tower(B,-62,-62,9,1,8,8,conc,0xd9453a);tower(B,62,62,9,0,8,8,conc,0x3b78d9);
 B.box(44,.14,30,0,.07,0,0x38b6e6,0,'t');B.box(46,.2,1,0,.1,-15.5,0xffffff);B.box(46,.2,1,0,.1,15.5,0xffffff);B.box(1,.2,32,-23,.1,0,0xffffff);B.box(1,.2,32,23,.1,0,0xffffff);
 for(let i=0;i<44;i++){const a=i/44*6.283;B.box(6.8,.12,7.4,Math.sin(a)*54,.06,Math.cos(a)*54,0x4cc6f0,a,'t');B.box(.5,.25,7.4,Math.sin(a)*57.6,.12,Math.cos(a)*57.6,0xffffff,a);B.box(.5,.25,7.4,Math.sin(a)*50.4,.12,Math.cos(a)*50.4,0xffffff,a)}
 const slide=(x,z,H,col)=>{let px=x,py=H+.4,pz=z;const tx=x*.2,tz=z*.2;for(let j=0;j<16;j++){const t=(j+1)/16,nx=x+(tx-x)*t+Math.sin(t*9)*(x>0?-4:4)*(1-t),nz=z+(tz-z)*t+Math.cos(t*9)*4*(1-t),ny=Math.max(.8,H*(1-t)+.8),dx=nx-px,dz=nz-pz,dy=py-ny,hor=Math.hypot(dx,dz),L=Math.hypot(hor,dy);B.box(2,1.1,L+.5,(px+nx)/2,(py+ny)/2,(pz+nz)/2,col,[Math.atan2(dy,hor),Math.atan2(dx,dz),0],'t');px=nx;py=ny;pz=nz}};
 slide(-62,-58,9.2,0xff5a8a);slide(62,58,9.2,0x35c8ff);
 for(const [x,z,c] of[[62,-62,0xffb02e],[-62,62,0x7bdc4a]]){tower(B,x,z,6,x>0?1:0,6,6,conc,c);slide(x,z,6.2,c)}
 for(let i=0;i<14;i++){const x=rr(-70,70),z=rr(-70,70);if(ok(x,z,4)&&Math.hypot(x,z)>34&&Math.hypot(x,z)<46||ok(x,z,5)&&Math.hypot(x,z)>62){const c=i%4;solid(x,z,3.6,2.6,3.6,mat(cab[c],.8));B.box(4.6,.3,4.6,x,2.75,z,roofs[(c+1)%4]);B.box(4.8,.15,4.8,x,3.0,z,0xffffff);B.box(3.7,.3,3.7,x,2.2,z,0xffffff)}}
 scat(46,1.5,(x,z)=>{if(Math.hypot(x,z)<26)return;const c=pick([0xf08c3a,0x2ec4b6,0xe24a8b,0xf5d547]);solid(x,z,.9,.45,2,mat(0xf2f2ee,.8));B.box(.9,.7,.15,x,.75,z+1,0xf2f2ee,[.9,0,0]);B.box(.92,.46,.5,x,.25,z-.45,c)});
 scat(26,2,(x,z)=>{const c=pick([0xf08c3a,0x2ec4b6,0xe24a8b,0xf5d547,0xd9453a]);B.cyl(.06,3,x,1.5,z,0xdddddd);B.cone(2.1,.9,x,3.1,z,c,0,null,8)});
 scat(34,2,(x,z)=>palm(B,x,z),78);
 scat(34,0,(x,z)=>B.sph(.45,x,.45,z,pick([0xff5a5a,0xffd23f,0x35c8ff,0x7bdc4a,0xff8fd0])));
 for(let i=0;i<4;i++){B.box(3,.3,3,(i-1.5)*12,.4,-0,0,0,'b')}
 B.cyl(2.2,.6,0,.3,0,0xffffff,0,null,16);B.sph(1.5,0,1.9,0,0xffe14d);B.sph(.9,.9,3.2,0,0xffe14d);B.box(.6,.25,.6,1.8,3.1,0,0xff8a2b);
 for(let i=0;i<40;i++){B.box(.55,.55,.04,-78+i*3.9,6.3+Math.sin(i*.7)*.35,-80,[0xff5a8a,0x35c8ff,0xffd23f,0x7bdc4a][i%4],.3);B.box(.55,.55,.04,-78+i*3.9,6.3+Math.sin(i*.7)*.35,80,[0xff5a8a,0x35c8ff,0xffd23f,0x7bdc4a][i%4],.3)}
 for(let i=0;i<14;i++){const a=i/14*6.283,x=Math.sin(a)*72,z=Math.cos(a)*72;lamp(B,x,z,5,0xfff6c8)}
 B.flush();
}
function buildPort(){
 const B=mkBatch(),wall=mat(0x6b7480,.9),conc=mat(0x8a8f94,.9),CC=[0xc0392b,0x2c6fbb,0x2e9e5b,0xe67e22,0xf1c40f,0x7f8c8d,0x8e44ad,0x16a085];
 perim(7,wall);reserve('port');
 tower(B,-68,-68,8,1,8,8,conc,0xd9453a);tower(B,68,68,8,0,8,8,conc,0x3b78d9);
 B.box(168,.2,16,0,.1,78,0x2e7fb8,0,'t');B.box(168,.5,1.4,0,.3,69.5,0xcfc9b8);for(let x=-80;x<=80;x+=10){B.cyl(.4,.8,x,.5,69.5,0x222222);B.cyl(.3,.15,x,.95,69.5,0xffd23f)}
 const cont=(x,z,c,ry,two)=>{const w=12,d=2.6,h=two?5.4:2.7;solid(x,z,w,h,d,mat(c,.55,.25),ry);const L=ry?[0,1]:[1,0];for(let i=-5;i<=5;i++)B.box(ry?d+.14:.14,h,ry?.14:d+.14,x+(ry?0:i*1.1),h/2,z+(ry?i*1.1:0),0x000000,0,null);B.box(ry?.1:w-.4,.2,ry?w-.4:.1,x,h-.1,z,0xffffff,0,null)};
 for(let r=0;r<6;r++)for(let c=0;c<4;c++){const x=-48+c*32+(r%2)*6,z=-50+r*16;if(Math.abs(x)<8||!ok(x,z,8))continue;const col=pick(CC);cont(x,z,col,0,rnd()<.4);if(rnd()<.8)cont(x+13.2,z,pick(CC),0,rnd()<.4)}
 for(let i=0;i<4;i++){const x=-60+i*40;for(const sx of[-1,1])for(const sz of[60,76]){B.box(1,28,1,x+sx*7,14,sz,0xd8a21f)}B.box(15,1.4,1.4,x,28,60,0xd8a21f);B.box(15,1.4,1.4,x,28,76,0xd8a21f);B.box(1.2,1.2,36,x,29,68,0xe9b12a);B.box(2.4,2,2.4,x,26,68+((i*7)%10)-5,0x555a60)}
 solid(-50,40,24,6,14,mat(0x9aa2ad,.8));B.box(25,.8,15,-50,6.3,40,0x6b7480);for(let i=0;i<5;i++)B.box(3,3.6,.1,-58+i*4.5,1.8,32.9,0x2c3a4a);
 scat(10,3,(x,z)=>{solid(x,z,1.6,1.2,3,mat(0xf1c40f,.6));B.box(.15,3.2,.15,x,1.6,z-1.4,0x333333);B.box(1.5,.15,.9,x,2.4,z-.3,0x222222)},70);
 scat(40,2,(x,z)=>{B.box(1.3,.18,1.3,x,.09,z,0xa58a5a);for(let i=0;i<2;i++)B.box(1.1,.5,1.1,x,.45+i*.5,z,pick([0xb08a58,0x9a7a48]))});
 scat(26,2,(x,z)=>{B.cyl(.45,1.1,x,.55,z,pick([0xc0392b,0x2c6fbb,0xd5a021]))});
 for(let i=0;i<12;i++){const a=i/12*6.283,x=Math.sin(a)*64,z=Math.cos(a)*50;if(ok(x,z,4)&&z<58){B.cyl(.18,12,x,6,z,0x555a60);B.box(2.6,.7,.9,x,12.2,z,0xfff6c8,0,'b')}}
 for(let x=-80;x<=80;x+=4){B.box(.4,.03,2.8,x,.02,-80,0xffd23f)}for(let z=-60;z<=60;z+=8)B.box(1,.03,.3,0,.02,z,0xffd23f);
 B.flush();
}
function buildSite(){
 const B=mkBatch(),wall=mat(0x9a8f78,.9),steel=mat(0xd8a21f,.6),conc=mat(0x9a9a94,.9),jersey=mat(0xd0d0c8,.8);
 perim(5,wall);reserve('site');
 tower(B,-62,-55,8,1,10,10,conc,0xd9453a);tower(B,62,55,8,0,10,10,conc,0x3b78d9);
 for(const [cx,cz] of[[-62,-55],[62,55]])for(let lv=0;lv<2;lv++)for(const a of[-5,5])for(const b of[-5,5]){B.box(.25,4,.25,cx+a,lv*4+2,cz+b,0xd8a21f);B.box(10.2,.2,.2,cx,lv*4+3.9,cz+b,0xd8a21f);B.box(.2,.2,10.2,cx+a,lv*4+3.9,cz,0xd8a21f)}
 B.box(2,38,2,0,19,-8,0xe9b12a);B.box(36,2,2,8,38,-8,0xe9b12a);B.box(4,3,4,-4,36,-8,0x444a50);B.box(.15,12,.15,22,32,-8,0x222222);B.box(3,2,3,22,25,-8,0x666666);for(let i=0;i<12;i++)B.box(1,.4,2.2,0,i*3,-8,0xe9b12a,[0,0,0]);solid(0,-8,2.4,38,2.4,steel);
 for(let i=0;i<22;i++){const x=rr(-72,72),z=rr(-72,72);if(!ok(x,z,6)||Math.hypot(x+0,z+8)<6)continue;const t=i%5;if(t===0){const r=rr(3,5),h=rr(1.8,3.2);solid(x,z,r*1.8,h*.8,r*1.8,mat(0x8a6f4a,.95));B.cone(r,h,x,h/2,z,0x8a6f4a,0,null,8)}else if(t===1){solid(x,z,5,2.4,2.4,mat(0xd8a21f,.55));B.box(4,1.2,2.2,x+1,2.4+.6,z,0x555a60);B.box(2.4,1.2,2.4,x-1.4,2.8,z,0x66ccff)}else if(t===2){solid(x,z,2.2,1.4,2.2,conc);B.cyl(.9,1.6,x,2,z,0xe9e6da,[.3,0,0])}else if(t===3){for(let k=0;k<4;k++)solid(x+k*2.2,z,2,.9,.7,jersey);for(let k=0;k<4;k++)B.box(2.02,.2,.72,x+k*2.2,.7,z,0xd9453a)}else{solid(x,z,1.3,2.4,1.3,mat(0x2c6fbb,.6));B.box(1.4,.2,1.4,x,2.5,z,0xeeeeee)}}
 for(let i=0;i<14;i++){const x=rr(-70,70),z=rr(-70,70);if(ok(x,z,5)){for(let k=0;k<4;k++)B.cyl(.35,3.5,x+(k%2)*.8,.35+Math.floor(k/2)*.7,z+Math.floor(k/2)*.2,0x8c9096,[0,0,1.5708])}}
 scat(40,1,(x,z)=>{B.cone(.25,.6,x,.3,z,0xff6a1a,0,null,6);B.box(.4,.05,.4,x,.03,z,0xffffff)},76);
 scat(28,0,(x,z)=>B.box(rr(2,7),.05,rr(2,6),x,.03,z,pick([0x6a5a3c,0x7a6848,0x5a4d33]),rnd()*3));
 scat(12,2,(x,z)=>{for(let k=0;k<6;k++)B.cyl(.06,1.3,x+k*.6,.65,z,0xb0a690);B.box(3.6,.05,.05,x+1.5,1.2,z,0xb0a690)},76);
 for(let i=0;i<10;i++){const a=i/10*6.283,x=Math.sin(a)*66,z=Math.cos(a)*66;if(ok(x,z,4))lamp(B,x,z,7,0xfff0b8)}
 for(let x=-80;x<=80;x+=6){B.box(.15,2.2,.15,x,1.1,-83,0x666666);B.box(6,.8,.05,x+3,1.8,-83,0xff6a1a,0,'t')}
 B.flush();
}
const BUILDERS={yard:()=>{buildYard();yardDetail()},store:buildStore,dealer:buildDealer,water:buildWater,port:buildPort,site:buildSite};
function makeFloor(n){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),sp=(col,a,k)=>{for(let i=0;i<k;i++){g.fillStyle=col.replace('A',a*Math.random());g.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*3,1+Math.random()*3)}};let r=50;
 if(n==='store'){r=80;g.fillStyle='#d8d6cc';g.fillRect(0,0,128,128);g.fillStyle='#c4c3b8';g.fillRect(0,0,64,64);g.fillRect(64,64,64,64);g.strokeStyle='rgba(60,60,50,.3)';g.strokeRect(0,0,128,128)}
 else if(n==='water'){r=60;g.fillStyle='#e6d9b8';g.fillRect(0,0,128,128);g.fillStyle='#d8c9a2';g.fillRect(0,0,64,64);g.fillRect(64,64,64,64);sp('rgba(150,120,70,A)',.18,200)}
 else if(n==='port'){r=40;g.fillStyle='#6d7176';g.fillRect(0,0,128,128);g.strokeStyle='rgba(0,0,0,.35)';g.strokeRect(0,0,128,128);sp('rgba(0,0,0,A)',.25,300);sp('rgba(255,255,255,A)',.07,200)}
 else if(n==='site'){r=50;g.fillStyle='#8a7350';g.fillRect(0,0,128,128);sp('rgba(60,45,25,A)',.35,500);sp('rgba(190,165,120,A)',.2,300)}
 else{g.fillStyle='#2e3033';g.fillRect(0,0,128,128);sp('rgba(0,0,0,A)',.5,500);sp('rgba(255,255,255,A)',.12,500)}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(r,r);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}

// ===== capture the flag, platforms, knife, avatars, board =====
let ctf=false,myTeam=0,teamOf=new Map(),flags=[{s:0,by:'',x:0,y:0,z:0,t:0},{s:0,by:'',x:0,y:0,z:0,t:0}],ctfScore=[0,0],flagObjs=[],ctfNet=0,ctfOver=false,floorY=0,wasAir=false,landT=0,knifeT=0,drawT=0;
const emoteBy=new Map(),TEAMCOL=[0xd9453a,0x3b78d9],TNAME=['RED','BLUE'],CTF_TARGET=3,emptyTally=()=>Object.fromEntries(Object.keys(MAPS).map(k=>[k,0]));
function oy(o){const u=o.userData;if(u.top===undefined){const h=o.geometry&&o.geometry.parameters?o.geometry.parameters.height:0;u.top=o.position.y+h/2;u.y0=o.position.y-h/2}return u}
function floorAt(x,z,feet){let f=0;for(const o of obstacles){const u=oy(o);if(u.top<=feet+.6&&u.top>f&&Math.abs(x-o.position.x)<u.w/2+.3&&Math.abs(z-o.position.z)<u.d/2+.3)f=u.top}return f}
function buildMap(name,seed){
 if(!floorTex.yard)floorTex.yard=mats.ground.map;
 clearMap();curMap=name;_rs=((seed||mapSeed||1)>>>0)||1;
 if(!floorTex[name])floorTex[name]=makeFloor(name);
 mats.ground.map=floorTex[name];mats.ground.needsUpdate=true;
 const before=new Set(scene.children),R=Math.random;Math.random=rnd;
 try{(BUILDERS[name]||BUILDERS.yard)()}finally{Math.random=R}
 mapObjs=scene.children.filter(c=>!before.has(c));
 if(car){const s=CARSPOT[name]||CARSPOT.yard;car.position.set(s[0],0,s[1]);car.rotation.y=-.5;car.userData.speed=0}
}
const stand=t=>{const f=(FLAGSPOT[curMap]||FLAGSPOT.yard)[t?'blue':'red'];return{x:f[0],y:f[1],z:f[2]}};
function makeFlagObj(col){
 const g=new THREE.Group(),pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,3,6),mat(0xdddddd,.4,.6));pole.position.y=1.5;g.add(pole);
 const cloth=new THREE.Mesh(new THREE.BoxGeometry(1.4,.8,.05),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.35,roughness:.6}));cloth.position.set(.75,2.5,0);g.add(cloth);g.userData.cloth=cloth;
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,60,8,1,true),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));beam.position.y=30;g.add(beam);return g;
}
function ctfReset(){flags=[{s:0,by:'',x:0,y:0,z:0,t:0},{s:0,by:'',x:0,y:0,z:0,t:0}];ctfScore=[0,0];ctfOver=false}
function ctfBuildObjs(){flagObjs.forEach(o=>scene.remove(o));flagObjs=[];if(!ctf||!scene)return;for(let t=0;t<2;t++){const o=makeFlagObj(TEAMCOL[t]);scene.add(o);flagObjs.push(o)}}
const evt=txt=>{showToast(txt);send({type:'ctf-ev',txt})};
function ctfBroadcast(){send({type:'flags',f:flags.map(f=>({s:f.s,by:f.by,x:f.x,y:f.y,z:f.z})),sc:ctfScore})}
function ctfPlayers(){const a=[{n:currentName,x:player.pos.x,z:player.pos.z,y:groundY,dead,team:myTeam}];remoteMeshes.forEach(r=>a.push({n:r.name,x:r.mesh.position.x,z:r.mesh.position.z,y:r.ty||0,dead:r.dead,team:teamOf.get(r.name)||0}));return a}
function ctfHost(dt){
 if(!ctf||!isHost||voting||!matchStarted||ctfOver)return;
 const P=ctfPlayers(),near=(p,a)=>Math.hypot(p.x-a.x,p.z-a.z)<2.4&&Math.abs(p.y-a.y)<2.6;
 for(let t=0;t<2;t++){
  const f=flags[t],home=stand(t);
  if(f.s===1){
   const c=P.find(p=>p.n===f.by);
   if(!c){f.s=0}else if(c.dead){f.s=2;f.t=20;f.x=c.x;f.z=c.z;f.y=c.y;evt(f.by.toUpperCase()+' DROPPED THE '+TNAME[t]+' FLAG')}
   else{const h=stand(c.team);if(flags[c.team].s===0&&near(c,h)){ctfScore[c.team]++;f.s=0;evt(TNAME[c.team]+' CAPTURED THE FLAG · '+ctfScore[0]+'–'+ctfScore[1]);if(ctfScore[c.team]>=CTF_TARGET){ctfOver=true;evt(TNAME[c.team]+' TEAM WINS');setTimeout(()=>{if(isHost)startVote()},5000)}}}
  }else{
   const at=f.s===0?home:f;
   for(const p of P){if(p.dead||!near(p,at))continue;if(p.team!==t){f.s=1;f.by=p.n;evt(p.n.toUpperCase()+' TOOK THE '+TNAME[t]+' FLAG');break}else if(f.s===2){f.s=0;evt(TNAME[t]+' FLAG RETURNED');break}}
   if(f.s===2){f.t-=dt;if(f.t<=0){f.s=0;evt(TNAME[t]+' FLAG RETURNED')}}
  }
 }
 ctfNet-=dt;if(ctfNet<=0){ctfNet=.15;ctfBroadcast()}
}
function ctfFrame(){
 if(!ctf||!flagObjs.length)return;const now=performance.now();
 flags.forEach((f,t)=>{const o=flagObjs[t],h=stand(t);let x=h.x,y=h.y,z=h.z;
  if(f.s===2){x=f.x;y=f.y;z=f.z}
  else if(f.s===1){if(f.by===currentName){x=player.pos.x;z=player.pos.z;y=groundY}else{let ok_=false;remoteMeshes.forEach(r=>{if(r.name===f.by){x=r.mesh.position.x;z=r.mesh.position.z;y=r.by||0;ok_=true}});if(!ok_){x=h.x;z=h.z;y=h.y}}y+=1}
  o.position.set(x,y,z);o.scale.setScalar(f.s===1?.55:1);o.userData.cloth.rotation.y=Math.sin(now/260+t)*.35});
}
function assignTeams(){if(!isHost||!ctf)return;teamOf.clear();[currentName,...lobbyNames.values()].forEach((n,i)=>teamOf.set(n,i%2));myTeam=teamOf.get(currentName)||0;send({type:'teams',t:Object.fromEntries(teamOf)});refreshTeams()}
function refreshTeams(){remoteMeshes.forEach(r=>{const tm=ctf?teamOf.get(r.name):undefined;if(tm!==r.tm){r.tm=tm;setAvatar(r,r.cfg||defaultChar(),tm)}})}
function updateHud(){
 $('score').textContent=String(score).padStart(5,'0');
 if(ctf){const me=flags.some(f=>f.s===1&&f.by===currentName);$('lbl-round').textContent=TNAME[myTeam]+' TEAM';$('round').textContent=ctfScore[0]+'–'+ctfScore[1];$('lbl-timer').textContent='FIRST TO '+CTF_TARGET;$('roundtimer').textContent=me?'CARRYING':'CAPTURE'}
 else if(pvp){$('lbl-round').textContent='FRAGS';$('round').textContent=String(pvpScores[currentName]||0).padStart(2,'0');$('lbl-timer').textContent='FIRST TO '+PVP_TARGET;const top=Object.entries(pvpScores).sort((a,b)=>b[1]-a[1])[0];$('roundtimer').textContent=top?top[0].slice(0,8).toUpperCase()+' '+top[1]:'--'}
 else{const br=pveState==='break';$('lbl-round').textContent='ROUND';$('round').textContent=String(roundNumber).padStart(2,'0');$('lbl-timer').textContent=br?'NEXT ROUND':'HOSTILES';$('roundtimer').textContent=br?String(Math.max(0,Math.ceil(pveTimer))).padStart(2,'0')+'S':String(toSpawn+enemies.length).padStart(2,'0')}
 const w=weapons[weaponIndex];
 $('weapon').textContent=buildMode?'BUILD · '+buildTypes[buildType].name:w.melee?w.name+' · INSTAKILL':w.name+' '+(reloadT>0?'RELOADING':ammo[weaponIndex]+'/'+w.mag);
 $('buildstatus').textContent=buildMode?'BUILD MODE · Z/X/C SELECT · R ROTATE · CLICK PLACE':'B · BUILD MODE';
}
function renderBoard(){
 const b=$('board');if(!b)return;const show=pvp||remoteMeshes.size>0;b.classList.toggle('on',show);if(!show)return;
 const now=performance.now(),names=[currentName];remoteMeshes.forEach(r=>names.push(r.name));
 const em=n=>{const e=emoteBy.get(n);return e&&e.until>now?' '+EMOTES[e.k][0]:''},tg=n=>ctf?(teamOf.get(n)===1?'B ':'R '):'';
 const rows=[...new Set(names)].map(n=>[n,pvp?(pvpScores[n]||0):null]).sort((a,b)=>(b[1]||0)-(a[1]||0));
 b.textContent=(ctf?'RED '+ctfScore[0]+'   BLUE '+ctfScore[1]+'\n':'')+rows.map(([n,k])=>tg(n)+n.slice(0,12).padEnd(12)+(k===null?'':String(k).padStart(3))+em(n)).join('\n');
}
function buildAvatar(c,team){
 const g=new THREE.Group(),sk=mat(SKIN[c.skin],.9),ot=mat(team===0||team===1?TEAMCOL[team]:OUTFIT[c.color],.85),pants=mat(0x2b2f3a,.9),hc=mat(HAIRC[c.hairc],.8),dark=mat(0x20231f,.75),B=(w,h,d,m,x,y,z,p)=>box(p||g,w,h,d,m,x,y,z);
 const cap=(r,m,y)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r,8,6,0,Math.PI*2,0,Math.PI*.55),m);o.position.y=y;g.add(o);return o},add=(geo,m,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);g.add(o);return o},piv=(x,y)=>{const p=new THREE.Group();p.position.set(x,y,0);g.add(p);return p};
 B(.62,.78,.38,ot,0,.91,0);B(.62,.1,.4,pants,0,.54,0);
 const lL=piv(-.2,.65),lR=piv(.2,.65),aL=piv(-.42,1.14),aR=piv(.42,1.14);
 const sm=c.shoes<4?[dark,mat(0xf2f2f2,.6),mat(0xd0342c,.6),mat(0xd5a021,.35,.7)][c.shoes]:sk;
 for(const l of[lL,lR]){B(.2,.5,.2,pants,0,-.25,0,l);if(c.shoes<4){B(.24,.14,.36,sm,0,-.58,-.04,l);if(c.shoes===1||c.shoes===2)B(.25,.04,.37,mat(0xffffff,.8),0,-.65,-.04,l)}else B(.2,.06,.3,sk,0,-.62,-.03,l)}
 for(const a of[aL,aR]){B(.18,.5,.18,ot,0,-.25,0,a);B(.15,.13,.15,sk,0,-.55,0,a)}aR.rotation.x=-1.2;
 add(new THREE.IcosahedronGeometry(.24,1),sk,0,1.55,0);
 if(c.hair===1)cap(.27,hc,1.58);
 else if(c.hair===2){for(let i=0;i<6;i++){const a=i/6*6.283;add(new THREE.ConeGeometry(.07,.22,5),hc,Math.sin(a)*.15,1.8,Math.cos(a)*.15)}add(new THREE.ConeGeometry(.09,.26,5),hc,0,1.84,0)}
 else if(c.hair===3)B(.07,.2,.42,hc,0,1.8,0);
 else if(c.hair===4){cap(.27,hc,1.58);B(.46,.6,.12,hc,0,1.38,.2);B(.07,.4,.3,hc,-.24,1.45,.05);B(.07,.4,.3,hc,.24,1.45,.05)}
 else if(c.hair===5)add(new THREE.SphereGeometry(.33,8,6),hc,0,1.72,.1);
 const hm=[0,mat(0x3b6ea5,.7),mat(0xc0392b,.9),mat(0x7a5230,.8),mat(0x15171a,.6),mat(0xd5a021,.3,.8)][c.hat];
 if(c.hat===1){cap(.29,hm,1.62);B(.3,.03,.24,hm,0,1.65,-.3)}
 else if(c.hat===2){cap(.29,hm,1.62);add(new THREE.SphereGeometry(.07,6,5),hm,0,1.92,0)}
 else if(c.hat===3){add(new THREE.CylinderGeometry(.5,.5,.03,12),hm,0,1.74,0);add(new THREE.CylinderGeometry(.2,.24,.22,10),hm,0,1.86,0)}
 else if(c.hat===4){add(new THREE.CylinderGeometry(.4,.4,.03,12),hm,0,1.74,0);add(new THREE.CylinderGeometry(.24,.24,.4,10),hm,0,1.95,0)}
 else if(c.hat===5){add(new THREE.CylinderGeometry(.25,.22,.16,8),hm,0,1.8,0);for(let i=0;i<5;i++){const a=i/5*6.283;add(new THREE.ConeGeometry(.05,.14,4),hm,Math.sin(a)*.2,1.95,Math.cos(a)*.2)}}
 if(c.glasses===1)B(.44,.08,.06,dark,0,1.58,-.23);else if(c.glasses===2)B(.46,.12,.05,mat(0x2ee6ff,.2,.1),0,1.58,-.235);
 if(c.chain){const gm=mat(c.chain===2?0xdddddd:0xd5a021,.25,.9),t=add(new THREE.TorusGeometry(.2,.022,6,18),gm,0,1.27,-.08);t.rotation.x=Math.PI/2.3;
  if(c.chain===3){const t2=add(new THREE.TorusGeometry(.24,.022,6,18),mat(0xdddddd,.25,.9),0,1.2,-.1);t2.rotation.x=Math.PI/2.5}
  if(c.chain===4)B(.1,.1,.04,mat(0x2ee6ff,.2,.3),0,1.0,-.2)}
 g.userData.parts={lL,lR,aL,aR};return g;
}
function setAvatar(r,cfg,team){r.cfg=cfg;if(!r.body)r.mesh.children.filter(o=>o.isMesh).forEach(o=>r.mesh.remove(o));else r.mesh.remove(r.body);r.body=buildAvatar(cfg,team);r.mesh.add(r.body)}
function updateRemoteWeapon(r,index){
 if(!r||r.weapon===index)return;r.weapon=index;r.held.clear();
 const dark=mat(0x20231f,.65,.2),metal=mat(0x9aa092,.35,.7),glow=mat(0xd5ff56,.35,.1),wood=mat(0x7a5230,.8),b=(w,h,d,m,x,y,z)=>box(r.held,w,h,d,m,.35+x,.95+y,z);
 if(index===0){b(.12,.14,.36,metal,0,0,-.27);b(.1,.22,.12,dark,0,-.17,-.12);b(.08,.07,.18,dark,0,0,-.52)}
 else if(index===1){b(.15,.15,.6,dark,0,0,-.3);b(.06,.06,.5,metal,0,.02,-.85);b(.12,.22,.14,dark,0,-.2,-.24);b(.1,.1,.18,dark,0,.1,-.32);b(.12,.16,.3,dark,0,-.02,.05)}
 else if(index===2){b(.17,.17,.5,dark,0,0,-.28);b(.07,.07,.7,metal,0,.03,-.85);b(.14,.12,.3,wood,0,-.08,-.6);b(.12,.2,.4,wood,0,-.06,.05)}
 else if(index===3){b(.15,.16,.5,dark,0,0,-.28);b(.09,.09,.4,dark,0,0,-.72);b(.08,.3,.12,dark,0,-.24,-.3);b(.06,.16,.06,dark,0,-.14,-.62)}
 else{b(.05,.06,.22,wood,0,0,-.3);b(.04,.08,.4,metal,0,0,-.62);b(.12,.03,.03,metal,0,0,-.43)}
 b(.04,.03,.06,glow,0,.1,-.42);
}
function buildGun(i,gun){
 const dark=mat(0x191c19,.55,.25),metal=mat(0x747c70,.45,.45),steel=mat(0xaab0a2,.3,.85),grip=mat(0x2b2118,.9),wood=mat(0x7a5230,.75),red=mat(0xc0392b,.5),glow=mat(0xd5ff56,.35,.1),X=.13;
 const T=i===4?(()=>{const g2=new THREE.Group();g2.rotation.set(.45,0,-.15);g2.position.set(0,-.05,.05);gun.add(g2);return g2})():gun;
 const b=(w,h,d,m,x,y,z,rx)=>{const o=box(T,w,h,d,m,x,y,z);if(rx)o.rotation.x=rx;return o},cy=(r,h,m,x,y,z)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,8),m);o.position.set(x,y,z);o.rotation.x=Math.PI/2;T.add(o);return o};
 if(i===0){b(.14,.12,.5,steel,X,-.1,-.8);b(.05,.02,.46,dark,X,-.035,-.8);b(.07,.07,.06,dark,X,-.1,-1.06);b(.15,.08,.44,dark,X,-.19,-.78);b(.12,.28,.15,grip,X,-.36,-.68,.25);b(.02,.06,.16,dark,X,-.25,-.84);b(.03,.05,.03,steel,X,-.24,-.78);b(.04,.04,.04,dark,X,-.04,-.57);b(.1,.03,.03,dark,X,-.03,-.6);b(.025,.03,.025,glow,X,-.03,-1);for(let k=0;k<4;k++)b(.16,.1,.012,dark,X,-.1,-.62-.03*k);b(.1,.03,.16,dark,X,-.51,-.7)}
 else if(i===1){b(.19,.18,.5,dark,X-.01,-.15,-.82);b(.1,.03,.5,steel,X-.01,-.045,-.85);for(let k=0;k<6;k++)b(.1,.02,.02,dark,X-.01,-.025,-.65-k*.08);b(.17,.16,.5,dark,X-.01,-.14,-1.2);for(let k=0;k<4;k++)b(.18,.04,.05,metal,X-.01,-.14,-1.05-k*.12);cy(.03,.5,steel,X-.01,-.11,-1.62);b(.09,.09,.12,dark,X-.01,-.11,-1.88);b(.02,.07,.02,dark,X-.01,-.06,-1.5);b(.12,.2,.4,dark,X-.01,-.17,-.5);b(.13,.22,.04,grip,X-.01,-.17,-.3);b(.1,.3,.14,dark,X-.01,-.38,-.88,.18);b(.1,.24,.12,grip,X-.01,-.34,-.64,.3);b(.1,.1,.2,dark,X-.01,0,-.8);b(.08,.07,.02,glow,X-.01,0,-.91);b(.2,.05,.1,metal,X-.01,-.16,-.9)}
 else if(i===2){b(.2,.2,.45,dark,X-.01,-.15,-.8);cy(.05,1,steel,X-.01,-.1,-1.4);cy(.04,.9,dark,X-.01,-.2,-1.35);b(.17,.13,.32,wood,X-.01,-.2,-1.2);for(let k=0;k<3;k++)b(.18,.14,.02,dark,X-.01,-.2,-1.12-k*.07);b(.14,.25,.5,wood,X-.01,-.2,-.45);b(.02,.04,.02,glow,X-.01,-.04,-1.88);for(let k=0;k<3;k++){const s=cy(.03,.12,red,X+.11,-.14,-.7+k*.08);s.rotation.z=Math.PI/2;s.rotation.x=0}b(.12,.12,.03,dark,X-.01,-.12,-1.7)}
 else if(i===3){b(.17,.17,.5,dark,X-.01,-.15,-.82);b(.1,.03,.5,steel,X-.01,-.05,-.82);b(.08,.09,.1,dark,X-.01,-.01,-.78);b(.06,.05,.02,glow,X-.01,-.01,-.84);cy(.055,.5,dark,X-.01,-.12,-1.2);for(let k=0;k<3;k++)b(.13,.13,.025,steel,X-.01,-.12,-1.05-k*.12);b(.07,.2,.07,grip,X-.01,-.3,-1.0);b(.09,.38,.12,dark,X-.01,-.4,-.82);b(.09,.12,.12,dark,X-.01,-.6,-.86,.3);b(.02,.02,.4,steel,X-.07,-.12,-.55);b(.02,.02,.4,steel,X+.05,-.12,-.55);b(.14,.2,.03,dark,X-.01,-.12,-.36);b(.09,.2,.1,grip,X-.01,-.3,-.66,.2)}
 else{b(.06,.07,.26,grip,X,-.2,-.72);for(let k=0;k<3;k++)b(.068,.078,.02,steel,X,-.2,-.64-k*.07);b(.14,.04,.03,steel,X,-.2,-.86);b(.04,.09,.42,steel,X,-.19,-1.1);b(.04,.07,.1,steel,X,-.18,-1.37,-.3);b(.01,.01,.4,glow,X,-.145,-1.1);for(let k=0;k<4;k++)b(.02,.02,.04,steel,X,-.13,-1.0-k*.09);b(.07,.07,.04,steel,X,-.2,-.58)}
}
function fire(){
 initAudio();if(fireCooldown>0||(!locked&&!mobile.enabled)||buildMode||dead||voting||emoteOpen||chatOpen||reloadT>0)return;
 const w=weapons[weaponIndex];
 if(w.melee){fireCooldown=w.cooldown;knifeT=.32;playSound('switch')}
 else{if(ammo[weaponIndex]<=0){reload();return}ammo[weaponIndex]--;fireCooldown=w.cooldown;fireAnim=.14;recoil=Math.min(1.6,recoil+w.kick);flashT=.05;playSound('fire');pitch=clamp(pitch+w.kick*.006,-1.35,1.35);yaw+=(Math.random()-.5)*w.kick*.004}
 const base=new THREE.Vector3();camera.getWorldDirection(base);const origin=camera.position.clone();
 for(let i=0;i<w.pellets;i++){const dir=base.clone();dir.x+=(Math.random()-.5)*w.spread*2;dir.y+=(Math.random()-.5)*w.spread*2;dir.z+=(Math.random()-.5)*w.spread*2;dir.normalize();shootRay(origin,dir,w)}
 if(!w.melee){send({type:'shot',pos:{x:origin.x,y:origin.y,z:origin.z},dir:{x:base.x,y:base.y,z:base.z}});if(ammo[weaponIndex]<=0)reload()}
}

function animate(){requestAnimationFrame(animate);if(!started)return;const dt=Math.min(clock.getDelta(),.04);update(dt);renderer.render(scene,camera)}
function switchWeapon(i){reloadT=0;drawT=.4;playSound('switch');weaponIndex=(i+weapons.length)%weapons.length;makeViewModel();updateHud();showToast(weapons[weaponIndex].name+' EQUIPPED')}
document.addEventListener('keydown',e=>{if(chatOpen)return;if(e.code==='Slash'&&started){e.preventDefault();openChat();return}if((e.code==='ControlLeft'||e.code==='ControlRight')&&started&&!e.repeat)setSprint(!sprintOn);if(e.code==='Space'&&started&&!inCar){e.preventDefault();if(groundY<=floorY+.02&&jumpVelocity===0)jumpVelocity=6.3}keys[e.code]=true;if(e.code==='KeyE'&&started)toggleCar();if(!started)return;if(emoteOpen){if(/^Digit[1-8]$/.test(e.code)&&!emoteEdit)useEmote(slots[+e.code.slice(5)-1]);if(e.code==='KeyG')closeEmote(true);if(e.code==='Escape')closeEmote(false);return}if(e.code==='KeyG'&&!voting&&!dead){openEmote();e.preventDefault();return}if(voting&&/^Digit[1-6]$/.test(e.code)){castVote(Object.keys(MAPS)[+e.code.slice(5)-1]);return}if(e.code==='Equal'||e.code==='NumpadAdd'){toggleControls();e.preventDefault()}if(e.code==='Digit1')switchWeapon(0);if(e.code==='Digit2')switchWeapon(1);if(e.code==='Digit3')switchWeapon(2);if(e.code==='Digit4')switchWeapon(3);if(e.code==='Digit5')switchWeapon(4);if(e.code==='KeyB')toggleBuild();if(buildMode&&e.code==='KeyZ')chooseBuildType(0);if(buildMode&&e.code==='KeyX')chooseBuildType(1);if(buildMode&&e.code==='KeyC')chooseBuildType(2);if(buildMode&&e.code==='KeyR'){buildRotation+=Math.PI/4;updateBuildPreview()}if(!buildMode&&e.code==='KeyR')reload();if(e.code==='Escape')document.exitPointerLock?.()});
document.addEventListener('keyup',e=>keys[e.code]=false);
document.addEventListener('mousemove',e=>{if(locked){swayX=clamp(swayX+e.movementX*.00022,-.05,.05);swayY=clamp(swayY+e.movementY*.00022,-.05,.05);yaw-=e.movementX*.0022;pitch=clamp(pitch-e.movementY*.0022,-1.35,1.35)}});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer?.domElement;$('crossnote').style.display=locked?'none':'block'});
document.addEventListener('mousedown',e=>{if(!started||voting||emoteOpen||chatOpen)return;if(!locked){renderer.domElement.requestPointerLock?.();return}if(e.button===0){holdFire=true;if(buildMode)placeBuildPiece();else fire()}});
$('host').addEventListener('click',()=>{initAudio();start('host')});$('join').addEventListener('click',()=>{initAudio();start('join')});$('solo').addEventListener('click',()=>{initAudio();start('solo')});$('sound-toggle')?.addEventListener('click',toggleSound);
$('leave').addEventListener('click',()=>{if(peer)peer.destroy();location.reload()});
$('close-controls')?.addEventListener('click',toggleControls);document.querySelectorAll('#vote button').forEach(b=>b.addEventListener('click',()=>castVote(b.dataset.map)));
initEmotes();initAccounts();
})();
