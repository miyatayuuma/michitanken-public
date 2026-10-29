/** Optional source-backed missing segments; never replaces a snapshot way. */
export function validateRoadSupplement(data,manifest){
 if(data?.schema!==1||!data.tiles||typeof data.tiles!=='object'||Array.isArray(data.tiles))throw Error('Invalid road supplement');
 const known=new Set(manifest.tiles.map(t=>t.id));
 for(const [id,roads] of Object.entries(data.tiles)){
  if(!known.has(id)||!Array.isArray(roads))throw Error('Unknown supplement tile');
  for(const r of roads){
   if(!Number.isFinite(r.id)||typeof r.kind!=='string'||!Number.isFinite(r.width)||r.width<=0||r.width>100||
      typeof r.bridge!=='boolean'||typeof r.tunnel!=='boolean'||!Number.isFinite(r.layer)||
      !Array.isArray(r.points)||r.points.length!==2||!r.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=manifest.size/2+.001)))throw Error('Invalid supplemental road');
  }
 }
 return data;
}
export async function loadRoadSupplement(manifest,root,fetcher){
 if(!manifest.roadSupplement)return null;
 if(!/^data\/[a-z0-9/_-]+\.json$/.test(manifest.roadSupplement))throw Error('Unsafe road supplement path');
 const response=await fetcher(root+manifest.roadSupplement,{cache:'no-store'});
 if(!response.ok)throw Error('Declared road supplement unavailable');
 return validateRoadSupplement(await response.json(),manifest);
}
export function applyRoadSupplement(field,entry,data){
 const additions=data?.tiles?.[entry.id];
 if(!additions?.length)return field;
 const existing=new Set(field.osm.roads.map(r=>r.id));
 const missing=additions.filter(r=>!existing.has(r.id));
 if(!missing.length)return field;
 return {...field,osm:{...field.osm,roads:[...field.osm.roads,...missing]}};
}
