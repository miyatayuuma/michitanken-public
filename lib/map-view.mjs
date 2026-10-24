const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))||0;
/** North-up transform shared by every map layer and inverse hit testing. */
export function createMapView(){
 let side=1,left=0,top=0,z=1,panX=0,panY=0;
 const bound=()=>{const max=side*(z-1)/2;panX=clamp(panX,-max,max);panY=clamp(panY,-max,max);};
 const project=(x,y)=>({x:left+side/2+(x-.5)*side*z+panX,y:top+side/2+(y-.5)*side*z+panY});
 const inverse=(x,y)=>({x:.5+(x-left-side/2-panX)/(side*z),y:.5+(y-top-side/2-panY)/(side*z)});
 return {project,inverse,layout(s,l,t){const ratio=s/side;panX*=ratio;panY*=ratio;side=s;left=l;top=t;bound();},reset(){z=1;panX=panY=0;},pan(dx,dy){panX+=dx;panY+=dy;bound();},zoom(value,x=left+side/2,y=top+side/2){const a=inverse(x,y);z=clamp(value,1,4);panX=x-left-side/2-(a.x-.5)*side*z;panY=y-top-side/2-(a.y-.5)*side*z;bound();},snapshot:()=>({zoom:z,panX,panY,side,left,top}),scale(worldWidth,maxPixels=80){const max=worldWidth*maxPixels/(side*z),power=10**Math.floor(Math.log10(max));const distance=[1,2,5,10].map(n=>n*power).filter(n=>n<=max).at(-1)||power;return {distance,pixels:distance*side*z/worldWidth};}};
}
export function compassBearing(x,z,previous=0){return Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x,z)>1e-5?Math.atan2(x,-z):previous;}
export function unwrapAngle(value,previous){return previous+Math.atan2(Math.sin(value-previous),Math.cos(value-previous));}
