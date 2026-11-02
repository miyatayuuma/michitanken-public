import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {terrainMeshHeight} from '../lib/geo.mjs';
import {buildingColors} from '../lib/appearance.mjs';

const localY=(field,x,z)=>terrainMeshHeight(field.terrain,x,z)-field.terrain.min;
function geometryFromTriangles(triangles,colors){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));
 if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 g.computeVertexNormals();return g;
}

// Facets are linear functions in the building's local footprint coordinates.
// Clip each original roof triangle to each facet: roofs remain inside the OSM
// polygon, including concave footprints, and meet exactly along the ridge.
function clipFacet(poly,plane,other){
 const result=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=other(a)-plane(a),db=other(b)-plane(b);
  const ia=da>=-1e-8,ib=db>=-1e-8;
  if(ia)result.push(a);
  if(ia!==ib){const t=da/(da-db);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 }
 return result;
}
function buildingProfile(b,p){
 let edge=p[0],next=p[1],longest=0;
 for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length],d=Math.hypot(c[0]-a[0],c[1]-a[1]);if(d>longest){edge=a;next=c;longest=d;}}
 const ux=longest?(next[0]-edge[0])/longest:1,uz=longest?(next[1]-edge[1])/longest:0;
 const u=q=>q[0]*ux+q[1]*uz,v=q=>-q[0]*uz+q[1]*ux;
 const us=p.map(u),vs=p.map(v),u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs);
 const spanU=u1-u0,spanV=v1-v0,area=Math.abs(p.reduce((a,q,i)=>a+q[0]*p[(i+1)%p.length][1]-p[(i+1)%p.length][0]*q[1],0))/2;
 const tag=String(b.building||b.kind||b.tags?.building||'').toLowerCase();
 const size=Math.max(spanU,spanV),height=b.height||7;
 const seed=Math.abs(Number(b.id)||Math.round(area*97))>>>0;
 const group=/apartments|residential/.test(tag)?'apartment':
   /retail|commercial|shop/.test(tag)?'shop':
   /industrial|warehouse|office/.test(tag)||area>420?'work':
   height>=12?'apartment':(!tag&&area>90&&seed%9===0?'shop':'house');
 const variants={house:[0,1,2,3],apartment:[4,5],shop:[6],work:[7]};
 const options=variants[group],variant=options[seed%options.length];
 const slope=group==='house'&&Math.min(spanU,spanV)>=3&&height>=4;
 const rise=slope?Math.min(2.0,height*.22,Math.min(spanU,spanV)*.22):0;
 const axis=spanU>=spanV?v:u,lo=spanU>=spanV?v0:u0,hi=spanU>=spanV?v1:u1,half=Math.max((hi-lo)/2,.01),mid=(lo+hi)/2;
 const eave=1-rise/Math.max(height,1),factor=rise/half;
 let facets=[()=>height];
 if(rise>0){
  facets=[q=>height-factor*(mid-axis(q)),q=>height-factor*(axis(q)-mid)];
  // Two intersecting ridges provide a low hipped roof on compact footprints.
  if(variant===1||variant===3){
   const along=spanU>=spanV?u:v,al=spanU>=spanV?u0:v0,ah=spanU>=spanV?u1:v1;
   facets.push(q=>height-factor*(half-(along(q)-al)));
   facets.push(q=>height-factor*(half-(ah-along(q))));
  }
 }
 return {group,variant,facets,rise,height,eave,seed};
}
function roofHeight(profile,q){return Math.min(...profile.facets.map(f=>f(q)));}
function appendRoof(profile,geometry,base,target){
 const source=geometry.getAttribute('position');
 for(let i=0;i<source.count;i+=3){
  const triangle=[0,1,2].map(j=>[source.getX(i+j),source.getZ(i+j)]);
  for(const facet of profile.facets){
   let poly=triangle;
   for(const other of profile.facets){if(other!==facet)poly=clipFacet(poly,facet,other);if(poly.length<3)break;}
   for(let j=1;j<poly.length-1;j++){
    for(const q of [poly[0],poly[j],poly[j+1]])target.push(q[0],base+facet(q),q[1]);
   }
  }
 }
}
function edgeBreaks(profile,a,b){
 const ts=[0,1];
 for(let i=0;i<profile.facets.length;i++)for(let j=i+1;j<profile.facets.length;j++){
  const f=profile.facets[i],g=profile.facets[j],d0=f(a)-g(a),d1=f(b)-g(b);
  if(d0*d1<0){const t=d0/(d0-d1);if(t>1e-6&&t<1-1e-6)ts.push(t);}
 }
 return [...new Set(ts)].sort((x,y)=>x-y);
}

