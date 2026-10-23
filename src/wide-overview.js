import * as THREE from 'three';
import {gridSample} from '../lib/geo.mjs';
import {manifestBounds} from '../lib/tiles.mjs';

// A fixed-size atlas is a wide-view fallback, not a substitute for walk-mode geometry.
// Its GPU cost is bounded by a fixed canvas size and a fixed terrain vertex budget.
export const WIDE_OVERVIEW_THRESHOLD=9;
export const WIDE_ATLAS_PIXELS=1536;
export const WIDE_TERRAIN_CELL_BUDGET=3600;
export const WIDE_ATLAS_DEPTH_OFFSET=8;

export function wideOverviewNeeded(manifest){
 return manifest.tiles.length>WIDE_OVERVIEW_THRESHOLD;
}
export function terrainCellsPerTile(tileCount){
 if(!Number.isInteger(tileCount)||tileCount<1||tileCount>WIDE_TERRAIN_CELL_BUDGET/4)
  throw Error('Invalid or unsupported wide tile count');
 return Math.max(2,Math.floor(Math.sqrt(WIDE_TERRAIN_CELL_BUDGET/tileCount)));
}
export function atlasCoordinates(bounds,x,z,size=WIDE_ATLAS_PIXELS){
 return [
  (x-bounds.minX)/(bounds.maxX-bounds.minX)*size,
  (z-bounds.minZ)/(bounds.maxZ-bounds.minZ)*size
 ];
}
export function atlasGeometryBudget(tileCount){
 const cells=terrainCellsPerTile(tileCount);
 return {cells,triangles:tileCount*cells*cells*2};
}
function makeCanvas(){
 const canvas=document.createElement('canvas');
 canvas.width=WIDE_ATLAS_PIXELS;canvas.height=WIDE_ATLAS_PIXELS;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('Canvas 2D required for wide overview');
 return {canvas,ctx};
}

/**
 * A single coarse terrain mesh and three fixed-size raster overlays cover the
 * complete declared grid. Source snapshots are consumed one at a time and are
 * never retained by this atlas. Walking/close map tiles remain independent and
 * render above this deliberately recessed fallback geometry.
 */
export function createWideOverview(manifest,baseElevation){
 if(!Number.isFinite(baseElevation))throw Error('Invalid elevation datum');
 const bounds=manifestBounds(manifest),size=manifest.size;
 const cells=terrainCellsPerTile(manifest.tiles.length);
 const sheets={
  water:makeCanvas(),roads:makeCanvas(),buildings:makeCanvas()
 };
 const positions=[],uv=[],indices=[],seen=new Set();
 const paintPath=(sheet,entry,points,{color,width,fill=false}={})=>{
  if(!Array.isArray(points)||points.length<(fill?3:2))return;
  const {ctx}=sheet;
  ctx.beginPath();
  for(let i=0;i<points.length;i++){
   const point=points[i];
   const [px,py]=atlasCoordinates(bounds,point[0]+entry.offset[0],point[1]+entry.offset[1]);
   if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  if(fill){ctx.closePath();ctx.fillStyle=color;ctx.fill();}
  else{
   ctx.strokeStyle=color;
   ctx.lineWidth=Math.max(1,width*WIDE_ATLAS_PIXELS/(bounds.maxX-bounds.minX));
   ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
  }
 };
 function addTile(entry,field,vegetation=null){
  if(seen.has(entry.id))throw Error('Duplicate wide atlas tile '+entry.id);
  if(!field?.terrain||field.size!==size)throw Error('Invalid wide atlas tile');
  seen.add(entry.id);
  // Sample the real DEM per tile, but cap total tessellation independently
  // of map size. Boundary samples use the original DEM to preserve seams.
  const first=positions.length/3;
  for(let z=0;z<=cells;z++)for(let x=0;x<=cells;x++){
   const localX=-size/2+size*x/cells,localZ=-size/2+size*z/cells;
   const globalX=entry.offset[0]+localX,globalZ=entry.offset[1]+localZ;
   const elevation=gridSample(field.terrain,localX,localZ)-baseElevation-WIDE_ATLAS_DEPTH_OFFSET;
   positions.push(globalX,elevation,globalZ);
   uv.push((globalX-bounds.minX)/(bounds.maxX-bounds.minX),
    1-(globalZ-bounds.minZ)/(bounds.maxZ-bounds.minZ));
  }
  for(let z=0;z<cells;z++)for(let x=0;x<cells;x++){
   const a=first+z*(cells+1)+x,b=a+1,c=a+cells+1,d=c+1;
   indices.push(a,c,b,b,c,d);
  }
  // The existing fixed-size atlas acts as a ground-cover layer too:
  // vegetation is painted before mapped blue water, without a fourth texture.
  if(vegetation?.schema===1&&vegetation.tileId===entry.id)
   for(const area of vegetation.areas||[]){
    const colors={wood:'#487e54',grove:'#487e54',canopy:'#487e54',shrub:'#6c9060',scrub:'#6c9060',grass:'#8db777',park:'#77a66b'};
    if(colors[area.kind]&&area.ring?.length>=3)
     paintPath(sheets.water,entry,area.ring,{color:colors[area.kind],fill:true});
   }
  for(const water of field.osm?.waterAreas||[])
   paintPath(sheets.water,entry,water.footprint,{color:'#4b9dc1',fill:true});
  for(const way of field.osm?.waterways||[]){
   if(way.tunnel||way.layer<0)continue;
   paintPath(sheets.water,entry,way.points,{color:'#4b9dc1',width:way.width||2.5});
  }
  for(const way of field.osm?.roads||[]){
   const foot=['footway','path','steps','pedestrian','cycleway'].includes(way.kind);
   paintPath(sheets.roads,entry,way.points,{color:way.bridge?'#eab878':foot?'#edbb7a':'#ded8c5',width:way.width||3});
  }
  for(const line of field.osm?.railways||[]){
   if(!line.tunnel)paintPath(sheets.roads,entry,line.points,{color:'#5e6b6e',width:line.width||2.5});
  }
  for(const building of field.osm?.buildings||[])
   paintPath(sheets.buildings,entry,building.footprint,{color:'#b47968',fill:true});
 }
 function finish(){
  if(seen.size!==manifest.tiles.length)throw Error('Incomplete wide atlas: '+seen.size+'/'+manifest.tiles.length);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const group=new THREE.Group();group.name='wide-overview-atlas';
  const ground=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:0x7da88a,side:THREE.DoubleSide}));
  group.add(ground);
  const layers={};
  for(const [name,sheet] of Object.entries(sheets)){
   const texture=new THREE.CanvasTexture(sheet.canvas);
   texture.colorSpace=THREE.SRGBColorSpace;
   texture.anisotropy=1;
   const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,
    side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
   const mesh=new THREE.Mesh(geometry,material);
   mesh.name='wide-overview-'+name;
   mesh.position.y=name==='water'?.35:name==='roads'?.55:.75;
   mesh.renderOrder=name==='water'?1:name==='roads'?2:3;
   group.add(mesh);layers[name]=mesh;
  }
  return {
   group,layers,loadedTiles:seen.size,
   budget:{...atlasGeometryBudget(manifest.tiles.length),textures:3,texturePixels:WIDE_ATLAS_PIXELS},
   dispose(){
    group.parent?.remove(group);
    const materials=new Set();
    group.traverse(object=>{if(object.material)materials.add(object.material);});
    for(const material of materials){material.map?.dispose();material.dispose();}
    geometry.dispose();
   }
  };
 }
 return {addTile,finish,get loadedTiles(){return seen.size;}};
}
