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
 let current=null;const counters=new Map(),sessionMet=new Set();const key=id=>'michitanken.npc.met.'+id;
 const hasMet=id=>{if(sessionMet.has(id))return true;try{return storage?.getItem(key(id))==='1';}catch{return false;}};
 return {get current(){return current;},start(group){if(current)return null;const n=counters.get(group.groupId)||0;const kind=!hasMet(group.groupId)?'first':n%2===0?'again':'explore';const lines=group.dialogues[kind];if(!lines?.length)return null;current={groupId:group.groupId,kind,lines,index:0};return current;},advance(){if(!current)return false;if(++current.index<current.lines.length)return true;const id=current.groupId;if(current.kind==='first'){sessionMet.add(id);try{storage?.setItem(key(id),'1');}catch{}}else counters.set(id,(counters.get(id)||0)+1);current=null;return false;},close(){current=null;}};
}
export function groupInRange(group,x,z,mode='walk'){return mode==='walk'&&Math.hypot(group.spawnAnchor[0]-x,group.spawnAnchor[1]-z)<=group.displayRadius;}
