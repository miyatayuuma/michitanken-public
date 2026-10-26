// Source-only diagnostic instrumentation. Real-field output must remain PRIVATE.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const [rootArg,outArg,ablation='none']=process.argv.slice(2),root=path.resolve(rootArg);
const browser=await chromium.launch({executablePath:process.env.MICHI_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const server=await createServer({root,server:{host:'127.0.0.1',port:8120,strictPort:true}});await server.listen();
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 await page.route('**/src/main.js*',async route=>{
  const r=await route.fetch();let s=await r.text();
  s=s.replace('const compass=setupCompass',`window.__profile={samples:[],builds:[],active:false};
   for(const [obj,key,label] of [[renderer,'render','renderSubmit'],[exploration,'update','exploration'],[wildlife,'update','wildlife'],[poiMarkers,'update','markers'],[map2d,'update','map']]){if(!obj)continue;const original=obj[key];obj[key]=function(...a){const t=performance.now();try{return original.apply(this,a);}finally{if(__profile.active)__profile.samples.push([label,performance.now()-t]);}};}
   const compass=setupCompass`);
  s=s.replace('addBuildings(visual.field,temp,next,target,visual.entry,colorsEnabled);',`{const t=performance.now();addBuildings(visual.field,temp,next,target,visual.entry,colorsEnabled);__profile.builds.push({ms:performance.now()-t,target});}`);
  if(ablation==='no-buildings')s=s.replace('updateVisibleTiles();\n   playerSprite',`updateVisibleTiles();for(const v of visuals.values())v.layers.buildings.visible=false;\n   playerSprite`);
  if(ablation==='no-exploration')s=s.replace('exploration?.update({dt,','false&&exploration?.update({dt,');
  if(ablation==='no-render')s=s.replace("if(mode==='walk')renderer.render(scene,camera);","if(false)renderer.render(scene,camera);");
  await route.fulfill({response:r,body:s});
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8120/?test=1');await page.waitForFunction(()=>window.__michiDebug,{timeout:90000});
 const c=JSON.parse(await fs.readFile(path.resolve('evidence/corridor.json')));
 await page.evaluate(async c=>{await __michiDebug.ensureTile(c.tileId);if(!__michiDebug.teleport(c.x,c.z-18,Math.PI))throw Error('blocked');},c);
 await page.waitForLoadState('networkidle');await page.waitForTimeout(2500);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 await cdp.send('HeapProfiler.collectGarbage');const start=await cdp.send('Performance.getMetrics');
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 await page.evaluate(()=>__profile.active=true);await page.keyboard.down('w');
 const frames=await page.evaluate(()=>new Promise(resolve=>{const a=[];let last;function f(t){if(last)a.push(t-last);last=t;if(a.length===240)resolve(a);else requestAnimationFrame(f);}requestAnimationFrame(f);}));
 await page.keyboard.up('w');await page.evaluate(()=>__profile.active=false);
 const profile=await cdp.send('Profiler.stop'),end=await cdp.send('Performance.getMetrics');
 const result=await page.evaluate(()=>({profile:__profile,stats:__michiDebug.renderStats(),state:__michiDebug.state()}));
 const gl=await page.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2');return g?{vendor:g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),timerQuery:!!g.getExtension('EXT_disjoint_timer_query_webgl2')}:null;});
 await fs.writeFile(outArg,JSON.stringify({root,ablation,frames,...result,cpu:profile,start,end,gl,errors}));
 console.log(JSON.stringify({root,ablation,errors,p95:[...frames].sort((a,b)=>a-b)[228],stats:result.stats}));
}finally{await browser.close();await server.close();}
