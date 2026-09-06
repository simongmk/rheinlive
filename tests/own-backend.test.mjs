import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createApi} from '../lib/api.mjs';
import {adaptOwnResponse,railMode,ownPlatformFields,createFreshnessGuard,parseAppliedFeed,createOwnApi} from '../lib/own-backend.mjs';
import {departureReadiness} from '../lib/monitor.mjs';
import {freshDetail} from '../lib/journey-platform.mjs';
const T=Date.parse('2026-09-06T10:00:00Z');
const metrics=(published=T,applied=T)=>`nigiri_gtfsrt_feed_timestamp_seconds{tag="de"} ${published/1000}\nnigiri_gtfsrt_last_update_timestamp_seconds{tag="de"} ${applied/1000}\n`;
const relay=(time=T)=>({ready:true,publicationAt:new Date(time).toISOString(),receivedAt:new Date(time).toISOString()});
const capture=JSON.parse(await readFile(new URL('./fixtures/departures-severin-2026-09-05.json',import.meta.url))).data;
const anchor=[capture.place.lat,capture.place.lon],stations={cologne:{de_123:anchor}};
const request=path=>new Request('http://app'+path);
const vehicle={trips:[{tripId:'de_trip',routeShortName:'S19'}],mode:'REGIONAL_RAIL',from:{name:'A',stopId:'de_123',lat:anchor[0],lon:anchor[1]},to:{name:'B',stopId:'de_456',lat:anchor[0]+.002,lon:anchor[1]+.002},departure:new Date(T).toISOString(),arrival:new Date(T+120000).toISOString(),scheduledDeparture:new Date(T).toISOString(),scheduledArrival:new Date(T+120000).toISOString(),realTime:true,polyline:''};

test('own rail refinement preserves replacement buses, unknown types and mixed shared segments',()=>{
  for(const [name,expected]of [['S19','SUBURBAN'],['ICE 10','HIGHSPEED_RAIL'],['IC 20','LONG_DISTANCE'],['NJ 1','NIGHT_RAIL'],['RE 1','REGIONAL_RAIL'],['Something','REGIONAL_RAIL']])assert.equal(railMode('REGIONAL_RAIL',name),expected);
  assert.equal(railMode('BUS','ICE Ersatz'),'BUS');
  const input=[{...vehicle,trips:[...vehicle.trips,{tripId:'b',routeShortName:'RE 1'}]}],output=adaptOwnResponse('/api/v6/map/trips',input);
  assert.deepEqual(output.map(e=>e.mode),['SUBURBAN','REGIONAL_RAIL']);assert.equal(output.flatMap(e=>e.trips).length,2);assert.equal(input[0].mode,'REGIONAL_RAIL');
  assert.equal(adaptOwnResponse('/api/v6/stoptimes',{stopTimes:[{mode:'REGIONAL_RAIL',displayName:'ICE 10'}]}).stopTimes[0].mode,'HIGHSPEED_RAIL');
  assert.deepEqual(adaptOwnResponse('/api/experimental/map/routes',{routes:[{mode:'REGIONAL_RAIL',transitRoutes:[{shortName:'S19'},{shortName:'RB 1'}]}]}).routes.map(e=>e.mode),['SUBURBAN','REGIONAL_RAIL']);
});

test('freshness coalesces metrics work, and cache hits still obey timestamp expiry',async()=>{
  let now=T,calls=0;const guard=createFreshnessGuard({clock:()=>now,fetcher:async u=>{calls++;await Promise.resolve();return u.pathname==='/metrics'?new Response(metrics(T-118000,T)):Response.json(relay(T));}});
  await Promise.all([guard(),guard(),guard()]);assert.equal(calls,2);
  now+=2100;await assert.rejects(guard());assert.equal(calls,2);
});

test('fresh relay cannot conceal stale, missing, future or wrong-dataset engine updates',async()=>{
  for(const body of [metrics(T-121000),metrics(T,T-91000),metrics(T+31000),metrics().replaceAll('tag="de"','tag="other"'),metrics()+'nigiri_gtfsrt_feed_timestamp_seconds{tag="de"} 1\n',metrics().replace(String(T/1000),'NaN')]){
    const guard=createFreshnessGuard({clock:()=>T,fetcher:async u=>u.pathname==='/metrics'?new Response(body):Response.json(relay())});await assert.rejects(guard());
  }
  assert.throws(()=>parseAppliedFeed(''));assert.throws(()=>parseAppliedFeed(metrics().replace(String(T/1000),'0')));
});

test('oversized or failed health requests fail closed, back off and recover',async()=>{
  let now=T,calls=0,bad=true;const guard=createFreshnessGuard({clock:()=>now,fetcher:async u=>{calls++;return u.pathname==='/metrics'?new Response(bad?'x'.repeat(256001):metrics(now)):Response.json(relay(now));}});
  await assert.rejects(guard());await assert.rejects(guard());assert.equal(calls,2);
  bad=false;now+=5000;await guard();assert.equal(calls,4);
});

