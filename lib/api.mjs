import {city,cities} from './cities.mjs';
import {normaliseTripDetail} from './trip.mjs';
import {normaliseSegments} from './transit.mjs';
const BASE='https://api.transitous.org';
const CACHE_MS=30_000, RETRY_MS=30_000, FETCH_TIMEOUT_MS=15_000, MAX_RESPONSE_BYTES=12_000_000;
export function upstreamUrl(now,configuredCity=city) {
  const minute=Math.floor(now/60_000)*60_000;
  const u=new URL('/api/v6/map/trips',BASE);
  u.search=new URLSearchParams({min:configuredCity.bounds[0].join(','),max:configuredCity.bounds[1].join(','),zoom:'14',startTime:new Date(minute-60_000).toISOString(),endTime:new Date(minute+120_000).toISOString(),precision:'5',language:'de'}).toString();
  return u;
}
export async function readBoundedJSON(response,max=MAX_RESPONSE_BYTES) {
  if(!response.ok)throw new Error(`Upstream HTTP ${response.status}`);
  if(Number(response.headers.get('content-length'))>max)throw new Error('Upstream too large');
  if(!response.body)throw new Error('Upstream body missing');
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max)throw new Error('Upstream too large');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
/** City reads are serialized to cap peak parsing memory in the Worker. */
export function createTransitService({fetcher=fetch,clock=Date.now}={}) {
  const states=new Map();let queue=Promise.resolve();
  return async function snapshot(cityId='cologne'){
    const configuredCity=cities[cityId];if(!Object.hasOwn(cities,cityId))throw new Error('Unknown city');
    if(!states.has(cityId))states.set(cityId,{cache:null,inflight:null,lastFailure:-Infinity});
    const state=states.get(cityId),now=clock();
    if(state.cache&&now-state.cache.fetchedAt<CACHE_MS)return {...state.cache,serverTime:now};
    function failure(time){return {city:cityId,fetchedAt:state.cache?.fetchedAt??null,serverTime:time,stale:true,source:'Transitous / MOTIS',trips:[],error:'Verkehrsdaten momentan nicht erreichbar. Alte Positionen werden ausgeblendet.'};}
    if(now-state.lastFailure<RETRY_MS)return failure(now);
    if(state.inflight)return state.inflight;
    state.inflight=queue.then(async()=>{try{
      const response=await fetcher(upstreamUrl(clock(),configuredCity),{headers:{'Accept':'application/json','User-Agent':'Rheinlive/0.2 (https://github.com/simongmk/rheinlive/issues)'},signal:AbortSignal.timeout(FETCH_TIMEOUT_MS)});
      const raw=await readBoundedJSON(response),{trips,rejected}=normaliseSegments(raw,configuredCity);
      state.cache={city:cityId,fetchedAt:clock(),serverTime:clock(),stale:false,source:'Transitous / MOTIS',trips,rejected};return state.cache;
    }catch{state.lastFailure=clock();return failure(clock());}finally{state.inflight=null;}});
    queue=state.inflight.then(()=>{},()=>{});return state.inflight;
  };
}
export const getSnapshot=createTransitService();
const details=new Map(),detailInflight=new Map();let detailQueue=Promise.resolve();
async function getDetail(id){
  const previous=details.get(id);if(previous&&Date.now()-previous.fetchedAt<30_000)return previous;
  if(detailInflight.has(id))return detailInflight.get(id);
  if(detailInflight.size>=8)throw new Error('Detail queue busy');
  const result=detailQueue.then(async()=>{
    const u=new URL('/api/v6/trip',BASE);u.search=new URLSearchParams({tripId:id,language:'de',detailedLegs:'true'});
    const r=await fetch(u,{headers:{'User-Agent':'Rheinlive/0.2 (https://github.com/simongmk/rheinlive/issues)'},signal:AbortSignal.timeout(FETCH_TIMEOUT_MS)});
    const data=normaliseTripDetail(await readBoundedJSON(r,2_000_000));
    const detail={...data,fetchedAt:Date.now(),positionType:'estimated'};
    if(details.size>=32)details.delete(details.keys().next().value);details.set(id,detail);return detail;
  }).finally(()=>detailInflight.delete(id));
  detailInflight.set(id,result);detailQueue=result.then(()=>{},()=>{});return result;
}
export async function handleApi(request){
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/'))return null;
  if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405,headers:{Allow:'GET'}});
  if(u.pathname==='/api/cities')return Response.json(Object.values(cities));
  const cityId=u.searchParams.get('city')||'cologne';
  if(!Object.hasOwn(cities,cityId))return Response.json({error:'Stadt noch nicht verfügbar'},{status:404});
  if(u.pathname==='/api/vehicles'){
    const data=await getSnapshot(cityId);return Response.json({...data,serverTime:Date.now()},{status:data.stale?503:200,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(u.pathname==='/api/trip'){
    const id=u.searchParams.get('id');if(!id||id.length>1000)return Response.json({error:'Ungültige Fahrt'},{status:400});
    const snapshot=await getSnapshot(cityId);
    if(!snapshot.trips.some(t=>t.id===id))return Response.json({error:'Fahrt nicht mehr im aktuellen Ausschnitt'},{status:404});
    try{return Response.json(await getDetail(id),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Fahrtverlauf momentan nicht erreichbar'},{status:503});}
  }
  return Response.json({error:'Not found'},{status:404});
}
