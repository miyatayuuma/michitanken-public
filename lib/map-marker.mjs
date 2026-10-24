// CSS pixels: zoom and devicePixelRatio must not affect visual or hit dimensions.
export const MAP_MARKER=Object.freeze({radius:3.25,selectedRadius:6,hitRadius:22});
export function nearestMapPoint(points,cursor,clip){
 if(cursor.x<clip.left||cursor.x>clip.left+clip.side||cursor.y<clip.top||cursor.y>clip.top+clip.side)return null;
 let best=null,distance=MAP_MARKER.hitRadius;
 for(const p of points){
  if(p.x<clip.left||p.x>clip.left+clip.side||p.y<clip.top||p.y>clip.top+clip.side)continue;
  const d=Math.hypot(p.x-cursor.x,p.y-cursor.y);
  if(d<distance||(d===distance&&(!best||String(p.id)<String(best.id)))){best=p;distance=d;}
 }
 return best;
}
