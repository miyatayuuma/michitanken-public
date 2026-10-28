import { promises as fs } from 'node:fs';
import path from 'node:path';

const required = {app:'div',scene:'div',status:'div',retry:'button',mode:'button',characters:'div','menu-open':'button','notebook-menu':'section','menu-close':'button','standalone-audio':'div',joystick:'div','joystick-knob':'div',run:'button'};
export function assertGameHtml(html) {
 for (const [id, tag] of Object.entries(required)) {
  const matches=[...html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi)].filter(m=>m[2]===id);
  if(matches.length!==1||matches[0][1].toLowerCase()!==tag)throw Error('Required game UI missing or invalid: '+id);
 }
 if(!/<script\b[^>]*type=["']module["'][^>]*src=["']\/src\/main\.js["']/i.test(html))throw Error('Game entry module missing');
 if(!/<section\b[^>]*id=["']notebook-menu["'][\s\S]*?<button\b[^>]*id=["']menu-close["']/i.test(html))throw Error('Menu close control missing');
}
export function integrateGameHtml(privateHtml,publicHtml) {
 assertGameHtml(publicHtml);
 if(!/<div\b[^>]*id=["']app["']/i.test(privateHtml)||!/<div\b[^>]*id=["']scene["']/i.test(privateHtml))throw Error('Unrecognized PRIVATE game HTML');
 const original=privateHtml.match(/<body\b[^>]*>[\s\S]*?<\/body>/i);
 const replacement=publicHtml.match(/<body\b[^>]*>[\s\S]*?<\/body>/i);
 if(!original||!replacement)throw Error('Game HTML body missing');
 const body=replacement[0].replace('サンプルは架空の地形です（実際の位置情報は含みません）','地理情報: © OpenStreetMap contributors (ODbL) · 標高: 国土地理院');
 const result=privateHtml.replace(original[0],body);
 assertGameHtml(result);
 return result;
}
export async function checkFile(root) { assertGameHtml(await fs.readFile(path.join(root,'index.html'),'utf8')); }
