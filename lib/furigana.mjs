// Explicit readings belong to each world ZIP. A plain string remains valid.
// Example: "道《みち》を歩《ある》こう".
export function splitFurigana(value){
 const text=typeof value==='string'?value:'';
 const result=[],re=/([一-龯々]+)《([ぁ-ゔー]+)》/g;
 let offset=0,match;
 while((match=re.exec(text))){
  if(match.index>offset)result.push({text:text.slice(offset,match.index)});
  result.push({base:match[1],reading:match[2]});
  offset=re.lastIndex;
 }
 if(offset<text.length)result.push({text:text.slice(offset)});
 return result;
}
