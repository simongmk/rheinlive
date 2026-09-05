import {city} from './cities.mjs';
import {normaliseSegments} from './transit.mjs';
const BASE='https://api.transitous.org';
const CACHE_MS=30_000, RETRY_MS=30_000, FETCH_TIMEOUT_MS=15_000, MAX_RESPONSE_BYTES=12_000_000;
export function upstreamUrl(now) {
  const minute=Math.floor(now/60_000)*60_000;
  const u=new URL('/api/v6/map/trips',BASE);
  u.search=new URLSearchParams({min:city.bounds[0].join(','),max:city.bounds[1].join(','),zoom:'14',startTime:new Date(minute-60_000).toISOString(),endTime:new Date(minute+120_000).toISOString(),precision:'5',language:'de'}).toString();
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
/** One bounded upstream request shared by concurrent clients. No user-controlled proxy URL. */
export function createTransitService({fetcher=fetch,clock=Date.now}={}) {
  let cache=null,inflight=null,lastFailure=-Infinity;
  return async function snapshot(){
    const now=clock();
    if(cache&&now-cache.fetchedAt<CACHE_MS)return {...cache,serverTime:now};
    if(now-lastFailure<RETRY_MS)return failure(now);
    if(inflight)return inflight;
    function failure(time){return {city:city.id,fetchedAt:cache?.fetchedAt??null,serverTime:time,stale:true,source:'Transitous / MOTIS',trips:[],error:'Verkehrsdaten momentan nicht erreichbar. Die Karte zeigt keine alten Positionen weiter an.'};}
    inflight=(async()=>{try{
      const response=await fetcher(upstreamUrl(now),{headers:{'Accept':'application/json','User-Agent':'Rheinlive/0.1 (https://github.com/simongmk/rheinlive/issues)'},signal:AbortSignal.timeout(FETCH_TIMEOUT_MS)});
      const raw=await readBoundedJSON(response),{trips,rejected}=normaliseSegments(raw);
      cache={city:city.id,fetchedAt:clock(),serverTime:clock(),stale:false,source:'Transitous / MOTIS',trips,rejected};return cache;
    }catch{lastFailure=clock();return failure(clock());}finally{inflight=null;}})();
    return inflight;
  };
}
export const getSnapshot=createTransitService();
export async function handleApi(request){
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/'))return null;
  if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405,headers:{Allow:'GET'}});
  if(u.pathname==='/api/cities')return Response.json([city]);
  if(u.pathname==='/api/vehicles'){
    if(u.searchParams.has('city')&&u.searchParams.get('city')!==city.id)return Response.json({error:'Stadt noch nicht verfügbar'},{status:404});
    const data=await getSnapshot();return Response.json({...data,serverTime:Date.now()},{status:data.stale?503:200,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  return Response.json({error:'Not found'},{status:404});
}
