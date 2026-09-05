import {city, MAX_SNAPSHOT_AGE_MS} from './cities.mjs';

export const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
export function distance(a,b) {
  const rad=Math.PI/180, lat=(a[0]+b[0])*rad/2;
  return Math.hypot((b[0]-a[0])*rad,(b[1]-a[1])*rad*Math.cos(lat))*6371000;
}
/** Google's encoded polyline, precision explicitly pinned to match the request. */
export function decodePolyline(encoded, precision=5) {
  if(typeof encoded !== 'string' || encoded.length > 250_000) throw new Error('Invalid polyline');
  let index=0,lat=0,lon=0;const result=[];
  const read=()=>{let value=0,shift=0,byte;do{if(index>=encoded.length || shift>30)throw new Error('Truncated polyline');byte=encoded.charCodeAt(index++)-63;if(byte<0||byte>63)throw new Error('Invalid polyline byte');value|=(byte&31)<<shift;shift+=5;}while(byte>=32);return value&1?~(value>>>1):value>>>1;};
  while(index<encoded.length){lat+=read();lon+=read();const point=[lat/10**precision,lon/10**precision];if(!validPoint(point))throw new Error('Invalid coordinates');result.push(point);}
  return result;
}
export function preparePath(points) {
  const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+distance(points[i-1],points[i]));
  return {points,cumulative,length:cumulative.at(-1)??0};
}
/** Distance-weighted, not point-count-weighted: tight curves must not slow a train. */
export function interpolate(path, fraction) {
  if(!path.points.length) return null;
  const target=Math.max(0,Math.min(1,fraction))*path.length;
  let i=1;while(i<path.cumulative.length-1&&path.cumulative[i]<target)i++;
  const a=path.points[Math.max(0,i-1)],b=path.points[Math.min(i,path.points.length-1)];
  const length=(path.cumulative[i]??0)-(path.cumulative[i-1]??0),t=length>0?(target-path.cumulative[i-1])/length:0;
  const bearing=Math.atan2((b[1]-a[1])*Math.cos(a[0]*Math.PI/180),b[0]-a[0])*180/Math.PI;
  return {lat:a[0]+(b[0]-a[0])*t,lon:a[1]+(b[1]-a[1])*t,bearing};
}
function parseTime(value){const n=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(n)?n:null;}
function stop(raw) {
  if(!raw||typeof raw.name!=='string'||!validPoint([raw.lat,raw.lon]))return null;
  return {id:String(raw.stopId??raw.name),name:raw.name.slice(0,200),lat:raw.lat,lon:raw.lon};
}
export function normaliseSegments(raw, configuredCity=city) {
  if(!Array.isArray(raw))throw new Error('Expected a list of trip segments');
  const lines=new Map(configuredCity.lines.map(l=>[l.id,l]));const trips=new Map();let rejected=0;
  for(const entry of raw) {
    if(!entry || !configuredCity.modes.includes(entry.mode))continue;
    const from=stop(entry.from),to=stop(entry.to),departure=parseTime(entry.departure),arrival=parseTime(entry.arrival);
    if(!from||!to||departure===null||arrival===null||arrival<departure||arrival-departure>3_600_000){rejected++;continue;}
    if(entry.cancelled===true)continue;
    const [[south,west],[north,east]]=configuredCity.bounds;
    if(![from,to].some(p=>p.lat>=south&&p.lat<=north&&p.lon>=west&&p.lon<=east))continue;
    let points,geometry='shape';
    try {points=decodePolyline(entry.polyline,5);} catch {points=[];}
    if(points.length<2 || distance(points[0],[from.lat,from.lon])>1000 || distance(points.at(-1),[to.lat,to.lon])>1000){points=[[from.lat,from.lon],[to.lat,to.lon]];geometry='straight';}
    for(const info of Array.isArray(entry.trips)?entry.trips:[]) {
      const line=String(info.routeShortName||info.displayName||'').replace(/^(?:Tram|STR|U|Stadtbahn)\s*/i,'').trim();
      if(!lines.has(line)||typeof info.tripId!=='string'||info.tripId.length>1000)continue;
      let trip=trips.get(info.tripId);
      if(!trip){trip={id:info.tripId,line,color:lines.get(line).color,segments:[]};trips.set(info.tripId,trip);}
      const key=`${from.id}:${to.id}:${departure}`;
      if(trip.segments.some(s=>s.key===key))continue;
      trip.segments.push({key,from,to,departure,arrival,scheduledDeparture:parseTime(entry.scheduledDeparture),scheduledArrival:parseTime(entry.scheduledArrival),realtime:entry.realTime===true,geometry,points});
    }
  }
  for(const trip of trips.values())trip.segments.sort((a,b)=>a.departure-b.departure);
  return {trips:[...trips.values()],rejected};
}
export function prepareTrips(trips) {return trips.map(t=>({...t,segments:t.segments.map(s=>({...s,path:preparePath(s.points)}))}));}
/** No extrapolation beyond the returned window; snapshot age bounds stale animation. */
export function positionAt(trip, now, fetchedAt) {
  if(!Number.isFinite(now)||!Number.isFinite(fetchedAt)||now-fetchedAt>MAX_SNAPSHOT_AGE_MS||fetchedAt-now>30_000)return null;
  for(let i=0;i<trip.segments.length;i++) {
    const s=trip.segments[i];
    if(now>=s.departure&&now<=s.arrival) {
      const fraction=s.arrival>s.departure?(now-s.departure)/(s.arrival-s.departure):1;
      const pos=interpolate(s.path??preparePath(s.points),fraction);if(!pos)return null;
      return {...pos,segment:s,state:'moving',quality:s.realtime?'realtime':'schedule',fraction};
    }
    const next=trip.segments[i+1];
    if(next&&s.to.id===next.from.id&&now>s.arrival&&now<next.departure&&next.departure-s.arrival<=600_000) {
      return {lat:s.to.lat,lon:s.to.lon,bearing:0,segment:next,state:'stopped',quality:next.realtime?'realtime':'schedule',fraction:0};
    }
  }
  return null;
}
export function vehiclesAt(trips,now,fetchedAt) {return trips.flatMap(trip=>{const p=positionAt(trip,now,fetchedAt);return p?[{...trip,...p}]:[];});}
/** Coverage describes current candidates, before the optional schedule fallback. */
export function vehicleView(vehicles,{includeSchedule=false}={}) {
  const predicted=vehicles.filter(v=>v.quality==='realtime');
  return {visible:includeSchedule?vehicles:predicted,total:vehicles.length,realtime:predicted.length,schedule:vehicles.length-predicted.length};
}
