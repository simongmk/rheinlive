import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cities} from '../lib/cities.mjs';
import {stationIndex} from '../lib/station-index.mjs';
import {cityAt,nearestStations,normaliseDepartures,departureReadiness,navigationLinks} from '../lib/monitor.mjs';
import {createMonitorApi} from '../lib/monitor-api.mjs';
import {readBoundedJSON} from '../lib/api.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/departures-severin-2026-09-05.json',import.meta.url)));
const raw=fixture.data,anchor=[raw.place.lat,raw.place.lon],T=Date.parse('2026-09-05T13:30:00Z');
const network=JSON.parse(await readFile(new URL('../public/data/network-cologne.json',import.meta.url)));
const station=network.stops.features.find(f=>f.properties.name==='Köln Severinstr.'),stopId=station.properties.queryId;
const event={departure:T+600000,scheduledDeparture:T+480000,realtime:true,cancelled:false,boarding:true};
const options={now:T,fetchedAt:T,walkMinutes:6,bufferMinutes:2};
const request=()=>new Request('https://app/api/departures?'+new URLSearchParams({city:'cologne',stopId}));
const walkRequest=(body={city:'cologne',origin:[50.9304,6.9601],stopIds:[stopId]})=>new Request('https://app/api/walk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('location selects its supported region and never silently maps Berlin to Cologne',()=>{
  for(const c of Object.values(cities))assert.equal(cityAt(c.center).id,c.id);
  assert.equal(cityAt([52.52,13.405]),null);assert.equal(cityAt([NaN,7]),null);
});
test('nearby search groups station platforms and respects the three-kilometre boundary',()=>{
  const near=nearestStations(network,[50.9292,6.9573]);assert.ok(near.length>1&&near.length<=6);assert.equal(near.filter(n=>n.feature.properties.name==='Köln Severinstr.').length,1);assert.equal(nearestStations(network,[52,13]).length,0);
  for(const n of near)assert.ok(n.meters<=3000);
});
test('every published monitor station has the exact source-observed server allowlist entry',async()=>{
  for(const id of Object.keys(cities)){const d=JSON.parse(await readFile(new URL('../public/data/network-'+id+'.json',import.meta.url)));for(const f of d.stops.features)assert.deepEqual(stationIndex[id][f.properties.queryId],[f.geometry.coordinates[1],f.geometry.coordinates[0]]);}
});
test('leave countdown subtracts walking and buffer from the forecast, including its delay',()=>{
  const r=departureReadiness(event,options);assert.equal(r.seconds,120);assert.equal(r.leaveAt,T+120000);
  assert.equal(departureReadiness({...event,departure:event.scheduledDeparture},options).seconds,0);
  assert.equal(departureReadiness(event,{...options,now:T+100001}).state,'leave');
  assert.equal(departureReadiness(event,{...options,now:T+120001,fetchedAt:T+120001}).state,'tight');
});
test('unknown walks, failed/old data, cancellations, boarding bans and schedules give no go recommendation',()=>{
  for(const [e,o,state]of [[event,{...options,walkMinutes:null},'no-walk'],[event,{...options,bufferMinutes:null},'no-walk'],[event,{...options,now:T+120001},'stale'],[event,{...options,fetchedAt:T+31000},'stale'],[{...event,cancelled:true},options,'cancelled'],[{...event,boarding:false},options,'no-boarding'],[{...event,realtime:false},options,'schedule'],[{...event,departure:T},options,'departed']])assert.equal(departureReadiness(e,o).state,state);
});
test('the actual Severinstraße board retains KVB predictions, distinct directions, platforms and delays',()=>{
  assert.equal(fixture.kind,'historical-live-capture-test-only');const data=normaliseDepartures(raw,cities.cologne,anchor);assert.ok(data.some(e=>e.mode==='bus'&&e.agency==='Kölner VB'));assert.ok(data.some(e=>e.mode==='tram'));assert.ok(data.some(e=>e.departure>e.scheduledDeparture));assert.ok(data.every(e=>e.headsign&&e.stop.id));assert.ok(new Set(data.map(e=>e.directionKey)).size>1);
});
test('cancelled duplicates win, foreign stops and invalid times are dropped',()=>{
  const a=raw.stopTimes[0],data=normaliseDepartures({place:raw.place,stopTimes:[a,{...a,cancelled:true},{...a,tripId:'bad',place:{...a.place,departure:'bad'}},{...a,tripId:'foreign',place:{...a.place,lat:53.5}}]},cities.cologne,anchor);assert.equal(data.length,1);assert.equal(data[0].cancelled,true);assert.throws(()=>normaliseDepartures({},cities.cologne,anchor));
});
test('navigation links contain only destination coordinates and use supported walking parameters',()=>{
  const links=navigationLinks({lat:50.9292,lon:6.9573});const apple=new URL(links[0].url),google=new URL(links[1].url);assert.equal(apple.searchParams.get('dirflg'),'w');assert.equal(google.searchParams.get('travelmode'),'walking');assert.equal(google.searchParams.get('api'),'1');assert.equal(google.searchParams.get('origin'),null);assert.equal(links[2].url,'https://www.bahn.de/buchung/fahrplan/suche');assert.deepEqual(navigationLinks({lat:NaN,lon:7}),[]);
});
test('station board coalesces and caches without renewing data age',async()=>{
  let now=T,calls=0;const api=createMonitorApi({clock:()=>now,readJSON:readBoundedJSON,fetcher:async()=>{calls++;return Response.json(raw);}});
  const [a,b]=await Promise.all([api(request()),api(request())]);assert.equal(calls,1);assert.deepEqual(await a.json(),await b.json());now+=10000;const c=await(await api(request())).json();assert.equal(c.fetchedAt,T);assert.equal(c.serverTime,now);now+=21000;await api(request());assert.equal(calls,2);
});
test('a board outage empties countdown data and backs off, instead of recycling a previous forecast',async()=>{
  let now=T,calls=0;const api=createMonitorApi({clock:()=>now,readJSON:readBoundedJSON,fetcher:async()=>{if(++calls>1)throw Error('offline');return Response.json(raw);}});await api(request());now+=31000;const r=await api(request());assert.equal(r.status,503);const d=await r.json();assert.equal(d.stale,true);assert.deepEqual(d.departures,[]);await api(request());assert.equal(calls,2);
});
test('unknown or cross-region station IDs and invalid walking requests never reach the source',async()=>{
  let calls=0;const api=createMonitorApi({readJSON:readBoundedJSON,fetcher:async()=>{calls++;throw Error('Unexpected request');}});
  assert.equal((await api(new Request('https://app/api/departures?city=bonn&stopId='+encodeURIComponent(stopId)))).status,404);
  for(const body of [{city:'__proto__',origin:anchor,stopIds:[stopId]},{city:'cologne',origin:[52.52,13.4],stopIds:[stopId]},{city:'cologne',origin:anchor,stopIds:Array(7).fill(stopId)},{city:'cologne',origin:anchor,stopIds:['unknown']}])assert.equal((await api(walkRequest(body))).status,400);
  assert.equal(calls,0);
});
test('foot paths preserve unreachable results, round in the UI, and never cache or echo the user origin',async()=>{
  let calls=0;const api=createMonitorApi({clock:()=>T,readJSON:readBoundedJSON,fetcher:async url=>{calls++;assert.equal(url.pathname,'/api/v1/one-to-many');assert.equal(url.searchParams.get('mode'),'WALK');assert.equal(url.searchParams.get('arriveBy'),'false');return Response.json(calls===1?[{duration:307,distance:369.5}]:[{}]);}});
  const r=await api(walkRequest());assert.equal(r.headers.get('Cache-Control'),'no-store');const a=await r.json();assert.equal(a.walks[0].seconds,307);assert.equal(a.origin,undefined);assert.equal(a.estimated,true);const b=await(await api(walkRequest())).json();assert.equal(b.walks[0].seconds,null);assert.equal(calls,2);
});
