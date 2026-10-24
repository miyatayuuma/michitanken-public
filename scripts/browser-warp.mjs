import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createServer} from 'vite';import {chromium} from 'playwright';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);await fs.mkdir(out,{recursive:true});const warps=JSON.parse(await fs.readFile(path.join(root,'public/data/warps.json'))),m=JSON.parse(await fs.readFile(path.join(root,'public/data/tiles.json')));
const server=await createServer({root,server:{host:'127.0.0.1',port:8087,strictPort:true,fs:{allow:[root]}}});await server.listen();const browser=await chromium.launch({args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const rows=[];
try{for(const mobile of [false,true]){const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8087/?test=1');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');
 const state=()=>page.evaluate(()=>window.__michiDebug.state());const avatar=()=>page.evaluate(()=>window.__michiDebug.avatar());const start=await state();const character=(await avatar()).character;
 await page.keyboard.press('c');assert.notEqual((await avatar()).character,character);const after=await state();assert.equal(start.x,after.x);assert.equal(start.z,after.z);
 await page.locator('#character-switch').click();assert.equal((await avatar()).character,character);
 const target=warps.points.find(p=>p.landing.confirmed);assert.ok(target);const [x,,z]=target.landing.position;
 await page.keyboard.press('m');assert.equal((await page.evaluate(id=>window.__michiDebug.warp(id),target.id)).ok,false);await page.keyboard.press('Escape');
 await page.evaluate(async ({x,z,m})=>{const ids=m.tiles.filter(t=>Math.abs(t.offset[0]-x)<=270&&Math.abs(t.offset[1]-z)<=270).map(t=>t.id);await Promise.all(ids.map(id=>window.__michiDebug.ensureTile(id)));if(!window.__michiDebug.teleport(x,z))throw Error('fixture setup');},{x,z,m});
 await page.waitForFunction(id=>window.__michiDebug.map().unlocked.includes(id),target.id);
 const unlocked=await page.evaluate(()=>window.__michiDebug.map().unlocked);await page.reload();await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');assert.deepEqual(await page.evaluate(()=>window.__michiDebug.map().unlocked),unlocked);
 await page.keyboard.press('m');const frozen=await state();await page.keyboard.press('c');assert.equal((await avatar()).character,character);
 await page.keyboard.down('w');await page.waitForTimeout(200);await page.keyboard.up('w');assert.equal((await state()).x,frozen.x);assert.equal((await state()).z,frozen.z);
 // Move the pointer to the exact fictional marker; selection alone cannot move.
 const box=await page.locator('#exploration-map canvas').boundingBox();const side=Math.min(box.width-28,box.height-124),left=(box.width-side)/2,top=Math.max(10,(box.height-110-side)/2);const minX=Math.min(...m.tiles.map(t=>t.offset[0]-250)),minZ=Math.min(...m.tiles.map(t=>t.offset[1]-250));const span=2500;
 const click={x:box.x+left+(x-minX)/span*side,y:box.y+top+(z-minZ)/span*side};
 if(mobile)await page.touchscreen.tap(click.x,click.y);else await page.mouse.click(click.x,click.y);
 assert.equal((await state()).x,frozen.x);assert.equal(await page.locator('#map-warp').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#map-warp').isVisible(),false);assert.equal(await page.evaluate(()=>window.__michiDebug.map().open),true);
 if(mobile)await page.touchscreen.tap(click.x,click.y);else await page.mouse.click(click.x,click.y);await page.locator('#map-warp').click();await page.waitForFunction(x=>Math.abs(window.__michiDebug.state().x-x)<.01,x);assert.equal(await page.evaluate(()=>window.__michiDebug.map().open),false);assert.equal(await page.evaluate(()=>window.__michiDebug.warpBusy()),false);
 await page.screenshot({path:path.join(out,(mobile?'mobile':'desktop')+'-warp.png')});
 // Saved discovery remains usable, but a failed destination load cannot move the player or camera.
 await page.reload();await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');await page.keyboard.press('m');
 const original=await state(),camera=await page.evaluate(()=>window.__michiDebug.camera());
 await page.route('**/data/tiles/*.json',route=>route.abort());
 const failure=await page.evaluate(id=>window.__michiDebug.warp(id),target.id);assert.equal(failure.ok,false);assert.equal((await state()).x,original.x);assert.deepEqual(await page.evaluate(()=>window.__michiDebug.camera()),camera);
 await page.unroute('**/data/tiles/*.json');
 await page.route('**/data/tiles/*.json',async route=>{await new Promise(r=>setTimeout(r,600));await route.continue().catch(()=>{});});
 await page.evaluate(id=>{window.warpResult=window.__michiDebug.warp(id);},target.id);await page.waitForFunction(()=>window.__michiDebug.warpBusy());await page.keyboard.press('Escape');const cancelled=await page.evaluate(()=>window.warpResult);assert.equal(cancelled.ok,false);await page.waitForTimeout(800);assert.equal((await state()).x,original.x);assert.deepEqual(await page.evaluate(()=>window.__michiDebug.camera()),camera);assert.equal(await page.evaluate(()=>window.__michiDebug.warpBusy()),false);
 await page.unroute('**/data/tiles/*.json');
 assert.deepEqual(errors,[]);rows.push({mobile,characterSwitch:true,positionPreserved:true,twoStep:true,saveRestore:true,undiscoveredRejected:true,warp:true,loadFailure:true,cancelLateResult:true,cameraPreserved:true,errors});await context.close();}
}finally{await browser.close();await server.close();}await fs.writeFile(path.join(out,'browser-warp.json'),JSON.stringify({status:'PASS',physicalDevice:'UNVERIFIED',renderer:'SwiftShader',rows},null,2));console.log(JSON.stringify({status:'PASS',rows}));
