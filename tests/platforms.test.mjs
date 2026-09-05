import test from 'node:test';
import assert from 'node:assert/strict';
import {platformFields} from '../lib/platforms.mjs';
import {platformRegistry} from '../lib/platform-data.mjs';
import {platformForStop,platformText} from '../lib/journey-platform.mjs';
import {normaliseTripDetail} from '../lib/trip.mjs';
import {createTransitService} from '../lib/api.mjs';
const T=Date.parse('2026-09-05T15:00:00Z');
const deutz='de-DELFI_de:05315:11901:7:79';
const v={id:'trip',mode:'suburban',segment:{from:{id:'a',track:'1'},to:{id:'b',track:'2'},departure:T,arrival:T+120000,scheduledDeparture:T,scheduledArrival:T+120000,realtime:true,observedAt:T}};
const context=(stops,extra={})=>({fetchedAt:T,now:T+60000,detailId:'trip',detail:{fetchedAt:T,realtime:true,stops},...extra});

test('official OpenStation plate labels repair DELFI internal codes by exact DHID',()=>{
  assert.equal(platformRegistry.source,'https://bahnhof.de/daten/netex');
  assert.ok(Object.keys(platformRegistry.stations).length>5000);
  assert.equal(platformFields({id:deutz,track:'91',scheduledTrack:'91'}).track,'9');
  assert.equal(platformFields({id:deutz,track:'91',scheduledTrack:'91'}).trackChanged,false);
  assert.equal(platformFields({id:deutz.replace(':79',':80'),track:'92'}).track,'10');
  assert.equal(platformFields({id:'de-DELFI_de:05315:11801:7:72',track:'75'}).track,'2');
  assert.equal(platformFields({id:'de-DELFI_de:05315:11201',track:''}).track,null);
  assert.equal(platformFields({id:'de-DELFI_de:05315:11901:7:999',track:'91'}).track,null);
});
test('a reported track change cannot be overwritten with the unchanged stop assignment',()=>{
  const actual=platformFields({id:deutz,track:'10',scheduledTrack:'91'});
  assert.equal(actual.track,'10');assert.equal(actual.scheduledTrack,null);assert.equal(actual.trackChanged,true);
  const ambiguous=platformFields({id:deutz,track:'92',scheduledTrack:'91'});
  assert.equal(ambiguous.track,null);assert.equal(ambiguous.scheduledTrack,null);
  assert.equal(platformText(ambiguous,'suburban').label,'Gleis geändert');
  const unknownCurrent=platformFields({id:deutz,track:'92',scheduledTrack:'9'});
  assert.equal(platformText(unknownCurrent,'suburban').label,'Gleis geändert');
  assert.equal(platformText(unknownCurrent,'suburban').unknown,true);
});
test('map snapshots and full journey use the same physical track label',async()=>{
  const from={stopId:deutz,name:'Köln Messe/Deutz Bf',lat:50.94111,lon:6.975984,track:'91',scheduledTrack:'91'};
  const to={stopId:'de-DELFI_de:05315:18001:7:71',name:'Trimbornstraße',lat:50.93578,lon:6.996897,track:'74',scheduledTrack:'74'};
  const raw={from,to,mode:'SUBURBAN',realTime:true,departure:new Date(T).toISOString(),arrival:new Date(T+120000).toISOString(),trips:[{tripId:'test',routeShortName:'S19'}]};
  const service=createTransitService({clock:()=>T,fetcher:async()=>Response.json([raw])});
  const snapshot=await service('cologne');assert.equal(snapshot.trips[0].segments[0].from.track,'9');
  const detail=normaliseTripDetail({legs:[{...raw,tripId:'test',agencyName:'Test'}]});
  assert.equal(detail.stops[0].track,'9');assert.equal(detail.stops[0].scheduledTrack,'9');
});
test('summary resolves the next stop and current dwell stop separately',()=>{
  const c=context([{id:'a',departure:T,scheduledDeparture:T,track:'4'},{id:'b',arrival:T+120000,scheduledArrival:T+120000,track:'5',scheduledTrack:'2'}]);
  assert.equal(platformForStop(v,'from',c).track,'4');
  assert.equal(platformForStop(v,'to',c).track,'5');
  assert.deepEqual(platformText(platformForStop(v,'to',c),'suburban'),{label:'Gleis 5',note:'statt 2',changed:true,unknown:false});
});
test('wrong-trip, stale and future detail responses cannot replace a fresh platform',()=>{
  const stops=[{id:'b',arrival:T+120000,track:'8'}];
  for(const extra of [{detailId:'other'},{detail:{stops,fetchedAt:T-61000}},{detail:{stops,fetchedAt:T+91000}},{detail:{stops,fetchedAt:null}}])assert.equal(platformForStop(v,'to',context(stops,extra)).track,'2');
  assert.equal(platformForStop(v,'to',context(stops,{now:T+120001})),null);
  assert.equal(platformForStop(v,'to',context(stops,{detail:{stops,fetchedAt:T-1000}})).track,'2');
});
test('looping stops match the scheduled event even after a large forecast shift',()=>{
  const stops=[{id:'b',arrival:T+120000,scheduledArrival:T-600000,track:'wrong'},{id:'b',arrival:T+600000,scheduledArrival:T+120000,track:'correct'}];
  assert.equal(platformForStop(v,'to',context(stops)).track,'correct');
  const ambiguous=stops.map(s=>({...s,scheduledArrival:null,arrival:T+120000}));
  assert.equal(platformForStop(v,'to',context(ambiguous)).track,'2');
});
test('new platform ID requires the same official station and matching event',()=>{
  const vehicle={...v,segment:{...v.segment,to:{id:deutz,stationId:'de:05315:11901',track:'9'}}};
  const stop={id:deutz.replace(':79',':80'),stationId:'de:05315:11901',scheduledArrival:T+120000,track:'10'};
  assert.equal(platformForStop(vehicle,'to',context([stop])).track,'10');
  assert.equal(platformForStop(vehicle,'to',context([{...stop,stationId:'de:05315:11201'}])).track,'9');
});
test('fresh missing/cancelled detail takes precedence; planned and unknown labels stay honest',()=>{
  const missing=platformForStop(v,'to',context([{id:'b',arrival:T+120000,track:null}]));
  assert.equal(platformText(missing,'suburban',{unknown:true}).label,'Gleis nicht gemeldet');
  assert.equal(platformText({...missing,cancelled:true},'suburban').label,'Halt entfällt');
  assert.equal(platformText({scheduledTrack:'3'},'regional').note,'laut Fahrplan');
  assert.equal(platformText({track:'A',plannedOnly:true},'bus').label,'Steig A');
  assert.equal(platformText({track:'1'},'ferry').label,'Anleger 1');
  assert.equal(platformText({track:'2',plannedOnly:true},'suburban').note,'laut Fahrplan');
});
