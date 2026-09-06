// Live HTTP integration evidence, not a fixture or a source for the application.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {cities,pointInBounds} from '../lib/cities.mjs';
import {upstreamUrl,readBoundedJSON} from '../lib/api.mjs';
import {createFreshnessGuard,adaptOwnResponse} from '../lib/own-backend.mjs';
import {normaliseSegments,prepareTrips,vehiclesAt} from '../lib/transit.mjs';
const get=async url=>readBoundedJSON(await fetch(url,{signal:AbortSignal.timeout(60000)}),16_000_000);
const engine='http://127.0.0.1:8787',preview='http://127.0.0.1:4174';
const freshness=await createFreshnessGuard()(),beganAt=new Date().toISOString();
const report={kind:'dated-live-integration-evidence-not-live-data',beganAt,source:'GTFS.de · own MOTIS',freshness,regions:[],integration:[],positionType:'estimated'};
const selected=JSON.parse(await readFile('scripts/gtfs/areas.json','utf8')).areas;
for(const [id,name,lat,lon]of selected){
  // Approximate 20 km square, deliberately distinct from the audit's circles.
  const dLat=10/111.2,dLon=dLat/Math.cos(lat*Math.PI/180);
  const region={id,name,modes:cities.cologne.modes,bounds:[[lat-dLat,lon-dLon],[lat+dLat,lon+dLon]]};
  const now=Date.now(),start=performance.now();
  const raw=await get(upstreamUrl(now,region,engine));
  const {trips,rejected}=normaliseSegments(adaptOwnResponse('/api/v6/map/trips',raw),region);
  const active=vehiclesAt(prepareTrips(trips),now,now).filter(v=>pointInBounds([v.lat,v.lon],region.bounds));
  const modes={};for(const v of active){const c=modes[v.mode]??={forecast:0,schedule:0,shape:0,straight:0};c[v.quality==='realtime'?'forecast':'schedule']++;c[v.segment.geometry==='shape'?'shape':'straight']++;}
  report.regions.push({id,name,bounds:region.bounds,at:new Date(now).toISOString(),milliseconds:Math.round(performance.now()-start),rawSegments:raw.length,trips:trips.length,active:active.length,rejected,modes});
  console.log(name,active.length,'active estimates');
}
for(const id of Object.keys(cities)){
  const started=performance.now(),snapshot=await get(preview+'/api/vehicles?city='+id);
  assert.equal(snapshot.stale,false);assert.ok(snapshot.trips.length);assert.ok(snapshot.validUntil>Date.now());
  assert.equal(snapshot.positionType,'estimated');assert.match(snapshot.source,/GTFS.de/);
  const choice=snapshot.trips.find(t=>t.mode==='long_distance')||snapshot.trips[0];
  const detail=await get(preview+'/api/trip?'+new URLSearchParams({city:id,id:choice.id}));assert.ok(detail.stops.length>=2);assert.ok(detail.validUntil>Date.now());
  const network=await get(preview+'/data/network-'+id+'.json');assert.equal(network.provider,'own');
  const station=network.stops.features.find(f=>/Severinstr\.|Hbf|Hauptbahnhof/.test(f.properties.name))||network.stops.features[0];
  const stopId=station.properties.queryId;
  const board=await get(preview+'/api/departures?'+new URLSearchParams({city:id,stopId}));assert.equal(board.stale,false);assert.ok(board.departures.length);assert.ok(board.validUntil>Date.now());
  const [lon,lat]=station.geometry.coordinates,origin=[lat+.001,lon]; // Public test coordinate, never a user location.
  const walked=await fetch(preview+'/api/walk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({city:id,origin,stopIds:[stopId]}),signal:AbortSignal.timeout(30000)});
  assert.equal(walked.status,200);const walk=await walked.json();assert.equal(walk.origin,undefined);assert.equal(walked.headers.get('cache-control'),'no-store');
  assert.ok(Number.isFinite(walk.walks[0].seconds));
  report.integration.push({city:id,at:new Date().toISOString(),milliseconds:Math.round(performance.now()-started),trips:snapshot.trips.length,validUntil:snapshot.validUntil,selectedLine:choice.line,detailStops:detail.stops.length,detailPaths:detail.paths.length,reportedTracks:detail.stops.filter(s=>s.track).length,station:station.properties.name,stopId,departures:board.departures.length,walkSeconds:walk.walks[0].seconds,walkMeters:walk.walks[0].meters});
}
report.endedAt=new Date().toISOString();
report.limitations=['Single time window; not a field accuracy test or representative coverage estimate.','Feed publication is not an individual vehicle observation.','Route shapes are inferred from OSM; missing/two-point paths remain straight estimates.','Counts in overlapping regions must not be summed.'];
await mkdir('.cache/motis/evidence',{recursive:true});
const path='.cache/motis/evidence/integration-'+beganAt.replaceAll(':','-')+'.json';await writeFile(path,JSON.stringify(report,null,2));
console.log('Validated live integration:',path);
