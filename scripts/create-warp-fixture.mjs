/** Fictional-only fixture. Never copies PRIVATE sprite, names or geometry. */
import fs from 'node:fs/promises';import path from 'node:path';
import {createTiledWorld,registerTile,tileAtPosition} from '../lib/tiles.mjs';import {validateLanding} from '../lib/warp.mjs';import {renderedFootHeight} from '../lib/avatar-ground.mjs';
const root=path.resolve(process.argv[2]);const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));const write=async(p,v)=>fs.writeFile(path.join(root,p),JSON.stringify(v,null,2));
const m=await read('public/data/tiles.json'),w=createTiledWorld(m);for(const t of m.tiles)registerTile(w,t,await read('public/'+t.url));
const pois=await read('public/data/pois.json');const warps=[];
for(const [id,min,max] of [['fictional-warp',400,600],['fictional-seam',249,251]]){
 let found;
 for(let x=min;x<=max&&!found;x+=2)for(let z=-100;z<=100&&!found;z+=5){const tile=tileAtPosition(m,x,z),f=w.tileWorlds.get(tile.id).field,y=renderedFootHeight(f,x-tile.offset[0],z-tile.offset[1],w.baseElevation,{roadStep:2.4})+w.baseElevation;const l={confirmed:true,publicAccessVerified:true,position:[x,y,z],yaw:1,clearance:1.5};if(validateLanding(w,l).ok)found={tile,l};}
 if(!found)throw Error('No safe synthetic landing');
 const {tile,l}=found;pois.points.push({...pois.points[0],id,name:'架空のワープ',tileId:tile.id,position:[l.position[0],20,l.position[2]]});warps.push({id,landing:l});
}
pois.points.push({...pois.points[0],id:'fictional-unconfirmed',name:'架空の通常地点'});warps.push({id:'fictional-unconfirmed',landing:{confirmed:false}});
await write('public/data/pois.json',pois);await write('public/data/warps.json',{schema:1,points:warps});
await fs.mkdir(path.join(root,'public/assets'),{recursive:true});
await fs.writeFile(path.join(root,'public/assets/fictional-sprite.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect x="2" y="2" width="28" height="28" fill="orange"/><circle cx="48" cy="16" r="14" fill="blue"/></svg>');
await write('public/data/player-sprite.json',{schema:1,image:'assets/fictional-sprite.svg',width:64,height:32,pixelsPerUnit:16,stride:2,frames:[{rect:[0,0,32,32],pivot:[16,31]},{rect:[32,0,32,32],pivot:[16,31]}],animations:{idle:[0],walk:[0]},characters:[{id:'cat',animations:{idle:[0],walk:[0]}},{id:'rabbit',animations:{idle:[1],walk:[1]}}]});
console.log('Fictional warp fixture ready');
