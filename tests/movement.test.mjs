import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareTrips,normaliseSegments,positionAt,movementProgress,distance} from '../lib/transit.mjs';
import {createVehicleLayer} from '../public/vehicles.js';

const capture=JSON.parse(await readFile(new URL('fixtures/zero-dwell-2026-09-05.json',import.meta.url)));
const trips=prepareTrips(normaliseSegments(capture.data).trips),tram=trips.find(t=>t.id==='20260905_16:27_de-DELFI_3380406407');
const stay=tram.dwells.find(d=>d&&d.departure>capture.receivedAt),T=stay.departure;

test('actual identical KVB minutes produce a stationary, explicitly estimated hold before departure',()=>{
  assert.equal(stay.kind,'estimated');assert.equal(stay.durationMs,20000);
  const positions=[18,12,6,1].map(s=>positionAt(tram,T-s*1000,capture.receivedAt));
  for(const p of positions){assert.equal(p.state,'stopped');assert.equal(p.speedMps,0);assert.equal(p.dwell.kind,'estimated');assert.equal(p.dwell.departure,T);assert.equal(p.dwell.sourceArrival,T);assert.equal(p.lat,positions[0].lat);assert.equal(p.lon,positions[0].lon);}
  const start=positionAt(tram,T,capture.receivedAt);assert.equal(start.state,'moving');assert.equal(start.segment.from.name,'Köln Dom/Hbf');assert.equal(start.fraction,0);assert.equal(start.speedMps,0);
  assert.equal(start.lat,positions[0].lat);assert.equal(start.lon,positions[0].lon);
});
test('icons approach the hold without a jump, brake to zero and accelerate afterwards',()=>{
  const before=positionAt(tram,stay.arrival-1,capture.receivedAt),held=positionAt(tram,stay.arrival,capture.receivedAt);
  assert.equal(before.movementPhase,'braking');assert.ok(before.speedMps<.01);assert.ok(distance([before.lat,before.lon],[held.lat,held.lon])<.01);
  const a=positionAt(tram,T+1000,capture.receivedAt),b=positionAt(tram,T+2000,capture.receivedAt),c=positionAt(tram,T+3000,capture.receivedAt);
  assert.equal(a.movementPhase,'accelerating');assert.ok(a.speedMps<b.speedMps&&b.speedMps<c.speedMps);
  assert.ok(b.fraction-a.fraction>a.fraction);assert.ok(c.fraction-b.fraction>b.fraction-a.fraction);
});
test('speed integration keeps the exact endpoints and never moves backwards or overshoots',()=>{
  for(const duration of [1000,60000,180000,3600000]){
    let previous=0;for(let t=0;t<=duration;t+=duration/500){const p=movementProgress(t,duration);assert.ok(p.fraction>=previous-1e-12&&p.fraction<=1);assert.ok(p.speedPerMs>=0);previous=p.fraction;}
    assert.equal(movementProgress(0,duration).fraction,0);assert.equal(movementProgress(duration,duration).fraction,1);assert.equal(movementProgress(duration,duration).speedPerMs,0);assert.equal(movementProgress(duration/2,duration).fraction,.5);
  }
});
test('short and fast legs cannot borrow arbitrary time for a cosmetic hold',()=>{
  const outer=trips.find(t=>t.id==='20260905_15:47_de-DELFI_3380406409');assert.equal(outer.dwells[1].durationMs,6000);
  const base=structuredClone(tram),a=base.segments[0],b=base.segments[1];
  a.departure=a.arrival-1000;b.departure=a.arrival;
  const short=prepareTrips([base])[0];assert.equal(short.dwells[0],null);
  a.departure=a.arrival-60000;a.points=[[a.from.lat,a.from.lon],[a.from.lat+.1,a.from.lon],[a.to.lat,a.to.lon]];
  const fast=prepareTrips([base])[0];assert.equal(fast.dwells[0],null);
});
test('missing, mixed, conflicting or second-resolved times never become modeled stays',()=>{
  for(const change of [t=>t.segments.splice(1),t=>t.segments[1].realtime=!t.segments[0].realtime,t=>t.segments[1].departure-=1000,t=>{t.segments[0].arrival+=1000;t.segments[1].departure+=1000;},t=>t.segments[1].from.id='different']){
    const t=structuredClone(tram);change(t);assert.equal(prepareTrips([t])[0].dwells[0],null);
  }
  const stale=structuredClone(tram);stale.segments[1].observedAt=T-200000;
  assert.equal(positionAt(stale,T-10000,T),null);
  assert.equal(positionAt(tram,T+121000,T),null);
});
test('a later forecast shifts the model without changing the reported timetable',()=>{
  const shifted=structuredClone(tram),original=shifted.segments[1].scheduledArrival;
  for(const s of shifted.segments){s.arrival+=60000;s.departure+=60000;}
  const prepared=prepareTrips([shifted])[0],p=positionAt(prepared,T+50000,T+40000);
  assert.equal(p.state,'stopped');assert.equal(p.dwell.departure,T+60000);assert.equal(prepared.segments[1].scheduledArrival,original);
});
test('the actual canvas icon stays at identical pixels across frames, then gains speed',()=>{
  let now=T-18000,painted=null,sourceUpdates=0;const ctx={setTransform(){},scale(){},clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},fillText(){},drawImage(_node,x,y,w,h){painted={x:x+w/2,y:y+h/2};}};
  const doc={hidden:false,createElement:()=>({style:{},setAttribute(){},getContext:()=>({...ctx}),remove(){}}),addEventListener(){},removeEventListener(){}};
  const map={getCanvas:()=>({clientWidth:1000,clientHeight:800}),getCanvasContainer:()=>({appendChild(){}}),getZoom:()=>17,getBounds:()=>({contains:()=>true}),project:([lon,lat])=>({x:500+(lon-tram.segments[2].from.lon)*100000,y:400+(lat-tram.segments[2].from.lat)*100000}),isMoving:()=>false,on(){},off(){},getSource(){sourceUpdates++;throw Error('Animation must not update map sources');}};
  const layer=createVehicleLayer(map,{document:doc,clock:()=>now,perf:{now:()=>now-T+20000},raf:()=>1,caf(){}});
  const p=positionAt(tram,now,capture.receivedAt);layer.update([{...tram,...p}],capture.receivedAt,now);const held={...painted};
  for(const seconds of [-12,-6,-1]){now=T+seconds*1000;layer.select(null);assert.deepEqual(painted,held);}
  now=T+1000;layer.select(null);const first={...painted};now=T+2000;layer.select(null);const second={...painted};
  assert.ok(Math.hypot(second.x-first.x,second.y-first.y)>Math.hypot(first.x-held.x,first.y-held.y));
  assert.equal(sourceUpdates,0);assert.equal(layer.stats().sprites,2);layer.destroy();
});
