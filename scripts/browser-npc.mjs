// Only synthetic geometry and generated test pixels are used here.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createServer} from 'vite';import {chromium} from 'playwright';
const root=process.cwd(),out=path.resolve(process.argv[2]||'artifacts/npc-browser');await fs.mkdir(out,{recursive:true});const server=await createServer({root,server:{host:'127.0.0.1',port:8123,strictPort:true}});await server.listen();const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const [name,width,height] of [['desktop',1280,800],['mobile',390,844]]){const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8123/?npcDemo=1&test=1');await page.waitForFunction(()=>document.querySelector('#scene')?.dataset.appReady==='true',null,{timeout:60000});await page.waitForFunction(()=>Number(document.querySelector('#scene').dataset.npcVisible)===2,null,{timeout:30000});await page.screenshot({path:path.join(out,name+'-game.png')});
 for(const [id,kind] of [['kiki','first'],['jiji','again']]){const point=await page.evaluate(id=>window.__michiDebug.npcTargets().find(p=>p.id===id),id);assert.ok(point&&point.x>0&&point.x<width&&point.y>0&&point.y<height,`${id} offscreen`);if(name==='mobile')await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);await page.locator('.npc-dialog:not([hidden])').waitFor();const text=await page.locator('.npc-dialog p').innerText();assert.match(text,kind==='first'?/こんにちは/:/あっちの道/);while(await page.locator('.npc-dialog').isVisible())await page.locator('.npc-dialog button').click();}

 // The retired character ZIP picker must not appear; inspect the new lineup.
 await page.locator('#menu-open').click();
 assert.equal(await page.locator('.npc-settings').count(),0);
 assert.equal(await page.locator('.npc-size-setting').count(),0);
 assert.equal(await page.locator('#notebook-menu input[type=file]').count(),0);
 assert.equal(await page.evaluate(()=>document.querySelector('#world-open')?.parentElement?.id),'notebook-menu');
 assert.equal(await page.locator('body > button').filter({hasText:'ワールド'}).count(),0);
 await page.locator('#npc-compare-open').click();
 await page.locator('.npc-compare-overlay').waitFor();
 assert.ok(await page.locator('.npc-compare-item').count()>=11);
 const playerCanvas=page.locator('.npc-compare-item').first().locator('canvas');
 const firstFrame=await playerCanvas.evaluate(canvas=>canvas.toDataURL());
 await page.waitForTimeout(320);
 const nextFrame=await playerCanvas.evaluate(canvas=>canvas.toDataURL());
 assert.notEqual(firstFrame,nextFrame,'player walk frames must animate in comparison');
 await page.getByRole('button',{name:'一時停止'}).click();
 assert.equal(await page.getByRole('button',{name:'再生'}).count(),1);
 await page.screenshot({path:path.join(out,name+'-size-comparison.png')});
 await page.getByRole('button',{name:'比較を閉じる'}).click();
 await page.locator('#menu-close').click();
 const result=await page.evaluate(async()=>{const THREE=await import('/node_modules/three/build/three.module.js'),{createNpcSystem}=await import('/src/npc.js'),{KIKI_JIJI_DIALOGUES}=await import('/lib/npc.mjs');const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.1,100);camera.position.set(0,2,8);camera.lookAt(0,1,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();const holder=document.createElement('div');holder.style.cssText='position:fixed;left:0;top:0;width:400px;height:400px;z-index:50';document.body.append(holder);const group={groupId:'test-'+Math.random(),spawnAnchor:[0,0],interactionRadius:5,displayRadius:30,movementMode:'fixed',members:[{id:'kiki',offset:[-1,0],height:1.6},{id:'jiji',offset:[1,0],height:.7}],dialogues:KIKI_JIJI_DIALOGUES};const npc=createNpcSystem({scene,container:holder,groups:[group],ground:()=>0,camera});npc.update({dt:.3,playerX:0,playerZ:1,currentMode:'walk'});for(let i=0;i<100&&npc.visibleCount!==2;i++)await new Promise(r=>setTimeout(r,20));if(npc.visibleCount!==2)throw Error('group did not load');const hit=(id)=>{const sprite=scene.getObjectByName('npc-'+id),p=sprite.position.clone();p.y+=sprite.scale.y/2;p.project(camera);return npc.interactAt((p.x+1)*200,(1-p.y)*200,holder.getBoundingClientRect());};if(!hit('kiki'))throw Error('kiki hit failed');const first=holder.querySelector('.npc-dialog strong').textContent;while(npc.talking)npc.advance();if(!hit('jiji'))throw Error('jiji hit failed');const again=holder.querySelector('.npc-dialog strong').textContent;npc.close();npc.update({dt:.3,playerX:100,playerZ:100,currentMode:'walk'});const count=npc.visibleCount;npc.dispose();holder.remove();return {first,again,count};});assert.deepEqual(result,{first:'キキ',again:'キキ',count:0});assert.deepEqual(errors,[]);await context.close();console.log(name,'game, menu, size comparison PASS');}}
finally{await browser.close();await server.close();}
