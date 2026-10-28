// NPC state contains no geography or artwork. Positions are supplied by the host.
export const KIKI_JIJI_DIALOGUES={
 first:[['キキ','こんにちは！ わたし、キキ。こっちはジジよ。'],['ジジ','ぼくはジジ。きみも散歩中？'],['キキ','このあたり、何が見つかるか楽しみね。']],
 again:[['キキ','また会えたね！ 今日はどこへ行くの？'],['ジジ','ぼくは、のんびり歩くのも悪くないと思うな。']],
 explore:[['キキ','あっちの道はどこにつながっているのかしら。'],['ジジ','さっき通った道も、反対から見ると違って見えるよ。'],['キキ','じゃあ、もう少し歩いてみましょう！']]
};
export function validRect(rect,width,height){return !!rect&&[rect.x,rect.y,rect.width,rect.height,width,height].every(Number.isInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=width&&rect.y+rect.height<=height;}
export function validateGroups(groups){
 if(!Array.isArray(groups))throw Error('NPC groups must be an array');const ids=new Set();
 for(const g of groups){if(!g||typeof g.groupId!=='string'||!g.groupId||ids.has(g.groupId)||!Array.isArray(g.spawnAnchor)||g.spawnAnchor.length!==2||!g.spawnAnchor.every(Number.isFinite)||!Array.isArray(g.members)||!g.members.length||!Number.isFinite(g.interactionRadius)||g.interactionRadius<=0||!Number.isFinite(g.displayRadius)||g.displayRadius<=g.interactionRadius||g.movementMode!=='fixed'||!Array.isArray(g.dialogues?.first)||!Array.isArray(g.dialogues?.again)||!Array.isArray(g.dialogues?.explore))throw Error('Invalid NPC group');ids.add(g.groupId);const members=new Set();for(const m of g.members){if(typeof m.id!=='string'||!m.id||members.has(m.id)||!Array.isArray(m.offset)||m.offset.length!==2||!m.offset.every(Number.isFinite)||!Number.isFinite(m.height)||m.height<=0)throw Error('Invalid NPC member');members.add(m.id);}}
 return groups;
}
export function createDialogueState(storage){
 let current=null;const sessionMet=new Set(),away=new Set(),counters=new Map();
 const key=id=>'michitanken.npc.met.'+id, awayKey=id=>'michitanken.npc.away.'+id;
 const read=k=>{try{return storage?.getItem(k)==='1';}catch{return false;}};
 const write=(k,value)=>{try{if(value)storage?.setItem(k,'1');else storage?.removeItem(k);}catch{}};
 const hasMet=id=>sessionMet.has(id)||read(key(id));
 const hasLeft=id=>away.has(id)||read(awayKey(id));
 return {get current(){return current;},
  observe(groups,x,z){if(!Number.isFinite(x)||!Number.isFinite(z))return;for(const g of groups){if(hasMet(g.groupId)&&!hasLeft(g.groupId)&&Math.hypot(g.spawnAnchor[0]-x,g.spawnAnchor[1]-z)>=25){away.add(g.groupId);write(awayKey(g.groupId),true);}}},
  start(group){if(current)return null;const id=group.groupId,kind=!hasMet(id)?'first':hasLeft(id)?'again':'normal';
   const choices=group.dialogues.normal;const lines=kind==='normal'?(Array.isArray(choices)&&choices.length?choices[(counters.get(id)||0)%choices.length]:group.dialogues.explore):group.dialogues[kind];
   if(!lines?.length)return null;current={groupId:id,kind,lines,index:0};return current;},
  advance(){if(!current)return false;if(++current.index<current.lines.length)return true;const {groupId:id,kind}=current;
   if(kind==='first'){sessionMet.add(id);write(key(id),true);}else if(kind==='again'){away.delete(id);write(awayKey(id),false);}else counters.set(id,(counters.get(id)||0)+1);
   current=null;return false;},close(){current=null;}};
}
export function groupInRange(group,x,z,mode='walk'){return mode==='walk'&&Math.hypot(group.spawnAnchor[0]-x,group.spawnAnchor[1]-z)<=group.displayRadius;}

