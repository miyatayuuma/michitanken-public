import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unproject,terrainMeshHeight} from '../lib/geo.mjs';
import {generate} from './generate-biomes.mjs';
const engine=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(process.argv[2]||'');if(!process.argv[2]||root===engine)throw Error('Fresh output root required');
await fs.mkdir(root);for(const p of ['src','lib','index.html','package.json'])await fs.cp(path.join(engine,p),path.join(root,p),{recursive:true});
const read=async p=>JSON.parse(await fs.readFile(path.join(engine,p),'utf8'));
const source=await read('public/data/field.json'),pois=await read('public/data/pois.json');
const manifest={schema:1,size:500,center:{lat:0,lon:0},tiles:[]};
const write=async(p,d)=>{await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),JSON.stringify(d));};
for(let row=0;row<5;row++)for(let col=0;col<5;col++){
 const offset=[(col-2)*500,(row-2)*500],id=row===2&&col===2?'north':`t-${row}-${col}`,url=id==='north'?'data/field.json':`data/tiles/${id}.json`;
 manifest.tiles.push({id,offset,url});
 const f=structuredClone(source);f.center=unproject(...offset,manifest.center);f.terrain.elevations.fill(20);f.terrain.min=f.terrain.max=20;
 f.osm.waterAreas=[{id:700001,kind:'water',footprint:[[-120,80],[-70,80],[-70,140],[-120,140]],layer:0}];
 f.osm.roads.push({id:700002,kind:'residential',points:[[-250,-180],[250,-180]],width:6,bridge:false,tunnel:false,layer:0});
 await write('public/'+url,f);
 await write(`public/data/vegetation/${id}.json`,{schema:1,tileId:id,areas:[{id:'fictional-wood',kind:'wood',ring:[[-200,50],[-80,50],[-80,200],[-200,200]]},{id:'fictional-grass',kind:'grass',ring:[[80,50],[200,50],[200,200],[80,200]]}],trees:[]});
}
for(const p of pois.points){p.position[1]=20;if(p.category==='shrine')p.name='架空の神社';}
await write('public/data/tiles.json',manifest);await write('public/data/pois.json',pois);
await write('public/data/site-config.json',await read('public/data/site-config.json'));
await write('public/data/biomes.json',await generate(root));console.log('Fictional 25-tile fixture created');
