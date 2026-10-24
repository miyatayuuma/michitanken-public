// Shared by full meshes, overview meshes and the fixed-size atlas.
export const WALL_PALETTE=Object.freeze([0xe3d4b3,0xd5c5ac,0xe2c4bd,0xced2ca,0xaac4bc,0xc5b09b,0xd0b8a2,0xc2c9d4]);
export const ROOF_PALETTE=Object.freeze([0x9d6759,0x876c5e,0x697b78,0x727c8b,0xa47e60,0x8d756e,0x777c71,0x96745e]);
export const ORIGINAL_BUILDING_COLORS=Object.freeze({wall:0xd3d7cf,roof:0xb47968});
export function stableHash(seed){
 let h=2166136261;
 for(const c of String(seed)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 return h>>>0;
}
export function buildingKey(building,entry={offset:[0,0]}){
 if(building.id!==undefined&&building.id!==null&&String(building.id)!=='')return 'building:'+building.id;
 // Canonical world-space vertices make ring rotation, winding and tile-local
 // coordinate changes immaterial for unlabelled synthetic geometry.
 return 'shape:'+building.footprint.map(p=>p.map((v,i)=>Math.round((v+entry.offset[i])*1000)).join(':')).sort().join(';');
}
export function buildingColors(building,entry,enabled=true){
 if(!enabled)return ORIGINAL_BUILDING_COLORS;
 const key=buildingKey(building,entry);
 return {wall:WALL_PALETTE[stableHash(key+':wall')%WALL_PALETTE.length],
  roof:ROOF_PALETTE[stableHash(key+':roof')%ROOF_PALETTE.length]};
}
export const cssColor=value=>'#'+value.toString(16).padStart(6,'0');
// Linear-light multipliers preserve the authored material/vertex colour.
// Exclude trees and textured models; no extra instance buffer is allocated.
export function natureTint(kind,worldX,worldZ){
 if(!['grass','flower','bush','rock'].includes(kind))return null;
 const key=kind+':'+Math.round(worldX*1000)+':'+Math.round(worldZ*1000);
 return ['r','g','b'].map(channel=>.90+(stableHash(key+channel)%1001)/10000);
}
