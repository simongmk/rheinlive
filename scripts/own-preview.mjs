// Separate, loopback-only integration preview. Never falls back to Transitous.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {cities} from '../lib/cities.mjs';
import {createOwnApi} from '../lib/own-backend.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dataRoot=resolve(root,'.cache/motis/preview/data'),stations={};
for(const id of Object.keys(cities)){
  const network=JSON.parse(await readFile(resolve(dataRoot,'network-'+id+'.json'),'utf8'));
  if(network.provider!=='own'||!network.stops.features.length)throw Error('Own-source network snapshot required: '+id);
  stations[id]=Object.fromEntries(network.stops.features.filter(f=>f.properties.queryId).map(f=>[f.properties.queryId,[f.geometry.coordinates[1],f.geometry.coordinates[0]]]));
}
const api=createOwnApi({stations});
const port=Number(process.env.PORT||4174);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
    const result=await api(request);
    if(result){res.writeHead(result.status,Object.fromEntries(result.headers));res.end(req.method==='HEAD'?undefined:Buffer.from(await result.arrayBuffer()));return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const pathname=decodeURIComponent(url.pathname),isLib=pathname.startsWith('/lib/');
    // All transit networks come from this import, while map tiles/OSM track detail
    // remain the independently licensed existing assets.
    const isNetwork=pathname.startsWith('/data/network-');
    const base=isNetwork?dataRoot:resolve(root,isLib?'lib':'public');
    const relative=isNetwork?pathname.slice(6):isLib?pathname.slice(5):pathname==='/'?'index.html':pathname.slice(1);
    const path=resolve(base,relative);
    if(!path.startsWith(base+sep)||(isLib&&!['cities.mjs','transit.mjs','monitor.mjs','journey-platform.mjs'].includes(relative))){res.writeHead(404);res.end();return;}
    let body=await readFile(path);
    if(relative==='index.html')body=Buffer.from(body.toString().replace('<html lang="de"','<html data-provider="own" lang="de"'));
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch(e){res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end('Preview request unavailable');}
}).listen(port,'127.0.0.1',()=>console.log('Own GTFS.de preview: http://localhost:'+port));
