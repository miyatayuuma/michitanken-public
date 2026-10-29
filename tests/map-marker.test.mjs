import test from 'node:test';import assert from 'node:assert/strict';import {MAP_MARKER,nearestMapPoint as hit} from '../lib/map-marker.mjs';
const clip={left:0,top:0,side:100},a={id:'a',x:40,y:50},b={id:'b',x:50,y:50};
test('44px effective hit region; inclusive edge, outside rejection',()=>{assert.equal(hit([a],{x:18,y:50},clip),a);assert.equal(hit([a],{x:17.9,y:50},clip),null);assert.ok(MAP_MARKER.hitRadius>=22);});
test('overlapping targets remain individually selectable; ties independent of registry order',()=>{assert.equal(hit([a,b],a,clip),a);assert.equal(hit([a,b],b,clip),b);for(const points of [[a,b],[b,a]])assert.equal(hit(points,{x:45,y:50},clip),a);});
test('off-map cursor and clipped marker cannot capture clicks',()=>{assert.equal(hit([{id:'x',x:-1,y:50}],{x:1,y:50},clip),null);assert.equal(hit([a],{x:-1,y:50},clip),null);});
