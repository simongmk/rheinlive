import {cities,pointInBounds} from './cities.mjs';
import {distance,validPoint} from './transit.mjs';
import {normaliseDepartures} from './monitor.mjs';
import {stationIndex} from './station-index.mjs';
import {platformFields} from './platforms.mjs';
const UA='Rheinlive/0.2 (https://github.com/simongmk/rheinlive/issues)';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createMonitorApi({fetcher=fetch,clock=Date.now,readJSON}){
  const cache=new Map(),pending=new Map();let queue=Promise.resolve(),walkPending=0;
  const source=async url=>readJSON(await fetcher(url,{headers:{Accept:'application/json','User-Agent':UA},signal:AbortSignal.timeout(15000)}),1_000_000);
  async function board(city,id){
    const key=city.id+'|'+id,now=clock(),old=cache.get(key);
    if(old&&now-old.fetchedAt<30000)return old;
    if(pending.has(key))return pending.get(key);
    if(pending.size>=8)throw Error('Busy');
    const task=queue.then(async()=>{
      const url=new URL('https://api.transitous.org/api/v6/stoptimes');url.search=new URLSearchParams({stopId:id,n:'60',arriveBy:'false',language:'de',withAlerts:'false'});
      let data;try{const raw=await source(url);const departures=normaliseDepartures(raw,city,stationIndex[city.id][id]);for(const e of departures)e.stop={...e.stop,...platformFields(e.stop)};data={city:city.id,stopId:id,fetchedAt:clock(),stale:false,departures};}
      catch{data={city:city.id,stopId:id,fetchedAt:clock(),stale:true,departures:[],error:'Abfahrtsprognosen gerade nicht erreichbar.'};}
      cache.delete(key);if(cache.size>=48)cache.delete(cache.keys().next().value);cache.set(key,data);return data;
    }).finally(()=>pending.delete(key));
    pending.set(key,task);queue=task.then(()=>{},()=>{});return task;
  }
  return async request=>{
    const url=new URL(request.url);
    if(url.pathname==='/api/departures'){
      if(request.method!=='GET')return json({error:'Nur Lesen erlaubt.'},405);
      const city=Object.hasOwn(cities,url.searchParams.get('city'))?cities[url.searchParams.get('city')]:null,id=url.searchParams.get('stopId');
      if(!city||!Object.hasOwn(stationIndex[city.id]??{},id))return json({error:'Haltestelle in dieser Region nicht verfügbar.'},404);
      try{const data=await board(city,id);return json({...data,serverTime:clock()},data.stale?503:200);}catch{return json({error:'Zu viele Abfragen. Bitte kurz warten.'},429);}
    }
    if(url.pathname==='/api/walk'){
      if(request.method!=='POST')return json({error:'POST erforderlich.'},405);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON erforderlich.'},415);
      let body;try{body=await readJSON(new Response(request.body),4096);}catch{return json({error:'Anfrage nicht lesbar.'},400);}
      const city=Object.hasOwn(cities,body?.city)?cities[body.city]:null,ids=body?.stopIds,origin=body?.origin;
      if(!city||!validPoint(origin)||!pointInBounds(origin,city.bounds)||!Array.isArray(ids)||!ids.length||ids.length>6||new Set(ids).size!==ids.length||ids.some(id=>!Object.hasOwn(stationIndex[city.id]??{},id)||distance(origin,stationIndex[city.id][id])>4000))return json({error:'Fußwege nur zu nahen Haltestellen der Region verfügbar.'},400);
      if(walkPending>=3)return json({error:'Gehzeitberechnung gerade ausgelastet.'},429);
      walkPending++;
      try{
        const u=new URL('https://api.transitous.org/api/v1/one-to-many');u.search=new URLSearchParams({one:origin.join(';'),many:ids.map(id=>stationIndex[city.id][id].join(';')).join(','),mode:'WALK',max:'3600',maxMatchingDistance:'100',arriveBy:'false',withDistance:'true'});
        const raw=await source(u);if(!Array.isArray(raw)||raw.length!==ids.length)throw Error('Invalid walks');
        const walks=ids.map((stopId,i)=>({stopId,seconds:Number.isFinite(raw[i]?.duration)&&raw[i].duration>=0&&raw[i].duration<=3600?raw[i].duration:null,meters:Number.isFinite(raw[i]?.distance)&&raw[i].distance>=0?raw[i].distance:null}));
        // Origin coordinates are deliberately absent from the result and all caches.
        return json({city:city.id,fetchedAt:clock(),walks,source:'Transitous / MOTIS · Fußwegenetz',estimated:true});
      }catch{return json({error:'Fußweg nicht berechenbar. Gehzeit bitte selbst einstellen.'},503);}finally{walkPending--;}
    }
    return null;
  };
}
