// Built production, one sequential browser; do not run alongside other local browser work.
// Output includes real locations when supplied a real field: keep it PRIVATE.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {preview} from 'vite';import {chromium} from 'playwright';
import {createTiledWorld,registerTile} from '../lib/tiles.mjs';import {collisionReason} from '../lib/navigation.mjs';
import {createExplorationMapStore} from '../lib/exploration-map.mjs';
const [casesArg,outArg]=process.argv.slice(2),cases=JSON.parse(await fs.readFile(casesArg)),root=path.resolve(cases[0].root),out=path.resolve(outArg);
const read=async p=>JSON.parse(await fs.readFile(root+'/public/data/'+p)),manifest=await read('tiles.json'),world=createTiledWorld(manifest),objects=[];
for(const t of manifest.tiles){registerTile(world,t,JSON.parse(await fs.readFile(root+'/public/'+t.url)));objects.push(...(await read('exploration/'+t.id+'.json')).objects);}
const corridor=objects.find(p=>Array.from({length:81},(_,i)=>i*.5-20).every(d=>!collisionReason(world,p.x,p.z+d)));assert.ok(corridor);
const pois=await read('pois.json'),map=await read('exploration-map.json');let saved;
const store=createExplorationMapStore({bounds:map.bounds,ids:pois.points.map(p=>p.id),storage:{getItem:()=>null,setItem:(k,v)=>saved=v}});for(const p of pois.points){store.discover(p.id);store.reveal(p.position[0],p.position[2]);}store.flush();
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),rows=[];
try{for(const c of cases){const server=await preview({root:path.resolve(c.root),preview:{host:'127.0.0.1',port:8110,strictPort:true}});
 try{
 const context=await browser.newContext({viewport:c.device==='pc'?{width:1280,height:800}:{width:390,height:844},isMobile:c.device==='mobile',hasTouch:c.device==='mobile',deviceScaleFactor:1});
 await context.addInitScript(s=>localStorage.setItem('michi.explored.v1',s),saved);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
 const start=performance.now();await page.goto('http://127.0.0.1:8110/?test=1');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');const readyMs=performance.now()-start;
 await page.evaluate(async p=>{await window.__michiDebug.ensureTile(p.tileId);if(!window.__michiDebug.teleport(p.x,p.z-18,Math.PI))throw Error('Corridor blocked');},corridor);
 await page.waitForLoadState('networkidle');await page.waitForTimeout(300);
 const sample=async(motion=false)=>page.evaluate(motion=>new Promise(resolve=>{
  const frames=[],draws=[];let last=null;const f=t=>{
   if(last!==null){frames.push(t-last);draws.push(window.__michiDebug.map().drawMs);}
   if(motion){const canvas=document.querySelector('#exploration-map canvas'),b=canvas.getBoundingClientRect(),m=window.__michiDebug.map();canvas.dispatchEvent(new WheelEvent('wheel',{clientX:b.x+m.view.left+m.view.side/2,clientY:b.y+m.view.top+m.view.side/2,deltaY:frames.length%40<20?-20:20,bubbles:true,cancelable:true}));}
   last=t;if(frames.length===120){const sorted=[...frames].sort((a,b)=>a-b);resolve({p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),frames,draws});}else requestAnimationFrame(f);
  };requestAnimationFrame(f);
 }),motion);
 const initial=await page.evaluate(()=>window.__michiDebug.state());await page.keyboard.down('w');const walk=await sample();await page.keyboard.up('w');const end=await page.evaluate(()=>window.__michiDebug.state());walk.movedMetres=Math.hypot(end.x-initial.x,end.z-initial.z);assert.ok(walk.movedMetres>1);
 const walkStats=await page.evaluate(()=>window.__michiDebug.renderStats());const opens=[];
 for(let i=0;i<2;i++){
  const open=await page.evaluate(()=>new Promise(resolve=>{const t=performance.now();document.querySelector('#mode').click();const sync=performance.now()-t;requestAnimationFrame(()=>resolve({syncMs:sync,nextRAFMs:performance.now()-t}));}));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForTimeout(100);
  const d0=await page.evaluate(()=>window.__michiDebug.map().drawCount),staticFrames=await sample(),d1=await page.evaluate(()=>window.__michiDebug.map().drawCount);
  const motion=i===1?await sample(true):null;opens.push({...open,staticFrames,staticDraws:d1-d0,motion});assert.equal(d1-d0,0,'MT-07E-2B static map optimization regressed');
  await page.locator('#mode').click();
 }
 assert.deepEqual(errors,[]);rows.push({...c,readyMs,walk,walkStats,opens,errors});await context.close();
 console.log(JSON.stringify({variant:c.variant,device:c.device,repeat:c.repeat,walkP95:walk.p95,mapP95:opens.map(o=>o.staticFrames.p95),openMs:opens.map(o=>o.nextRAFMs)}));
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({status:rows.length===cases.length?'PASS':'IN_PROGRESS',renderer:'Chromium SwiftShader; DPR1; PC/mobile viewport and touch emulation; physical hardware UNVERIFIED',protocol:'built production, one browser, fresh contexts, counterbalanced order, three repeats, 120 frames per condition, actual keyboard walking on common verified corridor; all landmarks saved; static map redraw count asserted zero',rows},null,2));
 }finally{await new Promise(r=>server.httpServer.close(r));}
}}finally{await browser.close();}
