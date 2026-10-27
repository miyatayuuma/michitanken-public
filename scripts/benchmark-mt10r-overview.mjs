// Test-only response instrumentation of final bundles. Does not write deploy assets.
// Deliberately separate from native follow-camera walking acceptance.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {preview} from 'vite';import {chromium} from 'playwright';
const [casesArg,poseArg,outArg]=process.argv.slice(2),cases=JSON.parse(await fs.readFile(casesArg)),pose=JSON.parse(await fs.readFile(poseArg)).find(c=>c.name==='dense-overview');assert.ok(pose);
async function foreignBrowsers(){
 const found=[];for(const pid of await fs.readdir('/proc')){if(!/^\d+$/.test(pid))continue;try{
  const cmd=(await fs.readFile('/proc/'+pid+'/cmdline','utf8')).replaceAll('\0',' ');
  if(!/chrom(e|ium)/.test(cmd)||!cmd.includes('--remote-debugging-pipe')||cmd.includes('--type='))continue;
  const status=await fs.readFile('/proc/'+pid+'/status','utf8'),parent=Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
  const parentCommand=(await fs.readFile('/proc/'+parent+'/cmdline','utf8')).replaceAll('\0',' ');
  // /proc can expose host PIDs while Node uses a container PID namespace.
  const owned=parentCommand.includes(path.basename(process.argv[1]))&&parentCommand.includes(outArg);
  if(!owned)found.push({pid:Number(pid),parent});
 }catch{}}return found;
}
const browser=await chromium.launch({executablePath:process.env.MICHI_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),rows=[];
try{for(const c of cases){
 let external=await foreignBrowsers();while(external.length){console.log(JSON.stringify({event:'WAIT_EXTERNAL_BROWSER',external}));await new Promise(r=>setTimeout(r,5000));external=await foreignBrowsers();}
 const interference=[];const monitor=setInterval(()=>{void foreignBrowsers().then(pids=>{if(pids.length)interference.push({time:Date.now(),pids});});},1000);

 const server=await preview({root:path.resolve(c.root),build:{outDir:'public'},preview:{host:'127.0.0.1',port:8126,strictPort:true}});let context;
 try{
 context=await browser.newContext({viewport:c.device==='pc'?{width:1280,height:800}:{width:390,height:844},deviceScaleFactor:1,isMobile:c.device==='mobile',hasTouch:c.device==='mobile'});const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assets/index-*.js',async route=>{
  const r=await route.fetch();let s=await r.text();
  const camera=s.match(/camera:\(\)=>\(\{position:([\w$]+)\.position\.toArray/)[1],visuals=s.match(/levels:\[\.\.\.([\w$]+)\.values\(\)\]\.map/)[1],streamer=s.match(/window\.__michiDebug=\{ensureTile:[\w$]+=>\s*([\w$]+)\.ensure/)[1];
  const detailMatch=s.match(/function ([\w$]+)\(([\w$]+),([\w$]+)\)\{\2\.removed\|\|\2\.requestedLevel===\3/),detail=detailMatch[1];
  const start=detailMatch.index,queue=s.slice(start,start+350).match(/([\w$]+)=\1\.then\(async/)[1];
  // The 0.28s policy and streaming remain in the bundle but are suspended only while
  // the explicit forced-overview probe is active. No walk result uses this patch.
  const quality=s.match(/([\w$]+)>\.28\)\{for\(const/)[1];s=s.replace(quality+'>.28){for(const','!window.__forcedOverview&&'+quality+'>.28){for(const');
  s=s.replace(new RegExp(streamer.replaceAll('$','\\$')+'\\.update\\(([^()]*)\\)','g'),'(window.__forcedOverview?undefined:'+streamer+'.update($1))');
  const hook=`window.__michiDebug={__forceOverview:async v=>{window.__forcedOverview=v;for(const id of v.ids)await ${streamer}.ensure(id);for(const visual of ${visuals}.values())${detail}(visual,'overview');await ${queue};const camera=${camera};if(!camera.userData.overviewProbe){const original=camera.updateMatrixWorld.bind(camera);camera.updateMatrixWorld=function(...a){const p=window.__forcedOverview;if(p){this.position.fromArray(p.position);this.lookAt(...p.target);}return original(...a);};camera.userData.overviewProbe=true;}return true;},`;
  s=s.replace('window.__michiDebug={',hook);await route.fulfill({response:r,body:s});
 });
 await page.goto('http://127.0.0.1:8126/games/michitanken/?test=1');await page.waitForFunction(()=>window.__michiDebug?.__forceOverview);
 await page.evaluate(p=>__michiDebug.__forceOverview(p),pose);await page.waitForLoadState('networkidle');
 const sample=n=>page.evaluate(n=>new Promise(resolve=>{const a=[];let last;function f(t){if(last)a.push(t-last);last=t;if(a.length===n)resolve(a);else requestAnimationFrame(f);}requestAnimationFrame(f);}),n);
 await sample(120);const frames=await sample(240),sorted=[...frames].sort((a,b)=>a-b),stats=await page.evaluate(()=>__michiDebug.renderStats());const actualPose=await page.evaluate(()=>__michiDebug.camera());assert.ok(actualPose.position.every((v,i)=>Math.abs(v-pose.position[i])<1e-7));assert.ok(stats.levels.every(v=>v.level==='overview'));assert.deepEqual(errors,[]);
 const quantiles=Object.fromEntries([50,90,95,99].map(p=>['p'+p,sorted[Math.floor(p/100*sorted.length)]]));rows.push({...c,interference,actualPose,frames,quantiles,max:sorted.at(-1),stats,errors});
 await fs.writeFile(outArg,JSON.stringify({status:rows.some(r=>r.interference.length)?'CONTAMINATED':rows.length===cases.length?'COMPLETE':'IN_PROGRESS',renderer:'Chromium '+browser.version()+' SwiftShader; physical GPU UNVERIFIED',protocol:'Final-bundle test-only response instrumentation; all loaded tiles forced overview, fixed dense camera, unchanged scene fog, 120 warmup + 240 measured RAF intervals; five counterbalanced trials/device/variant; not normal walk acceptance.',pose,rows},null,2));console.log(JSON.stringify({variant:c.variant,device:c.device,repeat:c.repeat,...quantiles,max:sorted.at(-1)}));
 }finally{clearInterval(monitor);await context?.close();await new Promise(r=>server.httpServer.close(r));}
}}finally{await browser.close();}
