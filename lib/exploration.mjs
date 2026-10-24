/** Dry-ground exploration v1. No location/time/identity is persisted. */
export const OBJECTS=Object.freeze({
 bird:{name:'ことり',kind:'animal',biomes:{urban:3,woodland:3},radius:.9,notice:12,height:.65},
 caterpillar:{name:'いもむし',kind:'animal',biomes:{grassland:3,woodland:1},radius:.7,notice:7,height:.35},
 acorn:{name:'どんぐり',kind:'treasure',biomes:{woodland:5},radius:.45,height:.55},
 stone:{name:'きれいな石',kind:'treasure',biomes:{grassland:2,waterside:5},radius:.6,height:.5},
 feather:{name:'はね',kind:'treasure',biomes:{urban:5,woodland:2},radius:.6,height:.6},
 chest:{name:'たからばこ',kind:'treasure',biomes:{urban:.12,grassland:.12,woodland:.12,waterside:.12},radius:1,height:.9},
 bee:{name:'ハチ',kind:'animal',legacy:true},duck:{name:'アヒル',kind:'animal',legacy:true}
});
export const RECORD_KEY='michi-discoveries-v1',TAKEN_KEY='michi-fixed-treasures-v1';
export const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
export const spawnId=c=>'e1-'+hash(c.id).toString(36);
/** Global order and spacing, before splitting into tiles. Stable across load order. */
export function planSpawns(candidates,{spacing=24,probability=.8,maximum=1400}={}){
 const out=[],buckets=new Map();
 for(const c of [...candidates].sort((a,b)=>hash(a.id+':order')-hash(b.id+':order')||a.id.localeCompare(b.id))){
  if(out.length>=maximum)break;
  if(c.terrain?.surface!=='dry-ground'||c.terrain.clearance<1.5||hash(c.id+':density')/2**32>=probability)continue;
  const [x,y,z]=c.position,ix=Math.floor(x/spacing),iz=Math.floor(z/spacing);
  let close=false;for(let a=ix-1;a<=ix+1;a++)for(let b=iz-1;b<=iz+1;b++)
   if((buckets.get(a+':'+b)||[]).some(p=>Math.hypot(p.x-x,p.z-z)<spacing))close=true;
  if(close)continue;
  const choices=Object.entries(OBJECTS).filter(([,d])=>!d.legacy&&d.radius<=c.terrain.clearance&&d.biomes[c.biome]);
  const total=choices.reduce((s,[,d])=>s+d.biomes[c.biome],0);let n=hash(c.id+':kind')/2**32*total;
  const choice=choices.find(([,d])=>(n-=d.biomes[c.biome])<0);if(!choice)continue;
  const item={id:spawnId(c),type:choice[0],tileId:c.tileId,biome:c.biome,x,y,z};
  out.push(item);const k=ix+':'+iz;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(item);
 }
 if(new Set(out.map(p=>p.id)).size!==out.length)throw Error('Spawn ID collision');
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}
export function validateSpawnTile(data,entry){
 if(data?.schema!==1||data.tileId!==entry.id||!Array.isArray(data.objects)||data.objects.length>500)throw Error('Invalid spawn tile');
 const ids=new Set();
 for(const p of data.objects){const d=OBJECTS[p.type];if(!d||d.legacy||!/^e1-[a-z0-9]{1,8}$/.test(p.id)||ids.has(p.id)||p.tileId!==entry.id||!d.biomes[p.biome]||![p.x,p.y,p.z].every(Number.isFinite)||Math.abs(p.x-entry.offset[0])>250||Math.abs(p.z-entry.offset[1])>250)throw Error('Invalid spawn object');ids.add(p.id);}
 return data.objects;
}
export function nearbySpawns(items,x,z,{limit=12,radius=65,taken=new Set()}={}){
 return items.filter(p=>!taken.has(p.id)&&Math.hypot(p.x-x,p.z-z)<=radius).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)||a.id.localeCompare(b.id)).slice(0,limit);
}
const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
export function createDiscoveryStore(storage){
 let raw=null,takenRaw=null;try{raw=parse(storage.getItem(RECORD_KEY));takenRaw=parse(storage.getItem(TAKEN_KEY));}catch{}
 const counts={};for(const [k,v] of Object.entries(raw?.schema===1?raw.counts||{}:{}))if(Object.hasOwn(OBJECTS,k)&&Number.isSafeInteger(v)&&v>0)counts[k]=Math.min(9999,v);
 // One bit per deterministic fixed treasure. No coordinates, dates or route order.
 const taken=new Set(takenRaw?.schema===1&&Array.isArray(takenRaw?.ids)?takenRaw.ids.filter(x=>typeof x==='string'&&/^e1-[a-z0-9]{1,8}$/.test(x)).slice(0,1400):[]);
 let writable=true;
 function persist(){try{storage.setItem(TAKEN_KEY,JSON.stringify({schema:1,ids:[...taken].sort()}));storage.setItem(RECORD_KEY,JSON.stringify({schema:1,counts}));return true;}catch{writable=false;return false;}}
 return {taken,counts,get writable(){return writable;},discover(type){if(!OBJECTS[type]||counts[type])return false;counts[type]=1;persist();return true;},
  collect(p){if(OBJECTS[p.type]?.kind!=='treasure'||taken.has(p.id))return null;const first=!counts[p.type];taken.add(p.id);counts[p.type]=Math.min(9999,(counts[p.type]||0)+1);persist();return {first};},
  snapshot(){return {counts:{...counts},taken:[...taken].sort(),writable};}};
}
