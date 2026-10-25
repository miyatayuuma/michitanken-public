// Runtime warp/navigation checks. Evidence follows input visibility.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright';
import {createExplorationMapStore} from '../lib/exploration-map.mjs';
const [rootArg,outArg]=process.argv.slice(2),root=path.resolve(rootArg),out=path.resolve(outArg);await fs.mkdir(out,{recursive:true});
const read=async p=>JSON.parse(await fs.readFile(root+'/public/data/'+p));
const pois=await read('pois.json'),map=await read('exploration-map.json'),warps=await read('warps.json');let saved;
const store=createExplorationMapStore({bounds:map.bounds,ids:pois.points.map(p=>p.id),storage:{getItem:()=>null,setItem:(k,v)=>saved=v}});for(const p of pois.points){store.discover(p.id);store.reveal(p.position[0],p.position[2]);}store.flush();
const server=await createServer({root,server:{host:'127.0.0.1',port:8109,strictPort:true,fs:{allow:[root]}}});await server.listen();
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),rows=[];
try{for(const device of ['pc','mobile']){
 const context=await browser.newContext({viewport:device==='pc'?{width:1280,height:800}:{width:390,height:844},hasTouch:device==='mobile',isMobile:device==='mobile',deviceScaleFactor:1});
 await context.addInitScript(s=>localStorage.setItem('michi.explored.v1',s),saved);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
 await page.goto('http://127.0.0.1:8109/?test=1');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');
 const start=await page.evaluate(()=>window.__michiDebug.state()),results=[];
 for(const p of warps.points){const result=await page.evaluate(id=>window.__michiDebug.warp(id),p.id);
  assert.equal(result.ok,p.landing.confirmed);if(!result.ok)continue;
  const s=await page.evaluate(()=>window.__michiDebug.state());assert.ok(Math.abs(s.x-p.landing.position[0])<.001&&Math.abs(s.z-p.landing.position[2])<.001);assert.ok(Number.isFinite(s.y));
  await page.keyboard.down('w');await page.waitForTimeout(150);await page.keyboard.up('w');
  const after=await page.evaluate(()=>window.__michiDebug.state());assert.ok([after.x,after.y,after.z].every(Number.isFinite));
  results.push({id:p.id,warp:true,moveMetres:Math.hypot(after.x-s.x,after.z-s.z)});
 }
 await page.evaluate(async s=>{await window.__michiDebug.ensureTile('north');if(!window.__michiDebug.teleport(s.x,s.z))throw Error('Return blocked');},start);
 await page.keyboard.press('m');assert.equal(await page.evaluate(()=>window.__michiDebug.map().open),true);
 const before=await page.evaluate(()=>window.__michiDebug.state());await page.keyboard.down('w');await page.waitForTimeout(120);await page.keyboard.up('w');const after=await page.evaluate(()=>window.__michiDebug.state());assert.equal(after.x,before.x);assert.equal(after.z,before.z);
 await page.keyboard.press('Escape');await page.screenshot({path:path.join(out,device+'-return.png')});assert.deepEqual(errors,[]);
 rows.push({device,results,mapStopsMovement:true,errors});await context.close();
}}finally{await browser.close();await server.close();}
await fs.writeFile(path.join(out,'runtime.json'),JSON.stringify({status:'PASS',renderer:'Chromium SwiftShader; physical hardware UNVERIFIED',rows},null,2));console.log(JSON.stringify({status:'PASS',warps:rows.reduce((n,r)=>n+r.results.length,0)}));
