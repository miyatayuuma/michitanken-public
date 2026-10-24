import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createBiomeWorld,generateBiomeCandidates} from '../lib/biomes.mjs';
export async function generate(root,options={}){
 const read=async p=>JSON.parse(await fs.readFile(path.join(root,'public',p),'utf8'));
 const manifest=await read('data/tiles.json'),tiles=new Map(),overlays=new Map();
 for(const e of manifest.tiles){tiles.set(e.id,await read(e.url));try{overlays.set(e.id,await read('data/vegetation/'+e.id+'.json'));}catch(err){if(err.code!=='ENOENT')throw err;}}
 // Preserve both measured green-cover polygons and broader OSM habitat evidence.
 for(const e of manifest.tiles){try{const cover=await read('data/green-cover/'+e.id+'.json');if(cover.schema!==1||cover.tileId!==e.id||!Array.isArray(cover.areas))throw Error('Invalid green-cover overlay');const previous=overlays.get(e.id)||{schema:1,tileId:e.id,areas:[],trees:[]};overlays.set(e.id,{...previous,areas:[...previous.areas,...cover.areas]});}catch(err){if(err.code!=='ENOENT')throw err;}}
 let pois=[];try{pois=(await read('data/pois.json')).points;}catch(err){if(err.code!=='ENOENT')throw err;}
 const world=createBiomeWorld({manifest,tiles,overlays,pois});
 const result=generateBiomeCandidates(world,options);
 result.sources={terrain:'existing field terrain attribution',hydrographyAndBuildings:'existing field OSM attribution',vegetation:'existing OSM overlays and optional municipal green-cover provenance; retained in source files',poi:'existing pois.json sources; association only'};
 return result;
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
 const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('Usage: generate-biomes.mjs ROOT NEW_OUTPUT.json');
 const started=performance.now(),result=await generate(path.resolve(root));
 await fs.writeFile(out,JSON.stringify(result)+'\n',{flag:'wx'});
 console.log(JSON.stringify({tiles:Object.keys(result.byTile).length,seams:result.seams.length,totals:result.totals,excluded:result.excluded,generationMs:performance.now()-started}));
}
