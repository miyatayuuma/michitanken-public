// Compare precomputed static Lambert lighting against Three's live Lambert shader.
// Output inherits the privacy of the input field.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright';
const [rootArg,casesArg,outArg]=process.argv.slice(2),root=path.resolve(rootArg),out=path.resolve(outArg);
const cases=JSON.parse(await fs.readFile(casesArg)).filter(c=>c.detail==='full');await fs.mkdir(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:8122,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.MICHI_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const rows=[];
try{for(const device of ['pc','mobile'])for(const live of [true,false]){
 const context=await browser.newContext({viewport:device==='pc'?{width:1280,height:800}:{width:390,height:844},deviceScaleFactor:1,isMobile:device==='mobile',hasTouch:device==='mobile'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(live)await page.route('**/src/buildings.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace("const group=new THREE.Group();group.name='buildings';","lighting=null;const group=new THREE.Group();group.name='buildings';")});});
 await page.route('**/src/main.js*',async route=>{
  const r=await route.fetch();let s=await r.text();s=s.replace(/async function init\(([^)]*)\)\{/,'async function init($1){let surfacePose=null;');
  s=s.replace('const compass=setupCompass',`window.__lightingProbe={async view(v){surfacePose=v;for(const id of v.ids)await streamer.ensure(id);streamer.update(v.target[0],v.target[2],{retainIds:[...v.ids,'north']});for(const visual of visuals.values())scheduleDetail(visual,'full');await lodQueue;}};const compass=setupCompass`);
  s=s.replace('if(qualityTime>.28){','if(!surfacePose&&qualityTime>.28){').replaceAll("if(mode==='walk'&&!warpController?.busy)streamer.update","if(!surfacePose&&mode==='walk'&&!warpController?.busy)streamer.update");
  s=s.replace('updateVisibleTiles();\n   playerSprite',`if(surfacePose){camera.position.fromArray(surfacePose.position);camera.lookAt(...surfacePose.target);camera.updateMatrixWorld();scene.fog=null;for(const v of visuals.values())for(const o of v.root.children)o.visible=o===v.layers.buildings;avatar.visible=false;poiMarkers?.update({camera,mode:'map',focus:playerState,isFound:()=>false,pulse:()=>0,isWarp:()=>false});}updateVisibleTiles();\n   playerSprite`);
  // Read back just the static building rendering; other animated objects are hidden.
  s=s.replace("if(mode==='walk')renderer.render(scene,camera);",`if(mode==='walk'){if(surfacePose){const hidden=[];for(const o of scene.children)if(o!==camera&&!o.isLight&&!o.name.startsWith('tile-')){hidden.push([o,o.visible]);o.visible=false;}renderer.render(scene,camera);for(const [o,v] of hidden)o.visible=v;}else renderer.render(scene,camera);}`);
  await route.fulfill({response:r,body:s});
 });
 await page.goto('http://127.0.0.1:8122/?test=1');await page.waitForFunction(()=>window.__lightingProbe,{timeout:120000});
 for(const c of cases){await page.evaluate(c=>__lightingProbe.view(c),c);await page.waitForTimeout(400);assert.deepEqual(errors,[]);const file=device+'-'+c.name+'-'+(live?'lambert':'baked')+'.png';await page.screenshot({path:path.join(out,file)});rows.push({device,name:c.name,live,file,errors});}
 await context.close();
}await fs.writeFile(path.join(out,'captures.json'),JSON.stringify({rows},null,2));}finally{await browser.close();await server.close();}
