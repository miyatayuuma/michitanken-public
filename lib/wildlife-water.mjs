import {distanceToSegment,pointInsidePolygon,uncoveredWaterSegments,waterVertex} from './water-field.mjs';

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

