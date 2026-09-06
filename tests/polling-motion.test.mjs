import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareTrips,positionAt,distance} from '../lib/transit.mjs';

const capture=JSON.parse(await readFile(new URL('fixtures/polling-dwell-2026-09-06.json',import.meta.url)));
const [before,after]=capture.captures,now=after.serverTime;
const previous=prepareTrips(before.trips),byId=new Map(previous.map(t=>[t.id,t]));
const context={previous,now,previousFetchedAt:before.fetchedAt};
const separation=(a,b)=>distance([a.lat,a.lon],[b.lat,b.lon]);

test('actual S6, line 4 and line 16 snapshots reproduce the late modeled-dwell jump and retain identical positions after reconciliation',()=>{
  assert.equal(capture.kind,'historical-live-capture-test-only');assert.equal(previous.length,3);
  const uncorrected=prepareTrips(after.trips),corrected=prepareTrips(after.trips,context);
  for(const t of corrected){
    const old=positionAt(byId.get(t.id),now,before.fetchedAt),naive=positionAt(uncorrected.find(x=>x.id===t.id),now,after.fetchedAt),fixed=positionAt(t,now,after.fetchedAt);
    assert.ok(separation(old,naive)>150,t.line+' recreates the original failure');
    assert.equal(separation(old,fixed),0,t.line+' does not teleport on the polling frame');
    assert.equal(fixed.speedMps,old.speedMps,'speed remains continuous');
    assert.deepEqual(t.segments.map(s=>[s.departure,s.arrival,s.scheduledDeparture,s.scheduledArrival,s.observedAt]),after.trips.find(x=>x.id===t.id).segments.map(s=>[s.departure,s.arrival,s.scheduledDeparture,s.scheduledArrival,s.observedAt]),'source times and freshness are unchanged');
  }
});

test('later polls retain the committed moving profile until its forecast arrival',()=>{
  let prepared=prepareTrips(after.trips,context);
  for(const elapsed of [1000,3000,10000,20000]){
    const nextNow=now+elapsed;
    const next=prepareTrips(after.trips,{previous:prepared,now:nextNow,previousFetchedAt:after.fetchedAt});
    for(const t of next){const a=positionAt(prepared.find(x=>x.id===t.id),nextNow,after.fetchedAt),b=positionAt(t,nextNow,after.fetchedAt);if(a&&b)assert.equal(separation(a,b),0);}
    prepared=next;
  }
});

test('holds known before a leg starts and reported station stays still apply',()=>{
  const incoming=after.trips.find(t=>t.line==='S6').segments[0],start=incoming.departure;
  const planned=prepareTrips(before.trips),future=prepareTrips(after.trips,{previous:planned,now:start-1,previousFetchedAt:start-1});
  assert.equal(future.find(t=>t.line==='S6').dwells[0].kind,'estimated');
  const raw=structuredClone(after.trips),s6=raw.find(t=>t.line==='S6');s6.segments[1].departure+=60000;
  const reported=prepareTrips(raw,context).find(t=>t.line==='S6');
  assert.equal(reported.dwells[0].kind,'reported');
  assert.equal(positionAt(reported,incoming.arrival+1000,incoming.arrival).state,'stopped');
  const alreadyPlanned=prepareTrips(after.trips),again=prepareTrips(after.trips,{previous:alreadyPlanned,now,previousFetchedAt:after.fetchedAt});
  assert.equal(again.find(t=>t.line==='S6').dwells[0].kind,'estimated','a previously planned modeled stop is kept');
});

test('real forecast changes take precedence and stale or missing trips cannot supply a motion plan',()=>{
  for(const field of ['departure','arrival']){
    const raw=structuredClone(after.trips),s6=raw.find(t=>t.line==='S6');s6.segments[0][field]-=60000;
    if(field==='arrival')s6.segments[1].departure-=60000;
    const expected=prepareTrips(raw).find(t=>t.line==='S6'),actual=prepareTrips(raw,context).find(t=>t.line==='S6');
    assert.deepEqual(actual.dwells,expected.dwells);
  }
  const stale=previous.map(t=>({...t,segments:t.segments.map(s=>({...s,observedAt:now-121000}))}));
  assert.deepEqual(prepareTrips(after.trips,{...context,previous:stale}).map(t=>t.dwells),prepareTrips(after.trips).map(t=>t.dwells));
  assert.deepEqual(prepareTrips([],{...context}),[],'no missing or cancelled trip is resurrected');
});

test('the regression is tied to the same trip, stop pair and prediction quality',()=>{
  for(const change of [t=>t.id+='-different',t=>t.segments[0].from.id+='-different',t=>{t.segments[0].realtime=false;t.segments[1].realtime=false;}]){
    const raw=structuredClone(after.trips),s6=raw.find(t=>t.line==='S6');change(s6);
    assert.deepEqual(prepareTrips(raw,context).find(t=>t.line==='S6').dwells,prepareTrips(raw).find(t=>t.line==='S6').dwells);
  }
});
