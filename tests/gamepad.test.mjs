import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {radialStick,mapGamepadStep} from '../lib/gamepad.mjs';
import {createGameInput} from '../src/controls.js';

test('radial deadzone, middle response, and diagonal cap',()=>{
  assert.deepEqual(radialStick(0.18,0),{x:0,y:0});
  assert.deepEqual(radialStick(NaN,Infinity),{x:0,y:0});
  const fine=radialStick(0.25,0).x,middle=radialStick(0.6,0).x;
  assert.ok(fine>0&&fine<0.2);
  assert.ok(middle>0.45&&middle<0.7);
  assert.ok(Math.abs(Math.hypot(...Object.values(radialStick(1,1)))-1)<1e-10);
  assert.equal(radialStick(0,0).x,0);
});

test('overview pans relative to camera, zooms with radius bounds, and stops',()=>{
  const scene={camera:[0,500,500],target:[0,0,0],dt:0.05};
  const stopped=mapGamepadStep(scene);
  assert.deepEqual(stopped.target,scene.target);
  const pan=mapGamepadStep({...scene,moveY:-1});
  assert.ok(pan.target[2]<0&&Math.abs(pan.target[0])<1e-9);
  const panNear=mapGamepadStep({...scene,camera:[0,50,50],moveY:-1});
  assert.ok(Math.abs(panNear.target[2])<Math.abs(pan.target[2]),
    'zoomed-in pan should be more precise');
  const orbit=mapGamepadStep({...scene,lookX:1});
  assert.ok(orbit.camera[0]<0&&Math.abs(Math.hypot(
    orbit.camera[0],orbit.camera[1],orbit.camera[2])-Math.hypot(...scene.camera))<1e-6);
  const zoomIn=mapGamepadStep({...scene,zoomIn:1});
  const zoomOut=mapGamepadStep({...scene,zoomOut:1});
  assert.ok(Math.hypot(...zoomIn.camera)<Math.hypot(...scene.camera));
  assert.ok(Math.hypot(...zoomOut.camera)>Math.hypot(...scene.camera));
  const limited=mapGamepadStep({...scene,zoomIn:1,minDistance:700,maxDistance:9000});
  assert.ok(Math.hypot(...limited.camera)>=700-1e-8);
  const still=mapGamepadStep({...scene,moveX:0,moveY:0,lookX:0,lookY:0});
  assert.ok(Math.abs(still.target[2])<1e-10);
});

function withMockBrowser(callback,embedded=false){
  const keys=['window','document','navigator','location'];
  const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const events=new Map();
  const pad={
    index:0,id:'GC201 (XInput)',connected:true,mapping:'standard',
    axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))
  };
  const window={addEventListener(name,fn){events.set('window:'+name,fn);}};
  window.parent=embedded?{}:window;
  const document={hidden:false,addEventListener(name,fn){events.set('document:'+name,fn);}};
  const element={
    addEventListener(){},setPointerCapture(){},
    classList:{add(){},remove(){}},style:{},
    getBoundingClientRect(){return {left:0,top:0,width:120,height:120};},
    offsetWidth:24
  };
  for(const [k,v] of Object.entries({window,document,
    navigator:{getGamepads:()=>[pad]},location:{origin:'https://game.test'}})){
    Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
  }
  try{
    const toggles=[],interactions=[],looks=[],mapCalls=[],characters=[],backs=[];
    const game=createGameInput({
      canvas:element,joystick:element,knob:element,runButton:element,
      onLook:(...v)=>looks.push(v),onZoom(){},
      onModeToggle:()=>toggles.push('X'),onInteract:()=>interactions.push('A'),onCharacter:()=>characters.push('Y'),onBack:()=>backs.push('B'),
      onMapControl:(...v)=>mapCalls.push(v),
      isActive:()=>true
    });
    callback({game,pad,window,events,toggles,interactions,looks,mapCalls,characters,backs});
    game.destroy();
  }finally{
    for(const k of keys){
      const desc=old.get(k);
      if(desc)Object.defineProperty(globalThis,k,desc);
      else delete globalThis[k];
    }
  }
}

