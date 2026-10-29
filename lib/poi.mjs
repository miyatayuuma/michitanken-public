import {tileAtPosition,validateManifest} from './tiles.mjs';
export const POI_CATEGORIES=Object.freeze({
 temple:{label:'寺院',color:'#8c7252',shape:'square',icon:'M3 10h18L12 3ZM5 11v10h14V11M9 15h6v6'},
 park:{label:'公園',color:'#4e7754',shape:'round',icon:'M12 3 5 12h4l-3 5h5v4h2v-4h5l-3-5h4Z'},
 shrine:{label:'神社・寺院',color:'#a45d4d',shape:'pentagon',icon:'M3 5h18M5 8h14M7 6v15M17 6v15M6 12h12'},
 bridge:{label:'橋',color:'#b97d3e',shape:'square',icon:'M3 19v-7Q12 2 21 12v7M3 13h18M7 8v5M12 6v7M17 8v5'},
 water:{label:'水辺',color:'#427b9a',shape:'drop',icon:'M3 9q3-4 6 0t6 0t6 0M3 15q3-4 6 0t6 0t6 0'},
 civic:{label:'目印',color:'#6d7181',shape:'square',icon:'M3 8 12 3l9 5ZM5 10v9M10 10v9M15 10v9M20 10v9M3 21h18'}
});
const keys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
const text=(v,max=80)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f<>]/.test(v);
const https=v=>{try{return new URL(v).protocol==='https:';}catch{return false;}};
const tags=v=>Array.isArray(v)&&v.length<=16&&new Set(v).size===v.length&&v.every(t=>/^[a-z][a-z0-9:-]{0,47}$/.test(t));
export function createPoiRegistry(data,manifest){
 validateManifest(manifest);
 if(!keys(data,['schema','sources','points'])||data.schema!==1||!Array.isArray(data.sources)||!Array.isArray(data.points)||data.points.length>512)throw Error('Invalid POI registry');
 const sources=new Map(),byId=new Map(),byTile=new Map();
 for(const source of data.sources){
  if(!keys(source,['id','provider','url','licence','licenceURL','attribution','retrievedAt'])||!text(source.id)||sources.has(source.id)||!text(source.provider)||!https(source.url)||!text(source.licence)||!https(source.licenceURL)||!text(source.attribution,160)||!Number.isFinite(Date.parse(source.retrievedAt)))throw Error('Invalid POI source');
  sources.set(source.id,Object.freeze({...source}));
 }
 for(const p of data.points){
  const m=p.marker;
  if(!keys(p,['id','category','name','tileId','position','marker','biomeTags','eventTags','source'])||!/^[-a-z0-9:]{1,96}$/.test(p.id)||byId.has(p.id)||!Object.hasOwn(POI_CATEGORIES,p.category)||!text(p.name)||!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite)||p.position[1]<-500||p.position[1]>9000||tileAtPosition(manifest,p.position[0],p.position[2])?.id!==p.tileId||!keys(m,['enabled','priority','range'])||typeof m.enabled!=='boolean'||!Number.isInteger(m.priority)||m.priority<0||m.priority>10||!Number.isFinite(m.range)||m.range<50||m.range>1200||!tags(p.biomeTags)||!tags(p.eventTags)||!keys(p.source,['id','feature','url'])||!sources.has(p.source.id)||!text(p.source.feature)||!https(p.source.url))throw Error('Invalid POI point: '+(p?.id||'?'));
  const point=Object.freeze({...p,position:Object.freeze([...p.position]),marker:Object.freeze({...m}),biomeTags:Object.freeze([...p.biomeTags]),eventTags:Object.freeze([...p.eventTags]),source:Object.freeze({...p.source})});
  byId.set(point.id,point);
  if(!byTile.has(point.tileId))byTile.set(point.tileId,[]);
  byTile.get(point.tileId).push(point);
 }
 const points=Object.freeze([...byId.values()].sort((a,b)=>a.id.localeCompare(b.id)));
 return Object.freeze({points,sources:Object.freeze([...sources.values()]),get:id=>byId.get(id),forTile:id=>Object.freeze([...(byTile.get(id)||[])])});
}
export const rectanglesOverlap=(a,b,pad=5)=>a.left<b.right+pad&&a.right>b.left-pad&&a.top<b.bottom+pad&&a.bottom>b.top-pad;
/** Pure screen-space layout. Markers are informational and never input targets.
 * Stable priority/distance/ID ordering suppresses colliding icons AND labels.
 */
export function layoutPoiMarkers(candidates,{width,height,mode,mobile=false,exclusions=[]}){
 const limit=mode==='walk'?3:mobile?12:18,out=[];
 const sorted=[...candidates].sort((a,b)=>b.point.marker.priority-a.point.marker.priority||a.distance-b.distance||a.point.id.localeCompare(b.point.id));
 for(const c of sorted){
  if(out.length>=limit)break;
  if(!c.point.marker.enabled||c.depth< -1||c.depth>1||!Number.isFinite(c.x)||!Number.isFinite(c.y)||(mode==='walk'&&c.distance>c.point.marker.range))continue;
  // Name remains in a compact single line; far markers display pictograms only.
  const label=c.near&&!out.some(v=>v.label&&v.point.name===c.point.name),boxWidth=label?Math.min(200,Math.max(100,c.point.name.length*12+58)):30;
  const box={left:c.x-boxWidth/2,right:c.x+boxWidth/2,top:c.y-15,bottom:c.y+15};
  if(box.left<8||box.right>width-8||box.top<8||box.bottom>height-8||exclusions.some(b=>rectanglesOverlap(box,b))||out.some(b=>rectanglesOverlap(box,b.box,8)))continue;
  out.push({...c,label,box});
 }
 return out;
}
