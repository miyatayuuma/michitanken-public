import {gridSample} from './geo.mjs';

export const WATER_MAX_EDGE_METRES=3.25;
export const WATER_MAX_TRIANGLES=90000;

const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export function distanceToSegment(p,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
 const t=length>1e-8?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length,0,1):0;
 const hit=[a[0]+dx*t,a[1]+dz*t];
 return {distance:dist(p,hit),t,point:hit};
}
export function distanceToShore(p,polygon,tileSize=null){
 let best=Infinity;
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length];
  const h=tileSize/2;
  // A tile clip edge is not a real riverbank: ignore it for shore foam and height blending.
  if(tileSize!==null&&([0,1].some(k=>Math.abs(Math.abs(a[k])-h)<.005&&Math.abs(Math.abs(b[k])-h)<.005&&Math.sign(a[k])===Math.sign(b[k]))))continue;
  best=Math.min(best,distanceToSegment(p,a,b).distance);
 }
 return best;
}
export function pointInsidePolygon(point,polygon){
 const [x,z]=point;let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [xi,zi]=polygon[i],[xj,zj]=polygon[j];
  if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;
 }
 return inside;
}
/**
 * Clip a mapped river centreline against actual mapped water-area polygons.
 * Having *any* polygon tagged water=river does not mean it covers an entire
 * OSM river way. Otherwise unpolygonized reaches disappear.
 */
export function uncoveredWaterSegments(segment,areas,{overlapMetres=.6}={}){
 const [a,b]=segment.points,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
 if(length<.01)return [];
 const polygonList=(areas||[]).map(v=>Array.isArray(v)?v:v.footprint)
  .filter(poly=>Array.isArray(poly)&&poly.length>=3);
 if(!polygonList.length)return [segment];
 const cross=(p,q)=>p[0]*q[1]-p[1]*q[0];
 const r=[dx,dz],parameters=[0,1];
 for(const poly of polygonList){
  for(let i=0;i<poly.length;i++){
   const p=poly[i],q=poly[(i+1)%poly.length],s=[q[0]-p[0],q[1]-p[1]],den=cross(r,s);
   if(Math.abs(den)<1e-9)continue;
   const c=[p[0]-a[0],p[1]-a[1]];
   const t=cross(c,s)/den,u=cross(c,r)/den;
   if(t>0&&t<1&&u>=0&&u<=1)parameters.push(t);
  }
 }
 parameters.sort((x,y)=>x-y);
 const pieces=[];
 for(let i=0;i<parameters.length-1;i++){
  const lo=parameters[i],hi=parameters[i+1];
  if(hi-lo<1e-6)continue;
  const mid=[a[0]+dx*(lo+hi)/2,a[1]+dz*(lo+hi)/2];
  if(polygonList.some(poly=>pointInsidePolygon(mid,poly)))continue;
  // Small overlap masks numerical hairlines where a ribbon meets the polygon.
  const padding=Math.min(.018,overlapMetres/length);
  const start=Math.max(0,lo-padding),end=Math.min(1,hi+padding);
  pieces.push({...segment,points:[[a[0]+dx*start,a[1]+dz*start],[a[0]+dx*end,a[1]+dz*end]]});
 }
 return pieces;
}
/** Way order from OSM is preserved, including the upstream-to-downstream convention. */
export function buildFlowPaths(waterways){
 const groups=new Map();
 for(const seg of waterways||[]){
  if(seg.tunnel||seg.layer<0||!Array.isArray(seg.points)||seg.points.length!==2)continue;
  if(!groups.has(seg.id))groups.set(seg.id,[]);
  groups.get(seg.id).push(seg);
 }
 const paths=[];
 for(const [id,segments] of groups){
  let nodes=[],lengths=[];
  function flush(){
   if(nodes.length<2)return;
   lengths=[0];for(let i=1;i<nodes.length;i++)lengths.push(lengths[i-1]+dist(nodes[i-1],nodes[i]));
   if(lengths.at(-1)>.01)paths.push({id,nodes,lengths,length:lengths.at(-1),width:segments[0].width,kind:segments[0].kind});
  }
  for(const seg of segments){
   const [a,b]=seg.points;if(dist(a,b)<.01)continue;
   if(!nodes.length){nodes=[a,b];continue;}
   if(dist(nodes.at(-1),a)<.35)nodes.push(b);
   else{flush();nodes=[a,b];}
  }
  flush();
 }
 return paths;
}
/**
 * DEM contains banks/bridges and noisy local rises, so don't transfer raw DEM
 * elevations into the water profile. Fit one gentle non-rising line per stream.
 */
