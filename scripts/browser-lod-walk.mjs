// Native keyboard / touch joystick movement across the actual 95m road-LOD boundary.
// Screencast is observational and can slow frames; performance is measured separately.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {preview} from 'vite';import {chromium} from 'playwright';
const [rootArg,casesArg,outArg]=process.argv.slice(2),root=path.resolve(rootArg),out=path.resolve(outArg),cases=JSON.parse(await fs.readFile(casesArg));await fs.mkdir(out,{recursive:true});
const server=await preview({root,build:{outDir:'public'},preview:{host:'127.0.0.1',port:8124,strictPort:true}});
const browser=await chromium.launch({executablePath:process.env.MICHI_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),rows=[];
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8124/games/michitanken/?test=1');await page.waitForFunction(()=>window.__michiDebug);
 const cdp=await context.newCDPSession(page);let frames=null;
 cdp.on('Page.screencastFrame',e=>{if(frames)frames.push({data:e.data,metadata:e.metadata});void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId});});
 for(const c of cases)for(const running of [false,true])for(const reverseView of [false,true]){
  const name=(mobile?'mobile':'pc')+'-'+c.category+'-'+(running?'run':'walk')+'-'+(reverseView?'back':'front'),folder=path.join(out,name);await fs.mkdir(folder,{recursive:true});
  const point=d=>[c.mid[0]+c.normal[0]*d,c.mid[1]+c.normal[1]*d];
  const initial=point(13),yaw=c.yaw+(reverseView?Math.PI:0);
  await page.evaluate(async({c,initial,yaw})=>{await __michiDebug.ensureTile(c.startTile);if(!__michiDebug.teleport(...initial,yaw))throw Error('Blocked start');await __michiDebug.ensureTile(c.target);}, {c,initial,yaw});
  await page.waitForLoadState('networkidle');await page.waitForTimeout(1000);
  await page.waitForFunction(id=>__michiDebug.renderStats().levels.find(v=>v.id===id)?.level==='overview',c.target);
  const before=await page.evaluate(()=>__michiDebug.renderStats());
  await page.evaluate(()=>{window.__walkSamples=[];window.__walkActive=true;let last;function f(t){if(!__walkActive)return;const s=__michiDebug.state();__walkSamples.push({time:t,dt:last?t-last:0,x:s.x,z:s.z,collision:s.collision,levels:__michiDebug.renderStats().levels});last=t;requestAnimationFrame(f);}requestAnimationFrame(f);});
  frames=[];await cdp.send('Page.startScreencast',{format:'jpeg',quality:76,maxWidth:960,maxHeight:844,everyNthFrame:1});
  let touch=[];
  const stop=async()=>{if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touch=[];}else{await page.keyboard.up('w');await page.keyboard.up('s');await page.keyboard.up('Shift');}};
  const move=async inward=>{
   const forward=inward!==reverseView;
   if(mobile){
    const j=await page.locator('#joystick').boundingBox(),r=await page.locator('#run').boundingBox();assert.ok(j&&r);
    const x=j.x+j.width/2,y=j.y+j.height/2,offset=(forward?-1:1)*j.height*.45;
    touch=[{id:1,x,y:y+offset}];if(running)touch.push({id:2,x:r.x+r.width/2,y:r.y+r.height/2});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch});
   }else{if(running)await page.keyboard.down('Shift');await page.keyboard.down(forward?'w':'s');}
  };
  await move(true);
  await page.waitForFunction(({c})=>{const s=__michiDebug.state();return (s.x-c.mid[0])*c.normal[0]+(s.z-c.mid[1])*c.normal[1]<=-13;},{c});await stop();
  await page.waitForFunction(id=>__michiDebug.renderStats().levels.find(v=>v.id===id)?.level==='full',c.target);await page.waitForTimeout(200);
  const turn=await page.evaluate(()=>({state:__michiDebug.state(),stats:__michiDebug.renderStats(),frame:__walkSamples.length}));
  await move(false);
  await page.waitForFunction(({c})=>{const s=__michiDebug.state();return (s.x-c.mid[0])*c.normal[0]+(s.z-c.mid[1])*c.normal[1]>=13;},{c});await stop();
  await page.waitForFunction(id=>__michiDebug.renderStats().levels.find(v=>v.id===id)?.level==='overview',c.target);await page.waitForTimeout(300);
  await cdp.send('Page.stopScreencast');const captured=frames;frames=null;
  const samples=await page.evaluate(()=>{__walkActive=false;return __walkSamples;});
  const geometry=before.levels.find(v=>v.id===c.target).buildingGeometry;
  assert.ok(geometry?.length);assert.ok(samples.every(s=>JSON.stringify(s.levels.find(v=>v.id===c.target)?.buildingGeometry)===JSON.stringify(geometry)),'Building geometry changed at LOD');
  const transitions=samples.map(s=>s.levels.find(v=>v.id===c.target)?.level).filter((s,i,a)=>i===0||s!==a[i-1]);assert.deepEqual(transitions,['overview','full','overview']);assert.deepEqual(errors,[]);assert.ok(captured.length>=10,'Insufficient continuous frames');
  for(let i=0;i<captured.length;i++){await fs.writeFile(path.join(folder,String(i).padStart(4,'0')+'.jpg'),Buffer.from(captured[i].data,'base64'));delete captured[i].data;}
  const row={name,mobile,running,reverseView,case:c,transitions,buildingGeometryUnchanged:true,before,turn,samples,captured,errors:[...errors],maxRecordedFrameMs:Math.max(...samples.map(s=>s.dt)),performanceAcceptance:'Not inferred from screencast timing; see separate final-build benchmark'};
  await fs.writeFile(path.join(folder,'frames.json'),JSON.stringify(row));rows.push({name,transitions,buildingGeometryUnchanged:true,frames:captured.length,maxRecordedFrameMs:row.maxRecordedFrameMs});
  await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({status:rows.length===24?'CAPTURE_COMPLETE':'IN_PROGRESS',protocol:'95m distance from tile rectangle; quality check every >0.28 simulated seconds, queued road replacement over RAFs; overview->full->overview. PC native W/S/Shift. Mobile native CDP touch joystick and run-button hold. Camera initialized at case yaw, then unchanged during movement. No pose assignment during traversal. All screencast frames and RAF positions retained.',rows},null,2));console.log(JSON.stringify(rows.at(-1)));
 }
 await cdp.detach();await context.close();
}}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
