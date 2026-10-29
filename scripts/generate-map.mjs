/** Offline only. No terrain, buildings, OSM tags or audit records enter the runtime map. */
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {manifestBounds} from '../lib/tiles.mjs';
export async function generateMap(root){
 const read=async p=>JSON.parse(await fs.readFile(path.join(root,'public',p),'utf8'));const manifest=await read('data/tiles.json'),bounds=manifestBounds(manifest),lines=[],areas=[];
 for(const e of manifest.tiles){const f=await read(e.url);const shift=p=>p.map(([x,z])=>[Math.round(x+e.offset[0]),Math.round(z+e.offset[1])]);
 for(const r of f.osm.roads)lines.push({kind:'road',width:r.width,points:shift(r.points)});
 for(const r of f.osm.waterways||[])if(!r.tunnel&&!(r.layer<0))lines.push({kind:'river',width:r.width,points:shift(r.points)});
 for(const a of f.osm.waterAreas||[])areas.push({kind:'water',ring:shift(a.footprint),holes:(a.holes||[]).map(shift)});
 for(const kind of ['vegetation','green-cover']){try{const v=await read('data/'+kind+'/'+e.id+'.json');for(const a of v.areas)areas.push({kind:['wood','grove','canopy'].includes(a.kind)?'wood':'green',ring:shift(a.ring),holes:(a.holes||[]).map(shift)});}catch(err){if(err.code!=='ENOENT')throw err;}}
 }
 const bio=await read('data/biomes.json'),step=bio.policy.step,cols=Math.ceil((bounds.maxX-bounds.minX)/step),rows=Math.ceil((bounds.maxZ-bounds.minZ)/step),grid=Array(cols*rows).fill('0'),names=['urban','grassland','woodland','waterside'];
 for(const s of bio.samples){const c=Math.floor((s.position[0]-bounds.minX)/step),r=Math.floor((s.position[2]-bounds.minZ)/step);if(c>=0&&c<cols&&r>=0&&r<rows)grid[r*cols+c]=String(names.indexOf(s.biome));}
 return {schema:1,bounds,lines,areas,biomes:{step,cols,rows,cells:grid.join('')},attribution:'Map data © OpenStreetMap contributors (ODbL); vegetation attribution retained in source data.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const [root,out]=process.argv.slice(2);await fs.writeFile(out,JSON.stringify(await generateMap(root))+'\n');}
