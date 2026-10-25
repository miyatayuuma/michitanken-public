/** Presentation only. This layer never writes discovery, coordinates or persistence. */
export const DEFAULT_TERRAIN_STYLE='A';
export const TERRAIN_STYLES=Object.freeze(['A','B','C']);
const palettes={
 normal:{ground:'#eddfb7',wood:'#a1b282',green:'#c2ce93',water:'#8ebfc3',river:'#7bb2bd',road:'#faf2dc'},
 muted:{ground:'#dedbd0',wood:'#b2b8ab',green:'#c5c9b8',water:'#a9bec0',river:'#86a4ac',road:'#fbf8ed'}
};
export function createMapTerrain(data,store,style=DEFAULT_TERRAIN_STYLE){
 if(!TERRAIN_STYLES.includes(style))style=DEFAULT_TERRAIN_STYLE;
 const size=1000,b=data.bounds,normal=document.createElement('canvas'),canvas=document.createElement('canvas');
 normal.width=normal.height=canvas.width=canvas.height=size;
 const project=p=>[(p[0]-b.minX)/(b.maxX-b.minX)*size,(p[1]-b.minZ)/(b.maxZ-b.minZ)*size];
 function paint(target,palette){const g=target.getContext('2d');g.fillStyle=palette.ground;g.fillRect(0,0,size,size);
  const ring=points=>{points.forEach((p,i)=>{const [x,y]=project(p);i?g.lineTo(x,y):g.moveTo(x,y);});g.closePath();};
  for(const a of data.areas){g.beginPath();ring(a.ring);for(const h of a.holes||[])ring(h);g.fillStyle=palette[a.kind];g.fill('evenodd');}
  for(const kind of ['river','road'])for(const l of data.lines){if(l.kind!==kind)continue;g.beginPath();l.points.forEach((p,i)=>{const [x,y]=project(p);i?g.lineTo(x,y):g.moveTo(x,y);});g.lineWidth=Math.max(kind==='river'?2:1,(l.width||4)*size/(b.maxX-b.minX));g.strokeStyle=palette[kind];g.lineCap='round';g.stroke();}
 }
 paint(normal,palettes.normal);
 const g=canvas.getContext('2d'),previous=new Uint8Array(store.cells.length);
 if(style==='A')paint(canvas,palettes.muted);
 else {g.drawImage(normal,0,0);if(style==='B'){g.fillStyle='rgba(255,245,223,.28)';g.fillRect(0,0,size,size);}}
 const cw=size/store.cols,ch=size/store.rows;
 let updates=0;
 function update(){
  // The loaded store is monotonic: reveal only adds cells. Save schema is untouched.
  if(style==='C')g.drawImage(normal,0,0);
  for(let r=0;r<store.rows;r++)for(let c=0;c<store.cols;){const i=r*store.cols+c;
   if(!store.cells[i]||(style!=='C'&&previous[i])){c++;continue;}
   const start=c;while(c<store.cols&&store.cells[r*store.cols+c]&&(style==='C'||!previous[r*store.cols+c])){previous[r*store.cols+c]=1;c++;}
   const x=start*cw,y=r*ch,width=(c-start)*cw;
   g.drawImage(normal,x,y,width,ch,x,y,width,ch);
   if(style==='C'){g.fillStyle='rgba(255,255,238,.10)';g.fillRect(x,y,width,ch);}
  }
  if(style==='C'){g.beginPath();for(let r=0;r<store.rows;r++)for(let c=0;c<store.cols;c++){if(!store.cells[r*store.cols+c])continue;const x=c*cw,y=r*ch;
   if(r===0||!store.cells[(r-1)*store.cols+c]){g.moveTo(x,y);g.lineTo(x+cw,y);}
   if(r===store.rows-1||!store.cells[(r+1)*store.cols+c]){g.moveTo(x,y+ch);g.lineTo(x+cw,y+ch);}
   if(c===0||!store.cells[r*store.cols+c-1]){g.moveTo(x,y);g.lineTo(x,y+ch);}
   if(c===store.cols-1||!store.cells[r*store.cols+c+1]){g.moveTo(x+cw,y);g.lineTo(x+cw,y+ch);}
  }g.strokeStyle='rgba(57,105,82,.72)';g.lineWidth=1.6;g.stroke();}
  updates++;
 }
 return {canvas,update,style,get updates(){return updates;},pixels:2*size*size,dispose(){normal.width=normal.height=canvas.width=canvas.height=0;}};
}
