import * as THREE from 'three';
import {terrainMeshHeight} from '../lib/geo.mjs';

// Static, translucent ground decals: no shadow map or per-frame shadow pass.
let texture;
function shadowTexture(){
 if(texture)return texture;
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
 const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,5,32,32,32);
 g.addColorStop(0,'rgba(24,34,27,.58)');g.addColorStop(.48,'rgba(24,34,27,.34)');g.addColorStop(1,'rgba(24,34,27,0)');
 ctx.fillStyle=g;ctx.fillRect(0,0,64,64);texture=new THREE.CanvasTexture(canvas);return texture;
}
export function addContactShadows(field,parent,items){
 if(!items.length)return;
 const geom=new THREE.PlaneGeometry(1,1),mat=new THREE.MeshBasicMaterial({map:shadowTexture(),transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
 const mesh=new THREE.InstancedMesh(geom,mat,items.length),obj=new THREE.Object3D();
 for(let i=0;i<items.length;i++){
  const {x,z,width,depth}=items[i];
  obj.position.set(x,terrainMeshHeight(field.terrain,x,z)-field.terrain.min+.14,z);
  obj.rotation.set(-Math.PI/2,0,0);obj.scale.set(width,depth,1);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);
 }
 mesh.instanceMatrix.needsUpdate=true;mesh.name='static-contact-shadows';mesh.raycast=()=>{};mesh.renderOrder=1;parent.add(mesh);
}
export function buildingShadows(field,parent){
 const items=[];
 for(const b of field.osm.buildings||[]){
  const p=b.footprint;if(!p||p.length<3)continue;
  const xs=p.map(q=>q[0]),zs=p.map(q=>q[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;
  items.push({x:x-1.1,z:z-.7,width:Math.min(26,Math.max(4,Math.max(...xs)-Math.min(...xs)+4)),depth:Math.min(26,Math.max(4,Math.max(...zs)-Math.min(...zs)+4))});
 }
 addContactShadows(field,parent,items);
}
