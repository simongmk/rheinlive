// Analyze an already permitted, captured /api/vehicles response. No network I/O.
import {readFile} from 'node:fs/promises';
import {city} from '../lib/cities.mjs';
import {prepareTrips,vehiclesAt,vehicleView} from '../lib/transit.mjs';
const path=process.argv[2];
if(!path)throw new Error('Usage: node scripts/inspect-snapshot.mjs captured-api-vehicles.json');
const snapshot=JSON.parse(await readFile(path,'utf8'));
if(snapshot.stale||!Array.isArray(snapshot.trips)||!Number.isFinite(snapshot.serverTime)||!Number.isFinite(snapshot.fetchedAt))throw new Error('Capture is unavailable or has an invalid snapshot schema');
const vehicles=vehiclesAt(prepareTrips(snapshot.trips),snapshot.serverTime,snapshot.fetchedAt);
const count=list=>{
  const {total,realtime,schedule}=vehicleView(list);
  return {total,realtime,schedule,coveragePercent:total?Math.round(realtime/total*100):null,
    delayed:list.filter(v=>v.quality==='realtime'&&v.segment.scheduledArrival!==null&&v.segment.arrival>v.segment.scheduledArrival).length,
    withoutShape:list.filter(v=>v.segment.geometry!=='shape').length};
};
const summary=count(vehicles);
console.log(JSON.stringify({kind:'captured-snapshot-analysis-not-a-live-check',evaluatedAt:new Date(snapshot.serverTime).toISOString(),fetchedAt:new Date(snapshot.fetchedAt).toISOString(),source:snapshot.source??'unknown',positionType:'estimated',originalPredictionTimestamp:'not supplied',summary,lines:city.lines.map(l=>({line:l.id,...count(vehicles.filter(v=>v.line===l.id))}))},null,2));
// A healthy HTTP response with only scheduled trips is not realtime evidence.
if(summary.realtime===0)process.exitCode=2;
