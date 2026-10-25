import {setupCompass} from './compass.js';
import {setupNotebook,icon,iconButton} from './notebook-ui.js';
import {compassBearing,unwrapAngle} from '../lib/map-view.mjs';
import {createWarpRegistry,canWarp,requiredLandingTiles,validateLanding,createWarpController} from '../lib/warp.mjs';
import {createLandmarkFX} from './landmark-fx.js';
import {createExplorationMap} from './exploration-map.js';
import {createMichiSound} from './sound.js';
import {createBiomeDebug} from './biome-debug.js';
import {loadPoiRegistry,createPoiMarkers} from './poi-markers.js';
import {addBuildings} from './buildings.js';
import * as THREE from 'three';
import {gridSample} from '../lib/geo.mjs';
import {buildRoadRibbon,roadSurfaceOptions} from '../lib/road-surface.mjs';
import {loadWaterProfiles,profilesForWaterField} from '../lib/water-profile-data.mjs';
import {loadRoadSupplement,applyRoadSupplement} from '../lib/road-supplement.mjs';
import {validateField} from '../lib/field.mjs';
import {createCollisionWorld,chooseSpawn,advancePlayer,terrainHeight,blocked,collisionReason} from '../lib/navigation.mjs';
import {createGameInput} from './controls.js';
import {createWaterLayer} from './water.js';
import {validateManifest,createTiledWorld,registerTile,removeTile,tileAtPosition,distanceFromRect,PRELOAD_DISTANCE} from '../lib/tiles.mjs';
import {createTileStreamer} from './tile-stream.js';
import {fitGlobalWaterProfiles,profilesInLocalSpace} from '../lib/tile-water.mjs';
import {pixelRatioBudget,tileDetail,geometryStats} from '../lib/render-policy.mjs';
import {createVegetationRenderer,natureInstanceBudget} from './vegetation.js';
import {createWildlifeRenderer} from './wildlife.js';
import {createExploration} from './exploration.js';
import {loadPlayerSprite} from './player-sprite.js';
import {renderedFootHeight} from '../lib/avatar-ground.mjs';
import './style.css';
const container=document.querySelector('#scene'),status=document.querySelector('#status'),details=document.createElement('aside');
const notebook=setupNotebook();document.querySelector('#retry').onclick=()=>location.reload();
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
 for(const road of field.osm.roads){
  const kind=road.bridge?'bridge':['footway','path','steps','pedestrian','cycleway'].includes(road.kind)?'path':'road';
  for(let i=1;i<road.points.length;i++)batches[kind].push(...buildRoadRibbon(road.points[i-1],road.points[i],road.width,field,road.bridge ? .40 : .23,roadSurfaceOptions(detail)));
 }
 for(const railway of field.osm.railways||[])if(!railway.tunnel)for(let i=1;i<railway.points.length;i++)
  batches.railway.push(...buildRoadRibbon(railway.points[i-1],railway.points[i],railway.width||2.5,field,railway.bridge?2.8:.31,roadSurfaceOptions(detail)));
 for(const [type,verts] of Object.entries(batches)){
  if(!verts.length)continue;
  const colors={road:0xded8c5,path:0xedbb7a,railway:0x5e6b6e,bridge:0xeab878};
  const roadMesh=new THREE.Mesh(geometryFromTriangles(verts),new THREE.MeshLambertMaterial({color:colors[type],side:THREE.DoubleSide,depthTest:true,depthWrite:true}));
  roadMesh.renderOrder=2;group.add(roadMesh);
 }
 parent.add(group);layerSet.roads=group;
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
async function init(north,manifest,roadSupplement=null,fixedWaterProfiles=null){
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
 let biomeDebug=null;
 let poiRegistry=null,poiMarkers=null;
 createBiomeDebug({scene,container,baseElevation:north.terrain.min,baseURL:import.meta.env.BASE_URL}).then(v=>{biomeDebug=v;}).catch(error=>{container.dataset.biomeError='true';console.warn(error);});
 if(new URLSearchParams(location.search).get('markers')!=='off'){
  try{
   poiRegistry=await loadPoiRegistry({baseURL:import.meta.env.BASE_URL,manifest});
   poiMarkers=createPoiMarkers({container,registry:poiRegistry,baseElevation:north.terrain.min,mobile:coarsePointer});
  }catch(error){console.warn('Optional public markers unavailable:',error);container.dataset.poiError='true';}
 }
 const visuals=new Map(),layerVisibility={roads:true,buildings:true};
 const colorsEnabled=new URLSearchParams(location.search).get('colors')!=='off';
 const natureColorsEnabled=new URLSearchParams(location.search).get('natureColors')!=='off';
 const flatWater=new URLSearchParams(location.search).get('water')==='flat';
 const natureEnabled=new URLSearchParams(location.search).get('nature')!=='off';
 const wildlifeEnabled=natureEnabled&&new URLSearchParams(location.search).get('wildlife')!=='off';
 const natureRenderer=createVegetationRenderer({baseURL:import.meta.env.BASE_URL});
 const exploration=new URLSearchParams(location.search).get('exploration')==='off'?null:createExploration({scene,container,baseURL:import.meta.env.BASE_URL,baseElevation:north.terrain.min,ground:(x,z)=>terrainHeight(world,x,z),onCollect:()=>sound.se('collect'),low:memoryGiB!==null&&memoryGiB<=2});
 const wildlife=wildlifeEnabled?createWildlifeRenderer({
   scene,baseURL:import.meta.env.BASE_URL,baseElevation:north.terrain.min,onDiscover:type=>exploration?.discover(type)
 }):null;
 async function vegetationOverlay(entry){
   if(!natureEnabled)return null;
   const response=await fetch(`${import.meta.env.BASE_URL}data/vegetation/${entry.id}.json`);
   if(response.status===404||!response.headers.get('content-type')?.includes('json'))return null;
   if(!response.ok)throw Error('Vegetation overlay HTTP '+response.status);
   const data=await response.json();
   if(data?.schema!==1||data.tileId!==entry.id||!Array.isArray(data.areas))
     throw Error('Invalid mapped vegetation overlay '+entry.id);
   // PRIVATE Nagoya aerial-photo-derived green cover is more precise than
   // generic OSM park/landuse boundaries. Preserve explicit OSM tree nodes.
   const municipal=await fetch(`${import.meta.env.BASE_URL}data/green-cover/${entry.id}.json`);
   if(municipal.ok&&municipal.headers.get('content-type')?.includes('json')){
     const cover=await municipal.json();
     if(cover.schema===1&&cover.tileId===entry.id&&Array.isArray(cover.areas)&&cover.areas.length)
       return {...data,areas:cover.areas};
   }
   return data;
 }
 const wideMap=false;
 const wideLayer=null;
 let map2d=null,warpRegistry=null,warpController=null;
 const landmarkFX=createLandmarkFX(scene,north.terrain.min);
 const sound=createMichiSound();
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
   mode:'walk',x:playerState?.x??0,z:playerState?.z??0,entry,size:manifest.size,
   camera:mode==='map'?camera.position:null
 });
 function updateLayerMetrics(){
   const mounted=[...visuals.values()];
   const stats=geometryStats(mounted);
   container.dataset.loadedTiles=[...visuals.keys()].join(',');
   container.dataset.natureInstances=String(mounted.reduce((n,v)=>n+(v.nature?.userData.vegetationCount||0),0));
   container.dataset.wildlifeCandidates=String(wildlife?.candidateCount||0);
   container.dataset.wildlifeVisible=String(wildlife?.visibleCount||0);
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
   if(fixedWaterProfiles)return fixedWaterProfiles;
   if(!streamer)return [];
   return fitGlobalWaterProfiles(streamer.getCached(),manifest);
 }
 function rebuildWater(visual,profiles=currentWaterProfiles()){
   if(visual.removed)return;
   const next=createWaterLayer(visual.field,{
     flat:flatWater,detail:visual.level,sharedProfiles:profilesInLocalSpace(fixedWaterProfiles?profilesForWaterField(profiles,visual.field):profiles,visual.entry)
   });
   next.uniforms.uTime.value=elapsed;
   next.uniforms.uMotion.value=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?0:1;
   if(visual.water){visual.root.remove(visual.water.group);disposeObject(visual.water.group);}
   visual.water=next;
   wildlife?.setWaterProfiles(visual.entry.id,next.profiles);
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
     road.material.depthTest=true;
     road.material.depthWrite=true;
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
       addBuildings(visual.field,temp,next,target,visual.entry,colorsEnabled);
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
   const prefix=mode==='map'?'全域 '+label+' · ':(container.dataset.fieldLabel||'フィールドを表示中')+' · ';
   const progressLabel=wideMap&&mode==='map'&&wideLayer
     ?'広域 '+wideLayer.loadedTiles+'/'+manifest.tiles.length+' · 詳細 '+visible
     :'読込 '+visible+'/'+manifest.tiles.length;
   status.textContent=container.dataset.appReady==='false'?'じゅんびしています…':snapshot.errors.length?'読みこめませんでした':'';
   document.querySelector('#retry').hidden=!snapshot.errors.length;
   status.classList.toggle('failed',!!snapshot.errors.length);
   status.hidden=container.dataset.appReady!=='false'&&!snapshot.errors.length;
 }
 async function mountVegetation(visual){
   if(!natureEnabled)return;
   try{
     const overlay=await vegetationOverlay(visual.entry);
     if(visual.removed||!overlay)return;
     wildlife?.register(visual.entry,visual.field,overlay);
     const group=await natureRenderer.build(visual.entry,visual.field,overlay,{maxTotal:natureInstanceBudget({coarsePointer,memoryGiB}),individualColors:natureColorsEnabled});
     if(visual.removed){disposeObject(group);return;}
     if(!group.userData.vegetationCount)return;
     visual.nature=group;visual.root.add(group);updateLayerMetrics();
   }catch(error){
     if(!visual.removed)console.warn('Optional mapped vegetation unavailable:',visual.entry.id,error);
   }
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
   addBuildings(field,root,layers,level,entry,colorsEnabled);
   await nextFrame();
   addCrossingMarkers(field,root,layers);
   layers.outline=addTileBorder(field,root,entry);
   layers.outline.visible=mode==='map';
   syncRoadDepth(layers);
   layers.roads.visible=layerVisibility.roads;
   layers.buildings.visible=layerVisibility.buildings;
   registerTile(world,entry,field);
   void exploration?.register(entry);
   root.position.set(entry.offset[0],field.terrain.min-world.baseElevation,entry.offset[1]);
   scene.add(root);
   const maxHeight=Math.max(40,...field.osm.buildings.map(b=>b.height));
   const h=manifest.size/2;
   const bounds=new THREE.Box3(
     new THREE.Vector3(entry.offset[0]-h,field.terrain.min-world.baseElevation-3,entry.offset[1]-h),
     new THREE.Vector3(entry.offset[0]+h,field.terrain.max-world.baseElevation+maxHeight+3,entry.offset[1]+h)
   );
   const visual={entry,field,root,layers,level,requestedLevel:level,bounds,
     lodQueued:false,removed:false,water:null,nature:null};
   visuals.set(entry.id,visual);
   void mountVegetation(visual);
   refreshWater({entry,field});
   updateDetails();
   // Mode can change while a tile is being created.
   scheduleDetail(visual,detailFor(entry));
   return visual;
 }
 function unmount(entry,visual){
   visual.removed=true;
   wildlife?.unregister(entry.id);exploration?.unregister(entry.id);
   visuals.delete(entry.id);
   removeTile(world,entry.id);
   scene.remove(visual.root);disposeObject(visual.root);
   refreshWater({entry,field:visual.field});
   updateDetails();
 }
 function updateDetails(){}
 streamer=createTileStreamer({
   manifest,
   fetchTile:async entry=>{
     if(entry.id==='north')return north;
     const response=await fetch(`${import.meta.env.BASE_URL}${entry.url}`,{cache:'no-store'});
     if(!response.ok)throw Error(`タイル ${entry.id} の取得に失敗 (HTTP ${response.status})`);
     const field=await response.json();validateField(field);return applyRoadSupplement(field,entry,roadSupplement);
   },
   mount,unmount,onChange:reportStreaming
 });
 await streamer.ensure('north');
 const spawn=chooseSpawn(createCollisionWorld(north));
 playerState={...spawn,facing:spawn.yaw,moving:false,collided:false,distance:0};
 const playerSprite=await loadPlayerSprite({baseURL:import.meta.env.BASE_URL});
 const avatar=playerSprite?.group||makeAvatar();avatar.traverse(o=>{if(o.isMesh)o.renderOrder=4;});scene.add(avatar);
 container.dataset.avatarKind=playerSprite?'sprite':'model';
 const controls={target:new THREE.Vector3(),update(){},dispose(){}};
 controls.enableDamping=true;controls.dampingFactor=.07;
 controls.maxPolarAngle=Math.PI/2.05;controls.minDistance=15;controls.maxDistance=9000;
 controls.screenSpacePanning=true;controls.enabled=false;
 let cameraYaw=spawn.yaw,cameraPitch=.52,cameraDistance=14;
 const coords=document.createElement('output');
 const modeButton=document.querySelector('#mode');
 const hint=document.createElement('span');
 const gameInput=createGameInput({
   canvas:renderer.domElement,joystick:document.querySelector('#joystick'),
   knob:document.querySelector('#joystick-knob'),runButton:document.querySelector('#run'),
   isActive:()=>mode==='walk'&&!warpController?.busy&&!notebook.opened,
   onLook(dx,dy){if(mode!=='walk'||warpController?.busy)return;cameraYaw+=dx;cameraPitch=Math.min(1.1,Math.max(.2,cameraPitch+dy));},
   onZoom(ratio){if(mode!=='walk'||warpController?.busy)return;cameraDistance=Math.min(28,Math.max(5,cameraDistance*ratio));},
   onModeToggle(){if(notebook.opened){notebook.close();return;}changeMode(mode==='walk'?'map':'walk');},
   onInteract(){if(notebook.opened){notebook.activate();return;}sound.activate();if(warpController?.busy)return;if(mode==='map')map2d?.select();else exploration?.collect();},
   onBack(){if(notebook.opened){notebook.close();gameInput.reset();return;}if(warpController?.busy){warpController.cancel();return;}if(mode==='map'&&!map2d?.cancel())changeMode('walk');},
   onCharacter(id){switchCharacter(id);},
   onActivity(kind){sound.activate();if(kind)document.querySelector('#app').dataset.input=kind;},
   onMapControl(input,dt){if(mode==='map')map2d?.move(input,dt);},
   onMapZoom(delta){if(mode==='map')map2d?.zoomStep(delta);},
   onMenu(){notebook.toggle();gameInput.reset();},onMenuMove:direction=>notebook.move(direction),onMenuAdjust:amount=>notebook.adjust(amount)

 });
 notebook.onChange(()=>gameInput.reset());
 let footCache=null;
 const avatarPosition=()=>{
   let y=playerState.y;
   if(playerSprite){
     const owner=tileAtPosition(manifest,playerState.x,playerState.z),tile=owner&&world.tileWorlds.get(owner.id);
     if(tile){
       if(!footCache||footCache.field!==tile.field||footCache.x!==playerState.x||footCache.z!==playerState.z)
         footCache={field:tile.field,x:playerState.x,z:playerState.z,
           y:renderedFootHeight(tile.field,playerState.x-owner.offset[0],playerState.z-owner.offset[1],world.baseElevation)};
       y=footCache.y;
     }
   }
   avatar.position.set(playerState.x,y,playerState.z);
   if(!playerSprite)avatar.rotation.y=playerState.facing;
 };
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
 container.dataset.overviewReady='false';
 function updateHud(){
   const owner=tileAtPosition(manifest,playerState.x,playerState.z);
   coords.dataset.x=playerState.x.toFixed(3);
   coords.dataset.z=playerState.z.toFixed(3);
   coords.dataset.y=playerState.y.toFixed(3);
   coords.dataset.tile=owner?.id||'outside';
   const labels={building:'建物',railway:'線路',waterway:'水路','water-area':'水域',boundary:'マップ境界',loading:'エリア読込待ち'};
   const contact=playerState.collided?` · ${labels[playerState.collision]||'障害物'}に接触`:'';
   coords.textContent='';
 }
 function resetWalk(){
   playerSprite?.reset();
   playerState={...spawn,facing:spawn.yaw,moving:false,collided:false,distance:0};
   cameraYaw=spawn.yaw;cameraPitch=.52;cameraDistance=14;gameInput.reset();
   avatarPosition();followCamera(0,true);updateHud();streamer.update(playerState.x,playerState.z);
 }
 function changeMode(next){
   if(warpController?.busy)warpController.cancel();
   if(next==='map'&&!map2d)return;
   mode=next;controls.enabled=false;gameInput.reset();accumulator=0;
   document.querySelector('#app').dataset.mode=mode;
   modeButton.innerHTML=icon(next==='walk'?'map':'close');
   modeButton.setAttribute('aria-label',next==='walk'?'全体マップを開く':'全体マップを閉じる');
   modeButton.setAttribute('aria-expanded',String(next==='map'));
   hint.textContent='';
   map2d?.setOpen(next==='map');
   container.dataset.overviewReady=next==='map'?'true':'false';
   sound.se('map');
   if(next==='walk'){followCamera(0,true);streamer.update(playerState.x,playerState.z);}
 }
 const characterButton=document.querySelector('#characters');characterButton.hidden=!playerSprite;
 for(const [id,label] of [['cat','猫（L）'],['rabbit','うさぎ（R）']]){const b=iconButton(id,label,'character-'+id);b.onclick=()=>switchCharacter(id);characterButton.append(b);}
 function characterState(){for(const b of characterButton.children)b.setAttribute('aria-pressed',String(b.id==='character-'+playerSprite?.snapshot().character));}
 function switchCharacter(id){if(mode!=='walk'||warpController?.busy||notebook.opened)return;const c=id?playerSprite?.selectCharacter(id):playerSprite?.switchCharacter();if(c){characterState();avatarPosition();}}
 characterState();
 warpController=createWarpController({
  allowed:id=>mode==='map'&&canWarp(warpRegistry,map2d.store,id),
  load:async id=>{const l=warpRegistry.get(id).landing;await Promise.all(requiredLandingTiles(manifest,l.position[0],l.position[2]).map(id=>streamer.ensure(id)));},
  validate:id=>validateLanding(world,warpRegistry.get(id).landing),
  capture:()=>({player:{...playerState},yaw:cameraYaw,pitch:cameraPitch,distance:cameraDistance,camera:camera.position.clone(),rotation:camera.quaternion.clone(),target:controls.target.clone()}),
  commit:result=>{playerState={...playerState,x:result.x,y:result.y,z:result.z,facing:result.yaw,moving:false,collided:false,collision:null,distance:0};cameraYaw=result.yaw;playerSprite?.reset();footCache=null;avatarPosition();changeModeAfterWarp();followCamera(0,true);landmarkFX.arrive([result.x,result.y+world.baseElevation,result.z]);updateHud();},
  restore:s=>{playerState=s.player;cameraYaw=s.yaw;cameraPitch=s.pitch;cameraDistance=s.distance;camera.position.copy(s.camera);camera.quaternion.copy(s.rotation);controls.target.copy(s.target);avatarPosition();updateHud();},
  transition:async signal=>{container.classList.add('warp-transition');if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(resolve=>setTimeout(resolve,140));if(signal.aborted)throw Error('cancelled');},
  onBusy:value=>{gameInput.reset();accumulator=0;map2d?.setBusy(value);for(const b of characterButton.children)b.disabled=value;if(!value){const arriving=container.classList.contains('warp-transition')&&mode==='walk';container.classList.remove('warp-transition');if(arriving){container.classList.add('warp-arrival');setTimeout(()=>container.classList.remove('warp-arrival'),150);}}}
 });
 function changeModeAfterWarp(){mode='walk';document.querySelector('#app').dataset.mode=mode;modeButton.innerHTML=icon('map');modeButton.setAttribute('aria-label','全体マップを開く');modeButton.setAttribute('aria-expanded','false');container.dataset.overviewReady='false';map2d?.setOpen(false);gameInput.reset();}
 modeButton.onclick=()=>changeMode(mode==='walk'?'map':'walk');
 const resize=()=>{
   const w=container.clientWidth,h=container.clientHeight;
   camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h,false);
   
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
       playerSprite?.reset();
       playerState={...playerState,x,z,y:terrainHeight(world,x,z),facing:yaw,collision:null,collided:false};
       cameraYaw=yaw;avatarPosition();followCamera(0,true);updateHud();streamer.update(x,z);return true;
     },
     state:()=>({...playerState,tiles:streamer.snapshot()}),
     avatar:()=>playerSprite?.snapshot()||{kind:'model'},
     biomes:()=>biomeDebug?{totals:biomeDebug.data.totals,candidates:biomeDebug.data.candidates.length,seams:biomeDebug.data.seams.length}:null,
     setMarkerTheme:value=>poiMarkers?.setTheme(value),
     poi:()=>({total:poiRegistry?.points.length||0,visible:poiMarkers?.snapshot()||[]}),
     renderStats:()=>({
       ...geometryStats(visuals.values()),
       pixelRatio:renderer.getPixelRatio(),
       memory:{...renderer.info.memory},
       geometryBytes:(()=>{const buffers=new Set();scene.traverse(o=>{if(o.geometry){for(const a of Object.values(o.geometry.attributes))buffers.add(a.array.buffer);if(o.geometry.index)buffers.add(o.geometry.index.array.buffer);}if(o.instanceColor)buffers.add(o.instanceColor.array.buffer);if(o.instanceMatrix)buffers.add(o.instanceMatrix.array.buffer);});return [...buffers].reduce((n,b)=>n+b.byteLength,0);})(),
       heapBytes:performance.memory?.usedJSHeapSize??null,
       markers:poiMarkers?.snapshot().length||0,
       render:mode==='map'?{calls:0,triangles:0,points:0,lines:0}:{...renderer.info.render},
       frameP95Ms:Number(container.dataset.frameP95Ms||0),
       longTaskCount:longTaskState.count,
       visibleTiles:Number(container.dataset.frustumVisibleTiles||0),
       wideOverview:wideLayer?{tiles:wideLayer.loadedTiles,...wideLayer.budget}:null,
       natureInstances:Number(container.dataset.natureInstances||0),
       wildlifeVisible:wildlife?.visibleCount||0,
       wildlifeCandidates:wildlife?.candidateCount||0,
       levels:[...visuals.values()].map(v=>({id:v.entry.id,level:v.level,visible:v.root.visible}))
     }),
     map:()=>map2d?.snapshot(),
     warp:id=>warpController.warp(id),
     warpBusy:()=>warpController.busy,
     camera:()=>({position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),yaw:cameraYaw,pitch:cameraPitch,distance:cameraDistance}),
     sound:()=>sound.snapshot(),
     exploration:()=>exploration?.snapshot(),
     wildlifeSpots:()=>wildlife?.candidatePositions||[],
     worldCollision:(x,z)=>collisionReason(world,x,z),
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
 const compass=setupCompass(document.querySelector('.compass'));
 const compassVector=new THREE.Vector3();let compassAngle=0;
 function draw(){
   frame=requestAnimationFrame(draw);
   const rawDt=clock.getDelta(),dt=Math.min(rawDt,.16);
   gameInput.pollGamepad(dt,notebook.opened?'menu':mode);
   document.querySelector('#app').dataset.running=String(gameInput.getIntent().run);
   if(mode==='walk'&&!warpController?.busy&&!notebook.opened){
     accumulator+=dt;const intent=gameInput.getIntent();let n=0;
     while(accumulator>=fixedStep&&n<10){
       playerState=advancePlayer(playerState,{...intent,yaw:cameraYaw},world,fixedStep);
       accumulator-=fixedStep;n++;
     }
     avatarPosition();followCamera(dt);
     hudTime+=dt;if(hudTime>.13){updateHud();hudTime=0;}
   }else{accumulator=0;controls.update();}
   streamTime+=dt;if(streamTime>.2){
     if(mode==='walk'&&!warpController?.busy)streamer.update(playerState.x,playerState.z);streamTime=0;
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
   playerSprite?.update({state:playerState,camera,walking:mode==='walk'});
   const direction=camera.getWorldDirection(compassVector);const bearing=unwrapAngle(compassBearing(direction.x,direction.z,compassAngle),compassAngle);compassAngle=bearing;compass.update(bearing);
   landmarkFX.update(dt);
   map2d?.update(playerState.x,playerState.z,dt,mode==='walk');
   sound.update(map2d?.biomeAt(playerState.x,playerState.z)||'urban',dt);
   exploration?.update({dt,playerX:playerState.x,playerZ:playerState.z,currentMode:mode,camera,occluders:[...visuals.values()].flatMap(v=>[v.root.children[0],...v.layers.buildings.children])});
   wildlife?.update({dt,playerX:playerState.x,playerZ:playerState.z,currentMode:mode});
   poiMarkers?.update({camera,mode,focus:playerState,isFound:id=>map2d?.isFound(id),pulse:id=>map2d?.pulse(id),isWarp:id=>canWarp(warpRegistry,map2d?.store||{has:()=>false},id)});
   if(mode==='walk')renderer.render(scene,camera);
   frameIndex++;
   frameDurations.push(rawDt*1000);
   if(frameDurations.length>90)frameDurations.shift();
   metricTime+=dt;
   if(metricTime>.8){
     container.dataset.wildlifeVisible=String(wildlife?.visibleCount||0);
     container.dataset.wildlifeCandidates=String(wildlife?.candidateCount||0);
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
 try{const response=await fetch(import.meta.env.BASE_URL+'data/warps.json');if(response.ok)warpRegistry=createWarpRegistry(await response.json(),poiRegistry,manifest);}catch(e){console.warn('Warp registry disabled',e);}
 try{map2d=await createExplorationMap({container,registry:poiRegistry||{points:[]},baseURL:import.meta.env.BASE_URL,warps:warpRegistry,onWarp:async id=>{const result=await warpController.warp(id);if(!result.ok)map2d?.failure();},onDiscover:p=>{const unlocked=canWarp(warpRegistry,map2d?.store||{has:()=>true},p.id);landmarkFX.discover(p,unlocked);sound.se(unlocked?'unlock':'discover');},onSelect:()=>sound.se('confirm')});map2d.update(playerState.x,playerState.z,0);modeButton.disabled=false;}catch(e){modeButton.disabled=true;container.dataset.mapError='true';console.warn(e);}
 container.dataset.appReady='true';
 reportStreaming(streamer.snapshot());
 draw();
 window.addEventListener('pagehide',()=>{
   cancelAnimationFrame(frame);observer.disconnect();warpController?.cancel();gameInput.destroy();controls.dispose();
   longTaskObserver?.disconnect();
   wideLayer?.dispose();
   landmarkFX.dispose();map2d?.dispose();sound.dispose();exploration?.dispose();wildlife?.dispose();poiMarkers?.dispose();biomeDebug?.dispose();
   void streamer.dispose();
   natureRenderer.dispose();
   if(playerSprite)playerSprite.dispose();
   else avatar.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
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
  const [roadSupplement,fixedWaterProfiles]=await Promise.all([loadRoadSupplement(manifest,root,fetch),loadWaterProfiles(manifest,root,fetch)]);
  const home=manifest.tiles.find(t=>t.id==='north');
  await init(applyRoadSupplement(field,home,roadSupplement),manifest,roadSupplement,fixedWaterProfiles);
 }catch(e){
  console.error(e);status.classList.add('failed');status.textContent='読みこめませんでした';document.querySelector('#retry').hidden=false;
 }
}
main();
