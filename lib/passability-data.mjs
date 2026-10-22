import {project,clipSegment,clipPolygon} from './geo.mjs';

const WATER_WIDTH={river:7,stream:2.4,canal:4,drain:1.2,ditch:1.2,tidal_channel:5};
const RAIL_TYPES=new Set(['rail','light_rail','tram','narrow_gauge','subway','funicular']);
const isYes=value=>value!==undefined&&!['no','false','0'].includes(String(value));
const finiteNum=(value,fallback=0)=>{
  const n=Number.parseFloat(String(value??''));
  return Number.isFinite(n)?n:fallback;
};
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
export function intersectSegments(a,b,c,d){
  const v=[b[0]-a[0],b[1]-a[1]],w=[d[0]-c[0],d[1]-c[1]],den=cross(v,w);
  if(Math.abs(den)<1e-10)return null;
  const dc=[c[0]-a[0],c[1]-a[1]],t=cross(dc,w)/den,u=cross(dc,v)/den;
  if(t<0||t>1||u<0||u>1)return null;
  return [a[0]+t*v[0],a[1]+t*v[1]];
}
function insidePolygon(point,poly){
 const [x,z]=point;let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const [xi,zi]=poly[i],[xj,zj]=poly[j];
   if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;
 }
 return inside;
}
function overlapsWaterArea(road,poly){
 const pts=road.points;
 for(const p of pts)if(insidePolygon(p,poly))return p;
 for(let i=1;i<pts.length;i++){
   for(let j=0;j<poly.length;j++){const point=intersectSegments(pts[i-1],pts[i],poly[j],poly[(j+1)%poly.length]);if(point)return point;}
 }
 return false;
}
export function crossingsAudit(features){
  const issues=[],seen=new Set();
  for(const rail of features.railways){
    if(rail.bridge||rail.tunnel||rail.layer!==0)continue;
    for(const road of features.roads){
      if(road.bridge||road.tunnel||road.layer!==rail.layer)continue;
      const p=intersectSegments(...rail.points,...road.points);
      if(!p)continue;
      const known=features.crossings.some(c=>c.railIds.includes(rail.id)&&Math.hypot(c.x-p[0],c.z-p[1])<3);
      if(known)continue;
      const key=`rail:${rail.id}:${road.id}:${p[0].toFixed(1)}:${p[1].toFixed(1)}`;
      if(seen.has(key))continue;seen.add(key);
      issues.push({kind:'rail-road',railId:rail.id,roadId:road.id,x:p[0],z:p[1],reason:'no tagged railway crossing or grade separation'});
    }
  }
  for(const water of features.waterways){
    if(water.tunnel)continue;
    for(const road of features.roads){
      if(road.bridge||road.tunnel)continue;
      const p=intersectSegments(...water.points,...road.points);
      if(!p)continue;
      const key=`water:${water.id}:${road.id}:${p[0].toFixed(1)}:${p[1].toFixed(1)}`;
      if(seen.has(key))continue;seen.add(key);
      issues.push({kind:'water-road',waterId:water.id,roadId:road.id,x:p[0],z:p[1],reason:'no tagged bridge or culvert'});
    }
  }
  for(const area of features.waterAreas){
    for(const road of features.roads){
      if(road.bridge||road.tunnel)continue;
      const crossing=overlapsWaterArea(road,area.footprint);
      if(!crossing)continue;
      const key=`area:${area.id}:${road.id}`;
      if(seen.has(key))continue;seen.add(key);
      const [x,z]=crossing;
      issues.push({kind:'water-area-road',waterId:area.id,roadId:road.id,x,z,reason:'mapped road overlaps water area without bridge'});
    }
  }
  return issues;
}
/**
 * Add only observed OSM tags. Unspecified structures remain unverified rather
 * than inferring a crossing from two lines intersecting in 2D.
 */
