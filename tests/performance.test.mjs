import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {groupStations,compactLines} from '../lib/network.mjs';
import {FrameBudget,createVehicleLayer} from '../public/vehicles.js';
import {prepareTrips} from '../lib/transit.mjs';

const stop=(id,name,coordinates,mode,lineKey)=>({type:'Feature',properties:{id,name,mode,lineKey},geometry:{type:'Point',coordinates}});
test('parent station groups different platforms and retains tram and bus filters',()=>{
  const stops=groupStations([stop('de-DELFI_de:05315:11311:1:13','Köln Severinstr.',[6.9573,50.9292],'tram','tram:17'),stop('de-DELFI_de:05315:11311:2:53','Köln Severinstr.',[6.9585,50.9286],'bus','bus:106'),stop('de-DELFI_de:05315:11311:1:13','Köln Severinstr.',[6.9573,50.9292],'tram','tram:3')]);
  assert.equal(stops.features.length,1);assert.deepEqual(stops.features[0].properties.modes,['bus','tram']);assert.equal(stops.features[0].properties.lineKeys.length,3);assert.equal(stops.features[0].geometry.coordinates[0],6.9579);
});
test('same-named stops in different places or with distinct parent IDs stay distinct',()=>{
  assert.equal(groupStations([stop('a','Hauptbahnhof',[7,51],'tram','tram:1'),stop('b','Hauptbahnhof',[7.1,51],'tram','tram:2')]).features.length,2);
  assert.equal(groupStations([stop('de:05315:1:1','Markt',[7,51],'tram','tram:1'),stop('de:05315:2:1','Markt',[7.0001,51],'tram','tram:2')]).features.length,2);
});
test('identical optional route geometry is stored once per mode while retaining line filters',()=>{
  const feature=(lineKey,mode,reverse=false)=>({type:'Feature',properties:{lineKey,mode,color:'#ff0000'},geometry:{type:'MultiLineString',coordinates:[reverse?[[7.1,51.1],[7,51]]:[[7,51],[7.1,51.1]]]}});
  const result=compactLines([feature('tram:3','tram'),feature('tram:4','tram',true),feature('bus:106','bus')]);assert.equal(result.features.length,2);assert.deepEqual(result.features[0].properties.lineKeys,['tram:3','tram:4']);
});
test('published networks have one Severinstraße label and defer all bus geometry',async()=>{
  for(const city of ['cologne','bonn','duesseldorf']){const data=JSON.parse(await readFile(new URL('../public/data/network-'+city+'.json',import.meta.url)));assert.ok(!data.lines.features.some(f=>f.properties.mode==='bus'));assert.ok(data.catalog.some(f=>f.mode==='bus'));assert.ok(data.stops.features.some(f=>f.properties.modes.includes('bus')));assert.ok(data.parts.bus.includes(city));const bus=JSON.parse(await readFile(new URL('../public/data/network-'+city+'-bus.json',import.meta.url)));assert.ok(bus.lines.features.length>0);assert.ok(bus.lines.features.every(f=>f.properties.mode==='bus'));if(city==='cologne')assert.equal(data.stops.features.filter(f=>f.properties.name==='Köln Severinstr.').length,1);}
});
test('animation slows down under sustained load and recovers after sustained headroom',()=>{
  const b=new FrameBudget();let ts=0;for(let i=0;i<12;i++){ts+=50;b.record(ts,15);}assert.equal(b.fps,12);for(let i=0;i<450;i++){ts+=1000/b.fps;b.record(ts,1);}assert.equal(b.fps,30);
});
test('sparse inexpensive camera frames do not trigger the load throttle',()=>{
  const b=new FrameBudget();for(let i=1;i<=30;i++)b.record(i*150,1);assert.equal(b.fps,30);
});
test('60 fps requires sustained headroom and falls back when its draw budget is exceeded',()=>{
  const b=new FrameBudget();for(let i=1;i<=180;i++)b.record(i*34,1);assert.equal(b.fps,60);
  for(let i=1;i<=6;i++)b.record(6120+i*17,8);assert.equal(b.fps,30);
});

