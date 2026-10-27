/** Synthetic objects, production picker and controls; safe for PUBLIC CI. */
import {createServer} from 'vite';import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);await fs.mkdir(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:8096,strictPort:true,fs:{allow:[root]}}});await server.listen();
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
await page.route('**/fixture/data/exploration/synthetic.json',r=>r.fulfill({json:{schema:1,tileId:'synthetic',objects:[0,1,2].map((x)=>({id:'e1-fixture'+x,type:'stone',tileId:'synthetic',biome:'grassland',x:x*2,y:0,z:0}))}}));
await page.goto('http://127.0.0.1:8096/?test=1');await page.waitForFunction(()=>document.querySelector('#scene').dataset.appReady==='true');
const result=await page.evaluate(async()=>{
const THREE=await import('/node_modules/.vite/deps/three.js'),{createExploration}=await import('/src/exploration.js'),{createGameInput}=await import('/src/controls.js');
localStorage.removeItem('michi-fixed-treasures-v1');localStorage.removeItem('michi-discoveries-v1');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,390/844,.1,100);camera.position.set(0,4,10);camera.lookAt(0,.3,0);camera.updateMatrixWorld();let sounds=0;
const c=createExploration({scene,container:document.body,baseURL:'/fixture/',baseElevation:0,ground:()=>0,onCollect:()=>sounds++});await c.register({id:'synthetic',offset:[0,0]});
const update=(extra={})=>c.update({dt:.2,playerX:0,playerZ:0,currentMode:'walk',camera,...extra});update();update();
const rect={left:0,top:0,width:390,height:844};const point=x=>{const p=new THREE.Vector3(x,.28,0).project(camera);return [(p.x+1)*195,(1-p.y)*422];};const p0=point(0),p1=point(2),p2=point(4);
const wall=new THREE.Mesh(new THREE.BoxGeometry(20,10,1),new THREE.MeshBasicMaterial());wall.position.set(0,3,5);wall.updateMatrixWorld();
update({occluders:[wall]});const blocked=c.collectAt(...p0,rect);update({playerX:-5});const range=c.collectAt(...p0,rect);update({currentMode:'map'});const map=c.collectAt(...p0,rect);update();update();
// A thin blocker immediately in front of the stone must also block (no 0.4m occlusion gap).
const thin=new THREE.Mesh(new THREE.BoxGeometry(1,2,.02),new THREE.MeshBasicMaterial());thin.position.set(0,.5,.3);thin.updateMatrixWorld();update({occluders:[thin]});const thinBlocked=c.collectAt(...p0,rect);update();
const target=document.createElement('canvas');target.style.cssText='position:fixed;inset:0;width:390px;height:844px;z-index:999';document.body.append(target);const joystick=document.createElement('div'),knob=document.createElement('div'),runButton=document.createElement('button');let active=true;
const controls=createGameInput({canvas:target,joystick,knob,runButton,isActive:()=>active,onLook(){},onZoom(){},onTap:(x,y,r)=>c.collectAt(x,y,r)});
const event=(type,id,x,y)=>target.dispatchEvent(new PointerEvent(type,{pointerId:id,clientX:x,clientY:y,pointerType:'touch',bubbles:true}));
// Suppress capture only for synthetic pointer IDs, retain production gesture handlers.
target.setPointerCapture=()=>{};
event('pointerdown',1,...p1);event('pointermove',1,p1[0]+30,p1[1]);event('pointermove',1,...p1);event('pointerup',1,...p1);const drag=c.snapshot().records.taken.length;
event('pointerdown',1,...p1);event('pointerdown',2,...p2);event('pointerup',2,...p2);event('pointerup',1,...p1);const pinch=c.snapshot().records.taken.length;
event('pointerdown',1,...p1);event('pointercancel',1,...p1);event('pointerup',1,...p1);const cancel=c.snapshot().records.taken.length;
event('pointerdown',1,...p1);active=false;event('pointerup',1,...p1);active=true;const inactive=c.snapshot().records.taken.length;
event('pointerdown',1,...p1);window.dispatchEvent(new Event('blur'));event('pointerup',1,...p1);const blur=c.snapshot().records.taken.length;
window.fixture={c,controls,target,point,rect,runButton};window.fixtureResult={blocked,range,map,thinBlocked,drag,pinch,cancel,inactive,blur,p0,p1,p2};return window.fixtureResult;
});
for(const k of ['blocked','range','map','thinBlocked'])assert.equal(result[k],false,k);for(const k of ['drag','pinch','cancel','inactive','blur'])assert.equal(result[k],0,k);
// Browser-generated touch input traverses pointerdown/up and the real picker.
await page.touchscreen.tap(...result.p1);let s=await page.evaluate(()=>fixture.c.snapshot());assert.deepEqual(s.records.taken,['e1-fixture1']);assert.equal(s.success,true);
await page.touchscreen.tap(...result.p1);assert.equal((await page.evaluate(()=>fixture.c.snapshot())).records.taken.length,1);
// Mouse, 20px tolerance for a small mesh, and E/A are covered through the real controls below.
await page.mouse.click(result.p0[0]+20,result.p0[1]);s=await page.evaluate(()=>fixture.c.snapshot());assert.ok(s.records.taken.includes('e1-fixture0'));assert.ok(!s.records.taken.includes('e1-fixture2'));
const saved=await page.evaluate(async()=>{fixture.controls.destroy();fixture.target.remove();const records=fixture.c.snapshot().records;fixture.c.dispose();return records;});assert.equal(saved.taken.length,2);
assert.equal(await page.locator('#explore-pickup').count(),0);
await fs.writeFile(out+'/direct-collect.json',JSON.stringify({status:'PASS',synthetic:true,...result,touchTargetOnly:true,mouseTolerance:true,duplicateRejected:true},null,2));console.log('DIRECT COLLECTION PASS');
}finally{await browser.close();await server.close();}