test('GC201 walking, ZR dash, A edge, map controls and disconnect',()=>{
  withMockBrowser(({game,pad,toggles,interactions,looks,mapCalls})=>{
    game.pollGamepad(0.016,'walk'); // neutral arm
    pad.axes=[0.6,-0.6,0.5,0];
    pad.buttons[7].pressed=true;
    game.pollGamepad(0.016,'walk');
    const intent=game.getIntent();
    assert.ok(intent.forward>0&&intent.right>0);
    assert.ok(Math.hypot(intent.forward,intent.right)<=1+1e-9);
    assert.equal(intent.run,true);
    assert.equal(looks.length,1);
    pad.buttons[0].pressed=true;
    game.pollGamepad(0.016,'walk');game.pollGamepad(0.016,'walk');
    assert.equal(interactions.length,1,'held A must not collect twice');
    pad.buttons[2].pressed=true;game.pollGamepad(.016,'walk');assert.equal(toggles.length,1);
    pad.buttons[0].pressed=false;pad.buttons[7].pressed=false;
    game.pollGamepad(0.016,'map');
    assert.ok(mapCalls.length>=1);
    pad.buttons[6].pressed=true;
    game.pollGamepad(0.016,'map');
    assert.equal('zoomOut' in mapCalls.at(-1)[0],false);assert.equal('lookX' in mapCalls.at(-1)[0],false);
    pad.connected=false;game.pollGamepad(0.016,'walk');
    assert.deepEqual(game.getIntent(),{forward:0,right:0,run:false});
    assert.equal(game.getIntent().run,false);
  });
});

test('DreamCore parent owns A and release; untrusted messages are ignored',()=>{
  withMockBrowser(({game,pad,window,events,toggles,interactions})=>{
    game.pollGamepad(0.016,'walk');
    const message=events.get('window:message');
    const input={type:'dreamcore:gamepad-v2',action:'button',button:0,phase:'down'};
    message({source:{},origin:'https://game.test',data:input});
    message({source:window.parent,origin:'https://evil.test',data:input});
    assert.equal(toggles.length,0);
    message({source:window.parent,origin:'https://game.test',data:input});
    assert.equal(interactions.length,1);assert.equal(toggles.length,0);
    pad.buttons[0].pressed=true;game.pollGamepad(.016,'walk');assert.equal(interactions.length,1);
    pad.axes[0]=1;game.pollGamepad(0.016,'walk');
    assert.ok(game.getIntent().right>0);
    message({source:window.parent,origin:'https://game.test',
      data:{type:'dreamcore:gamepad-v2',action:'release-all'}});
    assert.equal(game.getIntent().right,0);
    assert.equal(window.__dreamcoreGamepadCaptureA(),true);
    assert.equal(window.__dreamcoreGamepadCursorMode(),'off');
  },true);
});

test('existing touch and keyboard controls remain present',()=>{
  const src=readFileSync(new URL('../src/controls.js',import.meta.url),'utf8');
  assert.match(src,/pointerdown/);
  assert.match(src,/arrowup/);
  assert.match(src,/runHeld/);
  assert.doesNotMatch(src,/ゲームパッドメニュー|innerHTML\s*=/);
});

 test('Y and B are local edges and held input is released until neutral after mode reset',()=>{
  withMockBrowser(({game,pad,characters,backs})=>{
   game.pollGamepad(.016,'walk');pad.buttons[3].pressed=true;game.pollGamepad(.016,'walk');game.pollGamepad(.016,'walk');assert.equal(characters.length,1);
   pad.buttons[1].pressed=true;game.pollGamepad(.016,'map');assert.equal(backs.length,1);
   pad.axes[0]=1;game.reset();game.pollGamepad(.016,'walk');assert.equal(game.getIntent().right,0);
   pad.axes[0]=0;pad.buttons.forEach(b=>b.pressed=false);game.pollGamepad(.016,'walk');pad.axes[0]=1;game.pollGamepad(.016,'walk');assert.equal(game.getIntent().right,1);
  },true);
 });
