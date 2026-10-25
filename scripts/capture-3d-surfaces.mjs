// Test-only source instrumentation; does not ship camera controls or alter UI.
// Images and JSON inherit input visibility. Use a PRIVATE output for real fields.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const [rootArg,casesArg,outArg]=process.argv.slice(2),root=path.resolve(rootArg),out=path.resolve(outArg);
const cases=JSON.parse(await fs.readFile(casesArg));await fs.mkdir(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:8108,strictPort:true,fs:{allow:[root]}}});await server.listen();
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=[];
try{for(const device of ['pc','mobile']){
 const context=await browser.newContext({viewport:device==='pc'?{width:1280,height:800}:{width:390,height:844},deviceScaleFactor:1,isMobile:device==='mobile',hasTouch:device==='mobile'});
 const page=await context.newPage();page.setDefaultTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(process.env.MT08A_WATER_DEPTH_TEST==='1')await page.route('**/src/water.js*',async route=>{
  const response=await route.fetch();const s=(await response.text()).replaceAll('depthTest:false','depthTest:true');
  await route.fulfill({response,body:s});
 });
 await page.route('**/src/main.js*',async route=>{
  const response=await route.fetch();let s=await response.text();
  s=s.replace(/async function init\(([^)]*)\)\{/, 'async function init($1){\n let surfacePose=null;');
  s=s.replace('const compass=setupCompass',`window.__surfaceProbe={async view(v){surfacePose=v;for(const id of v.ids)await streamer.ensure(id);streamer.update(v.target[0],v.target[2],{retainIds:[...v.ids,'north']});for(const visual of visuals.values())scheduleDetail(visual,v.ids.includes(visual.entry.id)?v.detail||'full':'overview');await lodQueue;surfacePose=v;return window.__michiDebug.visualAudit();},normal(){surfacePose=null;},snapshot(){return {camera:camera.position.toArray(),stats:window.__michiDebug.renderStats(),tiles:streamer.snapshot()};}};\n const compass=setupCompass`);
  s=s.replace('if(qualityTime>.28){','if(!surfacePose&&qualityTime>.28){');
  s=s.replaceAll("if(mode==='walk'&&!warpController?.busy)streamer.update", "if(!surfacePose&&mode==='walk'&&!warpController?.busy)streamer.update");
  s=s.replace('updateVisibleTiles();\n   playerSprite',`if(surfacePose){camera.position.fromArray(surfacePose.position);camera.lookAt(...surfacePose.target);camera.updateMatrixWorld();scene.fog=null;}\n   updateVisibleTiles();\n   playerSprite`);
  await route.fulfill({response,body:s});
 });
 await page.goto('http://127.0.0.1:8108/?test=1');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');
 for(const c of cases){
  const audit=await page.evaluate(c=>window.__surfaceProbe.view(c),c);await page.waitForFunction(c=>window.__surfaceProbe.snapshot().camera.every((v,i)=>Math.abs(v-c.position[i])<1e-7),c);await page.waitForTimeout(400);assert.deepEqual(errors,[],'Capture instrumentation must not break the game loop');
  await page.screenshot({path:path.join(out,device+'-'+c.name+'.png')});
  const snapshot=await page.evaluate(()=>window.__surfaceProbe.snapshot());rows.push({device,name:c.name,audit,snapshot,errors:[...errors]});
  await fs.writeFile(path.join(out,'captures.json'),JSON.stringify({renderer:'Chromium SwiftShader; actual production geometry and material; test-only fixed camera',rows},null,2));
  console.log(device,c.name);
 }
 await context.close();
}}finally{await browser.close();await server.close();}
