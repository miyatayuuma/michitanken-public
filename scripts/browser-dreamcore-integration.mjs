import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {preview} from 'vite';
import {chromium} from 'playwright';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const server=await preview({root,build:{outDir:'public'},preview:{host:'127.0.0.1',port:8085,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});const rows=[];
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(window===window.top)window.__pad={connected:true,mapping:'standard',id:'synthetic GC201-equivalent',index:0,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.top.__pad]});});
 await page.goto('http://127.0.0.1:8085/play.html?game=michitanken&test=1');
 await page.waitForFunction(()=>{const f=document.querySelector('#game-frame');return f?.contentWindow?.document.querySelector('#scene')?.dataset.appReady==='true';},null,{timeout:90000});
 const frame=page.frames().find(f=>f.url().includes('/games/michitanken/'));assert.ok(frame);
 // The launcher does not forward its query string, so explicitly enable test hooks in the child.
 await frame.goto(frame.url().replace(/\?.*$/,'')+'?test=1');await frame.waitForFunction(()=>window.__michiDebug&&document.querySelector('#scene').dataset.appReady==='true');
 assert.equal(await frame.locator('#scene').getAttribute('data-avatar-kind'),'sprite');assert.equal((await frame.evaluate(()=>window.__michiDebug.poi())).total,4);
 const start=await frame.evaluate(()=>window.__michiDebug.state());await page.waitForTimeout(400);await page.evaluate(()=>window.__pad.axes[0]=.7);await frame.waitForFunction(p=>{const s=window.__michiDebug.state();return Math.hypot(s.x-p.x,s.z-p.z)>.3;},start);await page.evaluate(()=>window.__pad.axes[0]=0);
 await page.evaluate(()=>{window.__pad.buttons[0]={pressed:true,value:1};});await frame.waitForFunction(()=>document.querySelector('#mode').textContent==='歩く');await page.evaluate(()=>{window.__pad.buttons[0]={pressed:false,value:0};});
 await frame.waitForFunction(()=>document.querySelector('#scene').dataset.overviewReady==='true',null,{timeout:90000});
 // Resume walking, then exercise the same parent's shared pad with X/Y/B.
 await page.evaluate(()=>window.__pad.buttons[0]={pressed:true,value:1});await frame.waitForFunction(()=>document.querySelector('#app').dataset.mode==='walk');await page.evaluate(()=>window.__pad.buttons[0]={pressed:false,value:0});await page.waitForTimeout(300);
 const treasure=await frame.evaluate(async()=>{const m=await(await fetch('data/tiles.json')).json();for(const e of m.tiles){const d=await(await fetch('data/exploration/'+e.id+'.json')).json();const p=d.objects.find(p=>p.type==='stone');if(p)return p;}});
 await frame.evaluate(async p=>{await window.__michiDebug.ensureTile(p.tileId);if(!window.__michiDebug.teleport(p.x,p.z))throw Error('Parent pickup setup failed');},treasure);await frame.waitForSelector('#explore-pickup:not([hidden])');
 await page.evaluate(()=>window.__pad.buttons[2]={pressed:true,value:1});await frame.waitForFunction(id=>window.__michiDebug.exploration().records.taken.includes(id),treasure.id);await page.evaluate(()=>window.__pad.buttons[2]={pressed:false,value:0});await page.waitForTimeout(250);
 await page.evaluate(()=>window.__pad.buttons[3]={pressed:true,value:1});await frame.waitForSelector('#explore-journal:not([hidden])');await page.evaluate(()=>window.__pad.buttons[3]={pressed:false,value:0});await page.waitForTimeout(250);await page.evaluate(()=>window.__pad.buttons[1]={pressed:true,value:1});await frame.waitForSelector('#explore-journal[hidden]',{state:'attached'});await page.evaluate(()=>window.__pad.buttons[1]={pressed:false,value:0});
 const saved=await frame.evaluate(()=>window.__michiDebug.exploration().records.counts);await frame.reload();await frame.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true');assert.deepEqual(await frame.evaluate(()=>window.__michiDebug.exploration().records.counts),saved);
 await page.locator('#home').click({noWaitAfter:true});await page.waitForURL('http://127.0.0.1:8085/',{waitUntil:'commit'});
 assert.deepEqual(errors,[]);rows.push({mobile,subdirectoryBuild:true,originalSprite:true,poiRegistry:4,syntheticControllerMovement:true,parentAModeRelay:true,parentXPickup:true,parentYRecords:true,reloadPersistence:true,errors});await context.close();
}}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
await fs.writeFile(out,JSON.stringify({status:'PASS',rows},null,2));
console.log(JSON.stringify({status:'PASS',devices:2,subdirectoryBuild:true}));
