import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMapPicking} from '../public/map-picking.js';
import {createVisibleTicker} from '../public/ui-clock.js';

function picking(){
  const handlers=new Map(),frames=new Map(),queries=[],chosen=[],canvas={style:{cursor:''}};
  const stop=(id,x)=>({type:'Feature',properties:{queryId:id,name:id,modes:['tram','bus']},geometry:{type:'Point',coordinates:[x,100]}});
  const stops=new Map([['a',stop('a',100)],['b',stop('b',110)]]);let hits=[],vehicle=null,loaded=true,pickLocation=false;
  const map={getCanvas:()=>canvas,getLayer:()=>loaded,queryRenderedFeatures:(box,options)=>{queries.push({box,options});return hits;},project:([x,y])=>({x,y}),on:(e,f)=>handlers.set(e,f),off:e=>handlers.delete(e)};
  const destroy=bindMapPicking(map,{vehicles:{hitTest:()=>vehicle},stationById:id=>stops.get(id),onVehicle:id=>chosen.push(id),onStation:f=>chosen.push(f),onClear:()=>chosen.push(null),isPickingLocation:()=>pickLocation,onLocation:p=>chosen.push(p),raf:f=>{frames.set(1,f);return 1;},caf:id=>frames.delete(id)});
  return {handlers,frames,queries,chosen,canvas,stops,destroy,hits:value=>hits=value,vehicle:value=>vehicle=value,loaded:value=>loaded=value,pickLocation:value=>pickLocation=value,fire:(e,point={x:101,y:100},buttons=0)=>handlers.get(e)({point,originalEvent:{buttons}}),frame:()=>{const f=frames.get(1);frames.clear();f?.();}};
}
test('explicit location picking uses the clicked coordinates instead of vehicles or station hits',()=>{
  const h=picking();h.vehicle('train');h.pickLocation(true);h.fire('mousemove');h.frame();assert.equal(h.canvas.style.cursor,'crosshair');assert.equal(h.queries.length,0);
  h.handlers.get('click')({point:{x:101,y:100},lngLat:{lat:50.93,lng:6.95}});assert.deepEqual(h.chosen,[[50.93,6.95]]);
  h.fire('dragstart');h.handlers.get('click')({lngLat:{lat:51,lng:7}});assert.equal(h.chosen.length,1);
  h.fire('dragend');assert.equal(h.canvas.style.cursor,'crosshair');h.pickLocation(false);h.fire('click');assert.equal(h.chosen.at(-1),'train');h.destroy();
});
test('station picking resolves duplicate labels to the closest original known station',()=>{
  const h=picking();h.hits([{properties:{queryId:'foreign'}},{properties:{queryId:'b'}},{properties:{queryId:'a',modes:'["tram"]'}},{properties:{queryId:'a'}}]);
  h.fire('click');assert.equal(h.chosen[0],h.stops.get('a'));assert.deepEqual(h.chosen[0].properties.modes,['tram','bus']);
  assert.deepEqual(h.queries[0].box,[[89,88],[113,112]]);h.destroy();
});
test('vehicle hits take priority and missing station layers never cause a feature query',()=>{
  const h=picking();h.vehicle('train');h.fire('click');assert.deepEqual(h.chosen,['train']);assert.equal(h.queries.length,0);
  h.vehicle(null);h.loaded(false);h.fire('click');assert.equal(h.chosen.at(-1),null);assert.equal(h.queries.length,0);h.destroy();
});
test('hover work is coalesced, suppressed during dragging and cancelled on leaving or teardown',()=>{
  const h=picking();h.hits([{properties:{queryId:'a'}}]);for(let i=0;i<200;i++)h.fire('mousemove');
  assert.equal(h.frames.size,1);assert.equal(h.queries.length,0);h.frame();assert.equal(h.queries.length,1);assert.equal(h.canvas.style.cursor,'pointer');
  h.fire('mousemove');h.fire('dragstart');assert.equal(h.frames.size,0);assert.equal(h.canvas.style.cursor,'');
  h.fire('mousemove');h.fire('click');assert.equal(h.frames.size,0);assert.equal(h.chosen.length,0);
  h.fire('dragend');h.fire('mousemove',undefined,1);assert.equal(h.frames.size,0);
  h.fire('mousemove');h.fire('mouseout');assert.equal(h.frames.size,0);
  h.fire('mousemove');h.destroy();assert.equal(h.frames.size,0);assert.equal(h.handlers.size,0);
});
test('the text ticker has one aligned timer, stops when hidden and resumes once after a long absence',()=>{
  const events=new Map(),page=new Map(),timers=new Map();let now=230,ticks=0,sequence=0;
  const doc={hidden:false,addEventListener:(e,f)=>events.set(e,f),removeEventListener:e=>events.delete(e)},win={addEventListener:(e,f)=>page.set(e,f),removeEventListener:e=>page.delete(e)};
  const destroy=createVisibleTicker(()=>ticks++,{document:doc,window:win,clock:()=>now,setTimer:(f,delay)=>{timers.set(++sequence,{f,delay});return sequence;},clearTimer:id=>timers.delete(id)});
  assert.equal(ticks,1);assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,770);
  now=1000;const task=[...timers.values()][0];timers.clear();task.f();assert.equal(ticks,2);assert.equal(timers.size,1);
  doc.hidden=true;events.get('visibilitychange')();assert.equal(timers.size,0);
  now=120000;doc.hidden=false;events.get('visibilitychange')();assert.equal(ticks,3);assert.equal(timers.size,1);
  page.get('pagehide')();assert.equal(timers.size,0);events.get('visibilitychange')();assert.equal(ticks,3);
  page.get('pageshow')();assert.equal(ticks,4);assert.equal(timers.size,1);
  destroy();assert.equal(timers.size,0);assert.equal(events.size,0);assert.equal(page.size,0);
});
