import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSpawnCandidates} from '../lib/spawn-policy.mjs';
test('future object definitions enforce habitat, surface, footprint, spacing and stable choice',()=>{
 const points=Array.from({length:5},(_,i)=>({id:'p'+i,position:[i*10,20,0],biome:i===4?'urban':'woodland',allowedObjectTypes:['bird'],terrain:{surface:'dry-ground',clearance:1.5}}));
 const definition={type:'bird',surface:'dry-ground',radius:.5,biomes:['woodland']};
 const a=selectSpawnCandidates(points,definition,{minSpacing:15,limit:2});assert.equal(a.length,2);assert.ok(Math.abs(a[0].position[0]-a[1].position[0])>=15);assert.ok(a.every(p=>p.biome==='woodland'));
 assert.deepEqual(a,selectSpawnCandidates([...points].reverse(),definition,{minSpacing:15,limit:2}));
 assert.equal(selectSpawnCandidates(points,{...definition,radius:2}).length,0);assert.equal(selectSpawnCandidates(points,{...definition,type:'duck'}).length,0);assert.throws(()=>selectSpawnCandidates(points,{...definition,surface:'water'}));
});
