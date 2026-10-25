// Outputs inherit the visibility of the input snapshots; real geography stays PRIVATE.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [rootArg,codeArg,outArg]=process.argv.slice(2);
const root=path.resolve(rootArg),code=path.resolve(codeArg);
const {terrainMeshHeight}=await import(pathToFileURL(code+'/lib/geo.mjs'));
const {buildRoadRibbon,roadSurfaceOptions}=await import(pathToFileURL(code+'/lib/road-surface.mjs'));
const {fitGlobalWaterProfiles,profilesInLocalSpace}=await import(pathToFileURL(code+'/lib/tile-water.mjs'));
const {waterVertex,distanceToShore,waterSurfaceElevationAt}=await import(pathToFileURL(root+'/lib/water-field.mjs'));
const {adjacentTilePairs,seamRoadAudit,seamRiverAudit,tileAtPosition}=await import(pathToFileURL(code+'/lib/tiles.mjs'));
const manifest=JSON.parse(await fs.readFile(root+'/public/data/tiles.json'));
const snapshots=await Promise.all(manifest.tiles.map(async tile=>({tile,field:JSON.parse(await fs.readFile(root+'/public/'+tile.url))})));
if(manifest.roadSupplement){
 const {validateRoadSupplement,applyRoadSupplement}=await import(pathToFileURL(code+'/lib/road-supplement.mjs'));
 const supplement=validateRoadSupplement(JSON.parse(await fs.readFile(root+'/public/'+manifest.roadSupplement)),manifest);
 for(const s of snapshots)s.field=applyRoadSupplement(s.field,s.tile,supplement);
}
const profiles=fitGlobalWaterProfiles(snapshots,manifest),byId=new Map(snapshots.map(s=>[s.tile.id,s]));
const rows=[],worst=[];
for(const {tile,field} of snapshots){
 const row={tile:tile.id,roads:field.osm.roads.length,waterways:field.osm.waterways.length,waterAreas:field.osm.waterAreas.length,lods:[],banks:{samples:0,above25cm:0,maxAbove:-Infinity,worst:null}};
 for(const detail of ['full','overview']){
  let triangles=0,buried=0,minClearance=Infinity,affected=new Set(),maxFloat=0,worldBuried=0,minWorldClearance=Infinity;
  for(const road of field.osm.roads)for(let j=1;j<road.points.length;j++){
   const verts=buildRoadRibbon(road.points[j-1],road.points[j],road.width,field,road.bridge?.40:.23,roadSurfaceOptions?.(detail)||{alongStep:detail==='overview'?11:2.4,acrossStep:detail==='overview'?8:2.4,terrainSafe:detail==='overview'});
   triangles+=verts.length/9;
   for(let i=0;i<verts.length;i+=9){let bad=false,worldBad=false;
    for(const w of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){
     const p=[0,1,2].map(k=>w.reduce((s,v,n)=>s+v*verts[i+n*3+k],0));
     const clearance=p[1]+field.terrain.min-terrainMeshHeight(field.terrain,p[0],p[2]);
     const gx=p[0]+tile.offset[0],gz=p[2]+tile.offset[1],owner=tileAtPosition(manifest,gx,gz);
     if(owner){const of=byId.get(owner.id).field;const wc=p[1]+field.terrain.min-terrainMeshHeight(of.terrain,gx-owner.offset[0],gz-owner.offset[1]);minWorldClearance=Math.min(minWorldClearance,wc);if(wc<-.001)worldBad=true;}
     minClearance=Math.min(minClearance,clearance);maxFloat=Math.max(maxFloat,clearance);
     if(clearance<-.001){bad=true;if(worst.length<200||clearance<worst.at(-1).clearance){worst.push({tile:tile.id,id:road.id,detail,point:[p[0]+tile.offset[0],p[2]+tile.offset[1]],clearance});worst.sort((a,b)=>a.clearance-b.clearance);worst.length=Math.min(200,worst.length);}}
    }if(worldBad)worldBuried++;if(bad){buried++;affected.add(road.id);}
   }
  }
  row.lods.push({detail,triangles,buriedTriangles:buried,affectedWays:affected.size,minClearance,maxClearance:maxFloat,minWorldClearance,worldBuriedTriangles:worldBuried});
 }
 const relevant=manifest.waterProfiles?(await import(pathToFileURL(code+'/lib/water-profile-data.mjs'))).profilesForWaterField(profiles,field):profiles;
 const local=profilesInLocalSpace(relevant,tile);
 for(const area of field.osm.waterAreas){const p=area.footprint;
  for(let i=0;i<p.length;i++){
   const a=p[i],b=p[(i+1)%p.length];
   if([0,1].some(k=>Math.abs(Math.abs(a[k])-field.size/2)<.005&&Math.abs(Math.abs(b[k])-field.size/2)<.005&&Math.sign(a[k])===Math.sign(b[k])))continue;
   const count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));
   for(let j=0;j<=count;j++){
    const x=a[0]+(b[0]-a[0])*j/count,z=a[1]+(b[1]-a[1])*j/count;
    const y=waterVertex(field,[x,z],local,p).position[1]+field.terrain.min;
    const above=y-terrainMeshHeight(field.terrain,x,z);row.banks.samples++;
    if(above>.25)row.banks.above25cm++;
    if(above>row.banks.maxAbove){row.banks.maxAbove=above;row.banks.worst={id:area.id,point:[x+tile.offset[0],z+tile.offset[1]],water:y,ground:y-above};}
   }
  }
 }
 rows.push(row);console.log(tile.id,JSON.stringify(row.lods),JSON.stringify(row.banks));
}
const fixedScope=manifest.waterProfiles?(await import(pathToFileURL(code+'/lib/water-profile-data.mjs'))).profilesForWaterField:null;
const seams=adjacentTilePairs(manifest).map(([a,b])=>{
 const fa=byId.get(a.id).field,fb=byId.get(b.id).field;
 const axis=a.offset[0]===b.offset[0]?1:0,other=1-axis,seam=(a.offset[axis]+b.offset[axis])/2;
 let maxTerrainDelta=0;for(let i=0;i<=128;i++){const p=[];p[axis]=seam;p[other]=a.offset[other]-manifest.size/2+manifest.size*i/128;maxTerrainDelta=Math.max(maxTerrainDelta,Math.abs(terrainMeshHeight(fa.terrain,p[0]-a.offset[0],p[1]-a.offset[1])-terrainMeshHeight(fb.terrain,p[0]-b.offset[0],p[1]-b.offset[1])));}
 const river=seamRiverAudit(fa,fb,a,b);let maxWaterDelta=0;
 const pa=profilesInLocalSpace(fixedScope?fixedScope(profiles,fa):profiles,a),pb=profilesInLocalSpace(fixedScope?fixedScope(profiles,fb):profiles,b);
 for(const q of river.matched){
  const ha=waterVertex(fa,[q.p[0]-a.offset[0],q.p[1]-a.offset[1]],pa,null).position[1]+fa.terrain.min;
  const hb=waterVertex(fb,[q.p[0]-b.offset[0],q.p[1]-b.offset[1]],pb,null).position[1]+fb.terrain.min;
  maxWaterDelta=Math.max(maxWaterDelta,Math.abs(ha-hb));
 }
 let wetBoth=0,wetOnlyOne=0,maxSurfaceDelta=0,worstSurface=null;
 for(let i=0;i<=1000;i++){
  const p=[];p[axis]=seam;p[other]=a.offset[other]-manifest.size/2+manifest.size*i/1000;
  const direction=Math.sign(b.offset[axis]-a.offset[axis]),al=[p[0]-a.offset[0],p[1]-a.offset[1]],bl=[p[0]-b.offset[0],p[1]-b.offset[1]];
  al[axis]-=direction*1e-4;bl[axis]+=direction*1e-4;
  const ha=waterSurfaceElevationAt(fa,al,pa),hb=waterSurfaceElevationAt(fb,bl,pb);
  if((ha===null)!==(hb===null))wetOnlyOne++;
  if(ha!==null&&hb!==null){wetBoth++;const delta=Math.abs(ha-hb);if(delta>maxSurfaceDelta){maxSurfaceDelta=delta;worstSurface={point:p,a:ha,b:hb};}}
 }
 return {a:a.id,b:b.id,maxTerrainDelta,waterSurface:{wetBoth,wetOnlyOne,maxSurfaceDelta,worstSurface},road:seamRoadAudit(fa,fb,a,b),river,maxWaterDelta};
});
await fs.mkdir(path.dirname(path.resolve(outArg)),{recursive:true});
await fs.writeFile(outArg,JSON.stringify({manifestTiles:manifest.tiles.length,profileCount:profiles.length,rows,seams,worst},null,2));
