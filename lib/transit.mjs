import {city, MAX_SNAPSHOT_AGE_MS, modeFor, lineName, lineKey, lineColor, contrastText,pointInBounds,segmentIntersectsBounds} from './cities.mjs';

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
  let i=1,hi=path.cumulative.length-1;while(i<hi){const mid=(i+hi)>>>1;if(path.cumulative[mid]<target)i=mid+1;else hi=mid;}
  const a=path.points[Math.max(0,i-1)],b=path.points[Math.min(i,path.points.length-1)];
  const length=(path.cumulative[i]??0)-(path.cumulative[i-1]??0),t=length>0?(target-path.cumulative[i-1])/length:0;
  const bearing=Math.atan2((b[1]-a[1])*Math.cos(a[0]*Math.PI/180),b[0]-a[0])*180/Math.PI;
  return {lat:a[0]+(b[0]-a[0])*t,lon:a[1]+(b[1]-a[1])*t,bearing};
}
function parseTime(value){const n=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(n)?n:null;}
function stop(raw) {
  if(!raw||typeof raw.name!=='string'||!validPoint([raw.lat,raw.lon]))return null;
  return {id:String(raw.stopId??raw.name),name:raw.name.slice(0,200),lat:raw.lat,lon:raw.lon,track:typeof raw.track==='string'?raw.track.slice(0,30):null,scheduledTrack:typeof raw.scheduledTrack==='string'?raw.scheduledTrack.slice(0,30):null};
}
export function normaliseSegments(raw, configuredCity=city) {
  if(!Array.isArray(raw))throw new Error('Expected a list of trip segments');
  const trips=new Map();let rejected=0;
  for(const entry of raw) {
    if(!entry || !configuredCity.modes.includes(entry.mode)||!modeFor(entry.mode))continue;
    const mode=modeFor(entry.mode).id;
    const from=stop(entry.from),to=stop(entry.to),departure=parseTime(entry.departure),arrival=parseTime(entry.arrival);
    if(!from||!to||departure===null||arrival===null||arrival<departure||arrival-departure>(mode==='long_distance'?6:1)*3_600_000){rejected++;continue;}
    if(entry.cancelled===true)continue;
    let points,geometry='shape';
    try {points=decodePolyline(entry.polyline,5);} catch {points=[];}
    if(points.length<2 || distance(points[0],[from.lat,from.lon])>1000 || distance(points.at(-1),[to.lat,to.lon])>1000){points=[[from.lat,from.lon],[to.lat,to.lon]];geometry='straight';}
    const insideStop=[from,to].some(p=>pointInBounds([p.lat,p.lon],configuredCity.bounds));
    if(!insideStop&&!(geometry==='shape'&&points.some((p,i)=>i>0&&segmentIntersectsBounds(points[i-1],p,configuredCity.bounds))))continue;
    for(const info of Array.isArray(entry.trips)?entry.trips:[]) {
      const line=lineName(info.routeShortName||info.displayName,mode);
      if(!line||line==='?'||typeof info.tripId!=='string'||!info.tripId||info.tripId.length>1000)continue;
      let trip=trips.get(info.tripId);
      if(!trip){const color=lineColor(mode,line,entry.routeColor);trip={id:info.tripId,line,lineKey:lineKey(mode,line),mode,color,textColor:contrastText(color),source:info.tripId.match(/^\d{8}_\d{2}:\d{2}_([^_]+)_/)?.[1]??'Transitous',segments:[]};trips.set(info.tripId,trip);}
      const key=`${from.id}:${to.id}:${departure}`;
      if(trip.segments.some(s=>s.key===key))continue;
      trip.segments.push({key,from,to,departure,arrival,scheduledDeparture:parseTime(entry.scheduledDeparture),scheduledArrival:parseTime(entry.scheduledArrival),realtime:entry.realTime===true,geometry,points});
    }
  }
  for(const trip of trips.values())trip.segments.sort((a,b)=>a.departure-b.departure);
  return {trips:[...trips.values()],rejected};
}
// Display assumptions, not measured or operator-supplied dwell durations.
const dwellSeconds={tram:20,bus:15,suburban:25,regional:30,long_distance:45};
const modelSpeedLimit={tram:27,bus:25,suburban:45,regional:55,long_distance:90};
function prepareSegment(s){
  const points=[...s.points];
  // Remove metre-scale polyline quantisation jumps at a stop, without pulling
  // a distant routed shape onto a potentially wrong platform coordinate.
  for(const [i,stop]of [[0,s.from],[points.length-1,s.to]]){
    const p=[stop.lat,stop.lon];if(points[i]&&validPoint(p)&&distance(points[i],p)<=15)points[i]=p;
  }
  return {...s,path:preparePath(points)};
}
function dwellBetween(s,next,mode){
  if(!next||s.to.id!==next.from.id)return null;
  const gap=next.departure-s.arrival;
  if(gap>0&&gap<=3_600_000)return {arrival:s.arrival,departure:next.departure,durationMs:gap,kind:'reported'};
  // Equal minute timestamps give no resolved stay. Reserve a short estimated
  // interval BEFORE the forecast departure; never postpone it or subsequent stops.
  if(gap!==0||s.arrival%60000!==0||s.realtime!==next.realtime||!dwellSeconds[mode])return null;
  const travel=s.arrival-s.departure,path=s.path??preparePath(s.points);
  const room=travel-path.length/(modelSpeedLimit[mode]*.85)*1000;
  const durationMs=Math.floor(Math.min(dwellSeconds[mode]*1000,travel*.25,room)/1000)*1000;
  if(durationMs<3000||travel-durationMs<15000)return null;
  return {arrival:next.departure-durationMs,departure:next.departure,durationMs,kind:'estimated',sourceArrival:s.arrival};
}
export function prepareTrips(trips) {return trips.map(t=>{const segments=t.segments.map(prepareSegment);return {...t,segments,dwells:segments.map((s,i)=>dwellBetween(s,segments[i+1],t.mode))};});}
/** Integrate a trapezoidal speed profile: standstill at the ends, a steady
 * middle section, and exactly the supplied travel distance and time. */