function pointInFootprint(x,z,polygon){
 let hit=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
function segmentDistance(p,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],q=dx*dx+dz*dz;
 const t=q?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/q)):0;
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
}
// Only suggest a small paved parking pad where the sampled ground is outside
// known buildings and roads. This is scenery, not surveyed parcel geometry.
function parkingPad(field,points){
 const h=field.size/2;
 for(const p of points){
  if(Math.abs(p[0])>h-1||Math.abs(p[1])>h-1)return false;
  for(const b of field.osm.buildings)if(pointInFootprint(p[0],p[1],b.footprint))return false;
  for(const road of field.osm.roads)for(let i=1;i<road.points.length;i++)
   if(segmentDistance(p,road.points[i-1],road.points[i])<(road.width||4)/2+.8)return false;
 }
 return true;
}

export function addBuildings(field,parent,layerSet,detail='full',entry={offset:[0,0]},colorsEnabled=true,lighting=null){
 const group=new THREE.Group();group.name='buildings';
 const walls=[],roofs=[],details=[],wallColors=[],roofColors=[],detailColors=[],overviewBounds=[],ranges=[];
 const appendColor=(target,count,hex)=>{const c=new THREE.Color(hex);for(let i=0;i<count;i++)target.push(c.r,c.g,c.b);};
 const face=(target,a,b,c,d)=>target.push(...a,...b,...c,...c,...b,...d);
 for(const b of field.osm.buildings){
  const p=b.footprint;if(p.length<3)continue;
  const profile=buildingProfile(b,p),color=buildingColors(b,entry,colorsEnabled),wallStart=walls.length,roofStart=roofs.length;
  const heights=p.map(([x,z])=>localY(field,x,z)),base=heights.reduce((a,b)=>a+b,0)/p.length,bottom=Math.min(...heights)-.1,top=base+profile.height;
  const shape=new THREE.Shape();shape.moveTo(p[0][0],-p[0][1]);for(let i=1;i<p.length;i++)shape.lineTo(p[i][0],-p[i][1]);shape.closePath();
  const roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);const triangles=roof.index?roof.toNonIndexed():roof;
  appendRoof(profile,triangles,base,roofs);if(triangles!==roof)triangles.dispose();roof.dispose();
  const area=p.reduce((sum,a,i)=>{const c=p[(i+1)%p.length];return sum+a[0]*c[1]-c[0]*a[1];},0);
  let entranceEdge=0,entranceWidth=0;
  for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len>entranceWidth){entranceWidth=len;entranceEdge=i;}}
  for(let i=0;i<p.length;i++){
   const a=area>0?p[(i+1)%p.length]:p[i],c=area>0?p[i]:p[(i+1)%p.length],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);if(len<.1)continue;
   const point=t=>[a[0]+dx*t,a[1]+dz*t],breaks=edgeBreaks(profile,a,c);
   for(let j=1;j<breaks.length;j++){
    const q=point(breaks[j-1]),r=point(breaks[j]);
    face(walls,[q[0],localY(field,q[0],q[1])-.1,q[1]],[r[0],localY(field,r[0],r[1])-.1,r[1]],[q[0],base+roofHeight(profile,q),q[1]],[r[0],base+roofHeight(profile,r),r[1]]);
   }
   if(len<3||profile.height<3.5)continue;
   // One shared colored mesh for windows, doors, balconies and awnings.
   const nx=-dz/len,nz=dx/len,at=(t,y,out=.035)=>[a[0]+dx*t+nx*out,y,a[1]+dz*t+nz*out];
   const floors=Math.min(profile.group==='house'?2:5,Math.max(1,Math.floor((profile.height-profile.rise-.5)/3)));
   const columns=Math.min(3,Math.max(1,Math.floor((len-1)/2.5))),win=profile.group==='work'?'#667b80':profile.variant%2?'#6a8490':'#839ca1';
   for(let floor=0;floor<floors;floor++)for(let col=0;col<columns;col++){
    const t=(col+.5)/columns,half=Math.min(.65/len,.28/columns),y=base+1.15+floor*2.8;
    if(y+1.05>=top-profile.rise-.12)continue;
    const k=details.length;face(details,at(t-half,y),at(t+half,y),at(t-half,y+1.05),at(t+half,y+1.05));appendColor(detailColors,(details.length-k)/3,win);
    if(profile.group==='house'&&profile.seed%2===0){const kframe=details.length;face(details,at(t-half-.08/len,y-.09,.045),at(t+half+.08/len,y-.09,.045),at(t-half-.08/len,y,.045),at(t+half+.08/len,y,.045));appendColor(detailColors,(details.length-kframe)/3,'#e0d9c8');}
   }
   const originalEdge=i;
   if(originalEdge===entranceEdge&&len>=3.5){
    const t=.5,half=Math.min(.55/len,.12),y=base+.08,k=details.length;
    face(details,at(t-half,y,.055),at(t+half,y,.055),at(t-half,y+2.05,.055),at(t+half,y+2.05,.055));appendColor(detailColors,(details.length-k)/3,profile.variant%2?'#775c48':'#554a43');
    if(profile.group==='house'||profile.group==='shop'){
     const k2=details.length,h=y+2.12,wide=half+.22/len;
     face(details,at(t-wide,h,.03),at(t+wide,h,.03),at(t-wide,h,.48),at(t+wide,h,.48));appendColor(detailColors,(details.length-k2)/3,'#686961');
    }
    if(profile.group==='house'&&len>=4){
     // Low entrance step and sheltered threshold follow the local ground.
     const kstep=details.length,lo=at(t-half-.06/len,y+.06,.04),hi=at(t+half+.06/len,y+.06,.04);
     face(details,lo,hi,at(t-half-.06/len,y+.06,.78),at(t+half+.06/len,y+.06,.78));appendColor(detailColors,(details.length-kstep)/3,'#c1b5a0');
    }
    if(profile.group==='house'&&profile.seed%3===0&&len>=6){
     const k3=details.length,low=base+.08,high=base+.68;
     for(const [l,r] of [[.04,.32],[.68,.96]])face(details,at(l,low,.5),at(r,low,.5),at(l,high,.5),at(r,high,.5));
     appendColor(detailColors,(details.length-k3)/3,'#ada99c');
    }
    if(profile.group==='house'&&profile.seed%4===0&&len>=7){
     const q=(t,out)=>[a[0]+dx*t+nx*out,a[1]+dz*t+nz*out];
     const pad=[q(.12,.8),q(.42,.8),q(.12,4.3),q(.42,4.3)];
     if(parkingPad(field,pad)){
      const k4=details.length,pt=v=>[v[0],localY(field,v[0],v[1])+.035,v[1]];
      face(details,pt(pad[0]),pt(pad[1]),pt(pad[2]),pt(pad[3]));appendColor(detailColors,(details.length-k4)/3,'#b5b2aa');
     }
    }
   }
   if((profile.group==='apartment'||profile.variant===2)&&floors>=2&&len>=5){
    const k=details.length,y=base+3.1;
    face(details,at(.12,y,.04),at(.88,y,.04),at(.12,y,.65),at(.88,y,.65));
    face(details,at(.12,y,.65),at(.88,y,.65),at(.12,y+.8,.65),at(.88,y+.8,.65));
    appendColor(detailColors,(details.length-k)/3,'#a59e8f');
   }
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
 if(details.length&&colorsEnabled){
  const raw=geometryFromTriangles(details,detailColors);if(lighting)bakeDiffuse(raw,lighting);
  const geometry=mergeVertices(raw,1e-7);raw.dispose();geometry.computeBoundingSphere();
  const material=lighting?new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}):new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=3;mesh.raycast=()=>{};group.add(mesh);
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


