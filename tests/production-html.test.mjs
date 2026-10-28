import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {integrateGameHtml,assertGameHtml} from '../scripts/production-html.mjs';
test('integrates the PUBLIC controls into a PRIVATE document and rejects missing controls',async()=>{
 const template=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const host='<!doctype html><html><head><title>PRIVATE TITLE</title></head><body><div id="app"><div id="scene"></div></div></body></html>';
 const output=integrateGameHtml(host,template);
 assert.match(output,/<title>PRIVATE TITLE<\/title>/);
 assert.match(output,/OpenStreetMap/);
 assert.doesNotMatch(output,/サンプルは架空の地形/);
 assertGameHtml(output);
 assert.throws(()=>assertGameHtml(output.replace('id="retry"','id="missing"')),/retry/);
 assert.throws(()=>integrateGameHtml('<html><body></body></html>',template),/Unrecognized/);
});
