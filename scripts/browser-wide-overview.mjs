import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {unproject} from '../lib/geo.mjs';

const origin=process.env.MICHI_TEST_ORIGIN||'http://127.0.0.1:8080';
const source=JSON.parse(fs.readFileSync(new URL('../public/data/field.json',import.meta.url),'utf8'));
const manifest={schema:1,size:500,center:{lat:0,lon:0},tiles:[]};
for(let row=0;row<5;row++)for(let col=0;col<5;col++){
 const offset=[(col-2)*500,(row-2)*500];
 const id=col===2&&row===2?'north':'t-'+row+'-'+col;
 manifest.tiles.push({id,offset,url:id==='north'?'data/field.json':'data/tiles/'+id+'.json'});
}
const fields=new Map(manifest.tiles.filter(t=>t.id!=='north').map(entry=>[
 entry.id,{...source,center:unproject(entry.offset[0],entry.offset[1],manifest.center)}
]));
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2,hasTouch:true});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.route('**/data/tiles.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(manifest)}));
 await page.route(/\/data\/tiles\/t-\d+-\d+\.json/,route=>{
  const id=route.request().url().split('/').at(-1).replace('.json','');
  const field=fields.get(id);
  return field?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(field)}):route.abort();
 });
 await page.goto(origin+'/?test=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true',null,{timeout:30000});
 await page.locator('#mode').click();
 await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.overviewReady==='true',null,{timeout:60000});
 const stats=await page.evaluate(()=>window.__michiDebug.renderStats());
 assert.equal(stats.wideOverview?.tiles,25,'Wide overview should cover all fictional tiles');
 assert.ok(stats.wideOverview.triangles<=7200);
 assert.ok(stats.memory.geometries>0);
 assert.ok(stats.levels.length<25,'Distant tiles must not be GPU-mounted');
 assert.equal(await page.locator('#scene').getAttribute('data-wide-overview-tiles'),'25');
 await page.screenshot({path:'task5c-wide-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>window.__michiDebug.panOverview(1000,1000)),true);
 await page.waitForFunction(()=>window.__michiDebug.state().tiles.active.includes('t-4-4'),null,{timeout:20000});
 const farState=await page.evaluate(()=>window.__michiDebug.state());
 assert.ok(farState.tiles.active.includes('north'),'Player tile must survive distant overview pan');
 await page.locator('#mode').click();
 await page.waitForTimeout(350); // Cover multiple fixed-step walking updates after return.
 await page.waitForFunction(()=>window.__michiDebug.renderStats().wideOverview===null,null,{timeout:10000});
 const after=await page.evaluate(()=>window.__michiDebug.renderStats());
 assert.equal(after.wideOverview,null,'Walk mode should release wide atlas');
 assert.ok(after.levels.length<25,'Walking must keep near tiles only');
 assert.deepEqual(errors,[],'No browser JS errors or failed network requests');
 // The nine-tile production baseline must still use its original full 3D overview.
 const legacy=await context.newPage();
 try{
  const threeByThree={...manifest,tiles:manifest.tiles.filter(
   t=>Math.abs(t.offset[0])<=500&&Math.abs(t.offset[1])<=500)};
  await legacy.route('**/data/tiles.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(threeByThree)}));
  await legacy.route(/\/data\/tiles\/t-\d+-\d+\.json/,route=>{
   const id=route.request().url().split('/').at(-1).replace('.json','');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fields.get(id))});
  });
  await legacy.goto(origin+'/?test=1',{waitUntil:'domcontentloaded'});
  await legacy.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true',null,{timeout:30000});
  await legacy.locator('#mode').click();
  await legacy.waitForFunction(()=>document.querySelector('#scene')?.dataset.overviewReady==='true',null,{timeout:60000});
  const legacyStats=await legacy.evaluate(()=>window.__michiDebug.renderStats());
  assert.equal(legacyStats.wideOverview,null);
  assert.equal(legacyStats.levels.length,9,'3x3 should preserve the complete native overview');
  console.log('Task5C legacy 3x3 browser baseline: PASS');
 }finally{await legacy.close();}
 console.log(JSON.stringify({status:'PASS',overview:stats.wideOverview,overviewFullTileCount:stats.levels.length,walkTileCount:after.levels.length,gpuGeometries:stats.memory.geometries}));
}finally{
 await context.close();await browser.close();
}
