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
import {createWideOverview,wideOverviewNeeded} from './wide-overview.js';
import {pixelRatioBudget,tileDetail,geometryStats,OVERVIEW_ROAD_STEP,FULL_ROAD_STEP} from '../lib/render-policy.mjs';
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
function addRoads(field,parent,layerSet,detail='full'){
 const group=new THREE.Group();group.name='roads';const batches={road:[],path:[],railway:[],bridge:[]};
 const step=detail==='overview'?OVERVIEW_ROAD_STEP:FULL_ROAD_STEP;
 for(const road of field.osm.roads){
  const kind=road.bridge?'bridge':['footway','path','steps','pedestrian','cycleway'].includes(road.kind)?'path':'road';
  for(let i=1;i<road.points.length;i++)batches[kind].push(...buildRoadRibbon(road.points[i-1],road.points[i],road.width,field,road.bridge ? .40 : .23,{alongStep:step,acrossStep:detail==='overview'?8:2.4,terrainSafe:detail==='overview'}));
 }
 for(const railway of field.osm.railways||[])if(!railway.tunnel)for(let i=1;i<railway.points.length;i++)
  batches.railway.push(...buildRoadRibbon(railway.points[i-1],railway.points[i],railway.width||2.5,field,railway.bridge?2.8:.31,{alongStep:step,acrossStep:detail==='overview'?8:2.4,terrainSafe:detail==='overview'}));
 for(const [type,verts] of Object.entries(batches)){
  if(!verts.length)continue;
  const colors={road:0xded8c5,path:0xedbb7a,railway:0x5e6b6e,bridge:0xeab878};
  const roadMesh=new THREE.Mesh(geometryFromTriangles(verts),new THREE.MeshLambertMaterial({color:colors[type],side:THREE.DoubleSide,depthTest:true,depthWrite:true}));
  roadMesh.renderOrder=2;group.add(roadMesh);
 }
 parent.add(group);layerSet.roads=group;
}
function addBuildings(field,parent,layerSet,detail='full'){
 const group=new THREE.Group();group.name='buildings';
 const walls=[],roofs=[];
 for(const b of field.osm.buildings){
  const p=b.footprint;if(p.length<3)continue;
  const base=p.reduce((sum,[x,z])=>sum+localY(field,x,z),0)/p.length,bottom=base+.15,top=base+b.height;
  if(detail==='overview'){
   // Tiny distant buildings need roofs, not hundreds of unseen wall triangles.
   const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]);
   const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
   if(maxX-minX<.05||maxZ-minZ<.05)continue;
   roofs.push(minX,top,minZ,maxX,top,minZ,minX,top,maxZ,
     maxX,top,minZ,maxX,top,maxZ,minX,top,maxZ);
   continue;
  }
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
 container.dataset.appReady='false';
 scene=new THREE.Scene();scene.background=new THREE.Color(0xb7d7d9);scene.fog=new THREE.Fog(0xb7d7d9,500,1150);
 camera=new THREE.PerspectiveCamera(55,1,.1,11000);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 const coarsePointer=window.matchMedia?.('(pointer: coarse)').matches||false;
 const memoryGiB=Number.isFinite(navigator.deviceMemory)?navigator.deviceMemory:null;
 renderer.setPixelRatio(pixelRatioBudget(devicePixelRatio||1,{coarse:coarsePointer,memoryGiB}));
 container.dataset.renderPixelRatio=String(renderer.getPixelRatio());
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 container.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xf5faff,0x83917b,2.1));
 const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-180,320,120);scene.add(sun);
 const world=createTiledWorld(manifest);
 const visuals=new Map(),layerVisibility={roads:true,buildings:true};
 const flatWater=new URLSearchParams(location.search).get('water')==='flat';
 const wideMap=wideOverviewNeeded(manifest);
 let wideLayer=null;
 let elapsed=0,streamer=null,playerState=null,mode='walk';
 const disposeObject=object=>{
   const materials=new Set(),geometries=new Set();
   object.traverse(o=>{
     if(o.geometry)geometries.add(o.geometry);
     const mats=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
     for(const mat of mats)materials.add(mat);
   });
   for(const geometry of geometries)geometry.dispose();
   for(const material of materials)material.dispose();
 };
 const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 let lodQueue=Promise.resolve();
 const detailFor=entry=>tileDetail({
   mode,x:playerState?.x??0,z:playerState?.z??0,entry,size:manifest.size,
   camera:mode==='map'?camera.position:null
 });
 function updateLayerMetrics(){
   const mounted=[...visuals.values()];
   const stats=geometryStats(mounted);
   container.dataset.loadedTiles=[...visuals.keys()].join(',');
   container.dataset.waterMaterial=flatWater?'flat':'procedural';
   container.dataset.waterMeshes=String(mounted.reduce((n,v)=>n+(v.water?.group.children.length||0),0));
   container.dataset.waterTriangles=String(stats.waterTriangles);
   container.dataset.roadTriangles=String(stats.roadTriangles);
   container.dataset.buildingTriangles=String(stats.buildingTriangles);
   container.dataset.lodFull=String(stats.full);
   container.dataset.lodOverview=String(stats.overview);
   container.dataset.wideOverviewTiles=String(wideLayer?.loadedTiles||0);
   container.dataset.wideOverviewTriangles=String(wideLayer?.budget.triangles||0);
   container.dataset.waterRibbons=String(mounted.reduce((n,v)=>n+(v.water?.summary.ribbons||0),0));
   container.dataset.waterFlowPaths=String(mounted.reduce((n,v)=>n+(v.water?.summary.flowPaths||0),0));
   container.dataset.waterLimited=String(mounted.some(v=>v.water?.summary.limited));
   container.dataset.liveTileMeshes=String(mounted.reduce((sum,v)=>{
     let n=0;v.root.traverse(o=>{if(o.isMesh)n++;});return sum+n;
   },0));
 }
 function currentWaterProfiles(){
   if(!streamer)return [];
   return fitGlobalWaterProfiles(streamer.getCached(),manifest);
 }
 function rebuildWater(visual,profiles=currentWaterProfiles()){
   if(visual.removed)return;
   const next=createWaterLayer(visual.field,{
     flat:flatWater,detail:visual.level,sharedProfiles:profilesInLocalSpace(profiles,visual.entry)
   });
   next.uniforms.uTime.value=elapsed;
   next.uniforms.uMotion.value=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?0:1;
   if(visual.water){visual.root.remove(visual.water.group);disposeObject(visual.water.group);}
   visual.water=next;
   visual.root.add(next.group);
 }
 /** Refit only rivers sharing an OSM way with an acquired or removed tile. */
 function refreshWater(changed=null){
   if(!streamer)return;
   const profiles=currentWaterProfiles();
   const affected=changed?new Set((changed.field.osm.waterways||[]).map(w=>w.id)):null;
   for(const visual of visuals.values()){
     if(changed&&visual.entry.id!==changed.entry.id&&
       !visual.field.osm.waterways.some(w=>affected.has(w.id)))continue;
     rebuildWater(visual,profiles);
   }
   updateLayerMetrics();
 }
 function syncRoadDepth(layers){
   for(const road of layers.roads.children){
     road.material.depthTest=mode!=='map';
     road.material.depthWrite=mode!=='map';
     road.material.needsUpdate=true;
   }
 }
 function scheduleDetail(visual,detail){
   if(visual.removed||visual.requestedLevel===detail)return;
   visual.requestedLevel=detail;
   if(visual.lodQueued)return;
   visual.lodQueued=true;
   lodQueue=lodQueue.then(async()=>{
     while(!visual.removed&&visual.level!==visual.requestedLevel){
       const target=visual.requestedLevel;
       const temp=new THREE.Group(),next={};
       addRoads(visual.field,temp,next,target);
       await nextFrame();
       if(visual.removed){disposeObject(temp);break;}
       addBuildings(visual.field,temp,next,target);
       await nextFrame();
       if(visual.removed||visual.requestedLevel!==target){
         disposeObject(temp);continue;
       }
       visual.root.remove(visual.layers.roads,visual.layers.buildings);
       disposeObject(visual.layers.roads);disposeObject(visual.layers.buildings);
       visual.layers.roads=next.roads;visual.layers.buildings=next.buildings;
       visual.root.add(next.roads,next.buildings);
       visual.level=target;
       next.roads.visible=layerVisibility.roads;
       next.buildings.visible=layerVisibility.buildings;
       syncRoadDepth(visual.layers);
       rebuildWater(visual);
       updateLayerMetrics();
     }
   }).catch(error=>console.error('LOD replacement failed',error)).finally(()=>{visual.lodQueued=false;});
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
   const prefix=mode==='map'?'全域 '+label+' · ':'架空のデモ地形を表示中 · ';
   const progressLabel=wideMap&&mode==='map'&&wideLayer
     ?'広域 '+wideLayer.loadedTiles+'/'+manifest.tiles.length+' · 詳細 '+visible
     :'読込 '+visible+'/'+manifest.tiles.length;
   status.textContent=container.dataset.appReady==='false'
     ?'3Dフィールドを準備中 · 読込 '+visible+'/'+manifest.tiles.length
     :prefix+progressLabel+' · '+current+progress+error;
   status.classList.toggle('failed',!!snapshot.errors.length);
 }
 async function mount(entry,field){
   // Stagger terrain, roads, buildings and water uploads over separate RAFs.
   // This avoids one giant 9-tile geometry construction task on first overview.
   const root=new THREE.Group();root.name='tile-'+entry.id;
   const layers={},level=detailFor(entry);
   addTerrain(field,root);
   await nextFrame();
   addRoads(field,root,layers,level);
   await nextFrame();
   addBuildings(field,root,layers,level);
   await nextFrame();
   addCrossingMarkers(field,root,layers);
   layers.outline=addTileBorder(field,root,entry);
   layers.outline.visible=mode==='map';
   syncRoadDepth(layers);
   layers.roads.visible=layerVisibility.roads;
   layers.buildings.visible=layerVisibility.buildings;
   registerTile(world,entry,field);
   root.position.set(entry.offset[0],field.terrain.min-world.baseElevation,entry.offset[1]);
   scene.add(root);
   const maxHeight=Math.max(40,...field.osm.buildings.map(b=>b.height));
   const h=manifest.size/2;
   const bounds=new THREE.Box3(
     new THREE.Vector3(entry.offset[0]-h,field.terrain.min-world.baseElevation-3,entry.offset[1]-h),
     new THREE.Vector3(entry.offset[0]+h,field.terrain.max-world.baseElevation+maxHeight+3,entry.offset[1]+h)
   );
   const visual={entry,field,root,layers,level,requestedLevel:level,bounds,
     lodQueued:false,removed:false,water:null};
   visuals.set(entry.id,visual);
   refreshWater({entry,field});
   updateDetails();
   // Mode can change while a tile is being created.
   scheduleDetail(visual,detailFor(entry));
   return visual;
 }
 function unmount(entry,visual){
   visual.removed=true;
   visuals.delete(entry.id);
   removeTile(world,entry.id);
   scene.remove(visual.root);disposeObject(visual.root);
   refreshWater({entry,field:visual.field});
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
 let overviewSequence=0,overviewAbort=null;
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
   if(overviewAbort){overviewAbort.abort();overviewAbort=null;}
   if(wideLayer)wideLayer.group.visible=next==='map';
   for(const visual of visuals.values()){
     visual.layers.outline.visible=next==='map';
     syncRoadDepth(visual.layers);
     scheduleDetail(visual,detailFor(visual.entry));
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
     overviewAbort=new AbortController();
     const signal=overviewAbort.signal;
     const startOverview=async()=>{
       if(singleRiverView){await streamer.ensure('north');return;}
       if(!wideMap){await streamer.ensureAll({concurrency:2,signal});return;}
       if(wideLayer)return;
       // One fixed-size fallback atlas covers the full map while only nearby
       // tiles retain their normal detail/collision meshes.
       const builder=createWideOverview(manifest,world.baseElevation);
       await streamer.scanAll({concurrency:2,signal,onTile:async(entry,field)=>{
         if(signal.aborted)return;
         builder.addTile(entry,field);
         await nextFrame();
       }});
       if(signal.aborted)return;
       const finished=builder.finish();
       wideLayer=finished;
       finished.layers.roads.visible=layerVisibility.roads;
       finished.layers.buildings.visible=layerVisibility.buildings;
       scene.add(finished.group);
       updateLayerMetrics();
     };
     startOverview().then(()=>{
       if(mode!=='map'||sequence!==overviewSequence)return;
       resetMap();
       container.dataset.overviewReady=singleRiverView?'diagnostic':'true';
       reportStreaming(streamer.snapshot());
     }).catch(error=>{
       if(mode!=='map'||sequence!==overviewSequence||error.name==='AbortError')return;
       console.error('Unable to load complete overview:',error);
       status.classList.add('failed');
       status.textContent='全域の読み込みに失敗しました: '+error.message;
     });
   }else{
     container.dataset.overviewReady='false';
     followCamera(0,true);
     streamer.update(playerState.x,playerState.z);
   }
   reportStreaming(streamer.snapshot());
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
   if(wideLayer&&name in wideLayer.layers)wideLayer.layers[name].visible=layerVisibility[name];
   const button=document.querySelector('#'+name);
   button.classList.toggle('selected',layerVisibility[name]);button.setAttribute('aria-pressed',String(layerVisibility[name]));
 };
 const resize=()=>{
   const w=container.clientWidth,h=container.clientHeight;
   camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h,false);
   if(mode==='map')resetMap();
 };
 const observer=new ResizeObserver(resize);observer.observe(container);resize();
 const frustum=new THREE.Frustum(),projectionView=new THREE.Matrix4();
 function updateVisibleTiles(){
   camera.updateMatrixWorld();
   projectionView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
   frustum.setFromProjectionMatrix(projectionView);
   let visible=0;
   for(const visual of visuals.values()){
     // Exact tile width/height AABB: bounding spheres overestimated visibility
     // and kept all nine meshes alive in a close-up mobile view.
     visual.root.visible=frustum.intersectsBox(visual.bounds);
     if(visual.root.visible)visible++;
   }
   container.dataset.frustumVisibleTiles=String(visible);
 }
 const fixedStep=1/60,clock=new THREE.Clock();
 let accumulator=0,hudTime=0,streamTime=0,qualityTime=0,metricTime=0;
 let frameIndex=0;
 const frameDurations=[];
 const longTaskState={count:0,max:0};
 let longTaskObserver=null;
 if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
   longTaskObserver=new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
       longTaskState.count++;
       longTaskState.max=Math.max(longTaskState.max,entry.duration);
     }
   });
   longTaskObserver.observe({type:'longtask',buffered:false});
 }
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
     renderStats:()=>({
       ...geometryStats(visuals.values()),
       pixelRatio:renderer.getPixelRatio(),
       memory:{...renderer.info.memory},
       render:{...renderer.info.render},
       frameP95Ms:Number(container.dataset.frameP95Ms||0),
       longTaskCount:longTaskState.count,
       visibleTiles:Number(container.dataset.frustumVisibleTiles||0),
       wideOverview:wideLayer?{tiles:wideLayer.loadedTiles,...wideLayer.budget}:null,
       levels:[...visuals.values()].map(v=>({id:v.entry.id,level:v.level,visible:v.root.visible}))
     }),
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
   const rawDt=clock.getDelta(),dt=Math.min(rawDt,.16);
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
     const target=mode==='walk'?{x:playerState.x,z:playerState.z}:
       wideMap?{x:controls.target.x,z:controls.target.z}:{x:mapTarget.x,z:mapTarget.z};
     streamer.update(target.x,target.z,{retainAll:mode==='map'&&!wideMap&&new URLSearchParams(location.search).get('view')!=='river'});streamTime=0;
   }
   qualityTime+=dt;
   if(qualityTime>.28){
     for(const visual of visuals.values())scheduleDetail(visual,detailFor(visual.entry));
     qualityTime=0;
   }
   elapsed+=dt;
   for(const visual of visuals.values())if(visual.water)visual.water.uniforms.uTime.value=elapsed;
   // Frustum visibility must track the camera after every walk or orbit update.
   // LOD geometry rebuilds remain throttled above.
   updateVisibleTiles();
   renderer.render(scene,camera);
   frameIndex++;
   frameDurations.push(rawDt*1000);
   if(frameDurations.length>90)frameDurations.shift();
   metricTime+=dt;
   if(metricTime>.8){
     container.dataset.gpuGeometries=String(renderer.info.memory.geometries);
     container.dataset.gpuTextures=String(renderer.info.memory.textures);
     container.dataset.renderCalls=String(renderer.info.render.calls);
     container.dataset.renderTriangles=String(renderer.info.render.triangles);
     container.dataset.longTaskCount=String(longTaskState.count);
     container.dataset.maxLongTaskMs=String(Math.round(longTaskState.max));
     const sorted=[...frameDurations].sort((a,b)=>a-b);
     container.dataset.frameP50Ms=String(Math.round(sorted[Math.floor(sorted.length*.5)]||0));
     container.dataset.frameP95Ms=String(Math.round(sorted[Math.floor(sorted.length*.95)]||0));
     metricTime=0;
   }
 }
 container.dataset.appReady='true';
 reportStreaming(streamer.snapshot());
 draw();
 window.addEventListener('pagehide',()=>{
   cancelAnimationFrame(frame);observer.disconnect();gameInput.destroy();controls.dispose();
   overviewAbort?.abort();longTaskObserver?.disconnect();
   wideLayer?.dispose();
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
  if(!fieldResponse.ok)throw Error(`デモ地形データがありません (HTTP ${fieldResponse.status})`);
  const [manifest,field]=await Promise.all([manifestResponse.json(),fieldResponse.json()]);
  validateField(field);validateManifest(manifest);
  await init(field,manifest);
 }catch(e){
  console.error(e);status.classList.add('failed');status.textContent=`読み込み失敗: ${e.message}`;
 }
}
main();
