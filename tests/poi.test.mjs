import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPoiRegistry,layoutPoiMarkers,rectanglesOverlap,POI_CATEGORIES} from '../lib/poi.mjs';
import {loadPoiRegistry} from '../src/poi-markers.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../public/data/tiles.json',import.meta.url)));
const source={id:'fixture',provider:'Fictional test',url:'https://example.com/source',licence:'CC0',licenceURL:'https://creativecommons.org/publicdomain/zero/1.0/',attribution:'Synthetic',retrievedAt:'2026-10-24T00:00:00Z'};
const point=(id='test:1',position=[0,5,0],tileId='north')=>({id,category:'park',name:'架空の公園',tileId,position,marker:{enabled:true,priority:1,range:650},biomeTags:['park'],eventTags:[],source:{id:'fixture',feature:'synthetic',url:'https://example.com/source'}});
const data=()=>({schema:1,sources:[source],points:[point()]});
test('POI registry has immutable shared IDs and half-open tile boundary ownership',()=>{
 const d=data();d.points.push(point('test:boundary',[250,5,0],'east'));const r=createPoiRegistry(d,manifest);
 assert.equal(r.get('test:boundary'),r.forTile('east')[0]);assert.equal(r.points.length,2);
 assert.ok(Object.isFrozen(r.get('test:1').marker));assert.ok(Object.isFrozen(r.get('test:1').position));
 d.points[0].name='Changed';assert.equal(r.get('test:1').name,'架空の公園');
 for(let i=0;i<10;i++){assert.equal(r.forTile('north').length,1);assert.equal(r.get('test:1').position[0],0);}
});
test('POI schema rejects wrong tile, duplicate, nonfinite/outside coordinates, unknown source and private metadata',()=>{
 const mutations=[d=>d.points.push(point()),d=>d.points[0].tileId='east',d=>d.points[0].position[0]=NaN,d=>d.points[0].position[0]=999999,d=>d.points[0].source.id='missing',d=>d.points[0].family='private',d=>d.points[0].name='<script>',d=>d.points[0].marker.range=999999];
 for(const mutate of mutations){const d=data();mutate(d);assert.throws(()=>createPoiRegistry(d,manifest));}
 assert.equal(Object.keys(POI_CATEGORIES).length,5);
 assert.equal(new Set(Object.values(POI_CATEGORIES).map(x=>x.icon)).size,5);
});
test('screen layout bounds icons AND labels, enforces distance/limits and reserves input/HUD areas',()=>{
 const candidates=Array.from({length:120},(_,i)=>({point:point('p:'+i),x:25+(i%12)*50,y:25+Math.floor(i/12)*45,depth:0,distance:i*5,near:i<10}));
 for(const mode of ['walk','map'])for(const mobile of [false,true]){
  const exclusions=[{left:10,right:180,top:310,bottom:500}];
  const out=layoutPoiMarkers(candidates,{width:650,height:500,mode,mobile,exclusions});
  assert.ok(out.length>0);assert.ok(out.length<=(mode==='walk'?3:mobile?12:18));
  out.forEach((a,i)=>{assert.ok(!exclusions.some(b=>rectanglesOverlap(a.box,b)));out.slice(i+1).forEach(b=>assert.ok(!rectanglesOverlap(a.box,b.box,8)));});
  assert.deepEqual(out,layoutPoiMarkers([...candidates].reverse(),{width:650,height:500,mode,mobile,exclusions}));
 }
 const far={...candidates[0],distance:1000};assert.equal(layoutPoiMarkers([far],{width:650,height:500,mode:'walk'}).length,0);
});
test('optional POI absence is supported but malformed registry is surfaced',async()=>{
 const fetcher=async()=>new Response('',{status:404});const r=await loadPoiRegistry({baseURL:'/',manifest,fetcher});assert.equal(r.points.length,0);
 await assert.rejects(loadPoiRegistry({baseURL:'/',manifest,fetcher:async()=>Response.json({schema:9})}),/registry/);
});

test('walking hides recognisable water/bridges and reserves only three landmarks',()=>{
 const candidates=Array.from({length:10},(_,i)=>({point:{...point('p:'+i),category:i===0?'water':i===1?'bridge':'park'},x:40+i*60,y:100,depth:0,distance:20,near:false}));
 const out=layoutPoiMarkers(candidates,{width:800,height:600,mode:'walk'});assert.equal(out.length,3);assert.ok(out.every(c=>c.point.category==='park'));
});
