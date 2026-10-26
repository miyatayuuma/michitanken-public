export function decodeWaterProfiles(data,manifest){
 if(data?.schema!==1||!Array.isArray(data.tileIds)||!Array.isArray(data.profiles)||
    JSON.stringify([...data.tileIds].sort())!==JSON.stringify(manifest.tiles.map(t=>t.id).sort()))throw Error('Water profile coverage mismatch');
 return data.profiles.map(p=>{
  if(!Array.isArray(p.nodes)||p.nodes.length<2||!p.nodes.every(n=>Array.isArray(n)&&n.length===2&&n.every(Number.isFinite))||
     !Array.isArray(p.lengths)||p.lengths.length!==p.nodes.length||p.lengths[0]!==0||
     !p.lengths.every((v,i)=>Number.isFinite(v)&&(!i||v>p.lengths[i-1]))||
     !Number.isFinite(p.length)||p.length!==p.lengths.at(-1)||!Number.isFinite(p.start)||
     !Number.isFinite(p.slope)||Math.abs(p.slope)>.035||typeof p.reverseFlow!=='boolean')throw Error('Invalid fixed water profile');
  return {...p,getHeight(station){return p.start+p.slope*Math.max(0,Math.min(p.length,station));}};
 });
}
// A distant river must never dictate an unrelated pond's elevation merely
// because the fixed corpus contains every river in the declared grid.
export function profilesForWaterField(profiles,field){
 const ids=new Set((field.osm.waterways||[]).filter(w=>!w.tunnel&&w.layer>=0).map(w=>w.id));
 return profiles.filter(p=>ids.has(p.id));
}
export async function loadWaterProfiles(manifest,root,fetcher){
 if(!manifest.waterProfiles)return null;
 if(!/^data\/[a-z0-9/_-]+\.json$/.test(manifest.waterProfiles))throw Error('Unsafe water profile path');
 const response=await fetcher(root+manifest.waterProfiles,{cache:'no-store'});
 if(!response.ok)throw Error('Declared water profiles unavailable');
 return decodeWaterProfiles(await response.json(),manifest);
}
