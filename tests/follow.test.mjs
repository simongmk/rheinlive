import test from 'node:test';
import assert from 'node:assert/strict';
import {createFollowCamera} from '../public/follow-camera.js';
import {createVehicleLayer} from '../public/vehicles.js';
import {prepareTrips,positionAt} from '../lib/transit.mjs';

const epoch=Date.parse('2026-09-05T12:00:00Z');
function harness({count=1,drawCost=0,cameraCost=0,dwell=false}={}){
  let ms=0,seq=0,center=[6.99,51],paintCount=0,ends=0,renderPending=false;
  const tasks=new Map(),events=new Map(),listeners=new Map(),moves=[],draws=[];
  const raf=f=>{tasks.set(++seq,f);return seq;},caf=id=>tasks.delete(id);
  const emit=(event,data={})=>{for(const f of events.get(event)??[])f(data);};
  const context={globalAlpha:1,setTransform(){},scale(){},clearRect(){paintCount++;draws.length=0;ms+=drawCost;},beginPath(){},arc(){},fill(){},stroke(){},fillText(){},drawImage(_node,x,y,w,h){draws.push({x:x+w/2,y:y+h/2});}};
  const doc={hidden:false,createElement:()=>({style:{},setAttribute(){},getContext:()=>({...context}),remove(){}}),addEventListener:(e,f)=>listeners.set(e,f),removeEventListener:e=>listeners.delete(e)};
  const map={getCanvas:()=>({clientWidth:1000,clientHeight:800}),getCanvasContainer:()=>({appendChild(){}}),getZoom:()=>12,getBounds:()=>({contains:()=>true}),
    project:([lon,lat])=>({x:500+(lon-center[0])*10000,y:400+(lat-center[1])*10000}),getCenter:()=>({lng:center[0],lat:center[1]}),stop(){},
    jumpTo(options,data){assert.deepEqual(Object.keys(options),['center']);assert.equal(data.vehicleFollow,true);center=options.center;moves.push({ms,center:[...center]});ms+=cameraCost;emit('move',data);
      if(!renderPending){renderPending=true;raf(()=>{renderPending=false;emit('render');});}},
    on(e,f){if(!events.has(e))events.set(e,new Set());events.get(e).add(f);},off(e,f){events.get(e)?.delete(f);}};
  const camera=createFollowCamera(map),layer=createVehicleLayer(map,{document:doc,clock:()=>epoch+ms,perf:{now:()=>ms},raf,caf,onFollowFrame:camera.step,onFollowEnd:()=>ends++});
  const a={id:'a',lat:51,lon:7},b={id:'b',lat:51,lon:7.06},c={id:'c',lat:51,lon:7.12};
  const segment=(from,to,departure,arrival)=>({from,to,departure:epoch+departure,arrival:epoch+arrival,realtime:true,points:[[from.lat,from.lon],[to.lat,to.lon]]});
  const trips=prepareTrips(Array.from({length:count},(_,i)=>({id:'t'+i,line:String(i%5),mode:'tram',color:'#f00',textColor:'#fff',quality:'realtime',segments:dwell?[segment(a,b,-60000,2000),segment(b,c,5000,65000)]:[segment(a,b,-40000,80000)]})));
  layer.update(trips,epoch,epoch);camera.start();layer.follow('t0');
  return {layer,camera,map,doc,listeners,moves,draws,tasks,trips,emit,center:()=>center,paints:()=>paintCount,ends:()=>ends,time:()=>ms,
    setTime(t){ms=t;},frame(t){ms=t;const pending=[...tasks.values()];tasks.clear();for(const f of pending)f(t);},destroy(){layer.destroy();tasks.clear();}};
}

test('following shares the adaptive vehicle clock with 500 icons on 60 and 120 Hz displays',()=>{
  for(const hz of [60,120]){
    const h=harness({count:500,drawCost:1,cameraCost:.5});let before=0;
    for(let i=1;i<=hz*10;i++){
      if(i===hz*8+1)before=h.moves.length;
      h.frame(i*1000/hz);assert.ok(h.tasks.size<=2,'one vehicle callback and at most one pending map render');
      if(i===hz*2)assert.ok(h.moves.length>=58&&h.moves.length<=61,'initial camera cadence is 30 fps');
    }
    assert.equal(h.layer.stats().targetFps,60);assert.equal(h.moves.length-before,120,'camera reaches 60 fps without an extra frame timer');
    const sustained=h.moves.filter(m=>m.ms>1000);
    for(let i=1;i<sustained.length;i++)assert.ok(sustained[i].ms-sustained[i-1].ms<50.001,`no second-long camera pauses (${hz} Hz, ${sustained[i-1].ms} → ${sustained[i].ms})`);
    for(const move of sustained){const p=positionAt(h.trips[0],epoch+move.ms,epoch);assert.ok(Math.abs(move.center[0]-p.lon)<1e-9);}
    assert.equal(h.layer.stats().sprites,5);h.destroy();
  }
});

test('follow paints wait for the map render and reuse exactly its position sample',()=>{
  const h=harness(),before=h.paints(),old={...h.draws[0]};h.frame(500);
  assert.equal(h.moves.length,1);assert.equal(h.paints(),before);assert.deepEqual(h.draws[0],old);
  h.setTime(505);h.layer.update(h.trips,epoch,epoch+505);assert.equal(h.paints(),before,'poll/update cannot draw against a map transform not yet on screen');
  h.frame(520);assert.equal(h.paints(),before+1);assert.ok(Math.abs(h.draws[0].x-500)<1e-8,'overlay uses camera sample, not later wall time');
  const settled=h.paints(),moves=h.moves.length;for(let i=0;i<20;i++)h.emit('render');
  assert.equal(h.paints(),settled);assert.equal(h.moves.length,moves,'map renders cannot generate follow loops');h.destroy();
});

