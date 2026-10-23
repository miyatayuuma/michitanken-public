import {validateManifest,distanceFromRect,PRELOAD_DISTANCE,RELEASE_DISTANCE,validateTileForManifest} from '../lib/tiles.mjs';

/** Lazy tiles: CPU snapshot cache survives GPU unload, and requests are deduplicated. */
export function createTileStreamer({manifest,fetchTile,mount,unmount,onChange=()=>{},cacheLimit=3}){
 validateManifest(manifest);
 const descriptors=new Map(manifest.tiles.map(t=>[t.id,t]));
 const active=new Map(),loading=new Map(),cache=new Map(),errors=new Map();
 let closed=false,lastPublished=null;
 const publish=()=>{
  const snapshot={active:[...active.keys()],pending:[...loading.keys()],errors:[...errors.entries()]};
  const signature=JSON.stringify([snapshot.active,snapshot.pending,snapshot.errors.map(([id,e])=>[id,e.message])]);
  if(signature===lastPublished)return;
  lastPublished=signature;onChange(snapshot);
 };
 const prune=()=>{
  while(cache.size>cacheLimit){
   const discard=[...cache.keys()].find(key=>!active.has(key)&&!loading.has(key));
   if(!discard)break;
   cache.delete(discard);
  }
 };
 const memorize=(id,field)=>{cache.delete(id);cache.set(id,field);};
 async function ensure(id){
  if(closed)throw Error('Streamer disposed');
  if(active.has(id))return active.get(id);
  if(loading.has(id))return loading.get(id);
  const tile=descriptors.get(id);if(!tile)throw Error('Unknown tile: '+id);
  const run=(async()=>{
   try{
    const field=cache.has(id)?cache.get(id):await fetchTile(tile);
    validateTileForManifest(manifest,tile,field);
    if(closed)return null;
    memorize(id,field);
    const mounted=await mount(tile,field);
    if(closed){await unmount(tile,mounted);return null;}
    active.set(id,mounted);errors.delete(id);prune();return mounted;
   }catch(e){
    errors.set(id,{message:e.message,at:Date.now()});throw e;
   }finally{loading.delete(id);prune();publish();}
  })();
  loading.set(id,run);publish();return run;
 }
 function update(x,z,{retainAll=false}={}){
  if(closed)return;
  const desired=manifest.tiles.filter(tile=>distanceFromRect(x,z,tile,manifest.size)<=PRELOAD_DISTANCE);
  for(const tile of desired){
   if(active.has(tile.id)||loading.has(tile.id))continue;
   const error=errors.get(tile.id);
   if(error&&Date.now()-error.at<10000)continue;
   ensure(tile.id).catch(e=>console.error('Tile '+tile.id+' loading failed:',e));
  }
  for(const [id,mounted] of [...active]){
   const tile=descriptors.get(id);
   if(retainAll||distanceFromRect(x,z,tile,manifest.size)<=RELEASE_DISTANCE)continue;
   // Keep the nearest tile until the replacement is mounted.
   if(![...active.keys()].some(other=>other!==id&&distanceFromRect(x,z,descriptors.get(other),manifest.size)===0))continue;
   active.delete(id);
   Promise.resolve(unmount(tile,mounted)).catch(e=>console.error('Tile '+id+' dispose failed',e));
   prune();
  }
  publish();
 }
 async function ensureAll({concurrency=2,signal=null}={}){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const entries=[...manifest.tiles];
  let next=0;
  const failed=[];
  const workers=Array.from({length:Math.min(concurrency,entries.length)},async()=>{
   while(next<entries.length&&!signal?.aborted){
    const entry=entries[next++];
    try{await ensure(entry.id);}catch(e){failed.push({id:entry.id,error:e});}
   }
  });
  await Promise.all(workers);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(failed.length)throw new AggregateError(failed.map(f=>f.error),'Unable to load: '+failed.map(f=>f.id).join(','));
  return [...active.keys()];
 }
 const getCached=()=>[...cache].map(([id,field])=>({tile:descriptors.get(id),field}));
 return {ensure,ensureAll,update,getCached,get active(){return active;},get errors(){return errors;},
  get loading(){return loading;},snapshot:()=>({active:[...active.keys()],pending:[...loading.keys()],cached:[...cache.keys()],errors:[...errors.keys()]}),
  async dispose(){
   closed=true;
   await Promise.allSettled([...loading.values()]);
   for(const [id,mounted] of active)await unmount(descriptors.get(id),mounted);
   active.clear();cache.clear();loading.clear();publish();
  }
 };
}
