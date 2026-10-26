// Sequential final-build comparison. Real-field raw results are PRIVATE.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {preview} from 'vite';import {chromium} from 'playwright';
import {createTiledWorld,registerTile} from '../lib/tiles.mjs';import {collisionReason} from '../lib/navigation.mjs';
import {createExplorationMapStore} from '../lib/exploration-map.mjs';
const [casesArg,outArg]=process.argv.slice(2),cases=JSON.parse(await fs.readFile(casesArg)),root=path.resolve(cases[0].root);
const read=async p=>JSON.parse(await fs.readFile(root+'/public/games/michitanken/data/'+p)),manifest=await read('tiles.json'),world=createTiledWorld(manifest),objects=[];
for(const t of manifest.tiles){registerTile(world,t,JSON.parse(await fs.readFile(root+'/public/games/michitanken/'+t.url)));objects.push(...(await read('exploration/'+t.id+'.json')).objects);}
const corridor=objects.filter(p=>!process.env.MICHI_BENCH_TILE||p.tileId===process.env.MICHI_BENCH_TILE).find(p=>Array.from({length:81},(_,i)=>i*.5-20).every(d=>!collisionReason(world,p.x,p.z+d)));assert.ok(corridor);
const pois=await read('pois.json'),map=await read('exploration-map.json');let saved;
const store=createExplorationMapStore({bounds:map.bounds,ids:pois.points.map(p=>p.id),storage:{getItem:()=>null,setItem:(k,v)=>saved=v}});for(const p of pois.points){store.discover(p.id);store.reveal(p.position[0],p.position[2]);}store.flush();
async function foreignBrowsers(){
 const found=[];for(const pid of await fs.readdir('/proc')){if(!/^\d+$/.test(pid))continue;try{
  const cmd=(await fs.readFile('/proc/'+pid+'/cmdline','utf8')).replaceAll('\0',' ');
  if(!/chrom(e|ium)/.test(cmd)||!cmd.includes('--remote-debugging-pipe')||cmd.includes('--type='))continue;
  const status=await fs.readFile('/proc/'+pid+'/status','utf8'),parent=Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
  if(parent!==process.pid)found.push({pid:Number(pid),parent});
 }catch{}}return found;
}
const browser=await chromium.launch({executablePath:process.env.MICHI_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),rows=[];
try{for(const c of cases){
 let external=await foreignBrowsers();while(external.length){console.log(JSON.stringify({event:'WAIT_EXTERNAL_BROWSER',external}));await new Promise(r=>setTimeout(r,5000));external=await foreignBrowsers();}
 const interference=[];const monitor=setInterval(()=>{void foreignBrowsers().then(pids=>{if(pids.length)interference.push({time:Date.now(),pids});});},1000);
 const server=await preview({root:path.resolve(c.root),build:{outDir:'public'},preview:{host:'127.0.0.1',port:8110,strictPort:true}});
 let context;
 try{
 context=await browser.newContext({viewport:c.device==='pc'?{width:1280,height:800}:{width:390,height:844},isMobile:c.device==='mobile',hasTouch:c.device==='mobile',deviceScaleFactor:1});
 await context.addInitScript(s=>localStorage.setItem('michi.explored.v1',s),saved);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(120000);
 await page.goto('http://127.0.0.1:8110/games/michitanken/?test=1');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');
 await page.evaluate(async p=>{await __michiDebug.ensureTile(p.tileId);if(!__michiDebug.teleport(p.x,p.z-12,Math.PI))throw Error('Corridor blocked');},corridor);
 await page.waitForLoadState('networkidle');await page.waitForTimeout(1500);
 let held='w';await page.exposeFunction('__benchDirection',async key=>{await page.keyboard.up(held);held=key;await page.keyboard.down(held);});
 const sample=n=>page.evaluate(({n,corridor})=>new Promise(resolve=>{
  const frames=[],positions=[],levels=[];let last=null,direction=1,busy=false;
  function f(t){const state=__michiDebug.state();
   if(last!==null){frames.push(t-last);positions.push([state.x,state.z]);}
   if(!busy&&((direction===1&&state.z>=corridor.z+12)||(direction===-1&&state.z<=corridor.z-12))){direction*=-1;busy=true;__benchDirection(direction===1?'w':'s').then(()=>busy=false);}
   if(frames.length%60===0)levels.push({frame:frames.length,stats:__michiDebug.renderStats()});
   last=t;if(frames.length===n)resolve({frames,positions,levels});else requestAnimationFrame(f);
  }requestAnimationFrame(f);
 }),{n,corridor});
 await page.keyboard.down(held);await sample(120);await page.keyboard.up(held);
 await page.evaluate(p=>{if(!__michiDebug.teleport(p.x,p.z-12,Math.PI))throw Error('Warm reset failed');},corridor);await page.waitForTimeout(500);
 held='w';await page.keyboard.down(held);const walk=await sample(240);await page.keyboard.up(held);
 const sorted=[...walk.frames].sort((a,b)=>a-b);walk.quantiles=Object.fromEntries([50,90,95,99].map(p=>['p'+p,sorted[Math.floor(p/100*sorted.length)]]));walk.max=sorted.at(-1);
 walk.distance=walk.positions.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-walk.positions[i][0],p[1]-walk.positions[i][1]),0);
 assert.ok(walk.distance>5);assert.ok(walk.positions.every(p=>Math.abs(p[0]-corridor.x)<.1&&Math.abs(p[1]-corridor.z)<14),'Movement escaped checked corridor');assert.deepEqual(errors,[]);
 rows.push({...c,interference,walk,stats:await page.evaluate(()=>__michiDebug.renderStats()),errors});
 await fs.writeFile(outArg,JSON.stringify({status:rows.some(r=>r.interference.length)?'CONTAMINATED':rows.length===cases.length?'COMPLETE':'IN_PROGRESS',renderer:'Chromium '+browser.version()+' SwiftShader; physical GPU UNVERIFIED',protocol:'Sequential fresh contexts; DPR1; same collision-checked 24m bidirectional corridor and yaw; native W/S input; 120-frame moving warmup, reset, 240 measured RAF intervals; order rotated/reversed; five repetitions per device and variant. More loops may occur in slower trials; positions and distances retained.',corridor,rows},null,2));
 console.log(JSON.stringify({variant:c.variant,device:c.device,repeat:c.repeat,...walk.quantiles,max:walk.max,distance:walk.distance}));
 }finally{clearInterval(monitor);await context?.close();await new Promise(r=>server.httpServer.close(r));}
}}finally{await browser.close();}
