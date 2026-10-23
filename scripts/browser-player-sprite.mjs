import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs';
import {renderedFootHeight} from '../lib/avatar-ground.mjs';
const field=JSON.parse(fs.readFileSync(new URL('../public/data/field.json',import.meta.url),'utf8'));
const origin=process.env.MICHI_TEST_ORIGIN||'http://127.0.0.1:8080';
// Synthetic colored rectangles only: no private artwork or geographic fixtures.
const config={schema:1,image:'assets/synthetic-player.svg',width:90,height:50,pixelsPerUnit:18,stride:2.8,
 frames:[{rect:[1,1,22,43],pivot:[11,42]},{rect:[30,2,25,44],pivot:[12,43]},
 {rect:[61,3,27,45],pivot:[13,44]}],animations:{idle:[0],walk:[0,1,2]}};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="90" height="50">'+
 ['#f22','#2f2','#22f'].map((color,i)=>`<rect x="${config.frames[i].rect[0]+2}" y="6" width="18" height="36" fill="${color}"/>`).join('')+'</svg>';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{
 // Actual GPU depth/alpha check with synthetic texels and a foreground wall.
 const raster=await browser.newPage();await raster.goto(origin);
 const pixels=await raster.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {createSpriteAvatar}=await import('/src/player-sprite.js');
  const data=new Uint8Array(8*8*4);
  for(let i=0;i<64;i++)data.set([255,0,0,i%8<2?0:255],i*4);
  const texture=new T.DataTexture(data,8,8);texture.needsUpdate=true;
  const a=createSpriteAvatar({schema:1,image:'assets/test.png',width:8,height:8,pixelsPerUnit:8,stride:2,
   frames:[{rect:[0,0,8,8],pivot:[4,8]}],animations:{idle:[0],walk:[0]}},texture);
  a.group.traverse(o=>{if(o.isMesh)o.renderOrder=4;});
  const scene=new T.Scene();scene.background=new T.Color(0x00ff00);scene.add(a.group);
  const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.set(0,.5,3);camera.lookAt(0,.5,0);
  const wall=new T.Mesh(new T.BoxGeometry(.4,.4,.2),new T.MeshBasicMaterial({color:0x0000ff}));
  wall.position.set(0,.5,1);wall.renderOrder=3;scene.add(wall);
  const r=new T.WebGLRenderer({preserveDrawingBuffer:true});r.setSize(128,128);
  const read=(x,y)=>{const p=new Uint8Array(4);r.getContext().readPixels(x,y,1,1,r.getContext().RGBA,r.getContext().UNSIGNED_BYTE,p);return [...p];};
  r.render(scene,camera);const foreground=read(64,64),transparent=read(35,64);
  wall.position.z=-1;r.render(scene,camera);const background=read(64,64);
  a.dispose();wall.geometry.dispose();wall.material.dispose();r.dispose();
  return {foreground,background,transparent};
 });
 assert.deepEqual(pixels.foreground,[0,0,255,255],'foreground building must occlude the sprite');
 assert.deepEqual(pixels.background,[255,0,0,255],'sprite must occlude a building behind it');
 assert.deepEqual(pixels.transparent,[0,255,0,255],'transparent texels must expose the ground');
 await raster.close();console.log('Synthetic GPU alpha and front/back depth acceptance: PASS');
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__pad={connected:true,mapping:'standard',id:'synthetic standard controller',index:0,axes:[0,0,0,0],
    buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
   Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__pad]});
  });
  await page.route('**/data/player-sprite.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(config)}));
  await page.route('**/assets/synthetic-player.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
  await page.goto(origin+'/?test=1');
  await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');
  assert.equal(await page.locator('#scene').getAttribute('data-avatar-kind'),'sprite');
  const before=await page.evaluate(()=>window.__michiDebug.state());
  await page.keyboard.down('w');
  await page.waitForFunction(()=>window.__michiDebug.avatar().active);
  const frames=new Set();
  for(let i=0;i<12;i++){frames.add(await page.evaluate(()=>window.__michiDebug.avatar().frame));await page.waitForTimeout(60);}
  await page.keyboard.up('w');
  await page.waitForFunction(()=>!window.__michiDebug.avatar().active);
  assert.ok(frames.size>=2,'actual walking must advance frames');
  const state=await page.evaluate(()=>window.__michiDebug.state()),avatar=await page.evaluate(()=>window.__michiDebug.avatar());
  assert.ok(Math.hypot(state.x-before.x,state.z-before.z)>.1);
  assert.equal(avatar.position[0],state.x);assert.equal(avatar.position[2],state.z);
  assert.ok(Math.abs(avatar.position[1]-renderedFootHeight(field,state.x,state.z,field.terrain.min))<1e-8);
  assert.equal(avatar.frame,0);
  assert.equal(avatar.depthTest,true);assert.equal(avatar.depthWrite,true);
  if(mobile){
   const box=await page.locator('#joystick').boundingBox();
   const touch=await context.newCDPSession(page);
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height*.15}]});
   await page.waitForFunction(()=>window.__michiDebug.avatar().active);
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await touch.detach();
   await page.waitForFunction(()=>!window.__michiDebug.avatar().active);
  }
  await page.evaluate(()=>{window.__pad.axes[0]=.65;});
  await page.waitForFunction(()=>window.__michiDebug.avatar().active);
  await page.evaluate(()=>{window.__pad.connected=false;});
  await page.waitForFunction(()=>!window.__michiDebug.avatar().active);
  await page.locator('#mode').click();await page.waitForFunction(()=>document.querySelector('#scene').dataset.overviewReady==='true');
  assert.equal((await page.evaluate(()=>window.__michiDebug.avatar())).frame,0);
  await page.locator('#mode').click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',mobile,frames:[...frames],groundContact:true,keyboard:true,touch:mobile,syntheticGamepad:true}));
  await context.close();
 }
}finally{await browser.close();}
