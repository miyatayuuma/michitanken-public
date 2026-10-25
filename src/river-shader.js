/**
 * Textureless, single-pass stylized river shader. No reflection FBO,
 * screen-space refraction, height animation, or external texture assets.
 *
 * Coordinates follow OSM river way order; flow changes direction at bends.
 * Shore mask comes from the actual water polygon boundary.
 */
export const riverVertexShader=`
attribute vec2 aFlow;
attribute float aStation;
attribute float aLateral;
attribute float aShore;
varying vec3 vWorld;
varying vec2 vFlow;
varying float vStation;
varying float vLateral;
varying float vShore;
void main() {
  vec4 world=modelMatrix*vec4(position,1.0);
  vWorld=world.xyz;
  vFlow=aFlow;
  vStation=aStation;
  vLateral=aLateral;
  vShore=aShore;
  gl_Position=projectionMatrix*viewMatrix*world;
}
`;

export const riverFragmentShader=`
precision highp float;
uniform float uTime;
uniform float uMotion;
uniform float uDomainFlow;
varying vec3 vWorld;
varying vec2 vFlow;
varying float vStation;
varying float vLateral;
varying float vShore;

float hash21(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float noise2(vec2 p){
  vec2 i=floor(p),f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(
    mix(hash21(i),hash21(i+vec2(1.0,0.0)),u.x),
    mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),u.x),
    u.y
  );
}
void main(){
  // Distance measured in metres; station grows downstream.
  float elapsed=uTime*uMotion;
  float time=elapsed*(1.0-uDomainFlow);
  float s=vStation;
  float side=vLateral;
  vec2 current=normalize(vFlow+vec2(0.0001));
  // Different OSM ways have unrelated station origins. A prepared connected
  // domain uses world-anchored, locally advected noise instead of interpolating
  // those IDs into high-frequency stripes at a tributary or a tile boundary.
  vec2 domain=vWorld.xz-current*elapsed*1.5;
  s=mix(s,domain.x,uDomainFlow);
  side=mix(side,domain.y,uDomainFlow);
  vec2 along=vec2(s*0.18-time*0.28,side*0.34);
  float low=noise2(along*0.85);
  float high=noise2(vec2(s*0.38-time*0.65,side*0.8)+vec2(13.2,8.6));
  float detail=noise2(vec2(s*0.82-time*1.05,side*1.4)+vec2(4.1,-7.0));

  float ripples=sin(along.x*9.0+low*4.5+side*0.65);
  ripples+=0.5*sin(along.x*16.0-side*1.7+high*3.0);
  float crests=smoothstep(0.72,1.27,ripples*.5+high*.5);
  float glints=smoothstep(0.81,0.96,detail)*crests;

  float bank=1.0-smoothstep(0.12,2.9,vShore);
  float bankNoise=noise2(vec2(s*0.19-time*0.12,side*0.32));
  float foam=bank*smoothstep(0.49,0.78,bankNoise)*.65;
  float shallows=bank*(0.26+0.22*low);

  // Distinct hues keep the surface legible at a distant map camera.
  vec3 deep=vec3(0.037,0.272,0.398);
  vec3 pale=vec3(0.125,0.474,0.523);
  vec3 color=mix(deep,pale,clamp(.22+.56*low+.18*high,0.0,1.0));
  color=mix(color,vec3(0.38,0.70,0.66),clamp(shallows,0.0,.48));

  // Small virtual surface normals, not costly reflective render-to-texture.
  vec3 n=normalize(vec3(
     current.y*(high-.5)*.27+current.x*(low-.5)*.10,
     1.0,
     -current.x*(high-.5)*.27+current.y*(low-.5)*.10));
  vec3 viewDir=normalize(cameraPosition-vWorld);
  vec3 sunDir=normalize(vec3(-.46,.82,.35));
  float spec=pow(max(dot(reflect(-sunDir,n),viewDir),0.0),24.0);
  float fresnel=pow(1.0-clamp(dot(n,viewDir),0.0,1.0),2.8);
  color+=vec3(.14,.29,.29)*fresnel;
  color+=vec3(.23,.34,.31)*crests*.25;
  color+=vec3(.40,.51,.45)*spec*.60;
  color+=vec3(.25,.35,.32)*glints*.25;
  color=mix(color,vec3(.68,.86,.81),foam*.62);
  gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
