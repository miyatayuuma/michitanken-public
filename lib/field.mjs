import {project,boundsFromCenter,clipSegment,clipPolygon} from './geo.mjs';
import {enrichOsm} from './passability-data.mjs';
export const CENTER={lat:0,lon:0},SIZE=500;
const WIDTH={trunk:8,primary:7,secondary:6.5,tertiary:5.5,residential:4,living_street:3.5,unclassified:4,service:2.6,pedestrian:3,footway:1.6,path:1.2,steps:1.4,track:2.2,cycleway:2};
const EXCLUDED=new Set(['motorway','motorway_link','trunk_link','construction','proposed']);
export function overpassQuery(bounds=boundsFromCenter(CENTER,SIZE)){
 const b=[bounds.south,bounds.west,bounds.north,bounds.east].map(n=>n.toFixed(7)).join(',');
 return `[out:json][timeout:45];(way["highway"](${b});way["building"](${b});way["railway"](${b});way["waterway"](${b});way["natural"="water"](${b});way["landuse"="reservoir"](${b}););out body;>;out skel qt;`;
}
function area(poly){return poly.reduce((s,p,i)=>{const b=poly[(i+1)%poly.length];return s+p[0]*b[1]-b[0]*p[1];},0)/2;}
export function parseOsm(data,center=CENTER,size=SIZE){
 if(!Array.isArray(data?.elements))throw Error('Invalid Overpass data');
 const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e])),roads=[],buildings=[],railways=[],h=size/2;
 for(const way of data.elements){
  if(way.type!=='way'||!Array.isArray(way.nodes))continue;
  const points=way.nodes.map(id=>nodes.get(id)).filter(n=>n&&Number.isFinite(n.lat)&&Number.isFinite(n.lon)).map(n=>project(n.lat,n.lon,center)).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
  if(points.length<2)continue;
  const tags=way.tags||{};
  if(tags.highway&&!EXCLUDED.has(tags.highway)&&tags.access!=='private'&&WIDTH[tags.highway]){
   for(let i=1;i<points.length;i++){const seg=clipSegment(points[i-1],points[i],h);if(seg&&Math.hypot(seg[1][0]-seg[0][0],seg[1][1]-seg[0][1])>.01)roads.push({id:way.id,kind:tags.highway,width:WIDTH[tags.highway],points:seg});}
  }
  if(['rail','light_rail','tram','narrow_gauge','subway','funicular'].includes(tags.railway))for(let i=1;i<points.length;i++){const seg=clipSegment(points[i-1],points[i],h);if(seg)railways.push({id:way.id,points:seg});}
  if(tags.building&&points.length>=4&&way.nodes[0]===way.nodes.at(-1)){
   const clipped=clipPolygon(points.slice(0,-1),h);
   if(clipped.length<3||Math.abs(area(clipped))<2)continue;
   const levels=Number(tags['building:levels']),explicit=Number.parseFloat(String(tags.height||'').replace('m',''));
   const measured=Number.isFinite(explicit)&&explicit>1&&explicit<200;
   const height=measured?explicit:Number.isFinite(levels)&&levels>0&&levels<60?levels*3:7;
   buildings.push({id:way.id,footprint:clipped,height,heightEstimated:!measured});
  }
 }return enrichOsm(data,{roads,buildings,railways},center,size);
}
export function validateField(data){
 if(![1,2].includes(data?.schema)||data.size!==500||!data.center||!data.terrain||!data.osm)throw Error('Field schema invalid');
 const t=data.terrain;
 if(!Number.isInteger(t.count)||t.count<3||t.elevations?.length!==t.count**2)throw Error('Invalid terrain grid');
 if(t.elevations.some(n=>!Number.isFinite(n)))throw Error('Non-finite terrain elevation');
 if(!Array.isArray(data.osm.roads)||!Array.isArray(data.osm.buildings)||!data.osm.roads.length||!data.osm.buildings.length)throw Error('Missing OSM features');
 if(t.validRatio<.8)throw Error('Insufficient elevation coverage');
 if(data.schema===2){
  for(const key of ['railways','waterways','waterAreas','crossings','unverifiedCrossings'])if(!Array.isArray(data.osm[key]))throw Error('Missing passability layer: '+key);
  const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
  for(const kind of ['roads','railways','waterways'])for(const line of data.osm[kind]){
   if(!Array.isArray(line.points)||line.points.length<2||!line.points.every(finitePoint))throw Error('Invalid '+kind+' geometry');
   if(typeof line.bridge!=='boolean'||typeof line.tunnel!=='boolean'||!Number.isFinite(line.layer))throw Error('Missing grade metadata: '+kind);
  }
  for(const area of data.osm.waterAreas)if(!Array.isArray(area.footprint)||area.footprint.length<3||!area.footprint.every(finitePoint))throw Error('Invalid water area');
 }
 return true;
}