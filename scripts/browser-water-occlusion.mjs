// GPU pixel ownership test. Real assets and resulting images must remain PRIVATE.
// Cameras/placements are controlled test scenes, not changes to world data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const [rootArg,outArg]=process.argv.slice(2),root=path.resolve(rootArg),out=path.resolve(outArg);
const real=process.env.MICHI_OCCLUSION_REAL==='1';
await fs.mkdir(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:8116,strictPort:true,fs:{allow:[root]}}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.MICHI_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const html=`<!doctype html><html><body style="margin:0"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {GLTFLoader} from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createWaterLayer} from '/src/water.js';
import {addBuildings} from '/src/buildings.js';
import {buildRoadRibbon,roadSurfaceOptions} from '/lib/road-surface.mjs';
import {createSpriteAvatar} from '/src/player-sprite.js';
const real=${real},W=320,H=320;
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:false});renderer.setSize(W,H);renderer.setClearColor(0,0);document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.1,100);camera.position.set(0,7,14);camera.lookAt(0,2,0);camera.updateMatrixWorld();
scene.add(new THREE.HemisphereLight(0xf5faff,0x83917b,2.1));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-180,320,120);scene.add(sun);
const field={size:500,terrain:{size:500,count:3,min:0,elevations:Array(9).fill(0)},osm:{roads:[],buildings:[],waterAreas:[],waterways:[],railways:[]}};
const loader=new GLTFLoader();
function basic(g,color=0x724b36){return new THREE.Mesh(g,new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide}));}
async function subject(kind){
 let group=new THREE.Group();
 if(kind==='tree'){
  if(real){const gltf=await loader.loadAsync('/assets/nature/tree_default.glb');gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(o.isMesh){const m=new THREE.InstancedMesh(o.geometry,o.material,1);m.setMatrixAt(0,o.matrixWorld);group.add(m);}});}
  else {const crown=basic(new THREE.ConeGeometry(1.6,3.2,6),0x235f49);crown.position.y=3.3;group.add(crown);const trunk=basic(new THREE.CylinderGeometry(.2,.3,2,6));trunk.position.y=1;group.add(trunk);}
 }else if(kind==='building'){
  const layers={};addBuildings({...field,osm:{...field.osm,buildings:[{id:1,height:5,footprint:[[-1,-1],[1,-1],[1,1],[-1,1]]}]}},group,layers);
 }else if(kind==='animal'){
  if(real)group.add((await loader.loadAsync('/assets/wildlife/duck.glb')).scene);
  else {const m=basic(new THREE.SphereGeometry(1.4,10,8),0xddd3a6);m.position.y=1.4;group.add(m);}
 }else if(kind==='player'){
  if(real){const config=await (await fetch('/data/player-sprite.json')).json(),texture=await new THREE.TextureLoader().loadAsync('/'+config.image);const avatar=createSpriteAvatar(config,texture);group=avatar.group;}
  else {const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(10,1,12,30);c.fillRect(2,10,28,8);const m=new THREE.Mesh(new THREE.PlaneGeometry(3,5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,alphaTest:.065,depthTest:true,depthWrite:true,side:THREE.DoubleSide}));m.position.y=2.5;group.add(m);}
 }else if(kind==='bridge'){
  const verts=buildRoadRibbon([-4,0],[4,0],2,field,3,roadSurfaceOptions('full')),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();group.add(basic(g,0xd9d2b5));for(const x of [-2,2]){const pier=basic(new THREE.BoxGeometry(.8,3,.8),0x777777);pier.position.set(x,1.5,0);group.add(pier);}
 }
 group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(group),height=box.max.y-box.min.y;
 if(kind!=='bridge'){group.scale.setScalar(5/height);group.position.y=-box.min.y*5/height;}
 group.traverse(o=>{if(o.isMesh)o.renderOrder=kind==='player'?4:kind==='building'?3:0;});group.updateMatrixWorld(true);return group;
}
const target=new THREE.WebGLRenderTarget(W,H),ray=new THREE.Raycaster();
function pixels(){renderer.setRenderTarget(target);renderer.render(scene,camera);const p=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,p);renderer.setRenderTarget(null);return p;}
function maxDiff(a,b,i){return Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])));}
const rows=[];
for(const kind of ['tree','building','animal','player','bridge']){
 const object=await subject(kind);scene.add(object);
 for(const relation of ['front','back','cross']){
  const [z0,z1]=relation==='front'?[-14,-3]:relation==='back'?[3,9]:[-8,8];
  const s={coverage:[],water:{positions:[-16,2,z0,16,2,z0,-16,2,z1,16,2,z1],indices:[0,2,1,1,2,3],flow:[0,1,0,1,0,1,0,1],station:[0,0,10,10],lateral:[-16,16,-16,16],shore:[10,10,10,10]}};
  const layer=createWaterLayer({...field,surface:s});layer.uniforms.uMotion.value=0;scene.add(layer.group);
  layer.group.visible=false;const obj=pixels();layer.group.visible=true;object.visible=false;const water=pixels();object.visible=true;
  scene.updateMatrixWorld(true);const checks=[];
  for(let y=2;y<H-2;y+=2)for(let x=2;x<W-2;x+=2){const i=(y*W+x)*4;if(obj[i+3]<245||water[i+3]!==255)continue;
   ray.setFromCamera(new THREE.Vector2((x+.5)/W*2-1,(y+.5)/H*2-1),camera);const a=ray.intersectObject(object,true)[0],b=ray.intersectObject(layer.group,true)[0];
   if(!a||!b||Math.abs(a.distance-b.distance)<.02)continue;checks.push({i,front:a.distance<b.distance});
  }
  const metrics=[];
  for(const order of [-5,1,10]){layer.group.children.forEach(m=>m.renderOrder=order);const both=pixels();let front=0,back=0,wrongFront=0,wrongBack=0;
   for(const {i,front:f} of checks){if(f){front++;if(Math.max(...[0,1,2].map(k=>Math.abs(both[i+k]-(obj[i+k]+water[i+k]*(1-obj[i+3]/255)))))>3)wrongFront++;}else{back++;if(maxDiff(both,water,i)>2)wrongBack++;}}
   metrics.push({order,front,back,wrongFront,wrongBack});
  }
  // Negative control on identical prepared geometry, isolates the old depth flags.
  layer.group.children.forEach(m=>{m.renderOrder=10;m.material.depthTest=false;m.material.depthWrite=false;});const broken=pixels();let oldWrongFront=0;
  for(const {i,front:f}of checks)if(f&&maxDiff(broken,obj,i)>2)oldWrongFront++;
  layer.group.children.forEach(m=>{m.renderOrder=1;m.material.depthTest=true;m.material.depthWrite=true;});renderer.render(scene,camera);
  window.capture={kind,relation};await new Promise(resolve=>{window.nextCase=resolve;window.dispatchEvent(new Event('case-ready'));});
  rows.push({kind,relation,metrics,oldWrongFront,geometry:'production water + '+(real?'PRIVATE original assets':'fictional subjects')});
  scene.remove(layer.group);layer.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
 }
 scene.remove(object);
}
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
window.result={status:'COMPLETE',real,rows,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
</script></body></html>`;
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.route('**/__occlusion.html',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:8116/__occlusion.html');
 for(let n=0;n<15;n++){
  await page.waitForFunction(()=>window.capture&&window.nextCase,null,{timeout:90000});const c=await page.evaluate(()=>window.capture);
  await page.locator('canvas').screenshot({path:path.join(out,c.kind+'-'+c.relation+'.png')});
  await page.evaluate(()=>{const f=window.nextCase;window.nextCase=null;window.capture=null;f();});
 }
 await page.waitForFunction(()=>window.result);const result=await page.evaluate(()=>window.result);result.errors=errors;
 await fs.writeFile(path.join(out,'occlusion.json'),JSON.stringify(result,null,2));assert.deepEqual(errors,[]);
 for(const row of result.rows){for(const m of row.metrics){
  if(row.relation!=='back')assert.ok(m.front>10,JSON.stringify(row));
  if(row.relation!=='front')assert.ok(m.back>10,JSON.stringify(row));
  assert.equal(m.wrongFront,0,JSON.stringify(row));assert.equal(m.wrongBack,0,JSON.stringify(row));
 }}
 assert.ok(result.rows.some(r=>r.oldWrongFront>30),'Old depth flags must fail the same GPU test');
 result.status='PASS';await fs.writeFile(path.join(out,'occlusion.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({status:'PASS',cases:result.rows.length,real,oldFailures:result.rows.reduce((n,r)=>n+r.oldWrongFront,0)}));
}finally{await browser.close();await server.close();}
