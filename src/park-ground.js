import * as THREE from 'three';
import {terrainMeshHeight} from '../lib/geo.mjs';

// Clip park polygons to the same triangular DEM faces as the ground, so the
// overlay stays parallel to the terrain even where a cell changes slope.
function clip(poly, signed){
 const out=[];if(poly.length<3)return out;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=signed(a),db=signed(b),ia=da>=-1e-8,ib=db>=-1e-8;
  if(ia&&ib)out.push(b);
  else if(ia!==ib){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);if(ib)out.push(b);}
 }
 return out;
}
export function addParkGround(field,overlay,parent){
 const batches=[[],[],[]],terrain=field.terrain,half=terrain.size/2,cell=terrain.size/(terrain.count-1);
 for(const area of overlay.areas||[]){
  if(area.kind!=='park'||!Array.isArray(area.ring)||area.ring.length<3)continue;
  const shape=new THREE.Shape();area.ring.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
  for(const ring of area.holes||[]){if(ring.length<3)continue;const hole=new THREE.Path();ring.forEach(([x,z],i)=>i?hole.lineTo(x,z):hole.moveTo(x,z));hole.closePath();shape.holes.push(hole);}
  const source=new THREE.ShapeGeometry(shape),pos=source.getAttribute('position'),idx=source.index;
  let hash=0;for(const c of String(area.id))hash=(hash*31+c.charCodeAt(0))>>>0;
  const out=batches[hash%3],read=i=>[pos.getX(i),pos.getY(i)],index=n=>Math.max(0,Math.min(terrain.count-2,Math.floor((n+half)/cell)));
  function emit(poly){
   if(poly.length<3)return;
   for(let j=1;j<poly.length-1;j++){
    let [a,b,c]=[poly[0],poly[j],poly[j+1]];
    const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    if(Math.abs(cross)<1e-8)continue;
    // In X/Z coordinates a negative cross gives an upward-facing triangle.
    if(cross>0)[b,c]=[c,b];
    for(const [x,z] of [a,b,c])out.push(x,terrainMeshHeight(terrain,x,z)-terrain.min+.09,z);
   }
  }
  for(let i=0;i<(idx?idx.count:pos.count);i+=3){
   const tri=[read(idx?idx.getX(i):i),read(idx?idx.getX(i+1):i+1),read(idx?idx.getX(i+2):i+2)];
   const xs=tri.map(p=>p[0]),zs=tri.map(p=>p[1]);
   for(let ix=index(Math.min(...xs));ix<=index(Math.max(...xs));ix++)for(let iz=index(Math.min(...zs));iz<=index(Math.max(...zs));iz++){
    const x0=-half+ix*cell,x1=x0+cell,z0=-half+iz*cell,z1=z0+cell;
    let p=tri;for(const plane of [p=>p[0]-x0,p=>x1-p[0],p=>p[1]-z0,p=>z1-p[1]])p=clip(p,plane);
    if(p.length<3)continue;
    const diagonal=x0+z1;
    emit(clip(p,p=>diagonal-p[0]-p[1]));emit(clip(p,p=>p[0]+p[1]-diagonal));
   }
  }
  source.dispose();
 }
 const colors=[0x8eb477,0x9abd81,0x84aa72];
 batches.forEach((vertices,i)=>{if(!vertices.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const normals=new Float32Array(vertices.length);for(let j=1;j<normals.length;j+=3)normals[j]=1;geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:colors[i],side:THREE.FrontSide}));mesh.name='mapped-park-ground';mesh.raycast=()=>{};parent.add(mesh);});
}