function harness(drawCost=0){
  let now=Date.parse('2026-09-05T12:00:00Z'),ms=0,seq=0,pan=0,paints=0;const tasks=new Map(),listeners=new Map(),handlers=new Map(),draws=[];
  const context={globalAlpha:1,setTransform(){},scale(){},clearRect(){draws.length=0;paints++;ms+=drawCost;},beginPath(){},arc(){},fill(){},stroke(){},fillText(){},drawImage(_node,x,y){draws.push({x,y,alpha:this.globalAlpha});}};
  const doc={hidden:false,createElement:()=>({style:{},setAttribute(){},getContext:()=>({...context}),remove(){}}),addEventListener:(e,f)=>listeners.set(e,f),removeEventListener:e=>listeners.delete(e)};
  const map={getCanvas:()=>({clientWidth:1000,clientHeight:800}),getCanvasContainer:()=>({appendChild(){}}),getZoom:()=>12,getBounds:()=>({contains:()=>true}),project:([lon,lat])=>({x:500+(lon-7)*1000+pan,y:400+(lat-51)*1000}),isMoving:()=>false,on:(e,f)=>handlers.set(e,f),off:e=>handlers.delete(e)};
  const layer=createVehicleLayer(map,{document:doc,clock:()=>now,perf:{now:()=>ms},raf:f=>{tasks.set(++seq,f);return seq;},caf:id=>tasks.delete(id)});
  const trips=prepareTrips(Array.from({length:500},(_,i)=>({id:'t'+i,line:String(i%5),mode:'tram',color:'#ff0000',textColor:'#ffffff',quality:'realtime',segments:[{departure:now,arrival:now+60000,realtime:true,points:[[51,7],[51,7.06]],from:{id:'a'},to:{id:'b'}}]})));
  return {layer,trips,doc,tasks,listeners,draws,map,handlers,now:()=>now,paints:()=>paints,setTime:(n,t)=>{now=n;ms=t;},frame:()=>{const pending=[...tasks.values()];tasks.clear();for(const f of pending)f(ms);},pan:x=>{pan=x;}};
}
test('vehicles keep animating at 30 fps while a drag is held still without map renders',()=>{
  const h=harness(),start=h.now();h.map.isMoving=()=>true;h.layer.update(h.trips,start,start);
  const before=h.paints(),initialX=h.draws[0].x;for(let i=1;i<=120;i++){const ms=i*1000/60;h.setTime(start+ms,ms);h.frame();}
  assert.equal(h.paints()-before,60);assert.ok(h.draws[0].x>initialX);assert.equal(h.layer.stats().targetFps,30);
  assert.equal(h.layer.stats().sprites,5);assert.equal(h.tasks.size,1);h.layer.destroy();
});
test('real drawing time does not halve the clock rate, including 60 fps on a 120 Hz display',()=>{
  for(const hz of [60,120]){
    const h=harness(3),start=h.now();h.layer.update(h.trips,start,start);let before;
    for(let i=1;i<=hz*10;i++){
      if(i===hz*8+1)before=h.paints();
      const ms=i*1000/hz;h.setTime(start+ms,ms);h.frame();
      if(i===hz*2)assert.equal(h.paints()-1,60,'3 ms draw cost still delivers the initial 30 fps');
    }
    assert.equal(h.layer.stats().targetFps,60);assert.equal(h.paints()-before,120);
    assert.equal(h.layer.stats().sprites,5);assert.equal(h.tasks.size,1);h.layer.destroy();
  }
});
test('60 fps camera motion has no duplicate paints and a held pause resumes without catch-up bursts',()=>{
  for(const hz of [30,60])for(const clockFirst of [true,false]){
    const h=harness(),start=h.now();h.layer.update(h.trips,start,start);
    for(let i=1;i<=180;i++){const ms=i*1000/30;h.setTime(start+ms,ms);h.frame();}
    assert.equal(h.layer.stats().targetFps,60);const before=h.paints();
    // Start with an actual camera frame, then exercise both callback orders.
    h.handlers.get('move')();h.handlers.get('render')();
    for(let i=1;i<=120;i++){
      const ms=6000+i*1000/hz;h.setTime(start+ms,ms);if(clockFirst)h.frame();
      h.pan(i);h.handlers.get('move')();h.handlers.get('render')();if(!clockFirst)h.frame();
    }
    assert.equal(h.paints()-before,121);
    const held=h.paints(),end=6000+120*1000/hz;h.map.isMoving=()=>true;
    for(let i=1;i<=60;i++){const ms=end+i*1000/60;h.setTime(start+ms,ms);h.frame();}
    assert.ok(h.paints()-held>=57&&h.paints()-held<=60);assert.equal(h.tasks.size,1);h.layer.destroy();
  }
});
test('camera renders stay aligned without duplicate animation paints in either callback order',()=>{
  for(const clockFirst of [true,false]){
    const h=harness(),start=h.now();h.map.isMoving=()=>true;h.layer.update(h.trips,start,start);
    h.setTime(start+500,500);h.layer.update(h.trips,start,start+500);const before=h.paints();
    for(let i=1;i<=120;i++){
      const ms=500+i*1000/60;h.setTime(start+ms,ms);if(clockFirst)h.frame();
      h.pan(i);h.handlers.get('move')?.();h.handlers.get('render')();if(!clockFirst)h.frame();
      assert.equal(h.layer.hitTest({x:500+i+ms/1000,y:400}),'t0');
    }
    assert.equal(h.paints()-before,120);assert.equal(h.layer.stats().targetFps,30);assert.equal(h.tasks.size,1);
    h.map.isMoving=()=>false;h.pan(200);h.handlers.get('move')?.();h.handlers.get('render')();
    assert.equal(h.layer.hitTest({x:702.5,y:400}),'t0','final camera frame still reprojects');
    const settled=h.paints();for(let i=0;i<20;i++)h.handlers.get('render')();assert.equal(h.paints(),settled,'tile/style renders do not repaint vehicles');
    h.setTime(start+2600,2600);h.frame();assert.equal(h.paints(),settled+1,'idle animation resumes');
    h.layer.destroy();assert.equal(h.tasks.size,0);assert.equal(h.handlers.size,0);
  }
});
test('500 vehicles reuse five sprites and animate without source rebuilds or network requests',()=>{
  const h=harness(),start=h.now();h.layer.update(h.trips,start,start);h.setTime(start+500,500);h.frame();assert.equal(h.layer.stats().visible,500);assert.equal(h.layer.stats().sprites,5);assert.equal(h.layer.hitTest({x:500,y:400}),'t0');
  h.setTime(start+30000,30000);h.layer.update(h.trips,start,start+30000);assert.equal(h.layer.hitTest({x:530,y:400}),'t0');assert.equal(h.layer.stats().sprites,5);assert.equal(h.tasks.size,1);h.layer.destroy();assert.equal(h.tasks.size,0);
});
test('hidden tabs cancel animation, expired snapshots clear hit targets, and region bounds clip vehicles',()=>{
  const h=harness(),start=h.now();h.layer.update(h.trips,start,start);h.doc.hidden=true;h.listeners.get('visibilitychange')();assert.equal(h.tasks.size,0);assert.equal(h.layer.hitTest({x:500,y:400}),null);
  h.doc.hidden=false;h.setTime(start+121000,121000);h.listeners.get('visibilitychange')();assert.equal(h.layer.stats().visible,0);
  h.setTime(start,0);h.layer.setBounds([[50,6],[50.5,6.5]]);h.layer.update(h.trips,start,start);assert.equal(h.layer.stats().visible,0);h.layer.destroy();
});
test('new icons fade in once; polling does not restart their opacity',()=>{
  const h=harness(),start=h.now(),v=h.trips.slice(0,1);h.layer.update(v,start,start);
  assert.equal(h.draws[0].alpha,0);assert.equal(h.layer.hitTest({x:500,y:400}),null);
  h.setTime(start+225,225);h.frame();assert.equal(h.draws[0].alpha,.5);
  h.layer.update(v,start,start+225);assert.equal(h.draws[0].alpha,.5);
  h.setTime(start+450,450);h.frame();assert.equal(h.draws[0].alpha,1);h.layer.destroy();
});
test('terminal icons reach their endpoint and fade out without motion or hit targets',()=>{
  const h=harness(),start=h.now(),v=h.trips.slice(0,1);h.layer.update(v,start,start);
  h.setTime(start+59900,59900);h.frame();
  h.setTime(start+60050,60050);h.frame();const endpoint={...h.draws[0]};assert.equal(endpoint.alpha,1);
  assert.equal(h.layer.hitTest({x:560,y:400}),null);
  h.setTime(start+60375,60375);h.layer.update([],start,start+60375);
  assert.equal(h.draws[0].x,endpoint.x);assert.equal(h.draws[0].y,endpoint.y);assert.equal(h.draws[0].alpha,.5);
  h.setTime(start+60700,60700);h.frame();assert.equal(h.draws.length,0);assert.equal(h.layer.stats().transitions,0);assert.equal(h.tasks.size,0);h.layer.destroy();
});
test('a removed and returning ID reverses its fade instead of drawing two icons',()=>{
  const h=harness(),start=h.now(),v=h.trips.slice(0,1);h.layer.update(v,start,start);
  h.setTime(start+1000,1000);h.frame();h.layer.update([],start,start+1000);
  h.setTime(start+1325,1325);h.frame();assert.equal(h.draws[0].alpha,.5);
  h.layer.update(v,start,start+1325);assert.equal(h.draws.length,1);assert.equal(h.draws[0].alpha,.5);
  h.setTime(start+1775,1775);h.frame();assert.equal(h.draws[0].alpha,1);assert.equal(h.layer.stats().transitions,1);h.layer.destroy();
});
test('outages, expired observations, cancellations and city changes remove exits immediately',()=>{
  for(const reason of ['outage','stale','cancelled','city']){
    const h=harness(),start=h.now(),v=h.trips.slice(0,1);h.layer.update(v,start,start);h.setTime(start+1000,1000);h.frame();
    if(reason==='outage')h.layer.update([],start,start+1000,{immediate:true});
    if(reason==='cancelled')h.layer.update([],start,start+1000,{discard:['t0']});
    if(reason==='stale'){h.layer.update([],start,start+1000);h.setTime(start+121000,121000);h.frame();}
    if(reason==='city'){h.layer.setBounds([[50,6],[52,8]]);h.layer.setBounds([[53,6],[54,8]]);}
    assert.equal(h.draws.length,0,reason);assert.equal(h.layer.stats().transitions,0,reason);h.layer.destroy();
  }
});
test('reduced motion skips fades and rapid filter churn bounds retained exits',()=>{
  const before=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  try{const h=harness(),start=h.now();h.layer.update(h.trips.slice(0,1),start,start);assert.equal(h.draws[0].alpha,1);h.layer.update([],start,start);assert.equal(h.draws.length,0);h.layer.destroy();}finally{globalThis.matchMedia=before;}
  const h=harness(),start=h.now();h.layer.update(h.trips,start,start);h.setTime(start+500,500);h.frame();
  for(let batch=0;batch<4;batch++){const next=h.trips.map(v=>({...v,id:v.id+'-'+batch}));h.layer.update(next,start,start+500);assert.ok(h.layer.stats().transitions<=1012);}
  h.layer.destroy();assert.equal(h.tasks.size,0);
});
