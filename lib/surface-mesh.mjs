// Prepared geometry contains real coordinates only in PRIVATE data. These
// utilities neither change original snapshots nor write discovery/save data.
const GRID=16;
const finite=a=>Array.isArray(a)&&a.every(Number.isFinite);
function validateMesh(mesh,water=false){
 if(!mesh||!finite(mesh.positions)||mesh.positions.length%3||mesh.positions.length>1200000||!Array.isArray(mesh.indices)||mesh.indices.length%3||mesh.indices.length>1200000)throw Error('Invalid surface mesh');
 const count=mesh.positions.length/3;
 if(!mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<count))throw Error('Invalid surface index');
 if(water&&(!finite(mesh.flow)||mesh.flow.length!==count*2||!['station','lateral','shore'].every(k=>finite(mesh[k])&&mesh[k].length===count)))throw Error('Invalid water attributes');
 return mesh;
}
export function validateSurfaceMesh(data,entry,field){
 if(data?.schema!==1||data.tileId!==entry.id||data.size!==field.size||data.datum!==field.terrain.min||!Array.isArray(data.coverage))throw Error('Surface metadata mismatch');
 if(data.terrain)validateMesh(data.terrain);validateMesh(data.water,true);
 for(const shape of data.coverage){
  if(!Array.isArray(shape.outer)||shape.outer.length<3||!Array.isArray(shape.holes))throw Error('Invalid water coverage');
  for(const ring of [shape.outer,...shape.holes])if(ring.length<3||!ring.every(p=>finite(p)&&p.length===2&&p.every(v=>Math.abs(v)<=data.size/2+.001)))throw Error('Invalid coverage coordinates');
 }
 for(const mesh of [data.terrain,data.water].filter(Boolean))for(let i=0;i<mesh.positions.length;i+=3)if(Math.abs(mesh.positions[i])>data.size/2+.001||Math.abs(mesh.positions[i+2])>data.size/2+.001)throw Error('Surface exceeds tile bounds');
 return data;
}
export function createSurfaceMeshLoader(manifest,root,fetcher){
 if(!manifest.surfaceMeshes)return {attach:async field=>field};
 const config=manifest.surfaceMeshes;
 if(config.schema!==1||!config.tiles||manifest.tiles.some(t=>!/^data\/[a-z0-9/_-]+\.json$/.test(config.tiles[t.id]||''))||Object.keys(config.tiles).length!==manifest.tiles.length)throw Error('Incomplete surface mesh declaration');
 const cache=new Map();
 return {async attach(field,entry){
  if(!cache.has(entry.id))cache.set(entry.id,(async()=>{
   const response=await fetcher(root+config.tiles[entry.id],{cache:'no-store'});
   if(!response.ok)throw Error('Declared surface mesh unavailable');
   return validateSurfaceMesh(await response.json(),entry,field);
  })());
  const pending=cache.get(entry.id);
  try{return {...field,surface:await pending};}finally{if(cache.get(entry.id)===pending)cache.delete(entry.id);}
 }};
}
export function insideSurfaceRing(x,z,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function surfaceContainsWater(surface,x,z){
 return !!surface?.coverage.some(p=>insideSurfaceRing(x,z,p.outer)&&!p.holes.some(h=>insideSurfaceRing(x,z,h)));
}
const indices=new WeakMap();
function waterGrid(surface){
 let grid=indices.get(surface);if(grid)return grid;grid=new Map();
 const p=surface.water.positions,ids=surface.water.indices;
 for(let i=0;i<ids.length;i+=3){
  const xs=[0,1,2].map(j=>p[ids[i+j]*3]),zs=[0,1,2].map(j=>p[ids[i+j]*3+2]);
  for(let x=Math.floor(Math.min(...xs)/GRID);x<=Math.floor(Math.max(...xs)/GRID);x++)for(let z=Math.floor(Math.min(...zs)/GRID);z<=Math.floor(Math.max(...zs)/GRID);z++){
   const key=x+':'+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);
  }
 }
 indices.set(surface,grid);return grid;
}
/** Absolute elevation on actual prepared water triangles, or null off water. */
export function surfaceWaterHeight(surface,x,z){
 if(!surface)return null;
 const p=surface.water.positions,ids=surface.water.indices;
 for(const i of waterGrid(surface).get(Math.floor(x/GRID)+':'+Math.floor(z/GRID))||[]){
  const a=ids[i]*3,b=ids[i+1]*3,c=ids[i+2]*3,den=(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2]);if(Math.abs(den)<1e-10)continue;
  const u=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/den;
  const v=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/den,w=1-u-v;
  if(Math.min(u,v,w)>=-1e-6)return u*p[a+1]+v*p[b+1]+w*p[c+1]+surface.datum;
 }
 return null;
}
