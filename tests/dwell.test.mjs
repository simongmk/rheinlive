import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normaliseSegments,prepareTrips,positionAt,vehiclesAt} from '../lib/transit.mjs';
import {createTransitService} from '../lib/api.mjs';

const T=Date.parse('2026-09-05T13:00:00Z');
const p=id=>({stopId:id,name:id,lat:50.94,lon:6.95});
const leg=(from,to,dep,arr,realtime=true)=>({mode:'TRAM',from:p(from),to:p(to),departure:new Date(T+dep).toISOString(),arrival:new Date(T+arr).toISOString(),realTime:realtime,polyline:'',trips:[{tripId:'test-only',routeShortName:'1'}]});
const incoming=leg('a','b',-60000,0),outgoing=leg('b','c',60000,120000);
const trip=(a=incoming,b=outgoing)=>prepareTrips(normaliseSegments([a,b]).trips)[0];

test('a stop lasts from reported arrival until departure, then resumes at the outgoing stop',()=>{
  const t=trip();
  for(const seconds of [0,1,30,59.999]){const v=positionAt(t,T+seconds*1000,T);assert.equal(v.state,'stopped');assert.equal(v.dwell.durationMs,60000);assert.equal(v.lat,t.segments[1].from.lat);assert.equal(v.lon,t.segments[1].from.lon);}
  const moving=positionAt(t,T+60000,T);assert.equal(moving.state,'moving');assert.equal(moving.fraction,0);
});
test('an outgoing forecast cannot make an unpredicted arrival a forecast-based dwell',()=>{
  assert.equal(positionAt(trip({...incoming,realTime:false}),T+10000,T).quality,'schedule');
  assert.equal(positionAt(trip(incoming,{...outgoing,realTime:false}),T+10000,T).quality,'schedule');
});
test('zero dwell, conflicting timestamps and disconnected stops never create waiting time',()=>{
  assert.equal(positionAt(trip(incoming,leg('b','c',0,60000)),T+1000,T).state,'moving');
  assert.equal(positionAt(trip(incoming,leg('b','c',-10000,60000)),T+1000,T).state,'moving');
  assert.equal(positionAt(trip(incoming,leg('x','c',60000,120000)),T+1000,T),null);
});
test('known longer stops work with fresh observations but stale boundaries never extend them',()=>{
  const t=trip(incoming,leg('b','c',900000,960000));
  assert.equal(positionAt(t,T+650000,T+650000).state,'stopped');
  t.segments[0].observedAt=T;
  assert.equal(positionAt(t,T+650000,T+650000),null);
});
test('polling retains a dropped recent arrival once, without renewing its age or making extra requests',async()=>{
  let now=T+10000,calls=0,raw=[incoming,outgoing];
  const service=createTransitService({clock:()=>now,fetcher:async()=>{calls++;return Response.json(raw);}});
  await service();raw=[outgoing];now=T+41000;
  const next=await service(),v=positionAt(prepareTrips(next.trips)[0],now,next.fetchedAt);
  assert.equal(v.state,'stopped');assert.equal(next.trips[0].segments.length,2);assert.equal(next.trips[0].segments[0].observedAt,T+10000);assert.equal(calls,2);
  raw=[leg('b','c',300000,360000)];now=T+72000;const again=await service();assert.equal(again.trips[0].segments[0].observedAt,T+10000);
  now=T+141000;const expired=await service();assert.equal(expired.trips[0].segments.length,1);assert.equal(vehiclesAt(prepareTrips(expired.trips),now,expired.fetchedAt).length,0);
});
test('new forecasts replace the incoming leg; missing or cancelled trips are never retained',async()=>{
  let now=T+10000,raw=[incoming,outgoing];const service=createTransitService({clock:()=>now,fetcher:async()=>Response.json(raw)});
  await service();now=T+41000;raw=[leg('a','b',-40000,50000),outgoing];const next=await service();assert.equal(next.trips[0].segments.length,2);assert.equal(positionAt(prepareTrips(next.trips)[0],now,next.fetchedAt).state,'moving');
  now=T+72000;raw=[{...outgoing,cancelled:true}];assert.equal((await service()).trips.length,0);
});
test('recorded RB26 and S11 forecasts contain real one-minute station dwell intervals',async()=>{
  const c=JSON.parse(await readFile(new URL('./fixtures/transitous-dwell-2026-09-05.json',import.meta.url)));
  assert.equal(c.kind,'historical-live-capture-test-only');const trips=prepareTrips(normaliseSegments(c.data).trips),vs=vehiclesAt(trips,c.receivedAt,c.receivedAt);
  assert.equal(vs.length,3);assert.ok(vs.some(v=>v.line==='RB26'&&v.segment.from.name==='Köln Süd Bf'));
  for(const v of vs){assert.equal(v.state,'stopped');assert.equal(v.quality,'realtime');assert.equal(v.dwell.durationMs,60000);assert.equal(positionAt(v,v.dwell.departure,c.receivedAt).state,'moving');}
  assert.equal(vehiclesAt(trips,c.receivedAt+180000,c.receivedAt).length,0);
});
test('an explicitly cancelled incoming leg cannot be filled from the previous snapshot',async()=>{
  let now=T+10000,raw=[incoming,outgoing];const service=createTransitService({clock:()=>now,fetcher:async()=>Response.json(raw)});
  await service();now=T+41000;raw=[{...incoming,cancelled:true},outgoing];const current=await service();assert.equal(current.trips[0].segments.length,1);assert.equal(vehiclesAt(prepareTrips(current.trips),now,current.fetchedAt).length,0);
});
