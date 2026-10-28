/**
 * Versioned, data-only character/dialogue catalog.
 *
 * The runtime implements presentation, persistence and deterministic legacy
 * scene rotation; authored voices, cast choices, and narrative rules stay
 * outside the PUBLIC engine. No geographic position or reading history here.
 */
const ID=/^[a-z][a-z0-9-]{0,63}$/;
const validId=value=>typeof value==='string'&&ID.test(value);
function requireValue(ok,message){if(!ok)throw Error('NPC catalog: '+message);}
function uniqueIds(values,kind){
 requireValue(Array.isArray(values)&&values.length>0,kind+' must be a nonempty array');
 requireValue(values.every(validId)&&new Set(values).size===values.length,'Invalid/duplicate '+kind);
 return values;
}
function validLines(lines,memberIds,tag){
 requireValue(Array.isArray(lines)&&lines.length>0&&lines.length<=64,'Invalid dialogue '+tag);
 for(const [index,item] of lines.entries()){
  requireValue(Array.isArray(item)&&item.length===2,'Invalid dialogue line '+tag+':'+index);
  const [speakerId,content]=item;
  requireValue(memberIds.has(speakerId),'Speaker outside cast '+tag+':'+index);
  requireValue(typeof content==='string'&&content.trim().length>0&&content.length<=1200,'Invalid text '+tag+':'+index);
 }
}
/** Validate without executing scripts or modifying the supplied object. */
export function validateNpcCatalog(raw){
 requireValue(raw&&typeof raw==='object'&&!Array.isArray(raw)&&raw.schema===1,'Unsupported schema');
 requireValue(Array.isArray(raw.characters)&&raw.characters.length>0&&raw.characters.length<=128,'Invalid characters');
 const characters=new Map(),sprites=new Set();
 for(const c of raw.characters){
  requireValue(c&&validId(c.id)&&!characters.has(c.id),'Invalid/duplicate character id');
  requireValue(typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=80,'Invalid character name');
  requireValue(validId(c.spriteId),'Missing/invalid spriteId for '+c.id);
  characters.set(c.id,{id:c.id,name:c.name,spriteId:c.spriteId});
  sprites.add(c.spriteId);
 }
 requireValue(Array.isArray(raw.spritePacks)&&raw.spritePacks.length>0,'Missing image packs');
 const spritePacks=[],packs=new Set(),packedSprites=new Set();
 for(const p of raw.spritePacks){
  requireValue(p&&validId(p.id)&&!packs.has(p.id),'Invalid/duplicate pack id');
  requireValue(typeof p.name==='string'&&p.name.trim()&&p.name.length<=80,'Invalid pack label');
  const ids=uniqueIds(p.spriteIds,'sprite pack ids');
  requireValue(ids.length<=39,'ZIP pack supports at most 39 sprites');
  for(const id of ids){
 requireValue(!packedSprites.has(id),'Duplicate sprite among packs: '+id);
   packedSprites.add(id);
  }
  packs.add(p.id);spritePacks.push({id:p.id,name:p.name,spriteIds:ids.slice()});
 }
 requireValue([...sprites].every(id=>packedSprites.has(id)),'Character sprite missing from packs');
 requireValue(Array.isArray(raw.dialogueSets)&&raw.dialogueSets.length>0&&raw.dialogueSets.length<=128,'Missing dialogue sets');
 const dialogueSets=new Map(),sharedSprites=new Set();
 for(const set of raw.dialogueSets){
  requireValue(set&&validId(set.id)&&!dialogueSets.has(set.id),'Invalid/duplicate dialogue set');
  const memberIds=new Set(uniqueIds(set.members,'dialogue members'));
  requireValue([...memberIds].every(id=>characters.has(id)),'Unknown character in dialogue '+set.id);
  if(set.sharedSpriteId){
   requireValue(validId(set.sharedSpriteId)&&packedSprites.has(set.sharedSpriteId),'Unknown shared sprite for '+set.id);
   sharedSprites.add(set.sharedSpriteId);
  }
  validLines(set.first,memberIds,set.id+'.first');
  validLines(set.again,memberIds,set.id+'.again');
  requireValue(Array.isArray(set.normal)&&set.normal.length>0&&set.normal.length<=64,'Invalid normal scenes '+set.id);
  for(const [i,lines] of set.normal.entries())validLines(lines,memberIds,set.id+'.normal.'+i);
  dialogueSets.set(set.id,{
   id:set.id,members:[...memberIds],sharedSpriteId:set.sharedSpriteId||null,
   first:set.first,again:set.again,normal:set.normal
  });
 }
 requireValue([...packedSprites].every(id=>sprites.has(id)||sharedSprites.has(id)),'Unused sprite in image packs');
 return {schema:1,characters,dialogueSets,spritePacks};
}
/** A placement owns location and encounter save ID; the dialogue set owns voice. */
export function resolveNpcPlacements(placements,catalog,{fallback={}}={}){
 requireValue(Array.isArray(placements),'NPC groups must be an array');
 return placements.map(g=>{
  requireValue(g&&typeof g==='object','Invalid placement');
  const dialogueId=g.dialogueId||g.groupId;
  const authored=catalog?.dialogueSets.get(dialogueId);
  if(authored){
   const actual=(g.members||[]).map(m=>m.id);
   requireValue(actual.length===authored.members.length&&authored.members.every(id=>actual.includes(id)),
    'Placement members disagree with dialogue set '+dialogueId);
   const rename=lines=>lines.map(([speakerId,text])=>[catalog.characters.get(speakerId).name,text]);
   return {...g,dialogueId,visualSpriteId:authored.sharedSpriteId||undefined,members:g.members.map(m=>({...m,spriteId:catalog.characters.get(m.id).spriteId})),dialogues:{
    first:rename(authored.first),again:rename(authored.again),
    normal:authored.normal.map(rename),explore:rename(authored.normal[0])
   }};
  }
  const existing=g.dialogues||fallback[dialogueId]?.dialogues;
  requireValue(existing,'Unknown dialogue set '+dialogueId);
  return {...g,dialogueId,dialogues:existing};
 });
}
