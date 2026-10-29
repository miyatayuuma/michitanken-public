import {distanceFromRect} from './tiles.mjs';

/** Render policy is independent from collider/data fidelity. */
export const OVERVIEW_ROAD_STEP=11;
export const FULL_ROAD_STEP=2.4;
export const NEAR_TILE_MARGIN=95;
export const MAP_INSPECTION_HEIGHT=320;
export const VISIBILITY_RADIUS=375;

/** Actual frame-buffer budget, not a CSS change. Mobile devices render fewer pixels. */
export function pixelRatioBudget(deviceRatio=1,{coarse=false,memoryGiB=null}={}){
 if(!Number.isFinite(deviceRatio)||deviceRatio<=0)throw Error('Invalid DPR');
 const max=coarse?(memoryGiB!==null&&memoryGiB<=4?1.1:1.35):1.75;
 return Math.max(.75,Math.min(deviceRatio,max));
}
export function tileDetail({mode,x,z,entry,size=500,camera=null}){
 if(mode==='map'){
  // A user zooming down from the full 1.5km map must recover actual
  // building silhouettes and fine water geometry near the camera.
  if(camera&&camera.y<MAP_INSPECTION_HEIGHT&&
     distanceFromRect(camera.x,camera.z,entry,size)<=NEAR_TILE_MARGIN)return 'full';
  return 'overview';
 }
 if(mode!=='walk')throw Error('Unsupported scene mode');
 if(!Number.isFinite(x)||!Number.isFinite(z))return 'overview';
 return distanceFromRect(x,z,entry,size)<=NEAR_TILE_MARGIN?'full':'overview';
}
export function tileVisibilityQuery(entry,margin=VISIBILITY_RADIUS){
 return {center:[entry.offset[0],entry.offset[1]],radius:margin};
}
export function geometryStats(visuals){
 let roadTriangles=0,buildingTriangles=0,waterTriangles=0,full=0,overview=0;
 for(const visual of visuals){
  const detail=visual.level;
  if(detail==='full')full++;
  if(detail==='overview')overview++;
  for(const mesh of visual.layers.roads.children)
   roadTriangles+=mesh.geometry.getAttribute('position').count/3;
  for(const mesh of visual.layers.buildings.children)
   buildingTriangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;
  waterTriangles+=visual.water?.summary.triangles||0;
 }
 return {roadTriangles,buildingTriangles,waterTriangles,full,overview,totalTriangles:roadTriangles+buildingTriangles+waterTriangles};
}
