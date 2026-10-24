import * as THREE from 'three';
import {validateSpriteConfig,createSpriteAnimator} from '../lib/sprite-animation.mjs';

export function createSpriteAvatar(config,texture){
 validateSpriteConfig(config);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
 const group=new THREE.Group();group.name='player-avatar';group.userData.type='player';
 const geometry=new THREE.PlaneGeometry(1,1);
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.065,
  depthTest:true,depthWrite:true,side:THREE.DoubleSide});
 const plane=new THREE.Mesh(geometry,material);plane.name='player-sprite';group.add(plane);
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(.48,20),new THREE.MeshBasicMaterial({
  color:0x1b3935,transparent:true,opacity:.24,depthTest:true,depthWrite:false}));
 shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;group.add(shadow);
 let activeConfig=config,character=config.characters?.[0]?.id||null;
 let animator=createSpriteAnimator(config);
 let current={frame:-1,flipped:false,active:false,phase:0},disposed=false;
 function setFrame(frame){
  const {rect:[x,y,w,h],pivot:[px,py]}=config.frames[frame],ppu=config.pixelsPerUnit;
  // Geometry origin is the authored foot point; one common pixel scale avoids gait-size pumping.
  const left=-px/ppu,right=(w-px)/ppu,top=py/ppu,bottom=(py-h)/ppu;
  const positions=geometry.attributes.position;
  positions.setXYZ(0,left,top,0);positions.setXYZ(1,right,top,0);
  positions.setXYZ(2,left,bottom,0);positions.setXYZ(3,right,bottom,0);positions.needsUpdate=true;
  // Half-texel inset and disabled mipmaps prevent any adjacent-frame sampling.
  const u0=(x+.5)/config.width,u1=(x+w-.5)/config.width;
  const v0=1-(y+h-.5)/config.height,v1=1-(y+.5)/config.height,uv=geometry.attributes.uv;
  uv.setXY(0,u0,v1);uv.setXY(1,u1,v1);uv.setXY(2,u0,v0);uv.setXY(3,u1,v0);uv.needsUpdate=true;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
 }
 setFrame(config.animations.idle[0]);
 return {
  group,
  reset:()=>animator.reset(),
  selectCharacter(id){
   if(character===id)return character;const next=config.characters?.find(c=>c.id===id);if(!next)return null;
   activeConfig=validateSpriteConfig({...config,animations:next.animations});character=next.id;animator=createSpriteAnimator(activeConfig,current.flipped);current={...current,frame:-1};setFrame(activeConfig.animations.idle[0]);return character;
  },
  switchCharacter(){
   if(!config.characters?.length)return null;
   const index=config.characters.findIndex(c=>c.id===character),next=config.characters[(index+1)%config.characters.length];
   activeConfig=validateSpriteConfig({...config,animations:next.animations});character=next.id;
   animator=createSpriteAnimator(activeConfig,current.flipped);current={...current,frame:-1};setFrame(activeConfig.animations.idle[0]);return character;
  },
  update({state,camera,walking=true}){
   if(disposed)return;
   const yaw=Math.atan2(camera.position.x-state.x,camera.position.z-state.z);
   const next=animator.update({...state,cameraYaw:yaw,walking});
   if(next.frame!==current.frame)setFrame(next.frame);
   // Upright cylindrical billboard preserves ground contact at every camera pitch.
   plane.rotation.y=yaw;plane.scale.x=next.flipped?-1:1;current=next;
  },
  snapshot:()=>({...current,character,pixelsPerUnit:config.pixelsPerUnit,depthTest:material.depthTest,
   depthWrite:material.depthWrite,position:group.position.toArray(),yaw:plane.rotation.y}),
  dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();texture.dispose();
   shadow.geometry.dispose();shadow.material.dispose();}
 };
}

export async function loadPlayerSprite({baseURL='./',fetcher=fetch,loader=new THREE.TextureLoader()}={}){
 const response=await fetcher(`${baseURL}data/player-sprite.json`,{cache:'no-store'});
 if(response.status===404)return null;
 if(!response.ok)throw Error('Player sprite config HTTP '+response.status);
 if(!response.headers.get('content-type')?.includes('json'))return null;
 const config=validateSpriteConfig(await response.json());
 const texture=await loader.loadAsync(`${baseURL}${config.image}`);
 if(texture.image.width!==config.width||texture.image.height!==config.height){
  texture.dispose();throw Error('Player sprite source dimensions do not match metadata');
 }
 return createSpriteAvatar(config,texture);
}
