// Trace the actual production triangles on shared tile planes. Outputs inherit
// input visibility. Unlike fauna footprint queries, this adds no round caps.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {adjacentTilePairs} from '../lib/tiles.mjs';
import {fitGlobalWaterProfiles,profilesInLocalSpace} from '../lib/tile-water.mjs';
import {decodeWaterProfiles,profilesForWaterField} from '../lib/water-profile-data.mjs';
const [rootArg,out]=process.argv.slice(2),root=path.resolve(rootArg);
const {createWaterLayer}=await import(pathToFileURL(root+'/src/water.js'));
const m=JSON.parse(await fs.readFile(root+'/public/data/tiles.json'));
const snapshots=await Promise.all(m.tiles.map(async tile=>({tile,field:JSON.parse(await fs.readFile(root+'/public/'+tile.url))})));
const fixed=m.waterProfiles?decodeWaterProfiles(JSON.parse(await fs.readFile(root+'/public/'+m.waterProfiles)),m):null;
const all=fixed||fitGlobalWaterProfiles(snapshots,m),traces=new Map();
for(const {tile,field} of snapshots){
 const layer=createWaterLayer(field,{detail:'full',sharedProfiles:profilesInLocalSpace(fixed?profilesForWaterField(all,field):all,tile)});
 const edges=[[],[],[],[]];
 for(const mesh of layer.group.children){const p=mesh.geometry.getAttribute('position');
  for(let i=0;i<p.count;i+=3){const tri=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j)+field.terrain.min,p.getZ(i+j)]);
   for(let side=0;side<4;side++){
    const axis=side<2?0:2,other=axis===0?2:0,value=(side%2?1:-1)*m.size/2,points=[];
    if(Math.min(...tri.map(v=>v[axis]))>value+1e-5||Math.max(...tri.map(v=>v[axis]))<value-1e-5)continue;
    for(let j=0;j<3;j++){
     const a=tri[j],b=tri[(j+1)%3],da=a[axis]-value,db=b[axis]-value;
     if(Math.abs(da)<1e-5)points.push([a[other]+tile.offset[other===0?0:1],a[1]]);
     if(da*db<0){const t=-da/(db-da);points.push([a[other]+(b[other]-a[other])*t+tile.offset[other===0?0:1],a[1]+(b[1]-a[1])*t]);}
    }
    points.sort((a,b)=>a[0]-b[0]);if(points.length>=2&&points.at(-1)[0]-points[0][0]>1e-5)edges[side].push([points[0],points.at(-1)]);
   }
  }
 }
 traces.set(tile.id,edges);const mats=new Set();layer.group.traverse(o=>{o.geometry?.dispose();if(o.material)mats.add(o.material);});for(const mat of mats)mat.dispose();
}
const rows=[];
for(const [a,b] of adjacentTilePairs(m)){
 const dx=b.offset[0]-a.offset[0],dz=b.offset[1]-a.offset[1],sideA=dx?(dx>0?1:0):(dz>0?3:2),sideB=sideA^1,other=dx?1:0;
 const traceA=traces.get(a.id)[sideA],traceB=traces.get(b.id)[sideB];let common=0,onlyA=0,onlyB=0,maxHeightDelta=0,worstHeight=null;const discrepancies=[];
 const height=(traces,s)=>{const hit=traces.filter(([a,b])=>s>=a[0]-1e-6&&s<=b[0]+1e-6);return hit.length?Math.max(...hit.map(([a,b])=>a[1]+(b[1]-a[1])*(s-a[0])/(b[0]-a[0]))):null;};
 for(let i=0;i<=1000;i++){
  const s=a.offset[other]-m.size/2+i*m.size/1000,ha=height(traceA,s),hb=height(traceB,s);
  if(ha!==null&&hb!==null){common++;const delta=Math.abs(ha-hb);if(delta>maxHeightDelta){maxHeightDelta=delta;worstHeight={coordinate:s,a:ha,b:hb};}}
  else if((ha===null)!==(hb===null)){if(ha!==null)onlyA++;else onlyB++;discrepancies.push({coordinate:s,a:ha,b:hb});}
 }
 rows.push({a:a.id,b:b.id,common,onlyA,onlyB,maxHeightDelta,worstHeight,discrepancies});
}
const report={method:'actual float32 water triangles intersected with shared tile planes; 0.5m samples; fixed full-field profiles when declared',pairs:rows.length,common:rows.reduce((n,r)=>n+r.common,0),oneSided:rows.reduce((n,r)=>n+r.onlyA+r.onlyB,0),maxHeightDelta:Math.max(...rows.map(r=>r.maxHeightDelta)),rows};
await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({pairs:report.pairs,common:report.common,oneSided:report.oneSided,maxHeightDelta:report.maxHeightDelta}));
