// Device-only size and walking inspector. Dimensions and foot anchors come
// directly from the loaded world metadata, with no engine-wide size multiplier.
const METRE_PIXELS=46;

function roster(groups){
 const byId=new Map();
 for(const group of groups)for(const member of group.members){
  if(!byId.has(member.id))byId.set(member.id,{
   id:member.id,label:member.name||member.displayName||member.id,
   height:member.height,spriteId:member.spriteId||group.visualSpriteId||member.id,
   footRatios:member.footRatios||[0]
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
async function npcSheet(id,readNpcImage){
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
 if(!bitmap)return {source:placeholder(),columns:1,rows:1,rect:null,owned:false};
 return {source:bitmap,columns:record?.columns||2,rows:record?.rows||2,
  rect:record?.rect||null,owned:true};
}
function imageRect(sheet,index){
 const {source,columns,rows}=sheet;
 if(columns*rows===1)return sheet.rect||{x:0,y:0,width:source.width,height:source.height};
 const col=index%columns,row=Math.floor(index/columns);
 const x=Math.round(col*source.width/columns),y=Math.round(row*source.height/rows);
 return {x,y,width:Math.round((col+1)*source.width/columns)-x,
  height:Math.round((row+1)*source.height/rows)-y};
}
function item(row){
 const card=document.createElement('article');card.className='npc-compare-item';
 const stage=document.createElement('div');stage.className='npc-compare-stage';
 const label=document.createElement('strong');label.textContent=row.label;
 const metric=document.createElement('small');metric.textContent=row.note;
 card.append(stage,label,metric);return {card,stage};
}
function showFrame(stage,source,rect,worldWidth,worldHeight,footOffset){
 let canvas=stage.querySelector('canvas');
 if(!canvas){canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');stage.replaceChildren(canvas);}
 if(canvas.width!==rect.width)canvas.width=rect.width;
 if(canvas.height!==rect.height)canvas.height=rect.height;
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
 canvas.style.height=worldHeight*METRE_PIXELS+'px';
 canvas.style.width=worldWidth*METRE_PIXELS+'px';
 canvas.style.transform='translateY('+footOffset*METRE_PIXELS+'px)';
}
export function openNpcSizeComparison({container,groups,playerPreviews,readNpcImage,onClose=()=>{}}){
 const overlay=document.createElement('section');overlay.className='npc-compare-overlay paper';
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-label','登場人物のサイズ比較');
 const header=document.createElement('header');
 const title=document.createElement('h2');title.textContent='キャラサイズ比較';
 const pause=document.createElement('button');pause.type='button';pause.textContent='一時停止';
 const close=document.createElement('button');close.type='button';close.textContent='比較を閉じる';
 header.append(title,pause,close);
 const info=document.createElement('p');
 info.textContent='全員同じ縮尺・同じ足元線で、歩行アニメを繰り返します。横にスクロールして確認できます。';
 const lineup=document.createElement('div');lineup.className='npc-compare-lineup';
 overlay.append(header,info,lineup);
 (container.closest('main')||document.body).append(overlay);
 let closed=false,playing=true,tick=0;
 const redraw=[],owned=[];
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();dismiss();}};
 const timer=setInterval(()=>{
  if(closed||!playing||document.hidden)return;
  tick=(tick+1)%4;for(const draw of redraw)draw(tick);
 },250);
 const dismiss=()=>{
  if(closed)return;closed=true;clearInterval(timer);
  window.removeEventListener('keydown',onKey);
  for(const bitmap of owned)bitmap.close?.();
  overlay.remove();onClose();
 };
 pause.onclick=()=>{playing=!playing;pause.textContent=playing?'一時停止':'再生';};
 close.onclick=dismiss;window.addEventListener('keydown',onKey);close.focus();
 let players=[];
 try{players=playerPreviews?.()||[];}catch{}
 if(players.length===0)players=[{id:'player',source:placeholder(),
  rect:[0,0,128,192],pivot:[64,190],pixelsPerUnit:96}];
 for(const p of players){
  const frames=p.walkFrames?.length?p.walkFrames:[{rect:p.rect,pivot:p.pivot}];
  const [x,y,w,h]=p.rect;
  const label=p.id==='cat'?'主人公（ねこ）':p.id==='rabbit'?'主人公（うさぎ）':'主人公';
  const {card,stage}=item({label,note:(h/p.pixelsPerUnit).toFixed(2)+'m（画像枠）'});
  lineup.append(card);
  const draw=index=>{
   const f=frames[index%frames.length],[fx,fy,fw,fh]=f.rect;
   showFrame(stage,p.source,{x:fx,y:fy,width:fw,height:fh},
    fw/p.pixelsPerUnit,fh/p.pixelsPerUnit,(fh-f.pivot[1])/p.pixelsPerUnit);
  };
  draw(0);redraw.push(draw);
 }
 for(const npc of roster(groups)){
  const {card,stage}=item({label:npc.label,note:npc.height.toFixed(2)+'m（画像枠）'});
  lineup.append(card);stage.textContent='画像を確認中';
  void (async()=>{
   const sheet=await npcSheet(npc.spriteId,readNpcImage);
   if(closed){if(sheet.owned)sheet.source.close?.();return;}
   if(sheet.owned)owned.push(sheet.source);
   const frames=sheet.columns*sheet.rows;
   const draw=index=>{
    const frame=index%frames,rect=imageRect(sheet,frame),aspect=rect.width/rect.height;
    const footRatio=npc.footRatios[frame]??npc.footRatios[0]??0;
    showFrame(stage,sheet.source,rect,aspect*npc.height,npc.height,footRatio*npc.height);
   };
   draw(tick);redraw.push(draw);
  })().catch(()=>{
   if(closed)return;
   const fallback=placeholder();
   const draw=()=>showFrame(stage,fallback,{x:0,y:0,width:fallback.width,height:fallback.height},
    fallback.width/fallback.height*npc.height,npc.height,0);
   draw();redraw.push(draw);
  });
 }
 return dismiss;
}
