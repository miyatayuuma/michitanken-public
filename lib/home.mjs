// Player-selected homes are local-only and keyed by the active world pack.
export const homeStorageKey=packId=>'michitanken.home.v1.'+String(packId||'demo');

export function closestPointOnFootprint(point,footprint){
 if(!Array.isArray(footprint)||footprint.length<3)return null;
 let closest=null,distance=Infinity;
 const [x,z]=point;
 for(let i=0;i<footprint.length;i++){
  const a=footprint[i],b=footprint[(i+1)%footprint.length];
  const dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz;
  const t=den?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/den)):0;
  const candidate=[a[0]+t*dx,a[1]+t*dz],d=Math.hypot(candidate[0]-x,candidate[1]-z);
  if(d<distance){distance=d;closest=candidate;}
 }
 return {point:closest,distance};
}

export function nearbyBuildings(world,x,z,radius=12){
 const found=[];
 for(const {entry,field} of world.tileWorlds.values()){
  for(let index=0;index<(field?.osm?.buildings?.length||0);index++){
   const building=field.osm.buildings[index];
   const footprint=building.footprint?.map(([px,pz])=>[px+entry.offset[0],pz+entry.offset[1]]);
   const near=closestPointOnFootprint([x,z],footprint);
   if(!near||near.distance>radius)continue;
   const center=[footprint.reduce((sum,p)=>sum+p[0],0)/footprint.length,footprint.reduce((sum,p)=>sum+p[1],0)/footprint.length];
   found.push({id:entry.id+':'+index,tileId:entry.id,buildingIndex:index,footprint,center,distance:near.distance,edge:near.point});
  }
 }
 return found.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
}

export function validHomeRecord(record){
 return record?.schema===1&&typeof record.id==='string'&&/^[-A-Za-z0-9_]+:\d+$/.test(record.id)&&
  Array.isArray(record.center)&&record.center.length===2&&record.center.every(Number.isFinite)&&
  record.landing?.confirmed===true&&record.landing?.gameSafety==='GAME_SAFE_CONFIRMED'&&
  Array.isArray(record.landing.position)&&record.landing.position.length===3&&record.landing.position.every(Number.isFinite)&&
  Number.isFinite(record.landing.yaw);
}
