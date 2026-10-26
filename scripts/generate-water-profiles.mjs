// Build-time full-field fit: no tile-cache-dependent runtime elevation changes.
// Data and hashes inherit the input visibility; real outputs belong in PRIVATE.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {fitGlobalWaterProfiles} from '../lib/tile-water.mjs';import {decodeWaterProfiles} from '../lib/water-profile-data.mjs';
const [root,out]=process.argv.slice(2),m=JSON.parse(await fs.readFile(root+'/public/data/tiles.json')),hashes={};
const snapshots=await Promise.all(m.tiles.map(async tile=>{const raw=await fs.readFile(root+'/public/'+tile.url);hashes[tile.id]=createHash('sha256').update(raw).digest('hex');return {tile,field:JSON.parse(raw)};}));
const profiles=fitGlobalWaterProfiles(snapshots,m),data={schema:1,method:'whole-field fitGlobalWaterProfiles; original DEM and source ways',tileIds:m.tiles.map(t=>t.id),sourceSHA256:hashes,profiles};
decodeWaterProfiles(data,m);await fs.writeFile(out,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({tiles:snapshots.length,profiles:profiles.length}));
