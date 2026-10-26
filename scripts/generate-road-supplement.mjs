// Source data and outputs remain PRIVATE for a real field. No online fetches.
import fs from 'node:fs/promises';import path from 'node:path';import zlib from 'node:zlib';
import {seamRoadAudit,adjacentTilePairs} from '../lib/tiles.mjs';
import {clipSegment,project,unproject} from '../lib/geo.mjs';
import {validateRoadSupplement} from '../lib/road-supplement.mjs';
const [rootArg,sourceArg,outArg,reportArg]=process.argv.slice(2),root=path.resolve(rootArg);
const manifest=JSON.parse(await fs.readFile(root+'/public/data/tiles.json'));
const raw=await fs.readFile(sourceArg),source=JSON.parse(sourceArg.endsWith('.gz')?zlib.gunzipSync(raw):raw);
const fields=new Map(await Promise.all(manifest.tiles.map(async t=>[t.id,JSON.parse(await fs.readFile(root+'/public/'+t.url))])));
const missingIds=new Set(),exemplars=new Map();
for(const f of fields.values())for(const r of f.osm.roads)exemplars.set(r.id,r);
for(const [a,b] of adjacentTilePairs(manifest)){
 const s=seamRoadAudit(fields.get(a.id),fields.get(b.id),a,b);
 for(const p of [...s.unmatched,...s.unmatchedB])missingIds.add(p.id);
}
const data={schema:1,source:'Archived OSM ways; original snapshots remain unchanged',tiles:{}},report=[];
for(const feature of source.features){
 const id=Number(feature.id?.replace('way/',''));if(!missingIds.has(id)||!feature.points?.length)continue;
 const exemplar=exemplars.get(id);if(!exemplar||feature.tags?.highway!==exemplar.kind)throw Error('Source kind mismatch');
 for(const tile of manifest.tiles){
  const field=fields.get(tile.id);if(field.osm.roads.some(r=>r.id===id))continue;
  const points=feature.points.map(p=>{const ll=unproject(p[0],p[1],source.center);return project(ll.lat,ll.lon,field.center);});
  for(let i=1;i<points.length;i++){
   const seg=clipSegment(points[i-1],points[i],manifest.size/2);
   if(!seg||Math.hypot(seg[1][0]-seg[0][0],seg[1][1]-seg[0][1])<.01)continue;
   const road={...exemplar,points:seg};(data.tiles[tile.id]??=[]).push(road);
   report.push({tile:tile.id,id,sourceVersion:feature.version,points:seg,length:Math.hypot(seg[1][0]-seg[0][0],seg[1][1]-seg[0][1])});
  }
 }
}
validateRoadSupplement(data,manifest);
await fs.writeFile(outArg,JSON.stringify(data,null,2)+'\n');
await fs.writeFile(reportArg,JSON.stringify({segments:report.length,ways:[...new Set(report.map(r=>r.id))].length,tiles:Object.keys(data.tiles).length,report},null,2));
console.log(JSON.stringify({segments:report.length,ways:[...new Set(report.map(r=>r.id))].length,tiles:Object.keys(data.tiles).length}));
