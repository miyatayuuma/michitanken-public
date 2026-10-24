import * as THREE from 'three';
import {gridSample} from '../lib/geo.mjs';
import {buildingColors} from '../lib/appearance.mjs';
const localY=(field,x,z)=>gridSample(field.terrain,x,z)-field.terrain.min;
function geometryFromTriangles(triangles,colors){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));
 if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 g.computeVertexNormals();return g;
}
export function addBuildings(field,parent,layerSet,detail='full',entry={offset:[0,0]},colorsEnabled=true){
 const group=new THREE.Group();group.name='buildings';
 const walls=[],roofs=[],wallColors=[],roofColors=[];
 const appendColor=(target,count,hex)=>{const c=new THREE.Color(hex);for(let i=0;i<count;i++)target.push(c.r,c.g,c.b);};
 for(const b of field.osm.buildings){
  const p=b.footprint;if(p.length<3)continue;
  const color=buildingColors(b,entry,colorsEnabled),wallStart=walls.length,roofStart=roofs.length;
  const base=p.reduce((sum,[x,z])=>sum+localY(field,x,z),0)/p.length,bottom=base+.15,top=base+b.height;
  if(detail==='overview'){
   // Tiny distant buildings need roofs, not hundreds of unseen wall triangles.
   const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]);
   const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
   if(maxX-minX<.05||maxZ-minZ<.05)continue;
   roofs.push(minX,top,minZ,maxX,top,minZ,minX,top,maxZ,
     maxX,top,minZ,maxX,top,maxZ,minX,top,maxZ);
   if(colorsEnabled)appendColor(roofColors,(roofs.length-roofStart)/3,color.roof);
   continue;
  }
  const shape=new THREE.Shape();shape.moveTo(p[0][0],-p[0][1]);for(let i=1;i<p.length;i++)shape.lineTo(p[i][0],-p[i][1]);shape.closePath();
  const roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);roof.translate(0,top,0);
  const nongrid=roof.index?roof.toNonIndexed():roof;
  roofs.push(...nongrid.getAttribute('position').array);if(nongrid!==roof)nongrid.dispose();roof.dispose();
  for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length];walls.push(
   a[0],bottom,a[1],c[0],bottom,c[1],a[0],top,a[1],
   c[0],bottom,c[1],c[0],top,c[1],a[0],top,a[1]);
  }
  if(colorsEnabled){appendColor(wallColors,(walls.length-wallStart)/3,color.wall);appendColor(roofColors,(roofs.length-roofStart)/3,color.roof);}
 }
 if(walls.length){const mesh=new THREE.Mesh(geometryFromTriangles(walls,colorsEnabled?wallColors:null),new THREE.MeshLambertMaterial({color:colorsEnabled?0xffffff:0xd3d7cf,vertexColors:colorsEnabled,side:THREE.DoubleSide}));mesh.renderOrder=3;group.add(mesh);}
 if(roofs.length){const mesh=new THREE.Mesh(geometryFromTriangles(roofs,colorsEnabled?roofColors:null),new THREE.MeshLambertMaterial({color:colorsEnabled?0xffffff:0xb47968,vertexColors:colorsEnabled,side:THREE.DoubleSide}));mesh.renderOrder=3;group.add(mesh);}
 parent.add(group);layerSet.buildings=group;
}
