/* bessagoncc / deadzone — lightweight WebGL prototype */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const boot=$('boot'),hud=$('hud'),status=$('netstatus');
let renderer,scene,camera,clock,player,car,carBody,carWheels=[],remoteMeshes=new Map(),bullets=[],enemies=[],pickups=[],obstacles=[];
let keys={},locked=false,inCar=false,started=false,roomId='',peer=null,connections=[],isHost=false,solo=false;
let yaw=0,pitch=0,health=100,kills=0,fireCooldown=0,respawnTimer=0,toastTimer=0,lastBroadcast=0,spawnClock=0;
const peersState=new Map();
const ARENA=42;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mat(color,rough=.85,metal=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal})}
const mats={ground:mat(0x30332c),wall:mat(0x62665b),dark:mat(0x22241f),accent:mat(0xd5ff56,.5),car:mat(0xb5c0a2,.45,.25),tire:mat(0x171916),glass:mat(0x3a514b,.25,.25),enemy:mat(0xc65e42,.6),bullet:mat(0xd5ff56,.35),crate:mat(0x77705c)};
function box(parent,w,h,d,material,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=true;parent.add(m);return m}
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
 clock=new THREE.Clock();window.addEventListener('resize',resize);animate();
}
function createCar(x,y,z){
 car=new THREE.Group();car.position.set(x,0,z);car.rotation.y=-.5;
 carBody=new THREE.Group();car.add(carBody);
 box(carBody,2.15,.55,4.2,mats.car,0,.65,0);
 box(carBody,1.55,.65,1.8,mats.glass,0,1.18,-.25);
 box(carBody,1.85,.12,1.1,mats.dark,0,.95,1.3);
 box(carBody,.24,.18,.16,mats.accent,-.72,.7,2.12);box(carBody,.24,.18,.16,mats.accent,.72,.7,2.12);
 box(carBody,.25,.18,.16,mats.enemy,-.72,.7,-2.12);box(carBody,.25,.18,.16,mats.enemy,.72,.7,-2.12);
 for(const sx of [-1,1])for(const sz of [-1,1]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.24,8),mats.tire);wheel.rotation.z=Math.PI/2;wheel.position.set(sx*1.08,.4,sz*1.25);car.add(wheel);carWheels.push(wheel)}
 scene.add(car);
}
function spawnEnemy(){
 const g=new THREE.Group(),body=box(g,.75,1.25,.5,mats.enemy,0,.72,0),head=new THREE.Mesh(new THREE.IcosahedronGeometry(.28,0),mats.dark);head.position.y=1.55;g.add(head);
 let p;do{p=new THREE.Vector3((Math.random()-.5)*68,0,(Math.random()-.5)*68)}while(p.length()<12);
 g.position.copy(p);g.userData={hp:3,fire:1+Math.random()*2,speed:1.4+Math.random()*1.2};scene.add(g);enemies.push(g);
}
function spawnPickup(){const g=new THREE.Group();const core=new THREE.Mesh(new THREE.OctahedronGeometry(.48),mats.accent);g.add(core);g.position.set((Math.random()-.5)*62,.8,(Math.random()-.5)*62);g.userData={type:Math.random()<.7?'health':'boost',phase:Math.random()*5};scene.add(g);pickups.push(g)}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.35))}
function start(mode){
 if(started)return;started=true;solo=mode==='solo';isHost=mode==='host';roomId=$('room').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,24);
 if(mode==='host'&&!roomId)roomId='run-'+Math.random().toString(36).slice(2,7);
 if(mode==='join'&&!roomId){started=false;status.textContent='ENTER A ROOM CODE TO JOIN.';return}
 $('roomlabel').textContent=solo?'SOLO SESSION':(isHost?'HOST · ':'JOIN · ')+roomId;
 boot.classList.add('hidden');hud.classList.remove('hidden');setup();
 if(!solo)connectRoom(mode);
 $('crossnote').textContent='CLICK TO CAPTURE MOUSE';
}
function connectRoom(mode){
 if(!window.Peer){status.textContent='NETWORK LIBRARY FAILED TO LOAD — SOLO IS STILL AVAILABLE';return}
 status.textContent='CONNECTING…';
 const name=($('callsign').value.trim()||'driver').slice(0,16);
 // PeerJS cloud broker is free to try; gameplay state is exchanged peer-to-peer.
 const peerName='bessa-'+roomId+'-'+Math.random().toString(36).slice(2,6);
 peer=new Peer(peerName,{debug:0});
 peer.on('open',id=>{
  if(isHost){status.textContent='ROOM OPEN · CODE: '+roomId;showToast('ROOM OPEN — SHARE CODE '+roomId)}
  else{
   const hostId='bessa-'+roomId+'-host';
   const c=peer.connect(hostId,{reliable:false,serialization:'json'});wireConn(c,name);
   status.textContent='CONNECTING TO HOST…';
  }
 });
 peer.on('connection',c=>{if(isHost)wireConn(c,name)});
 peer.on('error',e=>{console.warn(e);showToast('NETWORK UNAVAILABLE · TRY SOLO');$('roomlabel').textContent='SOLO · NETWORK OFFLINE';});
 // Host needs a predictable address, so create a second stable host peer when hosting.
 if(isHost){peer.destroy();peer=new Peer('bessa-'+roomId+'-host',{debug:0});peer.on('open',()=>{status.textContent='ROOM OPEN · SHARE CODE: '+roomId;showToast('ROOM OPEN — SHARE THE CODE')});peer.on('connection',c=>wireConn(c,name));peer.on('error',e=>{console.warn(e);showToast('ROOM CODE IN USE — TRY ANOTHER')})}
}
function wireConn(c,name){
 connections.push(c);
 c.on('open',()=>{c.send({type:'hello',name, pos:{x:player.pos.x,z:player.pos.z},car:inCar});showToast('PLAYER CONNECTED')});
 c.on('data',d=>{
  if(!d||typeof d!=='object')return;
  if(d.type==='state'){peersState.set(c.peer,{...d,seen:performance.now()});ensureRemote(c.peer,d.name)}
  if(d.type==='shot'&&d.pos)makeTracer(d.pos,d.dir,0xd5ff56);
  if(d.type==='hello'){ensureRemote(c.peer,d.name)}
 });
 c.on('close',()=>{connections=connections.filter(x=>x!==c);removeRemote(c.peer)});
}
function ensureRemote(id,name){if(remoteMeshes.has(id))return;const g=new THREE.Group();const body=box(g,.65,1.2,.45,mat(0x7e91b5),0,.7,0);const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.24,0),mats.dark);head.position.y=1.48;g.add(head);scene.add(g);remoteMeshes.set(id,{mesh:g,name:name||'guest'})}
function removeRemote(id){const r=remoteMeshes.get(id);if(r){scene.remove(r.mesh);remoteMeshes.delete(id)}peersState.delete(id)}
function broadcast(dt){
 lastBroadcast+=dt;if(lastBroadcast<.075)return;lastBroadcast=0;
 if(!peer)return;
 const state={type:'state',name:($('callsign').value.trim()||'driver').slice(0,16),pos:{x:player.pos.x,z:player.pos.z},yaw,health,inCar,car:inCar?{x:car.position.x,z:car.position.z,rot:car.rotation.y}:null};
 connections.forEach(c=>{if(c.open)c.send(state)});
 for(const [id,s] of peersState){const r=remoteMeshes.get(id);if(r&&s.pos){r.mesh.position.set(s.pos.x,0,s.pos.z);r.mesh.rotation.y=s.yaw||0;if(s.car)r.mesh.visible=false;else r.mesh.visible=true}}
}
function fire(){
 if(fireCooldown>0||!locked)return;fireCooldown=.19;
 const dir=new THREE.Vector3();camera.getWorldDirection(dir);
 const origin=camera.position.clone();makeTracer(origin,dir,0xd5ff56);
 // Raycast enemies for responsive hitscan combat.
 const ray=new THREE.Raycaster(origin,dir,0,55),targets=[];enemies.forEach(e=>e.traverse(o=>{if(o.isMesh)targets.push(o)}));
 const hit=ray.intersectObjects(targets,false)[0];
 if(hit){const enemy=enemies.find(e=>{let o=hit.object;while(o&&o.parent!==e)o=o.parent;return o===e});if(enemy){enemy.userData.hp--;if(enemy.userData.hp<=0){scene.remove(enemy);enemies=enemies.filter(e=>e!==enemy);spawnEnemy();kills++;$('kills').textContent=String(kills).padStart(3,'0');showToast('TARGET DOWN +1');if(Math.random()<.6)spawnPickup()}}}
 connections.forEach(c=>{if(c.open)c.send({type:'shot',pos:{x:origin.x,y:origin.y,z:origin.z},dir:{x:dir.x,y:dir.y,z:dir.z}})});
}
function makeTracer(pos,dir,color){
 const end=pos.clone().add(dir.clone().multiplyScalar(28)),geom=new THREE.BufferGeometry().setFromPoints([pos,end]);const line=new THREE.Line(geom,new THREE.LineBasicMaterial({color,transparent:true,opacity:.75}));scene.add(line);bullets.push({mesh:line,life:.07});
}
function hitPlayer(){health=Math.max(0,health-8);$('health').textContent=health;$('healthbar').style.width=health+'%';$('hurt').style.opacity='.8';setTimeout(()=>$('hurt').style.opacity='0',100);if(health<=0){health=100;player.pos.set((Math.random()-.5)*10,0,10);player.vel.set(0,0,0);showToast('REDEPLOYED')}}
function update(dt){
 fireCooldown=Math.max(0,fireCooldown-dt);if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show')}
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 if(inCar){
  const accel=(keys.KeyW?1:0)-(keys.KeyS?1:0),steer=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  car.userData.speed=(car.userData.speed||0)+accel*dt*18;car.userData.speed*=Math.pow(keys.Space?.91:.985,dt*60);car.userData.speed=clamp(car.userData.speed,-9,23);
  car.rotation.y-=steer*dt*(.8+Math.abs(car.userData.speed)*.045)*(car.userData.speed<0?-1:1);
  const f=new THREE.Vector3(-Math.sin(car.rotation.y),0,-Math.cos(car.rotation.y));car.position.addScaledVector(f,car.userData.speed*dt);
  car.position.x=clamp(car.position.x,-40,40);car.position.z=clamp(car.position.z,-40,40);
  carWheels.forEach(w=>w.rotation.x+=car.userData.speed*dt*2);
  player.pos.set(car.position.x,0,car.position.z);yaw=car.rotation.y;
  camera.position.set(car.position.x,1.28,car.position.z);camera.rotation.order='YXZ';camera.rotation.set(0,yaw,0);
  $('speed').textContent=Math.round(Math.abs(car.userData.speed)*7)+' KM/H';$('weapon').textContent='VEHICLE';
 }else{
  let move=new THREE.Vector3();if(keys.KeyW)move.add(forward);if(keys.KeyS)move.sub(forward);if(keys.KeyD)move.add(right);if(keys.KeyA)move.sub(right);if(move.lengthSq())move.normalize();
  player.vel.x+=(move.x*10-player.vel.x)*Math.min(1,dt*12);player.vel.z+=(move.z*10-player.vel.z)*Math.min(1,dt*12);
  player.pos.addScaledVector(player.vel,dt);player.pos.x=clamp(player.pos.x,-41,41);player.pos.z=clamp(player.pos.z,-41,41);
  camera.position.set(player.pos.x,1.68,player.pos.z);camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);
  $('speed').textContent='ON FOOT';$('weapon').textContent='SIDEARM';
 }
 // Simple collision resolution against cover boxes.
 if(!inCar){for(const o of obstacles){const p=o.position,w=o.userData.w/2+.4,d=o.userData.d/2+.4;if(Math.abs(player.pos.x-p.x)<w&&Math.abs(player.pos.z-p.z)<d){const dx=Math.abs(player.pos.x-p.x)/w,dz=Math.abs(player.pos.z-p.z)/d;if(dx>dz)player.pos.x=p.x+Math.sign(player.pos.x-p.x)*w;else player.pos.z=p.z+Math.sign(player.pos.z-p.z)*d}}}
 // Enemies pursue and shoot; keep AI cheap and deterministic.
 enemies.forEach(e=>{const d=new THREE.Vector3(player.pos.x-e.position.x,0,player.pos.z-e.position.z),len=d.length();if(len>2.8){d.normalize();e.position.addScaledVector(d,e.userData.speed*dt);e.rotation.y=Math.atan2(-d.x,-d.z)}e.userData.fire-=dt;if(e.userData.fire<=0&&len<22){e.userData.fire=1.1+Math.random()*1.2;if(Math.random()<.24)hitPlayer()}});
 pickups.forEach(p=>{p.rotation.y+=dt*1.5;p.position.y=.8+Math.sin(clock.elapsedTime*2+p.userData.phase)*.16;if(p.position.distanceTo(new THREE.Vector3(player.pos.x,.8,player.pos.z))<1.6){if(p.userData.type==='health'){health=Math.min(100,health+25);$('health').textContent=health;$('healthbar').style.width=health+'%';showToast('VITALS +25')}else{if(inCar)car.userData.speed=Math.min(25,(car.userData.speed||0)+8);else player.vel.multiplyScalar(1.8);showToast('BOOST CHARGED')}scene.remove(p);pickups=pickups.filter(x=>x!==p);spawnPickup()}});
 bullets.forEach(b=>{b.life-=dt;if(b.life<=0){scene.remove(b.mesh);b.dead=true}});bullets=bullets.filter(b=>!b.dead);
 $('hint').textContent=inCar?'E · EXIT VEHICLE':'E · ENTER VEHICLE';$('health').textContent=health;$('healthbar').style.width=health+'%';
 broadcast(dt);
}
function animate(){requestAnimationFrame(animate);if(!started)return;const dt=Math.min(clock.getDelta(),.04);update(dt);renderer.render(scene,camera)}
function toggleCar(){if(!car)return;if(!inCar&&player.pos.distanceTo(new THREE.Vector3(car.position.x,0,car.position.z))<4){inCar=true;car.userData.speed=0;showToast('VEHICLE ACQUIRED')}else if(inCar){inCar=false;player.pos.x=car.position.x+Math.cos(car.rotation.y)*2;player.pos.z=car.position.z-Math.sin(car.rotation.y)*2;showToast('ON FOOT')}}
document.addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyE'&&started)toggleCar();if(e.code==='Escape')document.exitPointerLock?.()});
document.addEventListener('keyup',e=>keys[e.code]=false);
document.addEventListener('mousemove',e=>{if(locked){yaw-=e.movementX*.0022;pitch=clamp(pitch-e.movementY*.0022,-1.35,1.35)}});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer?.domElement;$('crossnote').style.display=locked?'none':'block'});
document.addEventListener('mousedown',e=>{if(!started)return;if(!locked){renderer.domElement.requestPointerLock?.();return}if(e.button===0)fire()});
$('host').addEventListener('click',()=>start('host'));$('join').addEventListener('click',()=>start('join'));$('solo').addEventListener('click',()=>start('solo'));
$('leave').addEventListener('click',()=>{if(peer)peer.destroy();location.reload()});
})();