export function enrichOsm(data,base,center,size){
  const ways=new Map(data.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
  const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
  const h=size/2;
  const attrib=way=>{
    const tags=way?.tags||{};
    return {bridge:isYes(tags.bridge),tunnel:isYes(tags.tunnel)||tags.covered==='yes',
      layer:Math.max(-8,Math.min(8,finiteNum(tags.layer,0)))};
  };
  for(const road of base.roads)Object.assign(road,attrib(ways.get(road.id)));
  for(const rail of base.railways){
    const way=ways.get(rail.id),tags=way?.tags||{};
    Object.assign(rail,attrib(way),{kind:tags.railway||'rail',width:Math.max(1.4,Math.min(6,finiteNum(tags.width,2.5)))});
  }
  const waterways=[],waterAreas=[];
  for(const way of ways.values()){
    const tags=way.tags||{},nodePoints=way.nodes?.map(id=>nodes.get(id));
    if(!nodePoints||nodePoints.length<2||nodePoints.some(n=>!n||!Number.isFinite(n.lat)||!Number.isFinite(n.lon)))continue;
    const points=nodePoints.map(n=>project(n.lat,n.lon,center));
    const closed=way.nodes.length>=4&&way.nodes[0]===way.nodes.at(-1);
    const waterArea=tags.natural==='water'||tags.waterway==='riverbank'||tags.landuse==='reservoir';
    if(waterArea&&closed){
      const poly=clipPolygon(points.slice(0,-1),h);
      if(poly.length>=3)waterAreas.push({id:way.id,kind:tags.water||tags.waterway||'water',footprint:poly});
    }
    if(WATER_WIDTH[tags.waterway]!==undefined&&!closed){
      const extras=attrib(way);
      const width=Math.max(.5,Math.min(30,finiteNum(tags.width,WATER_WIDTH[tags.waterway])));
      for(let i=1;i<points.length;i++){
        const segment=clipSegment(points[i-1],points[i],h);
        if(segment&&Math.hypot(segment[1][0]-segment[0][0],segment[1][1]-segment[0][1])>.03)
          waterways.push({id:way.id,kind:tags.waterway,width,points:segment,...extras});
      }
    }
  }
  const roadIds=new Set(base.roads.map(r=>r.id)),railIds=new Set(base.railways.map(r=>r.id));
  const roadRefs=new Map(),railRefs=new Map();
  for(const way of ways.values()){
    const list=roadIds.has(way.id)?roadRefs:railIds.has(way.id)?railRefs:null;
    if(!list)continue;
    for(let i=0;i<way.nodes.length;i++){
      const id=way.nodes[i];if(!list.has(id))list.set(id,[]);
      list.get(id).push({way,index:i});
    }
  }
  const crossings=[];
  for(const node of nodes.values()){
    if(!['level_crossing','crossing'].includes(node.tags?.railway))continue;
    if(!roadRefs.has(node.id)||!railRefs.has(node.id))continue;
    const [x,z]=project(node.lat,node.lon,center);
    if(Math.abs(x)>h||Math.abs(z)>h)continue;
    const roads=roadRefs.get(node.id),rails=railRefs.get(node.id);
    const road=roads[0],way=road.way,i=road.index;
    const before=nodes.get(way.nodes[Math.max(0,i-1)]),after=nodes.get(way.nodes[Math.min(i+1,way.nodes.length-1)]);
    if(!before||!after)continue;
    const a=project(before.lat,before.lon,center),b=project(after.lat,after.lon,center);
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<.02)continue;
    const width=Math.max(...roads.flatMap(({way:w})=>base.roads.filter(r=>r.id===w.id).map(r=>r.width)),1.5);
    crossings.push({nodeId:node.id,kind:node.tags.railway,x,z,dx:dx/length,dz:dz/length,width,railIds:[...new Set(rails.map(r=>r.way.id))]});
  }
  const features={...base,waterways,waterAreas,crossings};
  features.unverifiedCrossings=crossingsAudit(features);
  return features;
}
