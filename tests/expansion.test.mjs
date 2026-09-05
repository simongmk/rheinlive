import test from 'node:test';
import assert from 'node:assert/strict';
import{readFile}from'node:fs/promises';
import{cities,lineName,lineKey,pointInBounds,modeFor,segmentIntersectsBounds}from'../lib/cities.mjs';
import{normaliseSegments,prepareTrips,vehiclesAt,vehicleView}from'../lib/transit.mjs';
import{normaliseTripDetail}from'../lib/trip.mjs';
import{createTransitService,upstreamUrl}from'../lib/api.mjs';
import{createWorker}from'../worker.mjs';
const T=Date.parse('2026-09-05T12:00:00Z');
const segment=(city,mode='BUS',name='1',id='trip')=>({mode,trips:[{tripId:id,displayName:name}],from:{name:'A',stopId:'a',lat:city.center[0],lon:city.center[1]},to:{name:'B',stopId:'b',lat:city.center[0]+.001,lon:city.center[1]+.001},departure:new Date(T).toISOString(),arrival:new Date(T+60000).toISOString(),scheduledDeparture:new Date(T-60000).toISOString(),scheduledArrival:new Date(T).toISOString(),realTime:true,polyline:''});
test('bus and tram with the same line number have different filters and distinct trip IDs',()=>{const {trips}=normaliseSegments([segment(cities.cologne,'BUS','1','bus1'),segment(cities.cologne,'TRAM','1','tram1')]);assert.equal(trips.length,2);assert.notEqual(trips[0].lineKey,trips[1].lineKey);assert.equal(trips[0].mode,'bus');});
test('replacement buses retain bus mode even when named like a rail service',()=>{const t=normaliseSegments([segment(cities.bonn,'BUS','RE8','sev')],cities.bonn).trips[0];assert.equal(t.mode,'bus');assert.equal(t.lineKey,'bus:RE8');});
test('long-distance categories include night trains but never classify replacement buses by name',()=>{
  for(const source of ['HIGHSPEED_RAIL','LONG_DISTANCE','NIGHT_RAIL'])assert.equal(modeFor(source).id,'long_distance');
  const bus=normaliseSegments([segment(cities.bonn,'BUS','ICE 123','sev')],cities.bonn).trips[0];assert.equal(bus.mode,'bus');
  const night=segment(cities.bonn,'NIGHT_RAIL','NJ 40421','night');night.arrival=new Date(T+90*60000).toISOString();
  const trips=prepareTrips(normaliseSegments([night],cities.bonn).trips);assert.equal(trips[0].line,'NJ 40421');assert.equal(vehiclesAt(trips,T+30000,T)[0].quality,'realtime');
});
test('regional crossings work without an inside vertex and exclude nearby non-crossing segments',()=>{
  const bounds=cities.bonn.bounds;
  assert.equal(segmentIntersectsBounds([50.7,6.9],[50.7,7.4],bounds),true);
  assert.equal(segmentIntersectsBounds([50.5,7.1],[50.9,7.1],bounds),true);
  assert.equal(segmentIntersectsBounds([50.5,7.0],[50.7,7.4],bounds),true);
  assert.equal(segmentIntersectsBounds([50.5,7.2],[50.7,7.4],bounds),false);
  assert.equal(segmentIntersectsBounds([50.9,6.9],[50.9,7.4],bounds),false);
});
test('actual ICE and IC forecasts survive normalization, including Bonn through trains',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/long-distance-2026-09-05.json',import.meta.url)));
  assert.equal(fixture.kind,'historical-live-capture-test-only');
  for(const sample of fixture.samples){const normalized=normaliseSegments(sample.data,cities[sample.city]);assert.ok(normalized.trips.length>0);assert.ok(normalized.trips.every(t=>t.mode==='long_distance'));assert.ok(normalized.trips.some(t=>t.segments.some(s=>s.realtime)));}
  const sample=fixture.samples.find(s=>s.city==='bonn'),through=sample.data.find(s=>s.trips.some(t=>t.displayName==='ICE 519'));
  assert.ok([through.from,through.to].every(p=>!pointInBounds([p.lat,p.lon],cities.bonn.bounds)));
  assert.equal(normaliseSegments([through],cities.bonn).trips[0].line,'ICE 519');
  assert.equal(normaliseSegments([{...through,polyline:''}],cities.bonn).trips.length,0);
});
test('U prefixes are retained and regional trip numbers are removed from route labels',()=>{assert.equal(lineName('U79','tram'),'U79');assert.equal(lineName('RE10 (82277)','regional'),'RE10');assert.notEqual(lineKey('regional','RE8'),lineKey('bus','RE8'));});
test('each city uses its own bounds and rejects foreign stop segments',()=>{for(const city of Object.values(cities)){assert.equal(upstreamUrl(T,city).searchParams.get('min'),city.bounds[0].join(','));assert.equal(normaliseSegments([segment(city)],city).trips.length,1);}assert.equal(normaliseSegments([segment(cities.bonn)],cities.duesseldorf).trips.length,0);});
test('city caches are isolated, coalesce duplicate requests and serialize upstream parsing',async()=>{let calls=0,concurrent=0,peak=0;const svc=createTransitService({clock:()=>T,fetcher:async u=>{calls++;concurrent++;peak=Math.max(peak,concurrent);await Promise.resolve();const c=Object.values(cities).find(c=>u.searchParams.get('min')===c.bounds[0].join(','));concurrent--;return Response.json([segment(c)]);}});const [a,b,c]=await Promise.all([svc('cologne'),svc('bonn'),svc('cologne')]);assert.equal(calls,2);assert.equal(peak,1);assert.equal(a.city,'cologne');assert.equal(b.city,'bonn');assert.deepEqual(a,c);assert.equal(a.trips[0].segments[0].from.lat,cities.cologne.center[0]);assert.equal(b.trips[0].segments[0].from.lat,cities.bonn.center[0]);});
test('one regional source failure does not poison other city caches',async()=>{const svc=createTransitService({clock:()=>T,fetcher:async u=>{if(u.searchParams.get('min')===cities.bonn.bounds[0].join(','))throw Error('offline');return Response.json([segment(cities.cologne)]);}});assert.equal((await svc('bonn')).stale,true);assert.equal((await svc('cologne')).stale,false);});
test('edge cache keys cannot mix Cologne and Bonn',async()=>{const cache=new Map(),pending=[];let calls=0;const app=createWorker({clock:()=>T,getEdgeCache:()=>({match:async key=>cache.get(key.url)?.clone(),put:async(key,r)=>cache.set(key.url,r)}),api:async request=>{calls++;return Response.json({city:new URL(request.url).searchParams.get('city'),fetchedAt:T,trips:[]});}});const ctx={waitUntil:p=>pending.push(p)};for(const id of ['cologne','bonn','cologne']){const r=await app.fetch(new Request('https://app/api/vehicles?city='+id),{},ctx);assert.equal((await r.json()).city,id);await Promise.all(pending);}assert.equal(calls,2);assert.equal(cache.size,2);});
test('schedule-only ferry is hidden unless explicitly enabled',()=>{const s={...segment(cities.bonn,'FERRY','85710942'),realTime:false};const vs=vehiclesAt(prepareTrips(normaliseSegments([s],cities.bonn).trips),T+30000,T);assert.equal(vs[0].line,'Fähre');assert.equal(vehicleView(vs).visible.length,0);assert.equal(vehicleView(vs,{includeSchedule:true}).visible.length,1);});
test('full trip details retain actual cancellations and changed platforms without inventing a shape',()=>{const p={name:'Station',stopId:'x',lat:50.94,lon:6.95,arrival:new Date(T).toISOString(),scheduledArrival:new Date(T-120000).toISOString(),track:'2',scheduledTrack:'1',cancelled:true};const d=normaliseTripDetail({legs:[{tripId:'x',agencyName:'Operator',realTime:true,cancelled:true,headsign:'End',from:p,to:{...p,stopId:'end'},legGeometry:{points:'!'}}]});assert.equal(d.cancelled,true);assert.equal(d.paths.length,0);assert.equal(d.stops[0].cancelled,true);assert.equal(d.stops[0].track,'2');assert.equal(d.stops[0].arrival-d.stops[0].scheduledArrival,120000);assert.throws(()=>normaliseTripDetail({legs:[]}));});
test('dated map networks contain real region stops and separate transport-mode keys',async()=>{for(const city of Object.values(cities)){const d=JSON.parse(await readFile(new URL('../public/data/network-'+city.id+'.json',import.meta.url)));assert.equal(d.kind,'static-network-not-live-vehicles');assert.equal(d.city,city.id);assert.ok(d.catalog.some(l=>l.mode==='bus'));assert.ok(d.catalog.some(l=>l.mode==='tram'));assert.ok(d.stops.features.length>100);assert.ok(d.lines.features.every(f=>f.properties.mode==='ferry'));assert.ok(d.stops.features.every(f=>pointInBounds([f.geometry.coordinates[1],f.geometry.coordinates[0]],city.bounds)));assert.ok(d.catalog.every(l=>l.key===lineKey(l.mode,l.line)));}});
test('historical regional captures preserve actual bus operators and mode distinctions',async()=>{const fixture=JSON.parse(await readFile(new URL('./fixtures/regions-2026-09-05.json',import.meta.url)));assert.equal(fixture.kind,'historical-live-capture-test-only');const expected={cologne:'Kölner VB',bonn:'Stadtwerke Bonn',duesseldorf:'Rheinbahn Bus'};for(const sample of fixture.samples){const data=normaliseSegments(sample.data,cities[sample.city]);assert.ok(data.trips.some(t=>t.mode==='bus'));assert.ok(data.trips.some(t=>t.mode==='tram'));const detail=normaliseTripDetail(sample.detail);assert.equal(detail.agency,expected[sample.city]);assert.equal(detail.realtime,true);assert.ok(detail.paths.length>0);assert.ok(detail.stops.length>10);}});
