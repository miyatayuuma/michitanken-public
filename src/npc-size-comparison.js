import {BOOK_GROUPS} from '../lib/book-characters.mjs';

// Local-only inspector: use the exact source images and metres-per-pixel sizes
// from gameplay. Never serialise artwork or host-specific coordinates.
const METRE_PIXELS=110;
function roster(groups){
 const byId=new Map();
 for(const g of BOOK_GROUPS)for(const [id,label,height] of g.members)
  byId.set(id,{id,label,height,spriteId:id.startsWith('twin-')?'twins':id});
 for(const g of groups)for(const member of g.members){
  const previous=byId.get(member.id);
  byId.set(member.id,{
   id:member.id,label:previous?.label||member.id,height:member.height,
   spriteId:member.spriteId||g.visualSpriteId||previous?.spriteId||member.id
  });
 }
 return [...byId.values()];
}
function placeholder(){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=192;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#46534c';
 ctx.beginPath();ctx.arc(64,44,30,0,Math.PI*2);ctx.fill();
 ctx.fillRect(34,76,60,102);return canvas;
}
async function npcFrame(id,readNpcImage){
 const url=globalThis.michiWorldAsset?.('assets/npc/'+id+'.png');
 let record=null,bitmap=null;
 if(url){
  try{const response=await fetch(url);if(response.ok)bitmap=await createImageBitmap(await response.blob());}
  catch{bitmap=null;}
 }
 if(!bitmap){
  try{record=await readNpcImage(id);if(record?.blob)bitmap=await createImageBitmap(record.blob);}
  catch{bitmap=null;}
 }
 if(!bitmap)return {canvas:placeholder(),footRatio:0};
 try{
  const columns=record?.columns||2,rows=record?.rows||2;
  const bounds=columns*rows===1&&record?.rect
   ?record.rect
   :{x:0,y:0,width:Math.round(bitmap.width/columns),height:Math.round(bitmap.height/rows)};
  const canvas=document.createElement('canvas');
  canvas.width=bounds.width;canvas.height=bounds.height;
  canvas.getContext('2d').drawImage(bitmap,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
  return {canvas,footRatio:columns===2&&rows===2?.1:0};
 }finally{bitmap.close?.();}
}
function item(row){
 const card=document.createElement('article');card.className='npc-compare-item';
 const stage=document.createElement('div');stage.className='npc-compare-stage';
 const label=document.createElement('strong');label.textContent=row.label;
 const metric=document.createElement('small');metric.textContent=row.note;
 card.append(stage,label,metric);return {card,stage};
}
function showCanvas(stage,source,rect,worldWidth,worldHeight,footOffset){
 const canvas=document.createElement('canvas');
 canvas.width=rect.width;canvas.height=rect.height;
 canvas.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
 canvas.style.height=worldHeight*METRE_PIXELS+'px';
 canvas.style.width=worldWidth*METRE_PIXELS+'px';
 canvas.style.transform='translateY('+footOffset*METRE_PIXELS+'px)';
 canvas.setAttribute('aria-hidden','true');
 stage.replaceChildren(canvas);
}
export function openNpcSizeComparison({container,groups,scaleFactor,playerPreviews,readNpcImage,onClose=()=>{}}){
 const overlay=document.createElement('section');overlay.className='npc-compare-overlay paper';
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','登場人物のサイズ比較');
 const header=document.createElement('header');
 const title=document.createElement('h2');title.textContent='キャラサイズ比較';
 const close=document.createElement('button');close.textContent='比較を閉じる';
 header.append(title,close);
 const info=document.createElement('p');info.textContent='すべて同じ縮尺・同じ足元線です。横にスクロールして比較できます。';
 const lineup=document.createElement('div');lineup.className='npc-compare-lineup';
 overlay.append(header,info,lineup);
 (container.closest('main')||document.body).append(overlay);
 let closed=false;
 const dismiss=()=>{if(closed)return;closed=true;window.removeEventListener('keydown',onKey);overlay.remove();onClose();};
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();dismiss();}};
 close.onclick=dismiss;
 window.addEventListener('keydown',onKey);
 close.focus();
 let players=[];
 try{players=playerPreviews?.()||[];}catch{}
 if(players.length===0)players=[{id:'player',source:placeholder(),rect:[0,0,128,192],pivot:[64,190],pixelsPerUnit:96,fallback:true}];
 for(const p of players){
  const [x,y,w,h]=p.rect;
  const height=h/p.pixelsPerUnit,width=w/p.pixelsPerUnit;
  const label=p.id==='cat'?'主人公（ねこ）':p.id==='rabbit'?'主人公（うさぎ）':'主人公';
  const {card,stage}=item({label,note:height.toFixed(2)+'m（画像枠）'});
  lineup.append(card);
  showCanvas(stage,p.source,{x,y,width:w,height:h},width,height,(h-p.pivot[1])/p.pixelsPerUnit);
 }
 for(const npc of roster(groups)){
  const height=npc.height*scaleFactor;
  const {card,stage}=item({label:npc.label,note:height.toFixed(2)+'m（画像枠）'});
  lineup.append(card);
  stage.textContent='画像を確認中';
  void (async()=>{
   const frame=await npcFrame(npc.spriteId,readNpcImage);
   if(closed)return;
   const aspect=frame.canvas.width/frame.canvas.height;
   showCanvas(stage,frame.canvas,{x:0,y:0,width:frame.canvas.width,height:frame.canvas.height},aspect*height,height,frame.footRatio*height);
  })().catch(()=>{
   if(closed)return;
   const fallback=placeholder();
   showCanvas(stage,fallback,{x:0,y:0,width:fallback.width,height:fallback.height},fallback.width/fallback.height*height,height,0);
  });
 }
 return dismiss;
}
