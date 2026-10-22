import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {gridSample} from '../lib/geo.mjs';
import {buildRoadRibbon} from '../lib/road-surface.mjs';
import {validateField} from '../lib/field.mjs';
import {createCollisionWorld,chooseSpawn,advancePlayer,terrainHeight,blocked,collisionReason} from '../lib/navigation.mjs';
import {createGameInput} from './controls.js';
import {createWaterLayer} from './water.js';
import {pointOnPath} from '../lib/water-field.mjs';
import {validateManifest,createTiledWorld,registerTile,removeTile,tileAtPosition} from '../lib/tiles.mjs';
import {createTileStreamer} from './tile-stream.js';
import {fitGlobalWaterProfiles,profilesInLocalSpace} from '../lib/tile-water.mjs';
import {overviewPose} from '../lib/overview.mjs';
import './style.css';
const container=document.querySelector('#scene'),status=document.querySelector('#status'),details=document.querySelector('#details');
let renderer,controls,scene,camera,frame=0;
const localY=(field,x,z)=>gridSample(field.terrain,x,z)-field.terrain.min;
function geometryFromTriangles(triangles){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));g.computeVertexNormals();return g;
}
function addTerrain(field,parent){
 const {terrain}=field,{count,size,elevations}=terrain,vertices=[],uv=[],index=[];
 for(let z=0;z<count;z++)for(let x=0;x<count;x++){
  vertices.push(-size/2+x*size/(count-1),elevations[z*count+x]-terrain.min,-size/2+z*size/(count-1));uv.push(x/(count-1),z/(count-1));
 }
 for(let z=0;z<count-1;z++)for(let x=0;x<count-1;x++){
  const a=z*count+x,b=a+1,c=a+count,d=c+1;index.push(a,c,b,b,c,d);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color:0x7da88a,side:THREE.DoubleSide}));
 parent.add(mesh);
}
function addCrossingMarkers(field,parent,layerSet){
 const group=new THREE.Group();group.name='mapped-crossings';
 const marked=new Set();
 const add=(x,z,color,r=1.45)=>{
   const key=`${x.toFixed(1)}:${z.toFixed(1)}:${color}`;
   if(marked.has(key))return;marked.add(key);
   const geometry=new THREE.RingGeometry(r*.53,r,20),material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
   const marker=new THREE.Mesh(geometry,material);
   marker.rotation.x=-Math.PI/2;marker.position.set(x,localY(field,x,z)+.52,z);marker.renderOrder=4;
   group.add(marker);
 };
 for(const crossing of field.osm.crossings||[])add(crossing.x,crossing.z,0x50b47c);
 for(const crossing of field.osm.unverifiedCrossings||[])add(crossing.x,crossing.z,0xef915c,1.85);
 parent.add(group);layerSet.crossings=group;
}
function addTileBorder(field,parent,entry){
 const verts=[],segments=32,h=field.size/2;
 const sample=(x,z)=>[x,localY(field,x,z)+.7,z];
 const edges=[
   [[-h,-h],[h,-h]],[[h,-h],[h,h]],
   [[h,h],[-h,h]],[[-h,h],[-h,-h]]
 ];
 for(const [a,b] of edges){
   for(let i=0;i<segments;i++){
     const t0=i/segments,t1=(i+1)/segments;
     const px=t=>a[0]+(b[0]-a[0])*t,pz=t=>a[1]+(b[1]-a[1])*t;
     verts.push(...sample(px(t0),pz(t0)),...sample(px(t1),pz(t1)));
   }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
 const material=new THREE.LineBasicMaterial({
   color:entry.id==='north'?0xe5d7a6:0xf2bd76,
   transparent:true,opacity:.72,depthTest:false,depthWrite:false
 });
 const outline=new THREE.LineSegments(geometry,material);
 outline.name='tile-boundary-'+entry.id;
 outline.renderOrder=5;
 outline.visible=false;
 parent.add(outline);
 return outline;
}
function addRoads(field,parent,layerSet){
 const group=new THREE.Group();group.name='roads';const batches={road:[],path:[],railway:[],bridge:[]};
 for(const road of field.osm.roads){
  const kind=road.bridge?'bridge':['footway','path','steps','pedestrian','cycleway'].includes(road.kind)?'path':'road';
  for(let i=1;i<road.points.length;i++)batches[kind].push(...buildRoadRibbon(road.points[i-1],road.points[i],road.width,field,road.bridge ? .40 : .23));
 }
 for(const railway of field.osm.railways||[])if(!railway.tunnel)for(let i=1;i<railway.points.length;i++)
  batches.railway.push(...buildRoadRibbon(railway.points[i-1],railway.points[i],railway.width||2.5,field,railway.bridge?2.8:.31));
 for(const [type,verts] of Object.entries(batches)){
  if(!verts.length)continue;
  const colors={road:0xded8c5,path:0xedbb7a,railway:0x5e6b6e,bridge:0xeab878};
  const roadMesh=new THREE.Mesh(geometryFromTriangles(verts),new THREE.MeshLambertMaterial({color:colors[type],side:THREE.DoubleSide,depthTest:true,depthWrite:true}));
  roadMesh.renderOrder=2;group.add(roadMesh);
 }
 parent.add(group);layerSet.roads=group;
}
function addBuildings(field,parent,layerSet){
 const group=new THREE.Group();group.name='buildings';
 const walls=[],roofs=[];
 for(const b of field.osm.buildings){
  const p=b.footprint;if(p.length<3)continue;
  const base=p.reduce((sum,[x,z])=>sum+localY(field,x,z),0)/p.length,bottom=base+.15,top=base+b.height;
  const shape=new THREE.Shape();shape.moveTo(p[0][0],-p[0][1]);for(let i=1;i<p.length;i++)shape.lineTo(p[i][0],-p[i][1]);shape.closePath();
  const roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);roof.translate(0,top,0);
  const nongrid=roof.index?roof.toNonIndexed():roof;
  roofs.push(...nongrid.getAttribute('position').array);if(nongrid!==roof)nongrid.dispose();roof.dispose();
  for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length];walls.push(
   a[0],bottom,a[1],c[0],bottom,c[1],a[0],top,a[1],
   c[0],bottom,c[1],c[0],top,c[1],a[0],top,a[1]);
  }
 }
 if(walls.length){const mesh=new THREE.Mesh(geometryFromTriangles(walls),new THREE.MeshLambertMaterial({color:0xd3d7cf,side:THREE.DoubleSide}));mesh.renderOrder=3;group.add(mesh);}
 if(roofs.length){const mesh=new THREE.Mesh(geometryFromTriangles(roofs),new THREE.MeshLambertMaterial({color:0xb47968,side:THREE.DoubleSide}));mesh.renderOrder=3;group.add(mesh);}
 parent.add(group);layerSet.buildings=group;
}
function makeAvatar(){
 const group=new THREE.Group();group.name='player-avatar';
 const body=new THREE.Mesh(new THREE.CapsuleGeometry(.29,.78,6,12),new THREE.MeshLambertMaterial({color:0x244f80}));
 body.position.y=.82;group.add(body);
 const face=new THREE.Mesh(new THREE.SphereGeometry(.36,12,10),new THREE.MeshLambertMaterial({color:0xffd198}));
 face.position.y=1.73;group.add(face);
 const nose=new THREE.Mesh(new THREE.ConeGeometry(.12,.32,6),new THREE.MeshLambertMaterial({color:0xe68d43}));
 nose.rotation.x=Math.PI/2;nose.position.set(0,1.68,-.37);group.add(nose);
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(.55,20),new THREE.MeshBasicMaterial({color:0x1b3935,transparent:true,opacity:.24,depthWrite:false}));
 shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;group.add(shadow);
 group.userData.type='player';
 return group;
}
async function init(north,manifest){
 validateManifest(manifest);
 scene=new THREE.Scene();scene.background=new THREE.Color(0xb7d7d9);scene.fog=new THREE.Fog(0xb7d7d9,500,1150);
 camera=new THREE.PerspectiveCamera(55,1,.1,11000);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 container.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xf5faff,0x83917b,2.1));
 const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-180,320,120);scene.add(sun);
 const world=createTiledWorld(manifest);
 const visuals=new Map(),layerVisibility={roads:true,buildings:true};
 const flatWater=new URLSearchParams(location.search).get('water')==='flat';
 let elapsed=0,streamer=null,playerState=null,mode='walk';
 const disposeObject=object=>{
   object.traverse(o=>{
     if(o.geometry)o.geometry.dispose();
     const materials=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
     for(const material of materials)material.dispose();
   });
 };
 function updateLayerMetrics(){
   const mounted=[...visuals.values()];
   container.dataset.loadedTiles=[...visuals.keys()].join(',');
   container.dataset.waterMaterial=flatWater?'flat':'procedural';
   container.dataset.waterMeshes=String(mounted.reduce((n,v)=>n+(v.water?.group.children.length||0),0));
   container.dataset.waterTriangles=String(mounted.reduce((n,v)=>n+(v.water?.summary.triangles||0),0));
   container.dataset.waterRibbons=String(mounted.reduce((n,v)=>n+(v.water?.summary.ribbons||0),0));
   container.dataset.waterFlowPaths=String(mounted.reduce((n,v)=>n+(v.water?.summary.flowPaths||0),0));
   container.dataset.waterLimited=String(mounted.some(v=>v.water?.summary.limited));
   container.dataset.liveTileMeshes=String(mounted.reduce((sum,v)=>{
     let n=0;v.root.traverse(o=>{if(o.isMesh)n++;});return sum+n;
   },0));
 }
 function refreshWater(){
   if(!streamer)return;
   const cached=streamer.getCached();
   const profiles=fitGlobalWaterProfiles(cached,manifest);
   for(const visual of visuals.values()){
     if(visual.water){visual.root.remove(visual.water.group);disposeObject(visual.water.group);}
     visual.water=createWaterLayer(visual.field,{
       flat:flatWater,sharedProfiles:profilesInLocalSpace(profiles,visual.entry)
     });
     visual.water.uniforms.uTime.value=elapsed;
     visual.water.uniforms.uMotion.value=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?0:1;
     visual.root.add(visual.water.group);
   }
   updateLayerMetrics();
 }
 function reportStreaming(snapshot){
   container.dataset.pendingTiles=snapshot.pending.join(',');
   container.dataset.cachedTiles=streamer?.snapshot().cached.join(',')||'';
   const current=mode==='map'?'全域':([...visuals.keys()].slice(0,3).join('＋')||'なし');
   const progress=snapshot.pending.length?' · 読み込み中 '+snapshot.pending.length+'件':'';
   const error=snapshot.errors.length?' · タイル取得失敗（再試行可能）':'';
   const visible=visuals.size;
   const bounds=world.bounds;
   const label=(bounds.maxX-bounds.minX)+'m × '+(bounds.maxZ-bounds.minZ)+'m';
   const prefix=mode==='map'?'全域 '+label+' · ':'実地理データを表示中 · ';
   status.textContent=prefix+'読込 '+visible+'/'+manifest.tiles.length+' · '+current+progress+error;
   status.classList.toggle('failed',!!snapshot.errors.length);
 }
 function mount(entry,field){
   registerTile(world,entry,field);
   const root=new THREE.Group();root.name='tile-'+entry.id;
   root.position.set(entry.offset[0],field.terrain.min-world.baseElevation,entry.offset[1]);
   const layers={};
   addTerrain(field,root);addRoads(field,root,layers);addBuildings(field,root,layers);
   addCrossingMarkers(field,root,layers);
   layers.outline=addTileBorder(field,root,entry);
   layers.outline.visible=mode==='map';
   for(const road of layers.roads.children){
     road.material.depthTest=mode!=='map';
     road.material.depthWrite=mode!=='map';
   }
   layers.roads.visible=layerVisibility.roads;
   layers.buildings.visible=layerVisibility.buildings;
   scene.add(root);
   const visual={entry,field,root,layers,water:null};
   visuals.set(entry.id,visual);refreshWater();
   updateDetails();
   return visual;
 }
 function unmount(entry,visual){
   visuals.delete(entry.id);
   removeTile(world,entry.id);
   scene.remove(visual.root);disposeObject(visual.root);
   refreshWater();
   updateDetails();
 }
 function updateDetails(){
   const fields=[...visuals.values()].map(v=>v.field);
   const b=world.bounds;
   details.textContent=`対象 ${b.maxX-b.minX}m × ${b.maxZ-b.minZ}m · 読込 ${fields.length}/${manifest.tiles.length} · 道路 ${fields.reduce((a,v)=>a+v.osm.roads.length,0)}区間 · 建物 ${fields.reduce((a,v)=>a+v.osm.buildings.length,0)}棟 · 線路 ${fields.reduce((a,v)=>a+v.osm.railways.length,0)}区間 · 水路 ${fields.reduce((a,v)=>a+v.osm.waterways.length,0)}区間`;
 }
 streamer=createTileStreamer({
   manifest,
   fetchTile:async entry=>{
     if(entry.id==='north')return north;
     const response=await fetch(`${import.meta.env.BASE_URL}${entry.url}`,{cache:'no-store'});
     if(!response.ok)throw Error(`タイル ${entry.id} の取得に失敗 (HTTP ${response.status})`);
     const field=await response.json();validateField(field);return field;
   },
   mount,unmount,onChange:reportStreaming
 });
 await streamer.ensure('north');
 const spawn=chooseSpawn(createCollisionWorld(north));
 playerState={...spawn,facing:spawn.yaw,moving:false,collided:false,distance:0};
 const avatar=makeAvatar();avatar.traverse(o=>{if(o.isMesh)o.renderOrder=4;});scene.add(avatar);
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=true;controls.dampingFactor=.07;
 controls.maxPolarAngle=Math.PI/2.05;controls.minDistance=15;controls.maxDistance=9000;
 controls.screenSpacePanning=true;controls.enabled=false;
 let cameraYaw=spawn.yaw,cameraPitch=.52,cameraDistance=14;
 const coords=document.querySelector('#player-coords');
 const modeButton=document.querySelector('#mode');
 const hint=document.querySelector('#hint');
 const gameInput=createGameInput({
   canvas:renderer.domElement,joystick:document.querySelector('#joystick'),
   knob:document.querySelector('#joystick-knob'),runButton:document.querySelector('#run'),
   isActive:()=>mode==='walk',
   onLook(dx,dy){cameraYaw+=dx;cameraPitch=Math.min(1.1,Math.max(.2,cameraPitch+dy));},
   onZoom(ratio){cameraDistance=Math.min(28,Math.max(5,cameraDistance*ratio));}
 });
 const avatarPosition=()=>{avatar.position.set(playerState.x,playerState.y,playerState.z);avatar.rotation.y=playerState.facing;};
 function followCamera(dt,snap=false){
   const target=new THREE.Vector3(playerState.x,playerState.y+1.45,playerState.z);
   const horiz=cameraDistance*Math.cos(cameraPitch);
   let allowed=horiz;
   for(let d=1.1;d<=horiz;d+=.6){
     const cx=playerState.x+Math.sin(cameraYaw)*d,cz=playerState.z+Math.cos(cameraYaw)*d;
     const hit=collisionReason(world,cx,cz,.38);
     if(hit==='building'||hit==='boundary'||hit==='loading'){allowed=Math.max(1.05,d-.6);break;}
   }
   const x=target.x+Math.sin(cameraYaw)*allowed,z=target.z+Math.cos(cameraYaw)*allowed;
   let ground=playerState.y;
   try{ground=terrainHeight(world,x,z);}catch{}
   const desired=new THREE.Vector3(x,Math.max(target.y+allowed*Math.tan(cameraPitch),ground+1.5),z);
   const factor=snap?1:1-Math.exp(-12*dt);
   camera.position.lerp(desired,factor);
   controls.target.lerp(target,factor);camera.lookAt(controls.target);
 }
 const mapTarget=new THREE.Vector3();
 let overviewSequence=0;
 container.dataset.overviewReady='false';
 function resetMap(){
   const focusRiver=new URLSearchParams(location.search).get('view')==='river';
   const visual=visuals.get('north');
   if(focusRiver&&visual?.water?.profiles.length){
     const path=visual.water.profiles[0],point=pointOnPath(path,path.length*.54);
     const y=path.getHeight(path.length*.54)-world.baseElevation;
     controls.target.set(point[0]+visual.entry.offset[0],y+1.3,point[1]+visual.entry.offset[1]);
     camera.position.set(controls.target.x+41,y+39,controls.target.z+57);
   }else{
     const pose=overviewPose(manifest,container.clientWidth/Math.max(1,container.clientHeight),camera.fov,(north.terrain.max-north.terrain.min)/2);
     mapTarget.set(...pose.target);
     controls.target.copy(mapTarget);camera.position.set(...pose.position);
     container.dataset.overviewExtent=pose.dimensions.join('x');
   }
   controls.update();
 }
 function updateHud(){
   const owner=tileAtPosition(manifest,playerState.x,playerState.z);
   coords.dataset.x=playerState.x.toFixed(3);
   coords.dataset.z=playerState.z.toFixed(3);
   coords.dataset.y=playerState.y.toFixed(3);
   coords.dataset.tile=owner?.id||'outside';
   const labels={building:'建物',railway:'線路',waterway:'水路','water-area':'水域',boundary:'マップ境界',loading:'エリア読込待ち'};
   const contact=playerState.collided?` · ${labels[playerState.collision]||'障害物'}に接触`:'';
   coords.textContent=`位置 X ${playerState.x.toFixed(1)}m / Z ${playerState.z.toFixed(1)}m · エリア ${owner?.id||'外'} · 標高 ${(playerState.y+world.baseElevation).toFixed(1)}m${contact}`;
 }
 function resetWalk(){
   playerState={...spawn,facing:spawn.yaw,moving:false,collided:false,distance:0};
   cameraYaw=spawn.yaw;cameraPitch=.52;cameraDistance=14;gameInput.reset();
   avatarPosition();followCamera(0,true);updateHud();streamer.update(playerState.x,playerState.z);
 }
 function changeMode(next){
   mode=next;controls.enabled=next==='map';
   // Fog was originally tuned for the 500m walking view (far=1150m).
   // Full map camera sits ~1200m above the ground: without extending the
   // fog plane, the new southern tile becomes invisible behind fog.
   scene.fog.near=next==='map'?1500:500;
   scene.fog.far=next==='map'?11000:1150;
   for(const visual of visuals.values()){
     visual.layers.outline.visible=next==='map';
     for(const road of visual.layers.roads.children){
       road.material.depthTest=next!=='map';
       road.material.depthWrite=next!=='map';
       road.material.needsUpdate=true;
     }
   }
   document.querySelector('#app').dataset.mode=mode;
   modeButton.textContent=next==='walk'?'俯瞰':'歩く';
   document.querySelector('#reset').textContent=next==='walk'?'位置を戻す':'全域表示';
   modeButton.setAttribute('aria-label',next==='walk'?'俯瞰モードに切り替える':'歩行モードに切り替える');
   modeButton.classList.toggle('selected',next==='walk');
   hint.textContent=next==='walk'?'左スティック・WASDで移動 · ドラッグで視点 · Shift/「走る」でダッシュ':'ドラッグで回転 · 2本指・ホイールで拡大 · 右ドラッグで平行移動';
   gameInput.reset();
   overviewSequence++;
   if(next==='map'){
     resetMap();
     container.dataset.overviewReady='false';
     const sequence=overviewSequence;
     // A close-up river diagnostic needs only its local tile; do not
     // populate all nine GPU tiles during the textureless performance baseline.
     const singleRiverView=new URLSearchParams(location.search).get('view')==='river';
     (singleRiverView?streamer.ensure('north'):streamer.ensureAll({concurrency:2})).then(()=>{
       if(mode!=='map'||sequence!==overviewSequence)return;
       resetMap();
       container.dataset.overviewReady=singleRiverView?'diagnostic':'true';
       reportStreaming(streamer.snapshot());
     }).catch(error=>{
       if(mode!=='map'||sequence!==overviewSequence)return;
       console.error('Unable to load complete overview:',error);
       status.classList.add('failed');
       status.textContent='全域の読み込みに失敗しました: '+error.message;
     });
   }else{
     container.dataset.overviewReady='false';
     followCamera(0,true);
   }
 }
 document.querySelector('#reset').onclick=async()=>{
   if(mode==='map'){resetMap();return;}
   try{
     // Start tile may have been GPU-unloaded after a long walk south.
     // Rehydrate collision + terrain BEFORE teleporting back to spawn.
     await streamer.ensure('north');
     resetWalk();
   }catch(e){
     console.error('Unable to reload starting tile:',e);
     status.classList.add('failed');status.textContent='開始地点の読込に失敗: '+e.message;
   }
 };
 modeButton.onclick=()=>changeMode(mode==='walk'?'map':'walk');
 for(const name of ['roads','buildings'])document.querySelector('#'+name).onclick=()=>{
   layerVisibility[name]=!layerVisibility[name];
   for(const v of visuals.values())v.layers[name].visible=layerVisibility[name];
   const button=document.querySelector('#'+name);
   button.classList.toggle('selected',layerVisibility[name]);button.setAttribute('aria-pressed',String(layerVisibility[name]));
 };
 const resize=()=>{
   const w=container.clientWidth,h=container.clientHeight;
   camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h,false);
   if(mode==='map')resetMap();
 };
 const observer=new ResizeObserver(resize);observer.observe(container);resize();
 const fixedStep=1/60,clock=new THREE.Clock();
 let accumulator=0,hudTime=0,streamTime=0;
 resetWalk();changeMode('walk');
 if(new URLSearchParams(location.search).has('test')){
   window.__michiDebug={
     ensureTile:id=>streamer.ensure(id),
     teleport:(x,z,yaw=Math.PI)=>{
       if(collisionReason(world,x,z))return false;
       playerState={...playerState,x,z,y:terrainHeight(world,x,z),facing:yaw,collision:null,collided:false};
       cameraYaw=yaw;avatarPosition();followCamera(0,true);updateHud();streamer.update(x,z);return true;
     },
     state:()=>({...playerState,tiles:streamer.snapshot()}),
     worldCollision:(x,z)=>collisionReason(world,x,z),
     overviewProjection:()=>{
       const pose=overviewPose(manifest,container.clientWidth/Math.max(1,container.clientHeight),camera.fov);
       const {bounds}=pose;
       const corners=[];
       for(const x of [bounds.minX,bounds.maxX])for(const z of [bounds.minZ,bounds.maxZ]){
         const projected=new THREE.Vector3(x,world.baseElevation===null?0:5,z).project(camera);
         corners.push({x,z,ndc:[projected.x,projected.y,projected.z]});
       }
       return {mode,ready:container.dataset.overviewReady,extent:pose.dimensions,
         active:streamer.snapshot().active,corners,fogFar:scene.fog.far};
     },
     focusSouthRiver:()=>{
       if(mode!=='map'||!visuals.has('south'))return false;
       const x=199,z=390;
       const y=terrainHeight(world,x,z)+.25;
       controls.target.set(x,y,z);
       camera.position.set(x+28,y+54,z+62);
       controls.update();
       return true;
     },
     visualAudit:()=>({
       tiles:[...visuals].map(([id,visual])=>({
         id,
         waterAreas:visual.water?.summary.areas||0,
         waterRibbons:visual.water?.summary.ribbons||0,
         waterTriangleCount:visual.water?.summary.triangles||0,
         roadTriangles:visual.layers.roads.children.reduce((n,m)=>n+m.geometry.getAttribute('position').count/3,0),
         roadsDepthTest:visual.layers.roads.children.every(m=>m.material.depthTest),
         riverRibbons:visual.water?.group.children.filter(m=>m.name.startsWith('waterway-')).map(mesh=>{
           mesh.geometry.computeBoundingBox();
           const box=mesh.geometry.boundingBox;
           return {id:mesh.name,min:[box.min.x,box.min.y,box.min.z],max:[box.max.x,box.max.y,box.max.z]};
         })||[]
       }))
     }),
     tick:()=>streamer.update(playerState.x,playerState.z)
   };
 }
 function draw(){
   frame=requestAnimationFrame(draw);
   const dt=Math.min(clock.getDelta(),.16);
   if(mode==='walk'){
     accumulator+=dt;const intent=gameInput.getIntent();let n=0;
     while(accumulator>=fixedStep&&n<10){
       playerState=advancePlayer(playerState,{...intent,yaw:cameraYaw},world,fixedStep);
       accumulator-=fixedStep;n++;
     }
     avatarPosition();followCamera(dt);
     hudTime+=dt;if(hudTime>.13){updateHud();hudTime=0;}
   }else{accumulator=0;controls.update();}
   streamTime+=dt;if(streamTime>.2){
     const target=mode==='walk'?{x:playerState.x,z:playerState.z}:{x:mapTarget.x,z:mapTarget.z};
     streamer.update(target.x,target.z,{retainAll:mode==='map'&&new URLSearchParams(location.search).get('view')!=='river'});streamTime=0;
   }
   elapsed+=dt;
   for(const visual of visuals.values())if(visual.water)visual.water.uniforms.uTime.value=elapsed;
   renderer.render(scene,camera);
   if((frame%60)===0){
     container.dataset.gpuGeometries=String(renderer.info.memory.geometries);
     container.dataset.gpuTextures=String(renderer.info.memory.textures);
   }
 }
 draw();
 window.addEventListener('pagehide',()=>{
   cancelAnimationFrame(frame);observer.disconnect();gameInput.destroy();controls.dispose();
   void streamer.dispose();
   avatar.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
   renderer.dispose();
 },{once:true});
}

async function main(){
 try{
  const root=import.meta.env.BASE_URL;
  const [manifestResponse,fieldResponse]=await Promise.all([
    fetch(`${root}data/tiles.json`,{cache:'no-store'}),
    fetch(`${root}data/field.json`,{cache:'no-store'})
  ]);
  if(!manifestResponse.ok)throw Error(`tiles.json がありません (HTTP ${manifestResponse.status})`);
  if(!fieldResponse.ok)throw Error(`北側地理データがありません (HTTP ${fieldResponse.status})`);
  const [manifest,field]=await Promise.all([manifestResponse.json(),fieldResponse.json()]);
  validateField(field);validateManifest(manifest);
  await init(field,manifest);
 }catch(e){
  console.error(e);status.classList.add('failed');status.textContent=`読み込み失敗: ${e.message}`;
 }
}
main();
