import {radialStick} from '../lib/gamepad.mjs';

const GAMEPAD_MESSAGE = 'dreamcore:gamepad-v2';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const keyFor=e=>e.key.toLowerCase();

/**
 * Return intention only; the deterministic movement system owns position and collision.
 * Mobile: left thumb for movement, drag on canvas for looking, right thumb to run.
 */
export function createGameInput({canvas,joystick,knob,runButton,onLook,onZoom,onModeToggle=()=>{},onMapControl=()=>{},isActive=()=>true}){
  const abort=new AbortController(),{signal}=abort;
  const keys=new Set(),pressed=new Map();
  let joyId=null,runId=null,runHeld=false,joyX=0,joyY=0;
  const lookPointers=new Map();
  let pinchDistance=null;
  const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal});
  let padSignature='',padArmed=false,padButtons=[],padX=0,padY=0,padRun=false,padActive=false;
  const cursorMode=()=> 'off',captureA=()=>true;
  // The DreamCore parent still relays A, but must never generate a virtual click.
  window.__dreamcoreGamepadCursorMode=cursorMode;
  window.__dreamcoreGamepadCaptureA=captureA;
  function resetGamepad(){
    padSignature='';padArmed=false;padButtons=[];
    padX=padY=0;padRun=padActive=false;
  }
  function getPad(){
    if(!('getGamepads' in navigator))return null;
    try{
      return Array.from(navigator.getGamepads()||[]).find(p=>p?.connected&&p.mapping==='standard')||null;
    }catch{return null;}
  }
  listen(window,'message',e=>{
    if(window.parent===window||e.source!==window.parent||e.origin!==location.origin||
      e.data?.type!==GAMEPAD_MESSAGE)return;
    if(e.data.action==='release-all'){resetGamepad();return;}
    if(e.data.action==='button'&&e.data.button===0&&e.data.phase==='down'&&padArmed){
      onModeToggle();
    }
  });
  function pollGamepad(dt,mode='walk'){
    if(document.hidden){resetGamepad();return;}
    const pad=getPad();
    if(!pad){resetGamepad();return;}
    const signature=pad.index+':'+pad.id+':'+pad.mapping;
    if(signature!==padSignature){resetGamepad();padSignature=signature;}
    const left=radialStick(pad.axes?.[0],pad.axes?.[1]);
    const right=radialStick(pad.axes?.[2],pad.axes?.[3]);
    const buttons=Array.from(pad.buttons||[],b=>!!(b?.pressed||b?.value>0.5));
    if(!padArmed){
      if(!buttons.some(Boolean)&&!left.x&&!left.y&&!right.x&&!right.y)padArmed=true;
      padButtons=buttons;
      return;
    }
    padX=left.x;padY=left.y;padActive=Math.hypot(padX,padY)>0;
    padRun=!!buttons[7];
    const seconds=clamp(Number.isFinite(dt)?dt:0,0,0.05);
    if(mode==='walk'){
      if(seconds&&(right.x||right.y))onLook(-right.x*1.8*seconds,-right.y*1.1*seconds);
    }else if(mode==='map'){
      onMapControl({moveX:left.x,moveY:left.y,lookX:right.x,lookY:right.y,
        zoomOut:Number(!!buttons[6]),zoomIn:Number(!!buttons[7])},seconds);
    }
    // Standalone mode samples A locally; in DreamCore the parent owns edges.
    if(window.parent===window&&buttons[0]&&!padButtons[0])onModeToggle();
    padButtons=buttons;
  }
  listen(window,'gamepaddisconnected',resetGamepad);
  const movementKeys=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift']);
  listen(window,'keydown',e=>{
    const key=keyFor(e);
    if(e.repeat&&keys.has(key))return;
    if(isActive()&&movementKeys.has(key)&&!e.ctrlKey&&!e.altKey&&!e.metaKey){
      keys.add(key);e.preventDefault();
    }
  });
  listen(window,'keyup',e=>{keys.delete(keyFor(e));});
  function resetInput(){
    keys.clear();pressed.clear();lookPointers.clear();pinchDistance=null;
    joyId=null;runId=null;runHeld=false;joyX=joyY=0;
    knob.style.transform='translate(0px, 0px)';runButton.classList.remove('holding');
  }
  listen(window,'blur',()=>{resetInput();resetGamepad();});
  listen(document,'visibilitychange',()=>{if(document.hidden){resetInput();resetGamepad();}});
  const updateJoystick=e=>{
    const rect=joystick.getBoundingClientRect(),max=Math.max(1,(rect.width-knob.offsetWidth)/2);
    const centerX=rect.left+rect.width/2,centerY=rect.top+rect.height/2;
    const rawX=e.clientX-centerX,rawY=e.clientY-centerY,length=Math.hypot(rawX,rawY),scale=length>max?max/length:1;
    const ox=rawX*scale,oy=rawY*scale;
    joyX=ox/max;joyY=-oy/max;knob.style.transform=`translate(${ox}px, ${oy}px)`;
  };
  listen(joystick,'pointerdown',e=>{
    if(joyId!==null)return;
    joyId=e.pointerId;pressed.set('joystick',e.pointerId);
    joystick.setPointerCapture(e.pointerId);updateJoystick(e);e.preventDefault();
  });
  listen(joystick,'pointermove',e=>{if(e.pointerId===joyId){updateJoystick(e);e.preventDefault();}});
  const stopJoy=e=>{if(e.pointerId!==joyId)return;joyId=null;joyX=joyY=0;pressed.delete('joystick');knob.style.transform='translate(0px, 0px)';};
  listen(joystick,'pointerup',stopJoy);
  listen(joystick,'pointercancel',stopJoy);
  listen(joystick,'lostpointercapture',stopJoy);
  listen(runButton,'pointerdown',e=>{
    runId=e.pointerId;runHeld=true;runButton.classList.add('holding');
    runButton.setPointerCapture(e.pointerId);e.preventDefault();
  });
  const stopRun=e=>{if(e.pointerId===runId){runId=null;runHeld=false;runButton.classList.remove('holding');}};
  listen(runButton,'pointerup',stopRun);listen(runButton,'pointercancel',stopRun);listen(runButton,'lostpointercapture',stopRun);
  function distanceOfTwo(){
    if(lookPointers.size<2)return null;
    const [a,b]=Array.from(lookPointers.values());return Math.hypot(a.x-b.x,a.y-b.y);
  }
  listen(canvas,'pointerdown',e=>{
    if(!isActive()||(e.pointerType==='mouse'&&e.button!==0))return;
    lookPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(lookPointers.size>=2)pinchDistance=distanceOfTwo();
    canvas.setPointerCapture(e.pointerId);e.preventDefault();
  });
  listen(canvas,'pointermove',e=>{
    if(!lookPointers.has(e.pointerId))return;
    const old=lookPointers.get(e.pointerId),dx=e.clientX-old.x,dy=e.clientY-old.y;
    lookPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(lookPointers.size===1){onLook(-dx*0.006,-dy*0.0045);}
    else{
      const now=distanceOfTwo();if(pinchDistance!==null&&now>0)onZoom(pinchDistance/now);
      pinchDistance=now;
    }
    e.preventDefault();
  });
  const stopLook=e=>{
    lookPointers.delete(e.pointerId);pinchDistance=lookPointers.size>=2?distanceOfTwo():null;
  };
  listen(canvas,'pointerup',stopLook);listen(canvas,'pointercancel',stopLook);listen(canvas,'lostpointercapture',stopLook);
  listen(canvas,'wheel',e=>{if(!isActive())return;onZoom(Math.exp(e.deltaY*0.001));e.preventDefault();},{passive:false});
  return {
    getIntent(){
      if(!isActive())return {forward:0,right:0,run:false};
      return {
        forward:padActive?-padY:
          (keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0)+joyY,
        right:padActive?padX:
          (keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joyX,
        run:keys.has('shift')||runHeld||padRun
      };
    },
    pollGamepad,
    reset:resetInput,
    destroy(){
      abort.abort();resetInput();resetGamepad();
      if(window.__dreamcoreGamepadCursorMode===cursorMode)delete window.__dreamcoreGamepadCursorMode;
      if(window.__dreamcoreGamepadCaptureA===captureA)delete window.__dreamcoreGamepadCaptureA;
    }
  };
}
