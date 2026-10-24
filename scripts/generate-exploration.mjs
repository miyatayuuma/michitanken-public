import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBiomeWorld} from '../lib/biomes.mjs';
import {planSpawns} from '../lib/exploration.mjs';
export async function generateExploration(root){
 const read=async p=>JSON.parse(await fs.readFile(path.join(root,'public/data',p),'utf8'));
 const manifest=await read('tiles.json'),audit=await read('biomes.json'),tiles=new Map(),overlays=new Map();
 for(const e of manifest.tiles){tiles.set(e.id,await read(e.url.slice(5)));let areas=[],trees=[];
  for(const folder of ['vegetation','green-cover'])try{const o=await read(folder+'/'+e.id+'.json');areas.push(...o.areas);trees.push(...(o.trees||[]));}catch(err){if(err.code!=='ENOENT')throw err;}
  overlays.set(e.id,{schema:1,tileId:e.id,areas,trees});}
 const world=createBiomeWorld({manifest,tiles,overlays});
 // Revalidate every input against ALL original geometry, including adjacent tiles.
 for(const c of audit.candidates){const s=world.inspect(c.position[0],c.position[2],audit.policy);if(s.reason||s.tileId!==c.tileId||s.biome!==c.biome||Math.abs(s.y-c.position[1])>1e-6)throw Error('Unsafe/stale candidate '+c.id);}
 const objects=planSpawns(audit.candidates),out=path.join(root,'public/data/exploration');await fs.mkdir(out,{recursive:true});
 let bytes=0;const counts={};
 for(const e of manifest.tiles){const rows=objects.filter(p=>p.tileId===e.id);const text=JSON.stringify({schema:1,tileId:e.id,objects:rows})+'\n';bytes+=Buffer.byteLength(text);await fs.writeFile(path.join(out,e.id+'.json'),text);}
 for(const p of objects){const k=p.biome+':'+p.type;counts[k]=(counts[k]||0)+1;}
 return {candidates:audit.candidates.length,objects:objects.length,tiles:manifest.tiles.length,seams:audit.seams.length,spacing:24,bytes,counts,objectsForAudit:objects};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await generateExploration(path.resolve(process.argv[2]));delete r.objectsForAudit;console.log(JSON.stringify(r,null,2));}
