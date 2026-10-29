/** Pixel and persistence contract on fictional cartography only. */
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createServer} from 'vite';import {chromium} from 'playwright';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);await fs.mkdir(out,{recursive:true});const server=await createServer({root,server:{host:'127.0.0.1',port:8102,strictPort:true}});await server.listen();const browser=await chromium.launch({args:['--no-sandbox']});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8102/');const rows=await page.evaluate(async()=>{
 const {createMapTerrain}=await import('/src/map-terrain.js');const {createExplorationMapStore}=await import('/lib/exploration-map.mjs');
 const data={bounds:{minX:0,maxX:200,minZ:0,maxZ:200},areas:[{kind:'water',ring:[[100,0],[200,0],[200,100],[100,100]]},{kind:'green',ring:[[0,100],[100,100],[100,200],[0,200]]}],lines:[{kind:'road',points:[[0,25],[200,25]],width:6},{kind:'river',points:[[0,175],[200,175]],width:6}]};const rows=[];
 for(const style of ['A']){let saved=null;const store=createExplorationMapStore({bounds:data.bounds,ids:['known','hidden'],storage:{getItem:()=>null,setItem:(k,v)=>saved=v},radius:20});store.reveal(25,25);store.discover('known');store.flush();const before=saved,cells=store.snapshot();const source=JSON.stringify(data),layer=createMapTerrain(data,store);layer.update();const g=layer.canvas.getContext('2d'),pixel=(x,y)=>Array.from(g.getImageData(x,y,1,1).data),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),different=(a,b)=>!equal(a,b);
 const samples={road:pixel(375,125),ground:pixel(375,300),water:pixel(750,300),green:pixel(250,650),river:pixel(375,875)};
 if(!different(samples.road,samples.ground)||!different(samples.water,samples.ground)||!different(samples.green,samples.ground)||!different(samples.river,samples.green))throw Error('Invisible terrain '+style);
 const known=layer.canvas.toDataURL();layer.update();if(known!==layer.canvas.toDataURL())throw Error('Non-idempotent cache '+style);
 if(saved!==before||!equal(store.snapshot(),cells)||JSON.stringify(data)!==source||store.has('hidden'))throw Error('Presentation mutated exploration');
 const old=Array.from(g.getImageData(0,0,250,250).data);store.reveal(175,175);layer.update();const oldAfter=Array.from(g.getImageData(0,0,250,250).data);if(!equal(old,oldAfter))throw Error('Previously revealed terrain changed '+style);
 layer.dispose();if(layer.canvas.width!==0)throw Error('Canvas leak');rows.push({style,terrainDistinct:true,idempotentCache:true,saveUntouched:true,sourceUntouched:true,undiscoveredHidden:true,incrementalReveal:true,disposed:true,samples});
 }return rows;
});assert.equal(rows.length,1);await fs.writeFile(out+'/contract.json',JSON.stringify({status:'PASS',rows},null,2));console.log('Terrain pixel/persistence contract PASS');}finally{await browser.close();await server.close();}
