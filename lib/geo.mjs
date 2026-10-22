export const EARTH=6378137;
export function boundsFromCenter(center,size=500){
 const h=size/2,r=center.lat*Math.PI/180;
 return {south:center.lat-h/EARTH*180/Math.PI,north:center.lat+h/EARTH*180/Math.PI,
 west:center.lon-h/(EARTH*Math.cos(r))*180/Math.PI,east:center.lon+h/(EARTH*Math.cos(r))*180/Math.PI};
}
export function project(lat,lon,center){return [(lon-center.lon)*Math.PI/180*EARTH*Math.cos(center.lat*Math.PI/180),(center.lat-lat)*Math.PI/180*EARTH];}
export function unproject(x,z,center){return {lat:center.lat-z/EARTH*180/Math.PI,lon:center.lon+x/(EARTH*Math.cos(center.lat*Math.PI/180))*180/Math.PI};}
export function tileAt(lat,lon,zoom){const n=2**zoom;return {x:(lon+180)/360*n,y:(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n};}
export function gridSample(grid,x,z){
 const {size,count,elevations}=grid,ux=Math.max(0,Math.min(count-1,(x/size+.5)*(count-1))),uz=Math.max(0,Math.min(count-1,(z/size+.5)*(count-1)));
 const x0=Math.floor(ux),z0=Math.floor(uz),x1=Math.min(count-1,x0+1),z1=Math.min(count-1,z0+1),a=ux-x0,b=uz-z0,at=(r,c)=>elevations[r*count+c];
 return (1-b)*((1-a)*at(z0,x0)+a*at(z0,x1))+b*((1-a)*at(z1,x0)+a*at(z1,x1));
}
/**
 * Sample the exact piecewise-planar height used by addTerrain() meshes.
 * Their indices are (a,c,b) and (b,c,d), with the cell diagonal fx+fz=1.
 * Bilinear gridSample() differs near that diagonal and can bury road ribbons.
 */
export function terrainMeshHeight(grid,x,z){
 const {size,count,elevations}=grid;
 const ux=Math.max(0,Math.min(count-1,(x/size+.5)*(count-1)));
 const uz=Math.max(0,Math.min(count-1,(z/size+.5)*(count-1)));
 const x0=Math.min(count-2,Math.floor(ux)),z0=Math.min(count-2,Math.floor(uz));
 const fx=ux-x0,fz=uz-z0;
 const a=elevations[z0*count+x0],b=elevations[z0*count+x0+1];
 const c=elevations[(z0+1)*count+x0],d=elevations[(z0+1)*count+x0+1];
 return fx+fz<=1?a+(b-a)*fx+(c-a)*fz:
   d+(c-d)*(1-fx)+(b-d)*(1-fz);
}
export function clipSegment(a,b,h){
 const dx=b[0]-a[0],dz=b[1]-a[1],p=[-dx,dx,-dz,dz],q=[a[0]+h,h-a[0],a[1]+h,h-a[1]];
 let t0=0,t1=1;
 for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<0)return null;continue;}const t=q[i]/p[i];if(p[i]<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);if(t0>t1)return null;}
 return [[a[0]+dx*t0,a[1]+dz*t0],[a[0]+dx*t1,a[1]+dz*t1]];
}
export function clipPolygon(poly,h){
 const boundaries=[p=>p[0]>=-h,p=>p[0]<=h,p=>p[1]>=-h,p=>p[1]<=h];let output=poly;
 for(let i=0;i<4;i++){const input=output;output=[];if(!input.length)break;
 for(let j=0;j<input.length;j++){const a=input[j],b=input[(j+1)%input.length],insideA=boundaries[i](a),insideB=boundaries[i](b),k=i<2?0:1,v=(i===0||i===2)?-h:h;
 const intersect=()=>{const t=(v-a[k])/(b[k]-a[k]);return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
 if(insideA&&insideB)output.push(b);else if(insideA&&!insideB)output.push(intersect());else if(!insideA&&insideB)output.push(intersect(),b);
 }}return output;
}