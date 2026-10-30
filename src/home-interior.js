import * as THREE from 'three';

const color=value=>typeof value==='number'?value:typeof value==='string'?value:0xc9cecc;
const address=s=>{const m=/^([a-z]+)(\d+)$/i.exec(s||'');if(!m)return null;let col=0;for(const ch of m[1].toUpperCase())col=col*26+ch.charCodeAt(0)-64;return [col,+m[2]];};
function cells(ranges){
 const result=new Map();
 for(const text of Array.isArray(ranges)?ranges:String(ranges||'').split(',')){
  const pair=text.trim().split(':'),a=address(pair[0]),b=address(pair[1]||pair[0]);if(!a||!b)continue;
  for(let j=Math.min(a[1],b[1]);j<=Math.max(a[1],b[1]);j++)for(let i=Math.min(a[0],b[0]);i<=Math.max(a[0],b[0]);i++)result.set(i+','+j,[i,j]);
 }
 return [...result.values()];
}

// A data-only scene description. The original game's JS and greeting rules do
// not enter the world ZIP or this generic engine.
export function buildHomeInterior(data){
 if(data?.schema!==1||!Number.isFinite(data?.grid?.width)||!Number.isFinite(data?.grid?.depth)||!Array.isArray(data.floors)||!Array.isArray(data.walls)||!Array.isArray(data.fixtures))throw Error('自宅の屋内データが不正です');
 const W=data.grid.width,D=data.grid.depth,H=data.grid.floorHeight||3;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xf5f8fc);
 scene.add(new THREE.HemisphereLight(0xffffff,0xa9b7a6,2));
 const sunlight=new THREE.DirectionalLight(0xffffff,2);sunlight.position.set(-18,30,14);scene.add(sunlight);
 const geometries=new Set(),materials=new Set(),colliders=[],upperMeshes=[];
 let activeLevel=1;
 const at=(i,j)=>[i-1-W/2+.5,j-1-D/2+.5];
 const mat=c=>{const m=new THREE.MeshStandardMaterial({color:c,roughness:.86,metalness:0});materials.add(m);return m;};
 const material={floor:mat('#e7d5bd'),ceiling:mat('#e8ebea'),wall:mat('#d0d5d1'),gravel:mat('#b9b2a5'),grass:mat('#74ad67'),flower:mat('#73513b')};
 function box(x,y,z,w,h,d,c,blocking=false){const geo=new THREE.BoxGeometry(w,h,d);geometries.add(geo);const mesh=new THREE.Mesh(geo,typeof c==='string'&&material[c]?material[c]:mat(color(c)));mesh.position.set(x,y,z);scene.add(mesh);if(activeLevel===2)upperMeshes.push(mesh);if(blocking)colliders.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,y0:y-h/2,y1:y+h/2});return mesh;}
 const floorMasks=new Map();
 for(const f of data.floors){
  const used=new Map(cells(f.fill).map(([i,j])=>[i+','+j,[i,j]]));
  for(const [i,j] of cells(f.minus||[]))used.delete(i+','+j);
  if(f.level===1||f.level===2){const mask=floorMasks.get(f.level)||new Set();for(const key of used.keys())mask.add(key);floorMasks.set(f.level,mask);}
  // Leave the roof out of the playable interior so the camera can see both floors.
  if(f.level===3)continue;
  if(!used.size)continue;
  const geometry=new THREE.BoxGeometry(1,f.thickness||.12,1);geometries.add(geometry);
  const floor=new THREE.InstancedMesh(geometry,material[f.style||'floor']||material.floor,used.size),dummy=new THREE.Object3D();let n=0;
  for(const [i,j] of used.values()){const [x,z]=at(i,j);dummy.position.set(x,(f.y||0)-(f.thickness||.12)/2,z);dummy.updateMatrix();floor.setMatrixAt(n++,dummy.matrix);}
  floor.instanceMatrix.needsUpdate=true;scene.add(floor);if(f.level===2)upperMeshes.push(floor);
 }
 for(const wall of data.walls){
  if(wall.invisible||wall.passThrough)continue;
  activeLevel=wall.level===2?2:1;
  const y=(wall.level===2?H:0),height=wall.height||H,edge=wall.edge||'left';
  for(const [i,j] of cells(wall.range)){
   const [x,z]=at(i,j),th=wall.thickness||.18;
   if(edge==='left'||edge==='right')box(x+(edge==='right'?.5:-.5),y+height/2,z,th,height,1,wall.color||'#c9cecc',true);
   else box(x,y+height/2,z+(edge==='bottom'?.5:-.5),1,height,th,wall.color||'#c9cecc',true);
  }
 }
 const stairs=[];
 activeLevel=1;
 for(const stair of data.stairs||[]){
  const a=address(stair.from),b=address(stair.to);if(!a||!b)continue;
  const [ax,az]=at(...a),[bx,bz]=at(...b),steps=stair.steps||13;
  stairs.push({ax,az,bx,bz,width:stair.width||1});
  for(let i=0;i<steps;i++){const t=(i+.5)/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t,stepH=H*(i+1)/steps;
   box(x,stepH-.05,z,Math.max(.35,Math.abs(bx-ax)/steps+.12),.10,Math.max(.7,Math.abs(bz-az)/steps+.12),'#b88b5e');}
 }
 const palette={bed:'#e4c6bd',sofa:'#596976',shelf:'#b8a48b',tv:'#343d49',toilet:'#f1eff0',fridge:'#f0f3f8',washer:'#eeeeee',dining:'#b48b6f',kitchen:'#e7eaf0',bathtub:'#f4f6f6',clock:'#e5d4ab'};
 for(const item of data.fixtures){
  activeLevel=item.level===2?2:1;
  const cs=cells(item.range);if(!cs.length)continue;
  const x=cs.reduce((s,v)=>s+at(...v)[0],0)/cs.length,z=cs.reduce((s,v)=>s+at(...v)[1],0)/cs.length,level=item.level===2?H:0;
  const xs=cs.map(v=>v[0]),zs=cs.map(v=>v[1]),w=Math.max(1,...xs)-Math.min(...xs)+1,d=Math.max(1,...zs)-Math.min(...zs)+1;
  const type=item.kind,base=palette[type]||'#d2c5ae';
  if(type==='bed'){box(x,level+.32,z,Math.max(1.7,w),.45,Math.max(2.2,d),base,true);box(x,level+.62,z-.6,Math.max(1.4,w*.7),.13,.55,'#fff7e9');}
  else if(type==='sofa'){box(x,level+.33,z,Math.max(1.2,w),.48,Math.max(1,d),base,true);box(x,level+.67,z-.4,Math.max(1.2,w),.75,.18,base);}
  else if(type==='tv'){box(x,level+1.35,z,Math.max(1.2,w),.75,.10,base);}
  else if(type==='shelf'){box(x,level+.9,z,Math.max(.5,w),1.8,Math.max(.3,d),base,true);}
  else if(type==='dining'){box(x,level+.75,z,Math.max(1.5,w),.14,Math.max(1.2,d),base,true);}
  else if(type==='toilet'){box(x,level+.33,z,.65,.65,.85,base,true);}
  else if(type==='fridge'){box(x,level+1.05,z,Math.max(.8,w),2.1,Math.max(.65,d),base,true);}
  else if(type==='washer'){box(x,level+.7,z,.85,1.4,.85,base,true);}
  else if(type==='kitchen'){box(x,level+.45,z,Math.max(.7,w),.9,Math.max(.7,d),base,true);}
  else if(type==='bathtub'){box(x,level+.35,z,Math.max(1,w),.7,Math.max(1.5,d),base,true);}
  else if(type==='clock'){const geo=new THREE.CylinderGeometry(.35,.35,.08,24);geometries.add(geo);const mesh=new THREE.Mesh(geo,mat(base));mesh.rotation.x=Math.PI/2;mesh.position.set(x,level+2.2,z);scene.add(mesh);}
 }
 activeLevel=1;
 const random=(()=>{let seed=1234;return()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;})();
 for(const garden of data.garden||[]){
  const cs=cells(garden.range);if(!cs.length)continue;
  if(['grass','gravel','flower'].includes(garden.style)){
   const geometry=new THREE.BoxGeometry(1,.06,1);geometries.add(geometry);
   const surface=new THREE.InstancedMesh(geometry,material[garden.style],cs.length),dummy=new THREE.Object3D();
   cs.forEach(([i,j],n)=>{const [x,z]=at(i,j);dummy.position.set(x,garden.y??-.96,z);dummy.updateMatrix();surface.setMatrixAt(n,dummy.matrix);});
   surface.instanceMatrix.needsUpdate=true;scene.add(surface);
  }
  if(garden.style==='trees'||garden.style==='flowers'){
   for(let i=0;i<Math.min(garden.count||15,80);i++){
    const [j,k]=cs[Math.floor(random()*cs.length)],p=at(j,k),t= garden.style==='trees';
    const geo=t?new THREE.ConeGeometry(.5,2.2,6):new THREE.SphereGeometry(.13,5,4);geometries.add(geo);
    const mesh=new THREE.Mesh(geo,mat(t?'#44835b':['#f2c34d','#d77ca5','#bd93ec'][i%3]));mesh.position.set(p[0]+(random()-.5)*.7,(garden.y??-.9)+(t?1.1:.15),p[1]+(random()-.5)*.7);scene.add(mesh);
   }
  }
 }
 const state={x:-10.5,z:-.5,y:0,moving:false,facing:0},spawn=Array.isArray(data.spawn)&&data.spawn.length===2?data.spawn:[-10.5,-.5];state.x=spawn[0];state.z=spawn[1];
 const updateUpper=()=>{for(const mesh of upperMeshes)mesh.visible=state.y>H*.55;};updateUpper();
 const inside=(x,z,level)=>{const i=Math.floor(x+W/2)+1,j=Math.floor(z+D/2)+1;return floorMasks.get(level)?.has(i+','+j)||false;};
 function step(intent,yaw,dt){
  const right=Number(intent.right)||0,forward=Number(intent.forward)||0,speed=(intent.run?4.2:2.4)*Math.min(dt,.06),dx=(right*Math.cos(yaw)-forward*Math.sin(yaw))*speed,dz=(-right*Math.sin(yaw)-forward*Math.cos(yaw))*speed;
  let nx=state.x+dx,nz=state.z+dz,ny=state.y;
  for(const s of stairs){const vx=s.bx-s.ax,vz=s.bz-s.az,len=vx*vx+vz*vz,t=Math.max(0,Math.min(1,((nx-s.ax)*vx+(nz-s.az)*vz)/Math.max(.01,len))),distance=Math.hypot(nx-s.ax-t*vx,nz-s.az-t*vz);if(distance<s.width*.8){ny=t*H;break;}}
  if(ny>H*.85&&inside(nx,nz,2))ny=H;else if(ny<H*.15&&inside(nx,nz,1))ny=0;
  const level=ny>H*.6?2:1;
  const blocked=colliders.some(c=>ny+1.2>c.y0&&ny+.1<c.y1&&nx>c.x0-.22&&nx<c.x1+.22&&nz>c.z0-.22&&nz<c.z1+.22);
  if(!blocked&&(inside(nx,nz,level)||stairs.some(s=>Math.hypot(nx-s.ax,nz-s.az)<7&&ny>0&&ny<H))){state.x=nx;state.z=nz;state.y=ny;}
  state.moving=Math.abs(right)+Math.abs(forward)>.05;state.facing=yaw;updateUpper();
  return state;
 }
 return {scene,state,step,dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}
