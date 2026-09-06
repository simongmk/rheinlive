// Keep all owned development processes in one foreground session; Ctrl-C stops all.
import {spawn} from 'node:child_process';
import {access,mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFreshnessGuard} from '../lib/own-backend.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const children=[];let stopping=false,failed=false;
function stop(code){
  if(stopping)return;stopping=true;process.exitCode=code;
  for(const c of children)if(c.exitCode===null)c.kill('SIGTERM');
  const timer=setTimeout(()=>{for(const c of children)if(c.exitCode===null)c.kill('SIGKILL');},5000);timer.unref();
}
process.on('SIGINT',()=>stop(0));process.on('SIGTERM',()=>stop(0));
async function launch(command,args,name){
  if(stopping)throw Error('Startup cancelled');
  const log=await open(resolve('.cache/motis/logs',name+'.log'),'a');
  if(stopping){await log.close();throw Error('Startup cancelled');}
  const child=spawn(command,args,{cwd:root,stdio:['ignore',log.fd,log.fd]});children.push(child);
  child.once('spawn',()=>log.close().catch(()=>{}));
  child.on('error',e=>{failed=true;console.error(name+': '+e.message);stop(1);});
  child.on('exit',()=>{if(!stopping){failed=true;console.error(name+' stopped; see .cache/motis/logs/'+name+'.log');stop(1);}});
}
try{
  await access('.cache/motis/data/meta/route_shapes.json');
  await access('.cache/motis/preview/data/network-cologne.json');
  await mkdir('.cache/motis/logs',{recursive:true});
  let python=process.env.PYTHON;
  if(!python){try{await access('.venv-gtfs/bin/python');python=resolve('.venv-gtfs/bin/python');}catch{python='python3';}}
  await launch(python,['scripts/motis-relay.py'],'relay');
  await launch(resolve('.cache/motis/bin/motis'),['server','-d',resolve('.cache/motis/data')],'server');
  const fresh=createFreshnessGuard();let ready=false;
  for(let i=0;i<35&&!failed&&!stopping;i++){
    try{await fresh();ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}
  }
  if(!ready||failed||stopping)throw Error('Own realtime engine did not become ready');
  await launch(process.execPath,['scripts/own-preview.mjs'],'preview');
  let loaded=false;
  for(let i=0;i<10&&!failed&&!stopping;i++){
    try{const r=await fetch('http://127.0.0.1:4174/',{signal:AbortSignal.timeout(1000)});await r.body?.cancel();if(r.ok){loaded=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,300));
  }
  if(!loaded||failed||stopping)throw Error('Preview did not become ready');
  console.log('Own GTFS.de map: http://localhost:4174\nCtrl-C stops the map, MOTIS and the relay.');
}catch(e){console.error(e.message);stop(1);}