export function fitWaterProfiles(paths,terrain){
 return fitWaterProfilesFromSampler(paths,point=>gridSample(terrain,...point));
}
export function fitWaterProfilesFromSampler(paths,sample){
 return paths.map(path=>{
  const stations=[],heights=[];
  const n=Math.max(2,Math.ceil(path.length/12));
  for(let i=0;i<=n;i++){
   const s=path.length*i/n,point=pointOnPath(path,s);
   stations.push(s);heights.push(sample(point));
  }
  const meanS=stations.reduce((a,b)=>a+b,0)/stations.length;
  const meanH=heights.reduce((a,b)=>a+b,0)/heights.length;
  let covariance=0,variance=0;
  for(let i=0;i<stations.length;i++){
   covariance+=(stations[i]-meanS)*(heights[i]-meanH);
   variance+=(stations[i]-meanS)**2;
  }
  const rawSlope=variance>1e-8?covariance/variance:0;
  const reversed=rawSlope>.0006; // DEM evidence disagrees with OSM way direction.
  const slope=reversed?clamp(rawSlope,0,.035):clamp(rawSlope,-.035,0);
  const start=meanH-slope*meanS;
  return {...path,start,slope,reverseFlow:reversed,slopeFromDem:rawSlope,
   getHeight(station){return start+slope*clamp(station,0,path.length);}};
 });
}
export function pointOnPath(path,s){
 const station=clamp(s,0,path.length);
 let i=0;
 while(i<path.lengths.length-2&&station>path.lengths[i+1])i++;
 const a=path.nodes[i],b=path.nodes[i+1];
 const segmentLength=path.lengths[i+1]-path.lengths[i];
 const t=segmentLength?clamp((station-path.lengths[i])/segmentLength,0,1):0;
 return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}
export function closestFlow(point,profiles){
 let best=null;
 for(const path of profiles){
  for(let i=1;i<path.nodes.length;i++){
   const a=path.nodes[i-1],b=path.nodes[i],len=dist(a,b);
   if(len<.01)continue;
   const q=distanceToSegment(point,a,b);
   if(best&&q.distance>=best.distance)continue;
   let dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
   const lateral=(point[0]-q.point[0])*(-dz)+(point[1]-q.point[1])*dx;
   if(path.reverseFlow){dx=-dx;dz=-dz;}
   best={path,distance:q.distance,station:path.lengths[i-1]+q.t*len,
     lateral,flow:[dx,dz],nearest:q.point};
  }
 }
 return best;
}
// The shoreline sampled by fauna must match the polygons and uncovered
// ribbons actually emitted by src/water.js.
const visibleWaterFootprints=new WeakMap();
function waterFootprint(field){
 let footprint=visibleWaterFootprints.get(field);
 if(footprint)return footprint;
 const areas=(field.osm?.waterAreas||[]).filter(a=>a.footprint?.length>=3);
 const reaches=[];
 for(const line of field.osm?.waterways||[]){
  if(line.tunnel||line.layer<0||!Array.isArray(line.points)||line.points.length!==2)continue;
  const halfWidth=Math.max(.5,line.width||2.5)/2;
  for(const reach of uncoveredWaterSegments(line,areas)){
   reaches.push({a:reach.points[0],b:reach.points[1],halfWidth});
  }
 }
 footprint={areas,reaches};
 visibleWaterFootprints.set(field,footprint);
 return footprint;
}

/**
 * Absolute height of the actual rendered surface, or null on dry ground.
 * Shares the waterVertex profile and offset to avoid diverging calculations.
 */
export function waterSurfaceElevationAt(field,point,profiles=[]){
 const {areas,reaches}=waterFootprint(field);
 const covered=areas.some(a=>pointInsidePolygon(point,a.footprint))||
  reaches.some(r=>distanceToSegment(point,r.a,r.b).distance<=r.halfWidth);
 if(!covered)return null;
 return waterVertex(field,point,profiles,null).position[1]+field.terrain.min;
}

export function waterVertex(field,point,profiles,polygon,shoreOverride){
 const [x,z]=point,nearest=closestFlow(point,profiles);
 const land=gridSample(field.terrain,x,z);
 const shore=Math.max(0,shoreOverride??(polygon?distanceToShore(point,polygon,field.size):2));
 const target=nearest?nearest.path.getHeight(nearest.station):land;
 // Preserve the bank silhouette only within 3m; the middle of the channel
 // follows a smooth longitudinal water profile instead of DEM surface noise.
 // A water cross-section must stay level: blending DEM bank heights into
 // vertex Y created steep ridges and fake mounds along a narrow channel.
 // Shore distance controls color/foam only; it must never deform the surface.
 const elevation=target+.18;
 return {position:[x,elevation-field.terrain.min,z],
   flow:nearest?.flow||[0,1],station:nearest?.station||0,
   lateral:nearest?.lateral||0,shore};
}
/** Subdivide long triangles without inventing coordinates outside the polygon. */
export function tessellateTriangle(a,b,c,emit,{maxEdge=WATER_MAX_EDGE_METRES,maxTriangles=WATER_MAX_TRIANGLES}={}){
 let count=0,limited=false;
 function split(p,q,r,depth){
  const pq=(p[0]-q[0])**2+(p[1]-q[1])**2;
  const qr=(q[0]-r[0])**2+(q[1]-r[1])**2;
  const rp=(r[0]-p[0])**2+(r[1]-p[1])**2;
  const longest=Math.max(pq,qr,rp);
  if(longest>maxEdge*maxEdge&&depth<15&&count<maxTriangles-2){
   if(longest===pq){const m=[(p[0]+q[0])/2,(p[1]+q[1])/2];split(p,m,r,depth+1);split(m,q,r,depth+1);}
   else if(longest===qr){const m=[(q[0]+r[0])/2,(q[1]+r[1])/2];split(p,q,m,depth+1);split(p,m,r,depth+1);}
   else{const m=[(r[0]+p[0])/2,(r[1]+p[1])/2];split(p,q,m,depth+1);split(m,q,r,depth+1);}
  }else{if(longest>maxEdge*maxEdge)limited=true;emit(p,q,r);count++;}
 }
 split(a,b,c,0);return {count,limited};
}
