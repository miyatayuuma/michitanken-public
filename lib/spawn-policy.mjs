/** Declarative habitat/object contract. This module places no game objects. */
export const DEFAULT_SPAWN_POLICY=Object.freeze({step:10,density:.18,seed:'mt03-v1',radius:1.5,maxSlope:.35,seamTolerance:.5,waterBand:12});
export const BIOME_OBJECTS=Object.freeze(Object.fromEntries(Object.entries({urban:['small-treasure','lost-item'],grassland:['insect','acorn','bird'],woodland:['bird','rare-insect','fossil'],waterside:['frog','waterside-treasure']}).map(([k,v])=>[k,Object.freeze(v)])));
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
/** Future definitions can select compatible dry-ground candidates without
 * reclassifying terrain. This returns records only; there is no spawn renderer. */
export function selectSpawnCandidates(candidates,definition,{seed='selection-v1',limit=20,minSpacing=10}={}){
 if(!definition||typeof definition.type!=='string'||definition.surface!=='dry-ground'||!Number.isFinite(definition.radius)||definition.radius<=0||!Array.isArray(definition.biomes)||!definition.biomes.length||definition.biomes.some(b=>!Object.hasOwn(BIOME_OBJECTS,b))||!Number.isInteger(limit)||limit<0||limit>1000||!Number.isFinite(minSpacing)||minSpacing<0)throw Error('Invalid object selection policy');
 const compatible=candidates.filter(c=>c.allowedObjectTypes.includes(definition.type)&&definition.biomes.includes(c.biome)&&c.terrain.surface===definition.surface&&definition.radius<=c.terrain.clearance);
 compatible.sort((a,b)=>hash(seed+':'+a.id)-hash(seed+':'+b.id)||a.id.localeCompare(b.id));
 const out=[];
 for(const c of compatible){if(out.length>=limit)break;if(out.every(p=>Math.hypot(c.position[0]-p.position[0],c.position[2]-p.position[2])>=Math.max(minSpacing,definition.radius*2)))out.push(c);}
 return out;
}
