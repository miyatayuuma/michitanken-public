import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {unproject,gridSample} from '../lib/geo.mjs';
import {createPoiRegistry,rectanglesOverlap} from '../lib/poi.mjs';
const origin=process.env.MICHI_TEST_ORIGIN||'http://127.0.0.1:8080';
const source=JSON.parse(fs.readFileSync(new URL('../public/data/field.json',import.meta.url)));
const pois=JSON.parse(fs.readFileSync(new URL('../public/data/pois.json',import.meta.url)));
const manifest={schema:1,size:500,center:{lat:0,lon:0},tiles:[]};
for(let row=0;row<5;row++)for(let col=0;col<5;col++){
 const offset=[(col-2)*500,(row-2)*500],id=row===2&&col===2?'north':`t-${row}-${col}`;
 manifest.tiles.push({id,offset,url:id==='north'?'data/field.json':`data/tiles/${id}.json`});
}
const edge=structuredClone(pois.points[0]);edge.id='fictional:boundary';edge.marker.priority=10;edge.tileId='t-2-3';edge.position=[250,20,0];pois.points.push(edge);
for(const p of pois.points)if(p.tileId==='north')p.position[1]=gridSample(source.terrain,p.position[0],p.position[2]);
createPoiRegistry(pois,manifest);
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/tiles.json',r=>r.fulfill({json:manifest}));
 await page.route('**/data/pois.json',r=>r.fulfill({json:pois}));
 await page.route(/\/data\/tiles\/t-\d+-\d+\.json/,r=>{const id=r.request().url().split('/').at(-1).replace('.json',''),t=manifest.tiles.find(t=>t.id===id);return r.fulfill({json:{...source,center:unproject(...t.offset,manifest.center)}});});
 await page.goto(origin+'/?test=1');await page.waitForFunction(()=>document.querySelector('#scene').dataset.appReady==='true');
 assert.equal((await page.evaluate(()=>window.__michiDebug.poi())).total,6);
 const pointer=await page.locator('.poi-layer').evaluate(el=>getComputedStyle(el).pointerEvents);assert.equal(pointer,'none');
 // Exercise actual GPU building colors, then reconstruct both LODs and atlas.
 const colors=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');const {addBuildings}=await import('/src/buildings.js');
  const {buildingColors}=await import('/lib/appearance.mjs');const f=await (await fetch('/data/field.json')).json();
  const values=[];
  for(const detail of ['full','overview']){const root=new T.Group(),layers={};addBuildings(f,root,layers,detail);const a=layers.buildings.children.at(-1).geometry.attributes.color;values.push(Array.from(a.array.slice(0,3)));}
  return {values,color:new T.Color(buildingColors(f.osm.buildings[0]).roof).toArray()};
 });
 for(const v of colors.values)for(let i=0;i<3;i++)assert.ok(Math.abs(v[i]-colors.color[i])<1e-6);
 await page.locator('#mode').click();await page.waitForFunction(()=>document.querySelector('#scene').dataset.overviewReady==='true');
 await page.waitForFunction(()=>window.__michiDebug.poi().visible.length>0);
 const map=await page.evaluate(()=>window.__michiDebug.poi());
 assert.ok(map.visible.length<=(mobile?18:24));
 for(const a of map.visible){assert.deepEqual(a.position,pois.points.find(p=>p.id===a.id).position);for(const b of map.visible)if(a!==b)assert.equal(rectanglesOverlap(a.box,b.box,8),false);}
 assert.ok(map.visible.some(p=>p.id==='fictional:boundary'),'edge-owned marker remains present independently of tile mounting');
 await page.evaluate(()=>window.__michiDebug.panOverview(1000,1000));await page.waitForFunction(()=>window.__michiDebug.state().tiles.active.includes('t-4-4'));
 assert.equal((await page.evaluate(()=>window.__michiDebug.poi())).total,6);
 await page.locator('#mode').click();await page.waitForFunction(()=>window.__michiDebug.renderStats().wideOverview===null);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#scene').dataset.appReady==='true');assert.equal((await page.evaluate(()=>window.__michiDebug.poi())).total,6);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',mobile,registry:6,mapVisible:map.visible.length,fullOverviewColors:true,overlap:false,edgeAndReload:true,inputTransparent:true}));
 await context.close();
}}finally{await browser.close();}
