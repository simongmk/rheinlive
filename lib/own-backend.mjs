import {createApi,readBoundedJSON} from './api.mjs';
import {decodePolyline} from './transit.mjs';

export const OWN_SOURCE='GTFS.de · eigener MOTIS';

export function ownPlatformFields(place){
  const clean=v=>typeof v==='string'&&!/^(?:-|—|\?|n\/a)$/i.test(v.trim())?v.trim().slice(0,30):'';
  const track=clean(place.track),scheduledTrack=clean(place.scheduledTrack);
  return {track:track||null,scheduledTrack:scheduledTrack||null,trackChanged:!!(track&&scheduledTrack&&track!==scheduledTrack),trackSource:'gtfs.de',stationId:null};
}

// GTFS.de's rail routes use the generic GTFS rail class. Only refine that class:
// a replacement bus named ICE must remain a bus. Unknown names remain regional.
export function railMode(mode,name=''){
  if(mode!=='REGIONAL_RAIL')return mode;
  const n=String(name).trim().toUpperCase();
  if(/^S\s*\d/.test(n))return 'SUBURBAN';
  if(/^(ICE|TGV|THA|EST)\b/.test(n))return 'HIGHSPEED_RAIL';
  if(/^(IC|EC|ECE|RJX?|FLX)\b/.test(n))return 'LONG_DISTANCE';
  if(/^(NJ|EN)\b/.test(n))return 'NIGHT_RAIL';
  return mode;
}

export function adaptOwnResponse(path,raw){
  if(path==='/api/v6/map/trips'&&Array.isArray(raw))return raw.flatMap(entry=>{
    const groups=new Map();
    for(const trip of entry.trips||[]){const mode=railMode(entry.mode,trip.routeShortName||trip.displayName);if(!groups.has(mode))groups.set(mode,[]);groups.get(mode).push(trip);}
    // A two-point polyline is also how MOTIS represents a missing routed path.
    // Conservatively disclose it as straight even if a real track happens to be straight.
    let polyline=entry.polyline;
    try{if(decodePolyline(polyline,entry.precision??5).length<=2)polyline='';}catch{polyline='';}
    return [...groups].map(([mode,trips])=>({...entry,polyline,mode,trips}));
  });
  if(path==='/api/v6/stoptimes'&&Array.isArray(raw?.stopTimes))return {...raw,stopTimes:raw.stopTimes.map(s=>({...s,mode:railMode(s.mode,s.routeShortName||s.displayName)}))};
  if(path==='/api/experimental/map/routes'&&Array.isArray(raw?.routes))return {...raw,routes:raw.routes.flatMap(r=>(r.transitRoutes||[]).map(t=>({...r,mode:railMode(r.mode,t.shortName||t.longName),transitRoutes:[t]})))};
  return raw;
}

async function boundedText(response,max=256_000){
  if(!response.ok||!response.body||Number(response.headers.get('content-length'))>max)throw Error('Metrics unavailable');
  const reader=response.body.getReader();let total=0,text='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max)throw Error('Metrics too large');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
}

export function parseAppliedFeed(metrics){
  function value(name){const matches=metrics.split('\n').filter(line=>line.startsWith(name+'{tag="de"} '));if(matches.length!==1)throw Error('Missing source metric');const n=Number(matches[0].split('} ')[1]);if(!Number.isFinite(n)||n<=0)throw Error('Invalid source timestamp');return n*1000;}
  return {appliedPublicationAt:value('nigiri_gtfsrt_feed_timestamp_seconds'),appliedAt:value('nigiri_gtfsrt_last_update_timestamp_seconds')};
}

export function createFreshnessGuard({baseUrl='http://127.0.0.1:8787',relayUrl='http://127.0.0.1:8788',fetcher=fetch,clock=Date.now}={}){
  let cached=null,pending=null,lastAttempt=-Infinity,lastError=null;
  const valid=s=>{const now=clock();return s?.ready===true&&[s.receivedAt,s.publicationAt,s.appliedPublicationAt].every(t=>Number.isFinite(t)&&now-t>=-30_000&&now-t<=120_000)&&Number.isFinite(s.appliedAt)&&now-s.appliedAt>=-30_000&&now-s.appliedAt<=90_000;};
  return async()=>{
    if(clock()-lastAttempt>=5000&&!pending){
      lastAttempt=clock();
      pending=(async()=>{try{
        const signal=AbortSignal.timeout(5000);
        const [metrics,relay]=await Promise.all([
          fetcher(new URL('/metrics',baseUrl),{signal}).then(boundedText),
          fetcher(new URL('/status',relayUrl),{signal}).then(r=>readBoundedJSON(r,8192))
        ]);
        cached={...parseAppliedFeed(metrics),ready:relay.ready,publicationAt:Date.parse(relay.publicationAt),receivedAt:Date.parse(relay.receivedAt)};
        lastError=null;
      }catch(e){cached=null;lastError=e;}finally{pending=null;}})();
    }
    if(pending)await pending;
    if(lastError||!valid(cached))throw Error('Realtime source is not fresh');
    return {...cached};
  };
}

/** Fixed server-owned origins; never configured by request query parameters. */
export function createOwnApi({stations,baseUrl='http://127.0.0.1:8787',relayUrl='http://127.0.0.1:8788',fetcher=fetch,clock=Date.now}={}){
  if(!stations)throw Error('Own provider requires its own station registry');
  const assertFresh=createFreshnessGuard({baseUrl,relayUrl,fetcher,clock});
  const adaptedFetch=async(url,options)=>{
    const response=await fetcher(url,options);
    if(!response.ok)return response;
    const raw=await readBoundedJSON(response);
    return Response.json(adaptOwnResponse(new URL(url).pathname,raw));
  };
  const handle=createApi({stations,baseUrl,sourceName:OWN_SOURCE,fetcher:adaptedFetch,clock,assertFresh,platformResolver:ownPlatformFields});
  return async request=>{
    const result=await handle(request),path=new URL(request.url).pathname;
    if(!result?.ok||!['/api/vehicles','/api/trip','/api/departures'].includes(path))return result;
    try{
      // Recheck after the API work too. A long request must not renew the feed's
      // life. The browser enforces this deadline even without another poll.
      const state=await assertFresh(),data=await result.json();
      const validUntil=Math.min(state.publicationAt+120000,state.receivedAt+120000,state.appliedPublicationAt+120000,state.appliedAt+90000);
      if(Array.isArray(data.trips))data.trips=data.trips.map(trip=>({...trip,source:OWN_SOURCE,labelKind:'route'}));
      return Response.json({...data,validUntil,sourcePublicationAt:state.appliedPublicationAt,positionType:'estimated',attribution:{forecast:'GTFS.de · CC BY-SA 4.0',timetable:'GTFS.de / DELFI e.V. · CC BY 4.0',geometry:'© OpenStreetMap contributors · ODbL 1.0'}},{headers:result.headers});
    }catch{return Response.json({stale:true,trips:[],departures:[],error:'Aktuelle Datenquelle momentan nicht verfügbar.'},{status:503,headers:{'Cache-Control':'no-store'}});}
  };
}
