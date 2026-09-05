import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {handleApi} from '../lib/api.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.zip':'application/zip'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
    const api=await handleApi(request);if(api){res.writeHead(api.status,Object.fromEntries(api.headers));res.end(Buffer.from(await api.arrayBuffer()));return;}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const decoded=decodeURIComponent(url.pathname);
    const base=resolve(root,decoded.startsWith('/lib/')?'lib':'public');
    const relative=decoded.startsWith('/lib/')?decoded.slice(5):decoded==='/'?'index.html':decoded.slice(1);
    const path=resolve(base,relative);
    if(!path.startsWith(base+sep)){res.writeHead(403);res.end();return;}
    if(base.endsWith('/lib')&&!['transit.mjs','cities.mjs','monitor.mjs'].includes(relative)){res.writeHead(404);res.end();return;}
    const body=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
  }catch(e){res.writeHead(e?.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end(e?.code==='ENOENT'?'Not found':'Request failed');}
}).listen(port,'127.0.0.1',()=>console.log(`Rheinlive ready\nLocal: http://localhost:${port}`));