test('all provider APIs use their configured server and station namespace; stale guard blocks warm caches',async()=>{
  let fresh=true;const paths=[],fetcher=async u=>{assert.equal(u.origin,'http://own:8787');paths.push(u.pathname);
    if(u.pathname==='/api/v6/map/trips')return Response.json([vehicle]);
    if(u.pathname==='/api/v6/stoptimes')return Response.json(capture);
    if(u.pathname==='/api/v1/one-to-many')return Response.json([{duration:90,distance:100}]);
    if(u.pathname==='/api/v6/trip')return Response.json({legs:[{mode:'REGIONAL_RAIL',agencyName:'Test',realTime:true,from:{...vehicle.from,departure:vehicle.departure,scheduledDeparture:vehicle.departure},to:{...vehicle.to,arrival:vehicle.arrival,scheduledArrival:vehicle.arrival},intermediateStops:[]}]});
    throw Error('Unexpected path');};
  const api=createApi({stations,baseUrl:'http://own:8787',sourceName:'Own test',clock:()=>T,fetcher,assertFresh:async()=>{if(!fresh)throw Error('offline');}});
  const board='/api/departures?city=cologne&stopId=de_123',trip='/api/trip?city=cologne&id=de_trip';
  for(const path of ['/api/vehicles',board,trip]){const r=await api(request(path));assert.equal(r.status,200);assert.equal((await r.json()).source,'Own test');}
  assert.equal((await api(request('/api/departures?city=cologne&stopId=old_transitous_id'))).status,404);
  fresh=false;
  for(const path of ['/api/vehicles',board,trip]){const r=await api(request(path));assert.equal(r.status,503);const d=await r.json();assert.deepEqual(d.trips,[]);assert.deepEqual(d.departures,[]);assert.equal(r.headers.get('cache-control'),'no-store');}
  const walk=await api(new Request('http://app/api/walk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({city:'cologne',origin:anchor,stopIds:['de_123']})}));
  assert.equal(walk.status,200);assert.equal((await walk.json()).walks[0].seconds,90);assert.equal(new Set(paths).size,4);
});

test('own provider requires a separate station registry and freshness precedes data access',async()=>{
  assert.throws(()=>createOwnApi());let calls=[];
  const api=createOwnApi({stations,clock:()=>T,fetcher:async u=>{calls.push(u.pathname);if(u.pathname==='/metrics')return new Response(metrics(T-121000));if(u.pathname==='/status')return Response.json(relay());throw Error('Should not access map');}});
  assert.equal((await api(request('/api/vehicles'))).status,503);assert.deepEqual(calls.sort(),['/metrics','/status']);
});

test('feed deadline survives API caching and expires countdowns and details before their receipt-age limit',async()=>{
  let now=T,mapCalls=0;
  const api=createOwnApi({stations,clock:()=>now,fetcher:async u=>{
    if(u.pathname==='/metrics')return new Response(metrics(T-110000,T));
    if(u.pathname==='/status')return Response.json(relay());
    if(u.pathname==='/api/v6/map/trips'){mapCalls++;return Response.json([vehicle]);}
    throw Error('Unexpected query');}});
  const first=await(await api(request('/api/vehicles'))).json();assert.equal(first.validUntil,T+10000);assert.equal(first.trips[0].mode,'suburban');
  now+=6000;const second=await(await api(request('/api/vehicles'))).json();assert.equal(second.validUntil,first.validUntil);assert.equal(second.fetchedAt,first.fetchedAt);assert.equal(mapCalls,1);
  const event={departure:T+300000,realtime:true,boarding:true};
  const options={now:T+10001,fetchedAt:T,validUntil:first.validUntil,walkMinutes:1,bufferMinutes:0};
  assert.equal(departureReadiness(event,options).state,'stale');assert.equal(freshDetail(first,options.now),false);
  for(const deadline of [null,NaN,'bad']){assert.equal(departureReadiness(event,{...options,validUntil:deadline}).state,'stale');assert.equal(freshDetail({...first,validUntil:deadline},T),false);}
});

test('a feed expiring while a map request is running never returns a newly fresh snapshot',async()=>{
  let now=T;
  const api=createOwnApi({stations,clock:()=>now,fetcher:async u=>{
    if(u.pathname==='/metrics')return new Response(metrics(T-119000,T));
    if(u.pathname==='/status')return Response.json(relay());
    now+=2000;return Response.json([vehicle]);}});
  assert.equal((await api(request('/api/vehicles'))).status,503);
});

test('own platform labels keep reported changes without claiming an old provider or guessing DHIDs',()=>{
  assert.deepEqual(ownPlatformFields({stopId:'de_123',track:' 9 ',scheduledTrack:'10'}),{track:'9',scheduledTrack:'10',trackChanged:true,trackSource:'gtfs.de',stationId:null});
  assert.equal(ownPlatformFields({stopId:'de_123'}).track,null);
  assert.deepEqual(adaptOwnResponse('/api/v6/stoptimes',{error:'broken'}),{error:'broken'});
});
