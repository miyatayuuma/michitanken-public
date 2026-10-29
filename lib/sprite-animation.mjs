/** Optional, private-owned sprite metadata. Pixel rectangles are explicit, never inferred. */
export function validateSpriteConfig(config){
 if(config?.schema!==1)throw Error('Unsupported player sprite schema');
 const {image,width,height,pixelsPerUnit,stride,frames,animations}=config;
 if(typeof image!=='string'||!/^assets\/[A-Za-z0-9_./-]+$/.test(image)||image.split('/').some(p=>!p||p==='.'||p==='..'))
  throw Error('Player sprite image must be a relative asset path');
 if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=8192)||
    ![pixelsPerUnit,stride].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid player sprite dimensions');
 if(!Array.isArray(frames)||!frames.length||frames.length>256)throw Error('Invalid player sprite frames');
 for(const frame of frames){
  const r=frame.rect,p=frame.pivot;
  if(!Array.isArray(r)||r.length!==4||!r.every(Number.isInteger)||r[0]<0||r[1]<0||r[2]<1||r[3]<1||r[0]+r[2]>width||r[1]+r[3]>height)
   throw Error('Player sprite rectangle outside image');
  if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[1]<0||p[0]>r[2]||p[1]>r[3])
   throw Error('Invalid player sprite foot pivot');
 }
 for(const name of ['idle','walk'])if(!Array.isArray(animations?.[name])||!animations[name].length||
   !animations[name].every(i=>Number.isInteger(i)&&i>=0&&i<frames.length))throw Error('Invalid player sprite animation');
 if(config.characters!==undefined){
  if(!Array.isArray(config.characters)||config.characters.length<2||config.characters.length>8||new Set(config.characters.map(c=>c.id)).size!==config.characters.length)throw Error('Invalid characters');
  for(const c of config.characters){
   if(!/^[a-z][a-z0-9-]{0,31}$/.test(c.id))throw Error('Invalid character id');
   validateSpriteConfig({...config,characters:undefined,animations:c.animations});
  }
 }
 return config;
}

/** Camera-right projection with a dead band retains facing while walking toward/away. */
export function spriteFlip(dx,dz,cameraYaw,previous=false){
 const lateral=dx*Math.cos(cameraYaw)-dz*Math.sin(cameraYaw),distance=Math.hypot(dx,dz);
 return distance<1e-6||Math.abs(lateral)<distance*.18?previous:lateral<0;
}

export function createSpriteAnimator(config,initialFlip=false){
 validateSpriteConfig(config);
 let phase=0,last=null,flipped=initialFlip,frame=config.animations.idle[0];
 return {
  reset(){phase=0;last=null;flipped=false;frame=config.animations.idle[0];},
  update({x,z,moving,cameraYaw=0,walking=true}){
   const hadPosition=last!==null,dx=last?x-last.x:0,dz=last?z-last.z:0,distance=Math.hypot(dx,dz);
   last={x,z};
   // Teleports and mode switches must never advance a walking cycle.
   // At 120Hz some RAFs contain no 60Hz physics step. Keep the same gait phase
   // until the next actual displacement; collision/idle is signalled by moving=false.
   const active=walking&&moving&&hadPosition&&distance<5;
   if(active){
    phase=(phase+distance/config.stride)%1;
    flipped=spriteFlip(dx,dz,cameraYaw,flipped);
    frame=config.animations.walk[Math.floor(phase*config.animations.walk.length)];
   }else{phase=0;frame=config.animations.idle[0];}
   return {frame,flipped,active,phase};
  }
 };
}
