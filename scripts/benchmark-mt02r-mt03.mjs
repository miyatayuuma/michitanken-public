import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const [before,after,out]=process.argv.slice(2);const rows=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{for(const [variant,dir] of [['before',before],['after',after]]){
 const root=path.resolve(dir),server=await createServer({root,server:{host:'127.0.0.1',port:8084,strictPort:true,fs:{allow:[root]}}});await server.listen();
 try{for(let repeat=0;repeat<2;repeat++){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}),page=await context.newPage();
  const start=performance.now();await page.goto('http://127.0.0.1:8084/?test=1&wildlife=off');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true',null,{timeout:90000});const readyMs=performance.now()-start;
  const sample=async()=>{await page.evaluate(()=>new Promise(resolve=>{let n=0;function frame(){if(++n>120)resolve();else requestAnimationFrame(frame);}frame();}));const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('Performance.enable');const measured=await cdp.send('Performance.getMetrics');const result=await page.evaluate(()=>window.__michiDebug.renderStats());result.measuredHeapBytes=measured.metrics.find(m=>m.name==='JSHeapUsedSize')?.value;await cdp.detach();return result;};
  const walk=await sample();const mapStart=performance.now();await page.locator('#mode').click();await page.waitForFunction(()=>document.querySelector('#scene').dataset.overviewReady==='true',null,{timeout:90000});const mapReadyMs=performance.now()-mapStart,map=await sample();
  rows.push({variant,repeat,readyMs,mapReadyMs,walk,map});console.log(JSON.stringify({variant,repeat,readyMs,mapReadyMs,walk:walk.frameP95Ms,map:map.frameP95Ms}));await context.close();
 }}finally{await server.close();}
}}finally{await browser.close();await fs.writeFile(out,JSON.stringify({renderer:'Chromium SwiftShader; physical GPU/phone UNVERIFIED',rows},null,2));}
