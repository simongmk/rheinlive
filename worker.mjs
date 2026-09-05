import {cities} from './lib/cities.mjs';
import {handleApi} from './lib/api.mjs';
const headers={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'geolocation=(), camera=(), microphone=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self' https://chatgpt.com https://chat.openai.com",
};
/** Cache only the transit snapshot; serverTime is stamped when each response leaves. */
export function createWorker({api=handleApi,clock=Date.now,getEdgeCache=()=>globalThis.caches?.default}={}) {
  return {
    async fetch(request,env,ctx){
      let response;
      const url=new URL(request.url);
      const cityId=url.searchParams.get('city')||'cologne';
      const cacheKey=new Request(new URL('/api/vehicles?version=4&city='+encodeURIComponent(cityId),url.origin));
      const cacheable=url.pathname==='/api/vehicles'&&request.method==='GET'&&Object.hasOwn(cities,cityId);
      const cache=getEdgeCache();
      if(cacheable&&cache){try{response=await cache.match(cacheKey);}catch{/* Edge cache is optional. */}}
      if(!response){
        response=await api(request);
        if(response?.ok&&cacheable&&cache){
          const snapshot=await response.clone().json();
          const remaining=Math.floor((30_000-(clock()-snapshot.fetchedAt))/1000);
          if(Number.isFinite(remaining)&&remaining>0){
            const stored=Response.json(snapshot,{headers:{'Cache-Control':`public, max-age=${Math.min(30,remaining)}`}});
            ctx.waitUntil(cache.put(cacheKey,stored).catch(()=>{}));
          }
        }
        if(!response){
          if(!env.ASSETS)return new Response('Static assets are not bound.',{status:503});
          response=await env.ASSETS.fetch(request);
          response=new Response(response.body,response);
          response.headers.set('Cache-Control','no-cache');
        }
      }
      if(cacheable){
        const snapshot=await response.json();
        response=Response.json({...snapshot,serverTime:clock()},{status:response.status,headers:{'Cache-Control':'no-store'}});
      }
      const result=new Response(response.body,response);
      for(const[k,v]of Object.entries(headers))result.headers.set(k,v);
      return result;
    },
  };
}
export default createWorker();
