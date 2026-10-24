import * as THREE from 'three';
import {BIOME_COLORS} from '../lib/biomes.mjs';
/** Explicit test URL only. The full audit dataset is never fetched by players. */
export async function createBiomeDebug({scene,container,baseElevation,baseURL}){
 const q=new URLSearchParams(location.search);if(!q.has('test')||q.get('biomes')!=='1')return null;
 const response=await fetch(baseURL+'data/biomes.json');if(!response.ok)throw Error('Missing biome audit');
 const data=await response.json();if(data.schema!==1||!Array.isArray(data.samples)||!Array.isArray(data.candidates))throw Error('Invalid biome audit');
 const panel=document.createElement('div');panel.className='biome-debug';
 const select=document.createElement('select');
 for(const [value,label] of [['biome','環境の分類'],['candidate','出現候補'],['excluded','除外地点']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
 const output=document.createElement('pre');panel.append(select,output);container.append(panel);
 const group=new THREE.Group();scene.add(group);let cloud=null;
 function rebuild(){
  if(cloud){group.remove(cloud);cloud.geometry.dispose();cloud.material.dispose();}
  const list=select.value==='candidate'?data.candidates:select.value==='excluded'?data.samples.filter(p=>p.reason&&p.reason!=='density'):data.samples;
  const positions=[],colors=[];
  for(const p of list){positions.push(p.position[0],p.position[1]-baseElevation+1.5,p.position[2]);const c=new THREE.Color(select.value==='excluded'?'#e85d61':BIOME_COLORS[p.biome]);colors.push(c.r,c.g,c.b);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  cloud=new THREE.Points(geo,new THREE.PointsMaterial({size:select.value==='biome'?3:4,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.7,depthTest:false}));cloud.renderOrder=20;group.add(cloud);
  output.textContent=Object.entries(data.totals).map(([b,n])=>`${b}: ${n.areaM2}m² / ${n.candidates}候補`).join('\n')+'\n'+JSON.stringify(data.excluded);
 }
 select.addEventListener('change',rebuild);rebuild();
 return {data,dispose(){select.removeEventListener('change',rebuild);scene.remove(group);cloud?.geometry.dispose();cloud?.material.dispose();panel.remove();}};
}
