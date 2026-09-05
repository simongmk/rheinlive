import {decodePolyline,validPoint} from './transit.mjs';
import {platformFields} from './platforms.mjs';
const clean=(v,n=200)=>typeof v==='string'?v.slice(0,n):'';
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
function stop(p){
  if(!p||!validPoint([p.lat,p.lon])||!p.name)return null;
  return {id:clean(p.stopId,1000),name:clean(p.name),lat:p.lat,lon:p.lon,arrival:time(p.arrival),departure:time(p.departure),scheduledArrival:time(p.scheduledArrival),scheduledDeparture:time(p.scheduledDeparture),...platformFields(p),cancelled:p.cancelled===true,pickupType:clean(p.pickupType,30),dropoffType:clean(p.dropoffType,30)};
}
export function normaliseTripDetail(raw){
  if(!Array.isArray(raw?.legs)||!raw.legs.length)throw new Error('Missing trip legs');
  const legs=raw.legs.filter(l=>l.tripId||l.agencyName);if(!legs.length)throw new Error('No transit legs');
  const first=legs[0],last=legs.at(-1),stops=[],paths=[],alerts=[];
  for(const leg of legs.slice(0,10)){
    for(const p of [leg.from,...(leg.intermediateStops||[]).slice(0,250),leg.to]){const s=stop(p);if(!s)continue;const previous=stops.at(-1);if(previous?.id===s.id&&previous?.arrival===s.arrival)continue;stops.push(s);}
    try{const g=leg.legGeometry,points=decodePolyline(g.points,g.precision??5);if(points.length>=2)paths.push(points);}catch{/* A missing full route never becomes a straight-line full itinerary. */}
    for(const a of (leg.alerts||[]).slice(0,10)){const title=clean(a.headerText,300),body=clean(a.descriptionText,1500);if(title||body)alerts.push({title,body});}
  }
  return {agency:clean(first.agencyName),agencyId:clean(first.agencyId),routeId:clean(first.routeId,500),headsign:clean(first.headsign||last.to?.name),realtime:legs.some(l=>l.realTime===true),cancelled:legs.every(l=>l.cancelled===true),stops,paths,alerts};
}
