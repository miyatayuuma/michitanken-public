/** All output inherits the input map's visibility. Real inputs MUST use a private output directory. */
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright';
import {createExplorationMapStore} from '../lib/exploration-map.mjs';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);await fs.mkdir(out,{recursive:true});
const data=JSON.parse(await fs.readFile(root+'/public/data/exploration-map.json')),pois=JSON.parse(await fs.readFile(root+'/public/data/pois.json')),b=data.bounds;
const mid=ring=>ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]);
const area=ring=>Math.abs(ring.reduce((n,p,i)=>{const q=ring[(i+1)%ring.length];return n+p[0]*q[1]-q[0]*p[1];},0));
const river=data.lines.filter(l=>l.kind==='river').sort((a,b)=>b.points.length-a.points.length)[0];
const park=data.areas.filter(a=>a.kind==='green'||a.kind==='wood').sort((a,b)=>area(b.ring)-area(a.ring))[0];
const roads=data.lines.filter(l=>l.kind==='road');
const density=Array.from({length:36},(_,i)=>{const p=[b.minX+(i%6+.5)*(b.maxX-b.minX)/6,b.minZ+(Math.floor(i/6)+.5)*(b.maxZ-b.minZ)/6];return {p,n:roads.filter(l=>l.points.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<240)).length};}).sort((a,b)=>b.n-a.n)[0];
const centers={roads:density.p,river:river?river.points[Math.floor(river.points.length/2)]:density.p,park:park?mid(park.ring):density.p};
const saved={};for(const state of ['initial','partial','broad']){let value;const store=createExplorationMapStore({bounds:b,ids:pois.points.map(p=>p.id),storage:{getItem:()=>null,setItem:(k,v)=>value=v}});
 store.reveal((b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2);
 if(state!=='initial')for(const p of Object.values(centers)){for(let dx=-140;dx<=140;dx+=50)store.reveal(p[0]+dx,p[1]);}
 if(state==='broad')for(let z=b.minZ;z<b.maxZ;z+=100)for(let x=b.minX;x<b.minX+.7*(b.maxX-b.minX);x+=75)store.reveal(x,z);
 for(const p of pois.points)if(store.isExplored(p.position[0],p.position[2]))store.discover(p.id);store.flush();saved[state]=value;
}
const server=await createServer({root,server:{host:'127.0.0.1',port:8101,strictPort:true,fs:{allow:[root]}}});await server.listen();
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const rows=[];
try{for(const [device,width,height] of [['desktop',1280,800],['portrait',390,844],['landscape',844,390]])for(const state of ['initial','partial','broad'])for(const style of ['A','B','C']){
 const context=await browser.newContext({viewport:{width,height},hasTouch:device!=='desktop',isMobile:device!=='desktop',deviceScaleFactor:device==='portrait'?2:1});
 await context.addInitScript(v=>localStorage.setItem('michi.explored.v1',v),saved[state]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
 await page.goto('http://127.0.0.1:8101/?test=1&terrain='+style);await page.waitForFunction(()=>document.querySelector('#scene').dataset.appReady==='true');await page.keyboard.press('m');
 const get=()=>page.evaluate(()=>window.__michiDebug.map());const start=await get();assert.equal(start.terrainStyle,style);const player=await page.evaluate(()=>window.__michiDebug.state());
 for(const zoom of [1,2,4]){while((await get()).view.zoom<zoom)await page.locator('#map-plus').click();
  for(const [terrain,p] of Object.entries(centers)){const m=await get(),v=m.view,inset=Math.min(24,v.side*.2),fraction=1-2*inset/v.side;const q={x:v.left+v.side/2+(inset/v.side+(p[0]-b.minX)/(b.maxX-b.minX)*fraction-.5)*v.side*v.zoom+v.panX,y:v.top+v.side/2+(inset/v.side+(p[1]-b.minZ)/(b.maxZ-b.minZ)*fraction-.5)*v.side*v.zoom+v.panY};
   const box=await page.locator('#exploration-map canvas').boundingBox(),cx=box.x+v.left+v.side/2,cy=box.y+v.top+v.side/2;
   if(zoom>1){await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+v.left+v.side/2-q.x,cy+v.top+v.side/2-q.y,{steps:4});await page.mouse.up();}
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const before=await get();await page.waitForTimeout(50);const after=await get();assert.equal(after.drawCount,before.drawCount,'idle redraw');assert.deepEqual(after.found,start.found);assert.deepEqual(after.cells,start.cells);assert.deepEqual(after.unlocked,start.unlocked);assert.equal(after.marker.hitRadius,22);assert.equal(after.selected,null);
   const file=[style,device,state,'x'+zoom,terrain].join('-')+'.png';await page.screenshot({path:out+'/'+file});
   rows.push({style,device,state,zoom,terrain,file,explored:after.cells.split('1').length-1,total:after.cells.length,found:after.found.length,unlocked:after.unlocked.length,idleRedraws:after.drawCount-before.drawCount,view:after.view,drawMs:after.drawMs,currentPositionInView:(()=>{const x=v.left+v.side/2+(inset/v.side+(player.x-b.minX)/(b.maxX-b.minX)*fraction-.5)*v.side*v.zoom+after.view.panX,y=v.top+v.side/2+(inset/v.side+(player.z-b.minZ)/(b.maxZ-b.minZ)*fraction-.5)*v.side*v.zoom+after.view.panY;return x>=v.left&&x<=v.left+v.side&&y>=v.top&&y<=v.top+v.side;})()});
  }
 }assert.deepEqual(errors,[]);await context.close();console.log(device,state,style,'9 screenshots PASS');await fs.writeFile(out+'/matrix.json',JSON.stringify({status:'IN_PROGRESS',centers,rows},null,2));
}assert.equal(rows.length,243);await fs.writeFile(out+'/matrix.json',JSON.stringify({status:'PASS',protocol:'27 state/zoom/device combinations per style; all three terrain centers within each =81 captures per style. Browser screenshots, seeded map fixtures, no physical device acceptance.',centers,rows},null,2));
}finally{await browser.close();await server.close();}