export function movementProgress(elapsed,duration){
  if(duration<=0)return {fraction:1,speedPerMs:0,phase:'braking'};
  const t=Math.max(0,Math.min(duration,elapsed)),ramp=Math.min(12000,duration*.15),area=duration-ramp;
  if(t<ramp)return {fraction:t*t/(2*ramp*area),speedPerMs:t/(ramp*area),phase:'accelerating'};
  if(t>duration-ramp){const remaining=duration-t;return {fraction:1-remaining*remaining/(2*ramp*area),speedPerMs:remaining/(ramp*area),phase:'braking'};}
  return {fraction:(t-ramp/2)/area,speedPerMs:1/area,phase:'cruising'};
}
/** A narrow map window can drop the incoming leg while a vehicle is still waiting.
 * Keep at most one recently observed arrival, only for a trip still in the new feed.
 * Do not refresh its observation age, reuse moving legs, or resurrect missing trips. */
export function retainRecentArrivals(trips,previous,now,invalidatedIds=new Set()) {
  const oldTrips=new Map((previous?.trips??[]).map(t=>[t.id,t]));
  return trips.map(trip=>{
    const segments=trip.segments.map(s=>({...s,observedAt:now})),first=segments[0],old=oldTrips.get(trip.id);
    if(first&&old&&!invalidatedIds.has(trip.id)&&first.departure>now){
      const incoming=old.segments.filter(s=>s.to.id===first.from.id&&s.arrival<=now&&now-s.arrival<=MAX_SNAPSHOT_AGE_MS&&now-(s.observedAt??previous.fetchedAt)<=MAX_SNAPSHOT_AGE_MS&&(s.observedAt??previous.fetchedAt)<=now&& !segments.some(f=>f.from.id===s.from.id&&f.to.id===s.to.id)).sort((a,b)=>b.arrival-a.arrival)[0];
      if(incoming)segments.unshift({...incoming,observedAt:incoming.observedAt??previous.fetchedAt});
    }
    return {...trip,segments};
  });
}
const freshSegment=(s,now,fetchedAt)=>Number.isFinite(s.observedAt??fetchedAt)&&now-(s.observedAt??fetchedAt)<=MAX_SNAPSHOT_AGE_MS&&(s.observedAt??fetchedAt)-now<=30_000;
/** No extrapolation beyond the returned window; snapshot age bounds stale animation. */
export function positionAt(trip, now, fetchedAt) {
  if(!Number.isFinite(now)||!Number.isFinite(fetchedAt)||now-fetchedAt>MAX_SNAPSHOT_AGE_MS||fetchedAt-now>30_000)return null;
  for(let i=0;i<trip.segments.length;i++) {
    const s=trip.segments[i];
    if(!freshSegment(s,now,fetchedAt))continue;
    const next=trip.segments[i+1];
    const dwell=next&&freshSegment(next,now,fetchedAt)?(trip.dwells?trip.dwells[i]:dwellBetween(s,next,trip.mode)):null;
    if(dwell&&now>=dwell.arrival&&now<dwell.departure) {
      const quality=s.realtime&&next.realtime?'realtime':'schedule';
      return {lat:next.from.lat,lon:next.from.lon,bearing:0,segment:next,state:'stopped',quality,fraction:0,speedMps:0,dwell:{...dwell,quality}};
    }
    const arrival=dwell?.arrival??s.arrival;
    if(now>=s.departure&&now<=arrival&&!(next&&next.from.id===s.to.id&&now===next.departure)) {
      const progress=movementProgress(now-s.departure,arrival-s.departure),path=s.path??preparePath(s.points);
      const pos=interpolate(path,progress.fraction);if(!pos)return null;
      return {...pos,segment:s,state:'moving',quality:s.realtime?'realtime':'schedule',fraction:progress.fraction,speedMps:progress.speedPerMs*path.length*1000,movementPhase:progress.phase};
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
