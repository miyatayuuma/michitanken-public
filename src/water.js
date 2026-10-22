import * as THREE from 'three';
import {
  buildFlowPaths,fitWaterProfiles,waterVertex,tessellateTriangle,uncoveredWaterSegments,
  WATER_MAX_TRIANGLES,WATER_MAX_EDGE_METRES
} from '../lib/water-field.mjs';
import {riverVertexShader,riverFragmentShader} from './river-shader.js';

const RIVER_BASE_COLOR=0x4b9dc1;
const SHADER_TEXTURE_FREE=true;

function createBuffer(positions,flows,stations,laterals,shores){
 const geom=new THREE.BufferGeometry();
 geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geom.setAttribute('aFlow',new THREE.Float32BufferAttribute(flows,2));
 geom.setAttribute('aStation',new THREE.Float32BufferAttribute(stations,1));
 geom.setAttribute('aLateral',new THREE.Float32BufferAttribute(laterals,1));
 geom.setAttribute('aShore',new THREE.Float32BufferAttribute(shores,1));
 geom.computeVertexNormals();
 return geom;
}
function buildAreaGeometry(field,area,profiles){
 const points=area.footprint;
 if(points.length<3)return null;
 const shape=new THREE.Shape();shape.moveTo(points[0][0],-points[0][1]);
 for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],-points[i][1]);
 shape.closePath();
 const source=new THREE.ShapeGeometry(shape);source.rotateX(-Math.PI/2);
 const raw=source.index?source.toNonIndexed():source;
 const pos=raw.getAttribute('position');
 const positions=[],flows=[],stations=[],laterals=[],shores=[];
 let triangles=0,limited=false;
 const emit=(a,b,c)=>{
  for(const p of [a,b,c]){
   const vertex=waterVertex(field,p,profiles,points);
   positions.push(...vertex.position);
   flows.push(...vertex.flow);
   stations.push(vertex.station);
   laterals.push(vertex.lateral);
   shores.push(vertex.shore);
  }
  triangles++;
 };
 for(let i=0;i<pos.count;i+=3){
  if(triangles>=WATER_MAX_TRIANGLES){limited=true;break;}
  const points3=[];
  for(let j=0;j<3;j++)points3.push([pos.getX(i+j),pos.getZ(i+j)]);
  const stats=tessellateTriangle(...points3,emit,{
    maxEdge:WATER_MAX_EDGE_METRES,
    maxTriangles:WATER_MAX_TRIANGLES-triangles
  });
  if(stats.limited)limited=true;
 }
 if(raw!==source)raw.dispose();source.dispose();
 if(!positions.length)return null;
 return {geometry:createBuffer(positions,flows,stations,laterals,shores),triangles,limited};
}
function buildLineGeometry(field,line,profiles){
 const [a,b]=line.points,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
 if(len<.01)return null;
 const nx=-dz/len,nz=dx/len,width=Math.max(.5,line.width||2.5),count=Math.max(1,Math.ceil(len/2.3));
 const positions=[],flows=[],stations=[],laterals=[],shores=[];
 const sample=(t,across)=>{
  const center=[a[0]+dx*t,a[1]+dz*t];
  const point=[center[0]+nx*across,center[1]+nz*across];
  return waterVertex(field,point,profiles,null,Math.max(0,width/2-Math.abs(across)));
 };
 const emit=vertices=>{
  for(const v of vertices){positions.push(...v.position);flows.push(...v.flow);stations.push(v.station);laterals.push(v.lateral);shores.push(v.shore);}
 };
 for(let i=0;i<count;i++){
  const aL=sample(i/count,width/2),aR=sample(i/count,-width/2),bL=sample((i+1)/count,width/2),bR=sample((i+1)/count,-width/2);
  emit([aL,aR,bL]);emit([bL,aR,bR]);
 }
 return {geometry:createBuffer(positions,flows,stations,laterals,shores),triangles:count*2,limited:false};
}
/**
 * Water polygon is authoritative for channel width. A matching centreline
 * supplies flow coordinates but is NOT drawn again (prevents duplicate bands).
 */
export function createWaterLayer(field,{flat=false,sharedProfiles=null}={}){
 const group=new THREE.Group();group.name='mapped-water';
 const paths=buildFlowPaths(field.osm.waterways||[]);
 const profiles=sharedProfiles||fitWaterProfiles(paths,field.terrain);
 const uniforms={uTime:{value:0},uMotion:{value:1}};
 const sharedMaterial=flat
  ?new THREE.MeshLambertMaterial({color:RIVER_BASE_COLOR,side:THREE.DoubleSide,depthTest:false,depthWrite:false})
  :new THREE.ShaderMaterial({
    uniforms,vertexShader:riverVertexShader,fragmentShader:riverFragmentShader,
    depthTest:false,depthWrite:false,side:THREE.DoubleSide,transparent:false
  });
 const areas=field.osm.waterAreas||[];
 const summary={areas:0,ribbons:0,triangles:0,flowPaths:paths.length,limited:false,mode:flat?'flat':'procedural',textureFree:SHADER_TEXTURE_FREE};
 const add=(result,label)=>{
  if(!result)return;
  const mesh=new THREE.Mesh(result.geometry,sharedMaterial);
  mesh.name=label;mesh.renderOrder=1;
  mesh.frustumCulled=true;
  group.add(mesh);
  summary.triangles+=result.triangles;
  summary.limited ||=result.limited;
 };
 for(const area of areas){
  const geometry=buildAreaGeometry(field,area,profiles);
  if(!geometry)continue;
  add(geometry,'water-area-'+area.id);summary.areas++;
 }
 for(const line of field.osm.waterways||[]){
  if(line.tunnel||line.layer<0)continue;
  // Emit only the unmapped river reaches, never entire ways based on type.
  // In Task④ the south water polygon stops ~100m before the river way ends.
  for(const reach of uncoveredWaterSegments(line,areas)){
   add(buildLineGeometry(field,reach,profiles),'waterway-'+line.id);
   summary.ribbons++;
  }
 }
 return {group,uniforms,summary,profiles};
}
