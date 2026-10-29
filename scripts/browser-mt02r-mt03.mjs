import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {rectanglesOverlap} from '../lib/poi.mjs';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);await fs.mkdir(out,{recursive:true});
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const pois=await read('public/data/pois.json'),audit=await read('public/data/biomes.json');
assert.equal(Object.keys(audit.byTile).length,25);assert.equal(audit.seams.length,40);
const server=await createServer({root,server:{host:'127.0.0.1',port:8083,strictPort:true,fs:{allow:[root]}}});await server.listen();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});const rows=[];
const settle=async page=>page.evaluate(()=>new Promise(resolve=>{let n=0;function next(){if(++n>=30)resolve();else requestAnimationFrame(next);}next();}));
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto('http://127.0.0.1:8083/?test=1');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true',null,{timeout:90000});
  assert.equal(requests.some(r=>r.includes('biomes.json')),false,'Normal play must not load the audit data');
  const device=mobile?'mobile':'desktop';const metrics=[];
  // Use an actual dry-ground candidate near the existing park; never alter PRIVATE POIs.
  const park=pois.points.find(p=>p.category==='park'),near=[...audit.candidates].sort((a,b)=>Math.hypot(a.position[0]-park.position[0],a.position[2]-park.position[2])-Math.hypot(b.position[0]-park.position[0],b.position[2]-park.position[2]))[0];
  await page.locator('#mode').click();await page.waitForFunction(()=>document.querySelector('#scene').dataset.overviewReady==='true',null,{timeout:90000});
  await page.evaluate(async({p,park})=>{const d=window.__michiDebug;await d.ensureTile(p.tileId);const yaw=Math.atan2(p.position[0]-park.position[0],p.position[2]-park.position[2]);if(!d.teleport(p.position[0],p.position[2],yaw))throw Error('Candidate not navigable');document.querySelector('#mode').click();},{p:near,park});
  await settle(page);
  for(const mode of ['walk','map']){
   if(mode==='map'){await page.locator('#mode').click();await page.waitForFunction(()=>document.querySelector('#scene').dataset.overviewReady==='true',null,{timeout:90000});}
   for(const theme of ['legacy','cartography']){
    await page.evaluate(t=>window.__michiDebug.setMarkerTheme(t),theme);await settle(page);
    const state=await page.evaluate(()=>window.__michiDebug.poi());assert.ok(state.visible.length<=(mode==='walk'?3:mobile?12:18));
    for(let i=0;i<state.visible.length;i++)for(const b of state.visible.slice(i+1))assert.ok(!rectanglesOverlap(state.visible[i].box,b.box,8));
    assert.equal(await page.locator('.poi-layer').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
    assert.ok(await page.locator('.poi-icon img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
    await page.screenshot({path:path.join(out,`${device}-${mode}-${theme}.png`)});
    const stats=await page.evaluate(()=>window.__michiDebug.renderStats());
    metrics.push({mode,theme,stats,visible:state.visible});
   }
  }
  // Close framing covers near labels; the full atlas above covers far icon-only display.
  const focus=park.position;
  await page.evaluate(p=>window.__michiDebug.setAuditView(p[0],p[2],110),focus);await settle(page);
  for(const dark of [false,true]){
   await page.locator('#scene canvas').first().evaluate((e,d)=>e.style.filter=d?'brightness(.3)':'none',dark);
   await page.screenshot({path:path.join(out,`${device}-close-${dark?'dark':'light'}.png`)});
  }
  await page.locator('#scene canvas').first().evaluate(e=>e.style.filter='none');
  assert.deepEqual(errors,[]);rows.push({mobile,metrics,normalAuditRequests:0,errors});
  await page.goto('http://127.0.0.1:8083/?test=1&biomes=1');await page.waitForFunction(()=>window.__michiDebug?.biomes(),null,{timeout:90000});
  await page.locator('#mode').click();await page.waitForFunction(()=>document.querySelector('#scene').dataset.overviewReady==='true',null,{timeout:90000});
  for(const view of ['biome','candidate','excluded']){await page.locator('.biome-debug select').selectOption(view);await settle(page);await page.screenshot({path:path.join(out,`${device}-${view}.png`)});}
  if(pois.sources.some(s=>s.id==='synthetic')){
   const dense=structuredClone(pois);dense.points=Array.from({length:40},(_,i)=>({...pois.points[i%5],id:'fictional:dense-'+i,tileId:'north',position:[-50+(i%8)*12,20,-50+Math.floor(i/8)*12]}));
   await page.route('**/data/pois.json',r=>r.fulfill({json:dense}));
   await page.goto('http://127.0.0.1:8083/?test=1');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');await page.locator('#mode').click();await page.waitForFunction(()=>document.querySelector('#scene').dataset.overviewReady==='true',null,{timeout:90000});
   await page.evaluate(()=>window.__michiDebug.setAuditView(0,0,160));await settle(page);
   const layout=await page.evaluate(()=>window.__michiDebug.poi());assert.ok(layout.visible.length>0);const labels=layout.visible.filter(c=>c.label).map(c=>dense.points.find(p=>p.id===c.id).name);assert.equal(new Set(labels).size,labels.length);for(let i=0;i<layout.visible.length;i++)for(const b of layout.visible.slice(i+1))assert.ok(!rectanglesOverlap(layout.visible[i].box,b.box,8));
   await page.screenshot({path:path.join(out,`${device}-dense.png`)});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify({status:'PASS',renderer:'Chromium SwiftShader; physical device UNVERIFIED',rows},null,2));
 console.log(JSON.stringify({status:'PASS',devices:2,screenshots:pois.sources.some(s=>s.id==='synthetic')?20:18,normalAuditRequests:0}));
}finally{await browser.close();await server.close();}
