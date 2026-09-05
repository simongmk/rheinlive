import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodePolyline,preparePath,interpolate,normaliseSegments,prepareTrips,positionAt,vehiclesAt,vehicleView} from '../lib/transit.mjs';
import {createTransitService,readBoundedJSON,upstreamUrl,handleApi} from '../lib/api.mjs';
import worker from '../worker.mjs';
const T=Date.parse('2026-09-05T08:00:00Z');
// Synthetic schema fixtures only: never used in the app or presented as live data.
const place=(id,lat,lon)=>({name:id,stopId:id,lat,lon});
function segment(overrides={}){return {trips:[{tripId:'test-trip',routeShortName:'1',displayName:'1'}],mode:'TRAM',from:place('A',50.94,6.95),to:place('B',50.941,6.96),departure:new Date(T).toISOString(),arrival:new Date(T+60_000).toISOString(),scheduledDeparture:new Date(T-120_000).toISOString(),scheduledArrival:new Date(T-60_000).toISOString(),realTime:true,polyline:'',...overrides};}
const trip=raw=>prepareTrips(normaliseSegments(raw).trips)[0];
test('decodes the standard Google reference polyline',()=>{assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'),[[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]);});
test('rejects truncated and malformed encoded paths',()=>{assert.throws(()=>decodePolyline('_'));assert.throws(()=>decodePolyline('!!'));assert.throws(()=>decodePolyline(null));});
test('interpolates using distance and clamps both ends',()=>{const p=preparePath([[0,0],[0,1],[0,10]]);assert.ok(Math.abs(interpolate(p,.5).lon-5)<1e-6);assert.equal(interpolate(p,-1).lon,0);assert.equal(interpolate(p,4).lon,10);});
test('zero length shapes remain finite',()=>{const p=interpolate(preparePath([[50,7],[50,7]]),.5);assert.equal(p.lat,50);assert.equal(p.lon,7);});
test('excludes unsupported modes, invalid coordinates, cancelled trips and foreign regions',()=>{assert.equal(normaliseSegments([segment({mode:'AIRPLANE'}),segment({trips:[{tripId:'x',routeShortName:'?'}]}),segment({from:place('A',NaN,7)}),segment({cancelled:true}),segment({from:place('Hamburg',53.5,10),to:place('Hamburg2',53.6,10)})]).trips.length,0);});
test('normalizes the actual API schema and marks missing shape geometry',()=>{const t=trip([segment()]);assert.equal(t.line,'1');assert.equal(t.segments[0].geometry,'straight');assert.equal(t.segments[0].realtime,true);});
test('does not treat false or missing realtime as live',()=>{const t=trip([segment({realTime:false})]);assert.equal(positionAt(t,T+30_000,T).quality,'schedule');});
test('a two-minute delay changes the position and operating window, not just its label',()=>{
  const predicted=trip([segment()]);
  const scheduled=trip([segment({realTime:false,departure:new Date(T-120_000).toISOString(),arrival:new Date(T-60_000).toISOString()})]);
  assert.equal(positionAt(predicted,T-90_000,T-90_000),null);
  assert.equal(positionAt(scheduled,T+30_000,T),null);
  const current=positionAt(predicted,T+30_000,T);
  assert.equal(current.quality,'realtime');assert.equal(current.fraction,.5);
  assert.equal(current.segment.arrival-current.segment.scheduledArrival,120_000);
});
test('mixed coverage excludes schedule-only vehicles until the user enables them',()=>{
  const input=prepareTrips(normaliseSegments([segment(),segment({realTime:false,trips:[{tripId:'planned-trip',routeShortName:'3'}]})]).trips);
  const candidates=vehiclesAt(input,T+30_000,T),view=vehicleView(candidates);
  assert.equal(view.total,2);assert.equal(view.realtime,1);assert.equal(view.schedule,1);
  assert.deepEqual(view.visible.map(v=>v.id),['test-trip']);
  assert.equal(vehicleView(candidates,{includeSchedule:true}).visible.length,2);
});
test('future realtime on a trip cannot make its current schedule segment count as realtime',()=>{
  const a=segment({realTime:false}),b=segment({from:a.to,to:place('C',50.945,6.968),departure:new Date(T+90_000).toISOString(),arrival:new Date(T+150_000).toISOString()});
  const view=vehicleView(vehiclesAt([trip([a,b])],T+30_000,T));
  assert.equal(view.total,1);assert.equal(view.realtime,0);assert.equal(view.visible.length,0);
});
test('recorded Cologne response contains shaped realtime trips with actual forecast deviations',async()=>{
  const capture=JSON.parse(await readFile(new URL('./fixtures/transitous-cologne-2026-09-05.json',import.meta.url),'utf8'));
  assert.equal(capture.kind,'historical-live-capture-test-only');
  const candidates=vehiclesAt(prepareTrips(normaliseSegments(capture.data).trips),capture.receivedAt,capture.receivedAt);
  assert.equal(candidates.length,3);
  assert.ok(candidates.every(v=>v.quality==='realtime'&&v.segment.geometry==='shape'&&v.segment.points.length>2));
  const delayed=candidates.find(v=>v.id==='20260905_10:04_de-DELFI_3380412714');
  assert.equal(delayed.segment.arrival-delayed.segment.scheduledArrival,12*60_000);
  assert.equal(delayed.segment.to.name,'Vochem Brühl-Vochem');
  // The historical capture must not keep producing vehicles at a later wall clock.
  assert.equal(vehiclesAt(prepareTrips(normaliseSegments(capture.data).trips),capture.receivedAt+180_000,capture.receivedAt).length,0);
});
test('deduplicates segments for the same trip',()=>{assert.equal(trip([segment(),segment()]).segments.length,1);});
test('keeps two real trips on the same line distinct',()=>{assert.equal(normaliseSegments([segment(),segment({trips:[{tripId:'another',routeShortName:'1'}]})]).trips.length,2);});
test('selects only the current segment and does not invent future or finished vehicles',()=>{const t=trip([segment()]);assert.equal(positionAt(t,T-1,T),null);assert.equal(positionAt(t,T+60_001,T),null);assert.ok(positionAt(t,T+30_000,T).lat>50.94);});
test('stale snapshots stop animation instead of looking live',()=>{assert.equal(positionAt(trip([segment({arrival:new Date(T+600_000).toISOString()})]),T+120_001,T),null);assert.equal(vehiclesAt([],T,T).length,0);});
test('dwells only between connected adjacent stops',()=>{const a=segment(),b=segment({from:a.to,to:place('C',50.945,6.968),departure:new Date(T+90_000).toISOString(),arrival:new Date(T+150_000).toISOString()});assert.equal(positionAt(trip([a,b]),T+70_000,T).state,'stopped');assert.equal(positionAt(trip([a,{...b,from:place('D',50.941,6.96)}]),T+70_000,T),null);});
test('midnight is handled by absolute timestamps and separate trip IDs',()=>{const m=Date.parse('2026-09-05T21:59:30Z'),t=trip([segment({departure:new Date(m).toISOString(),arrival:new Date(m+60_000).toISOString()})]);assert.ok(positionAt(t,m+45_000,m));});
test('rejects reversed times and malformed JSON schemas',()=>{assert.equal(normaliseSegments([segment({arrival:new Date(T-1).toISOString()})]).trips.length,0);assert.throws(()=>normaliseSegments({trips:[]}));});
test('bounded upstream URL has fixed bounds and two minutes of future coverage',()=>{const u=upstreamUrl(T);assert.equal(u.origin,'https://api.transitous.org');assert.equal(u.pathname,'/api/v6/map/trips');assert.equal(u.searchParams.get('precision'),'5');assert.equal(Date.parse(u.searchParams.get('endTime')),T+120_000);});
test('concurrent callers coalesce and cached snapshots keep their original timestamp',async()=>{let requests=0,now=T;const svc=createTransitService({clock:()=>now,fetcher:async()=>{requests++;await Promise.resolve();return Response.json([segment()]);}});const [a,b]=await Promise.all([svc(),svc()]);assert.equal(requests,1);assert.deepEqual(a,b);now+=10_000;const c=await svc();assert.equal(requests,1);assert.equal(c.fetchedAt,T);assert.equal(c.serverTime,T+10_000);now+=21_000;await svc();assert.equal(requests,2);});
test('upstream outage returns visible error with no stale trips and backs off',async()=>{let requests=0,now=T;const svc=createTransitService({clock:()=>now,fetcher:async()=>{requests++;if(requests>1)throw new Error('offline');return Response.json([segment()]);}});assert.equal((await svc()).trips.length,1);now+=31_000;const failed=await svc();assert.equal(failed.stale,true);assert.equal(failed.trips.length,0);assert.equal(failed.fetchedAt,T);await svc();assert.equal(requests,2);});
test('malformed upstream does not become a healthy empty network',async()=>{const svc=createTransitService({clock:()=>T,fetcher:async()=>Response.json({error:'bad'})});assert.equal((await svc()).stale,true);});
test('size guard and HTTP errors reject',async()=>{await assert.rejects(readBoundedJSON(new Response('x'.repeat(20)),10));await assert.rejects(readBoundedJSON(new Response('{}',{status:502})));});
test('API rejects writes and unsupported cities without contacting upstream',async()=>{assert.equal((await handleApi(new Request('https://local/api/vehicles',{method:'POST'}))).status,405);assert.equal((await handleApi(new Request('https://local/api/vehicles?city=berlin'))).status,404);assert.equal((await handleApi(new Request('https://local/api/nothing'))).status,404);});
test('worker exports fetch and serves assets with security headers',async()=>{const r=await worker.fetch(new Request('https://local/'),{ASSETS:{fetch:async()=>new Response('hello')}},{waitUntil(){}});assert.equal(await r.text(),'hello');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.ok(r.headers.get('Content-Security-Policy').includes("connect-src 'self'"));});

test('an edge-cache hit keeps snapshot age but stamps a fresh response time',async()=>{
  const {createWorker}=await import('../worker.mjs');
  let now=T,stored=null,requests=0;
  const cache={match:async()=>stored?.clone(),put:async(_key,response)=>{stored=response;}};
  const app=createWorker({clock:()=>now,getEdgeCache:()=>cache,api:async()=>{requests++;return Response.json({fetchedAt:T,serverTime:T,stale:false,trips:[]});}});
  const ctx={waitUntil(p){this.pending=p;}};
  const first=await app.fetch(new Request('https://local/api/vehicles'),{},ctx);await ctx.pending;
  assert.equal(first.headers.get('Cache-Control'),'no-store');
  now=T+25_000;
  const second=await app.fetch(new Request('https://local/api/vehicles'),{},ctx);
  const body=await second.json();
  assert.equal(requests,1);assert.equal(body.fetchedAt,T);assert.equal(body.serverTime,T+25_000);
  assert.equal(second.headers.get('Cache-Control'),'no-store');
});
test('edge caching cannot add thirty seconds to an already aged snapshot',async()=>{
  const {createWorker}=await import('../worker.mjs');let stored;
  const app=createWorker({clock:()=>T+20_000,getEdgeCache:()=>({match:async()=>undefined,put:async(_key,r)=>{stored=r;}}),api:async()=>Response.json({fetchedAt:T,serverTime:T+20_000,trips:[]})});
  const ctx={waitUntil(p){this.pending=p;}};
  await app.fetch(new Request('https://local/api/vehicles'),{},ctx);await ctx.pending;
  assert.equal(stored.headers.get('Cache-Control'),'public, max-age=10');
});
test('an unavailable edge cache still serves a successful API response',async()=>{
  const {createWorker}=await import('../worker.mjs');
  const app=createWorker({clock:()=>T,getEdgeCache:()=>({match:async()=>{throw new Error('cache unavailable');},put:async()=>{throw new Error('cache unavailable');}}),api:async()=>Response.json({fetchedAt:T,serverTime:T,trips:[]})});
  const ctx={waitUntil(p){this.pending=p;}};
  const response=await app.fetch(new Request('https://local/api/vehicles'),{},ctx);await ctx.pending;
  assert.equal(response.status,200);assert.deepEqual((await response.json()).trips,[]);
});
