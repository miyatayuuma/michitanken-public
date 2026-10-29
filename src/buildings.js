import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {gridSample} from '../lib/geo.mjs';
import {buildingColors} from '../lib/appearance.mjs';
const localY=(field,x,z)=>gridSample(field.terrain,x,z)-field.terrain.min;
function geometryFromTriangles(triangles,colors){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));
 if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 g.computeVertexNormals();return g;
}
export function addBuildings(field,parent,layerSet,detail='full',entry={offset:[0,0]},colorsEnabled=true,lighting=null){
 const group=new THREE.Group();group.name='buildings';
 const walls=[],roofs=[],wallColors=[],roofColors=[],overviewBounds=[],ranges=[];
 const appendColor=(target,count,hex)=>{const c=new THREE.Color(hex);for(let i=0;i<count;i++)target.push(c.r,c.g,c.b);};
 for(const b of field.osm.buildings){
  const p=b.footprint;if(p.length<3)continue;
  const color=buildingColors(b,entry,colorsEnabled),wallStart=walls.length,roofStart=roofs.length;
  const base=p.reduce((sum,[x,z])=>sum+localY(field,x,z),0)/p.length,bottom=base+.15,top=base+b.height;
  const shape=new THREE.Shape();shape.moveTo(p[0][0],-p[0][1]);for(let i=1;i<p.length;i++)shape.lineTo(p[i][0],-p[i][1]);shape.closePath();
  const roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);roof.translate(0,top,0);
  const nongrid=roof.index?roof.toNonIndexed():roof;
  roofs.push(...nongrid.getAttribute('position').array);if(nongrid!==roof)nongrid.dispose();roof.dispose();
  const area=p.reduce((sum,a,i)=>{const c=p[(i+1)%p.length];return sum+a[0]*c[1]-c[0]*a[1];},0);
  for(let i=0;i<p.length;i++){const a=area>0?p[(i+1)%p.length]:p[i],c=area>0?p[i]:p[(i+1)%p.length];walls.push(
   a[0],bottom,a[1],c[0],bottom,c[1],a[0],top,a[1],
   c[0],bottom,c[1],c[0],top,c[1],a[0],top,a[1]);
  }
  const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]);
  overviewBounds.push(new THREE.Box3(new THREE.Vector3(Math.min(...xs),bottom,Math.min(...zs)),new THREE.Vector3(Math.max(...xs),top,Math.max(...zs))));
  ranges.push({wallStart:wallStart/3,wallCount:(walls.length-wallStart)/3,roofStart:roofStart/3,roofCount:(roofs.length-roofStart)/3});
  if(colorsEnabled){appendColor(wallColors,(walls.length-wallStart)/3,color.wall);appendColor(roofColors,(roofs.length-roofStart)/3,color.roof);}
 }
 const triangles=walls.concat(roofs),colors=wallColors.concat(roofColors);
 if(!colorsEnabled){appendColor(colors,walls.length/3,0xd3d7cf);appendColor(colors,roofs.length/3,0xb47968);}
 if(triangles.length){
  const raw=geometryFromTriangles(triangles,colors);
  if(lighting)bakeDiffuse(raw,lighting);
  const geometry=mergeVertices(raw,1e-7);raw.dispose();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=lighting?new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,side:THREE.FrontSide}):new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.FrontSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=3;accelerateBuildingRaycast(mesh,overviewBounds,ranges,walls.length/3);group.add(mesh);
 }
 parent.add(group);layerSet.buildings=group;
}

// Exact Lambert diffuse irradiance for static, unshadowed hemisphere + directional
// lights. Inputs are linear RGB/intensity and a world-space unit sun direction.
// Fog, output colour space and tone mapping remain in Three's standard Basic shader.
export function bakeDiffuse(geometry,{sky,ground,sun,direction}){
 const normals=geometry.attributes.normal,colors=geometry.attributes.color;
 for(let i=0;i<colors.count;i++){
  const n=[normals.getX(i),normals.getY(i),normals.getZ(i)];
  const h=.5*n[1]+.5,d=Math.max(0,n.reduce((s,v,k)=>s+v*direction[k],0));
  const rgb=[colors.getX(i),colors.getY(i),colors.getZ(i)];
  colors.setXYZ(i,...rgb.map((c,k)=>c*(ground[k]*(1-h)+sky[k]*h+sun[k]*d)/Math.PI));
 }
}

// Bounds prune candidates; acceptance still uses actual indexed mesh triangles.
function accelerateBuildingRaycast(mesh,boxes,ranges,roofOffset){
 const inverse=new THREE.Matrix4(),ray=new THREE.Ray();
 mesh.raycast=function(raycaster,hits){
  inverse.copy(this.matrixWorld).invert();ray.copy(raycaster.ray).applyMatrix4(inverse);
  const range={...this.geometry.drawRange};
  try{for(let i=0;i<boxes.length;i++)if(ray.intersectsBox(boxes[i])){
   const r=ranges[i];this.geometry.setDrawRange(r.wallStart,r.wallCount);THREE.Mesh.prototype.raycast.call(this,raycaster,hits);
   this.geometry.setDrawRange(roofOffset+r.roofStart,r.roofCount);THREE.Mesh.prototype.raycast.call(this,raycaster,hits);
  }}finally{this.geometry.setDrawRange(range.start,range.count);}
 };
}
