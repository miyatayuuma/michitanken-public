import * as THREE from 'three';
import {MAP_ICONS} from './exploration-map.js';
import {POI_CATEGORIES,createPoiRegistry,layoutPoiMarkers} from '../lib/poi.mjs';
export async function loadPoiRegistry({baseURL,manifest,fetcher=fetch}){
 const response=await fetcher(baseURL.replace(/\/?$/,'/')+'data/pois.json',{cache:'no-store'});
 if(response.status===404||!response.headers.get('content-type')?.includes('json'))return createPoiRegistry({schema:1,sources:[],points:[]},manifest);
 if(!response.ok)throw Error('POI HTTP '+response.status);
 return createPoiRegistry(await response.json(),manifest);
}
const MATERIALS=MAP_ICONS;
export function createPoiMarkers({container,registry,baseElevation,mobile=false}){
 const layer=document.createElement('div');layer.className='poi-layer';layer.setAttribute('aria-hidden','true');container.append(layer);
 const pool=[],v=new THREE.Vector3();let displayed=[];
 // Comparison is intentionally restricted to development/test sessions.
 const query=new URLSearchParams(location.search);
 let theme=query.has('test')&&query.get('markers')==='legacy'?'legacy':'cartography';
 layer.dataset.theme=theme;
 const max=Math.min(24,registry.points.length);
 for(let i=0;i<max;i++){
  const node=document.createElement('div'),icon=document.createElement('span'),name=document.createElement('span');
  node.className='poi-marker';node.hidden=true;icon.className='poi-icon';name.className='poi-name';node.append(icon,name);layer.append(node);pool.push({node,icon,name,category:null});
 }
 // Reserved HUD rectangles are read only at creation/resize, never each frame.
 let size=null;
 function update({camera,mode,focus,isFound=()=>true,pulse=()=>0,isWarp=()=>false}){
  const width=container.clientWidth,height=container.clientHeight;
  if(!size||size.width!==width||size.height!==height||size.mode!==mode){
   const origin=container.getBoundingClientRect();
   const exclusions=['#status','#player-coords','#details','.compass','#joystick','#run'].flatMap(selector=>{
    const el=document.querySelector(selector);if(!el||!el.getClientRects().length)return [];
    const b=el.getBoundingClientRect();return [{left:b.left-origin.left,right:b.right-origin.left,top:b.top-origin.top,bottom:b.bottom-origin.top}];
   });
   // Reserve the projected player area as well as the HUD.
   if(mode==='walk')exclusions.push({left:width*.34,right:width*.66,top:height*.40,bottom:height*.86});
   size={width,height,mode,exclusions};
  }
  camera.updateMatrixWorld();
  const candidates=registry.points.flatMap(point=>{
   const distance=Math.hypot(point.position[0]-focus.x,point.position[2]-focus.z);
   if(mode!=='walk'||!isFound(point.id)||!point.marker.enabled||(mode==='walk'&&distance>point.marker.range))return [];
   v.set(point.position[0],point.position[1]-baseElevation+4,point.position[2]).project(camera);
   return {point,distance,x:(v.x+1)*width/2,y:(1-v.y)*height/2,depth:v.z,
    near:distance<=65&&(mode==='walk'||camera.position.y<320)};
  });
  displayed=layoutPoiMarkers(candidates,{...size,mobile});
  for(let i=0;i<max;i++){
   const {node,icon,name}=pool[i],c=displayed[i];node.hidden=!c;if(!c)continue;
   node.classList.toggle('discovering',pulse(c.point.id)>0);node.classList.toggle('warp-open',isWarp(c.point.id));
   node.dataset.poiId=c.point.id;node.dataset.tileId=c.point.tileId;
   const style=POI_CATEGORIES[c.point.category];
   if(pool[i].category!==c.point.category+theme){
    // Only built-in constant SVG paths enter markup; all data labels use textContent.
    const asset=theme==='cartography'&&MATERIALS[c.point.category];
    if(asset){icon.replaceChildren();const img=document.createElement('img');img.src=asset;img.alt='';img.draggable=false;icon.append(img);}else icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+style.icon+'"/></svg>';
    pool[i].category=c.point.category+theme;node.dataset.role='landmark';node.dataset.material=asset?'cartography':'legacy';node.dataset.shape=style.shape;node.style.setProperty('--poi-color',style.color);
   }
   node.style.transform=`translate(${c.box.left}px,${c.box.top}px)`;node.style.width=(c.box.right-c.box.left)+'px';
   name.textContent=c.point.name;name.hidden=!c.label;
  }
  container.dataset.poiTotal=String(registry.points.length);container.dataset.poiVisible=String(displayed.length);
 }
 return {update,setTheme(value){if(!query.has('test')||!['legacy','cartography'].includes(value))return false;theme=value;layer.dataset.theme=theme;return true;},snapshot:()=>displayed.map(c=>({id:c.point.id,tileId:c.point.tileId,position:[...c.point.position],label:c.label,box:{...c.box}})),dispose(){layer.remove();pool.length=0;displayed=[];}};
}
