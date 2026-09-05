import {cities,pointInBounds,modeFor,lineName,lineKey,lineColor,contrastText,MAX_SNAPSHOT_AGE_MS} from './cities.mjs';
import {distance,validPoint} from './transit.mjs';
const time=value=>{const t=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(t)?t:null;};
export function cityAt(point){return validPoint(point)?Object.values(cities).filter(c=>pointInBounds(point,c.bounds)).sort((a,b)=>distance(point,a.center)-distance(point,b.center))[0]??null:null;}
export function nearestStations(network,point,limit=6){
  if(!validPoint(point))return [];
  return (network?.stops?.features??[]).filter(f=>f.properties.queryId).map(f=>({feature:f,meters:distance(point,[f.geometry.coordinates[1],f.geometry.coordinates[0]])})).filter(s=>s.meters<=3000).sort((a,b)=>a.meters-b.meters).slice(0,limit);
}
export function normaliseDepartures(raw,city,anchor){
  if(!Array.isArray(raw?.stopTimes)||!validPoint([raw.place?.lat,raw.place?.lon])||!pointInBounds([raw.place.lat,raw.place.lon],city.bounds)||distance(anchor,[raw.place.lat,raw.place.lon])>1000)throw Error('Invalid station board');
  const events=new Map();
  for(const e of raw.stopTimes.slice(0,200)){
    const p=e.place,mode=modeFor(e.mode)?.id,departure=time(p?.departure);
    if(!mode||departure===null||!validPoint([p?.lat,p?.lon])||distance(anchor,[p.lat,p.lon])>1000||!pointInBounds([p.lat,p.lon],city.bounds)||typeof e.tripId!=='string'||e.tripId.length>1000)continue;
    const line=lineName(e.routeShortName||e.displayName,mode),scheduledDeparture=time(p.scheduledDeparture),color=lineColor(mode,line,e.routeColor),headsign=String(e.headsign||e.tripTo?.name||'Richtung nicht gemeldet').slice(0,200);
    const id=e.tripId+'|'+p.stopId+'|'+(scheduledDeparture??departure),cancelled=e.cancelled===true||e.tripCancelled===true||p.cancelled===true;
    const event={id,tripId:e.tripId,line,lineKey:lineKey(mode,line),mode,color,textColor:contrastText(color),headsign,directionKey:[mode,e.routeId,e.directionId,headsign].join('|'),departure,scheduledDeparture,realtime:e.realTime===true,cancelled,boarding:e.pickupDropoffType==='NORMAL'&&p.pickupType!=='NOT_ALLOWED',stop:{id:p.stopId,name:p.name,lat:p.lat,lon:p.lon,track:p.track??null,scheduledTrack:p.scheduledTrack??null,description:String(p.description||'').slice(0,160)},agency:String(e.agencyName||'').slice(0,160)};
    // A cancellation wins over duplicate data for the same departure.
    if(!events.has(id)||cancelled)events.set(id,event);
  }
  return [...events.values()].sort((a,b)=>a.departure-b.departure).slice(0,80);
}
export function departureReadiness(event,{now,fetchedAt,walkMinutes,bufferMinutes=2}){
  if(!Number.isFinite(now)||!Number.isFinite(fetchedAt)||now-fetchedAt>MAX_SNAPSHOT_AGE_MS||fetchedAt-now>30000)return {state:'stale'};
  if(event.cancelled)return {state:'cancelled'};
  if(!event.boarding)return {state:'no-boarding'};
  if(event.departure<=now)return {state:'departed'};
  if(!event.realtime)return {state:'schedule'};
  if(!Number.isFinite(walkMinutes)||walkMinutes<0||walkMinutes>60||!Number.isFinite(bufferMinutes)||bufferMinutes<0||bufferMinutes>15)return {state:'no-walk'};
  const leaveAt=event.departure-(walkMinutes+bufferMinutes)*60000,seconds=Math.ceil((leaveAt-now)/1000);
  return {state:leaveAt<now?'tight':seconds<=60?'leave':'ready',leaveAt,seconds};
}
export function navigationLinks(stop){
  if(!validPoint([stop.lat,stop.lon]))return [];
  const destination=stop.lat+','+stop.lon;
  return [{label:'Apple Karten',url:'https://maps.apple.com/?'+new URLSearchParams({daddr:destination,dirflg:'w'})},{label:'Google Maps',url:'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',destination,travelmode:'walking'})},{label:'DB Reiseplanung',url:'https://www.bahn.de/buchung/fahrplan/suche'}];
}