test('camera acquisition eases once, then polling does not restart it',()=>{
  const h=harness();const initial=h.center()[0];h.frame(225);const midway=h.center()[0],p=positionAt(h.trips[0],epoch+225,epoch);
  assert.ok(midway>initial&&midway<p.lon);h.frame(250);h.frame(500);h.frame(520);
  h.setTime(1000);h.layer.update(h.trips,epoch+1000,epoch+1000);const latest=h.moves.at(-1),target=positionAt(h.trips[0],epoch+1000,epoch+1000);
  assert.ok(Math.abs(latest.center[0]-target.lon)<1e-10);h.destroy();
});

test('dwell keeps the followed vehicle and camera still, then both resume together',()=>{
  const h=harness({dwell:true});for(let i=1;i<=150;i++)h.frame(i*1000/60);
  const stopped=h.center(),moves=h.moves.length;
  for(let i=151;i<=290;i++)h.frame(i*1000/60);
  assert.equal(h.moves.length,moves);assert.deepEqual(h.center(),stopped);assert.ok(Math.abs(h.draws[0].x-500)<1e-8);
  for(let i=291;i<=350;i++)h.frame(i*1000/60);
  assert.ok(h.center()[0]>stopped[0]);assert.ok(h.moves.length>moves);assert.equal(h.ends(),0);h.destroy();
});

test('terminal, missing, cancelled, stale and out-of-region targets end following before decorative fades',()=>{
  for(const reason of ['terminal','missing','cancelled','stale','region']){
    const h=harness();h.frame(500);h.frame(520);const before=h.moves.length;
    if(reason==='terminal')h.frame(81000);
    if(reason==='missing')h.layer.update([],epoch,epoch+520);
    if(reason==='cancelled')h.layer.update([],epoch,epoch+520,{discard:['t0']});
    if(reason==='stale')h.frame(121000);
    if(reason==='region')h.layer.setBounds([[52,8],[53,9]]);
    assert.equal(h.ends(),1,reason);h.frame(reason==='stale'?122000:82000);assert.equal(h.moves.length,before,reason);h.destroy();
  }
});

test('manual stop during a pending render cannot schedule another camera move',()=>{
  const h=harness();h.frame(500);const before=h.moves.length;h.layer.follow(null);h.camera.reset();
  for(let i=31;i<=100;i++)h.frame(i*1000/60);
  assert.equal(h.moves.length,before);assert.equal(h.ends(),0);assert.ok(h.draws[0].x>500,'vehicle continues independently');h.destroy();
});

test('hidden tabs stop the clock and resume following only while source data is fresh',()=>{
  for(const stale of [false,true]){
    const h=harness();h.frame(500);h.frame(520);h.doc.hidden=true;h.listeners.get('visibilitychange')();assert.equal(h.tasks.size,0);
    const before=h.moves.length;h.setTime(stale?121000:2000);h.doc.hidden=false;h.listeners.get('visibilitychange')();
    if(stale){assert.equal(h.ends(),1);assert.equal(h.tasks.size,0);assert.equal(h.moves.length,before);}
    else{for(let i=121;i<=180;i++)h.frame(i*1000/60);assert.ok(h.moves.length>before);assert.equal(h.ends(),0);}
    h.destroy();
  }
});

test('reduced motion retains the one-second cadence without animated camera acquisition',()=>{
  const original=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  try{const h=harness();for(let i=1;i<=180;i++)h.frame(i*1000/60);assert.equal(h.layer.stats().targetFps,1);assert.equal(h.moves.length,4);
    assert.equal(h.moves[0].center[0],positionAt(h.trips[0],epoch,epoch).lon);h.destroy();
  }finally{globalThis.matchMedia=original;}
});

test('camera work participates in the adaptive CPU budget',()=>{
  const h=harness({cameraCost:12});for(let i=1;i<=180;i++)h.frame(i*1000/60);
  assert.equal(h.layer.stats().targetFps,12);h.destroy();
});

test('newly revealed outgoing context cannot teleport either the followed camera or its icon',()=>{
  const h=harness(),original=h.trips[0],first={...original.segments[0],arrival:epoch+60000};
  const previous=prepareTrips([{...original,segments:[first]}]);h.layer.update(previous,epoch,epoch);
  for(let i=1;i<=90;i++)h.frame(i*1000/60);
  h.frame(30000);h.frame(30020);
  const before=[...h.center()],now=epoch+30020;
  const next={...first,from:first.to,to:{id:'c',lat:51,lon:7.12},departure:epoch+60000,arrival:epoch+120000,points:[[51,7.06],[51,7.12]]};
  const raw=[{...original,segments:[first,next]}];
  const updated=prepareTrips(raw,{previous,now,previousFetchedAt:epoch});
  assert.equal(updated[0].dwells[0],null);
  h.layer.update(updated,now,now);h.frame(30040);
  const current=h.center();assert.ok(Math.abs(current[0]-before[0])<.00003,'only normal frame motion, no poll jump');
  assert.ok(Math.abs(h.draws[0].x-500)<1e-8,'camera and icon share the reconciled position');
  assert.equal(h.ends(),0);h.destroy();
});
