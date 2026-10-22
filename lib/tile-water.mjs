import {gridSample} from './geo.mjs';
import {fitWaterProfilesFromSampler} from './water-field.mjs';
import {tileAtPosition} from './tiles.mjs';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
/** Stitch segmented directed OSM ways after translating all tiles to one origin. */
export function buildGlobalWaterPaths(snapshots){
 const grouped=new Map();
 for(const {tile,field} of snapshots){
  for(const line of field.osm.waterways||[]){
   if(line.tunnel||line.layer<0)continue;
   const points=line.points.map(p=>[p[0]+tile.offset[0],p[1]+tile.offset[1]]);
   if(distance(points[0],points[1])<.01)continue;
   if(!grouped.has(line.id))grouped.set(line.id,[]);
   grouped.get(line.id).push({points,id:line.id,width:line.width,kind:line.kind});
  }
 }
 const paths=[];
 for(const [id,segments] of grouped){
  const unused=[...segments];let count=0;
  while(unused.length){
   // Prefer starts that are not the end of another remaining directed segment.
   let head=unused.findIndex(s=>!unused.some(other=>other!==s&&distance(other.points[1],s.points[0])<.1));
   if(head<0)head=0;
   const start=unused.splice(head,1)[0];
   const nodes=[...start.points];
   while(unused.length){
    const next=unused.findIndex(s=>distance(s.points[0],nodes.at(-1))<.1);
    if(next<0)break;
    nodes.push(unused.splice(next,1)[0].points[1]);
   }
   const lengths=[0];
   for(let i=1;i<nodes.length;i++)lengths.push(lengths.at(-1)+distance(nodes[i-1],nodes[i]));
   if(lengths.at(-1)>.05)paths.push({id,nodes,lengths,length:lengths.at(-1),width:start.width,kind:start.kind,chain:count++});
  }
 }
 return paths;
}
/** Profiles are in absolute GSI elevations and global x/z coordinates. */
export function fitGlobalWaterProfiles(snapshots,manifest){
 const paths=buildGlobalWaterPaths(snapshots);
 const fields=new Map(snapshots.map(s=>[s.tile.id,s]));
 return fitWaterProfilesFromSampler(paths,point=>{
  const entry=tileAtPosition(manifest,point[0],point[1])||
    snapshots.reduce((best,s)=>!best||Math.hypot(point[0]-s.tile.offset[0],point[1]-s.tile.offset[1])<
      Math.hypot(point[0]-best.tile.offset[0],point[1]-best.tile.offset[1])?s:best,null)?.tile;
  const item=fields.get(entry?.id)||snapshots.reduce((best,s)=>!best||
    Math.hypot(point[0]-s.tile.offset[0],point[1]-s.tile.offset[1])<Math.hypot(point[0]-best.tile.offset[0],point[1]-best.tile.offset[1])?s:best,null);
  if(!item)throw Error('Global water sampler missing geographical tile');
  const tile=item.tile;
  return gridSample(item.field.terrain,point[0]-tile.offset[0],point[1]-tile.offset[1]);
 });
}
export function profilesInLocalSpace(globalProfiles,entry){
 return globalProfiles.map(p=>({...p,nodes:p.nodes.map(n=>[n[0]-entry.offset[0],n[1]-entry.offset[1]])}));
}
export function seamFlowAudit(globalProfiles,entryA,entryB,oldOffset=0){
 const {length:ignored}=globalProfiles;
 const a=globalProfiles.filter(p=>p.nodes.some(n=>n[1]>=entryA.offset[1]+245&&n[1]<=entryA.offset[1]+255));
 const b=globalProfiles.filter(p=>p.nodes.some(n=>n[1]>=entryB.offset[1]-255&&n[1]<=entryB.offset[1]-245));
 const matching=a.filter(pa=>b.some(pb=>pa.id===pb.id));
 return {throughPaths:matching.length,ids:[...new Set(matching.map(p=>p.id))],profiles:globalProfiles.length};
}
