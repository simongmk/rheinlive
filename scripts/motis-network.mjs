// Rebuild all configured app regions from the own engine. Never queries Transitous.
import {mkdir,writeFile,readFile,rename} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {cities} from '../lib/cities.mjs';
import {readBoundedJSON} from '../lib/api.mjs';
const folder=resolve('.cache/motis/preview'),staging=resolve(folder,'data-next');
await mkdir(staging,{recursive:true});
const evidence=[];
for(const city of Object.values(cities)){
  const url=new URL('/api/experimental/map/routes','http://127.0.0.1:8787');
  url.search=new URLSearchParams({min:city.bounds[0].join(','),max:city.bounds[1].join(','),zoom:'14',language:'de'});
  const start=performance.now(),raw=await readBoundedJSON(await fetch(url,{signal:AbortSignal.timeout(120000)}),64_000_000);
  if(!Array.isArray(raw.routes)||!raw.routes.length||raw.zoomFiltered)throw Error('Incomplete network: '+city.id);
  const counts={};for(const route of raw.routes)counts[route.pathSource]=(counts[route.pathSource]||0)+1;
  if(!counts.ROUTED&&!counts.TIMETABLE)throw Error('No actual route geometries imported: '+city.id);
  const path=resolve(folder,'raw-'+city.id+'.json');await writeFile(path,JSON.stringify(raw));
  const result=spawnSync(process.execPath,['scripts/prepare-network.mjs',city.id,path,staging,'own'],{stdio:'inherit'});
  if(result.status!==0)throw Error('Network generation failed');
  evidence.push({city:city.id,source:url.href,generatedAt:new Date().toISOString(),milliseconds:Math.round(performance.now()-start),pathSources:counts});
}
// Only promote a complete set. Stop the preview before regeneration so it never
// combines a new static station namespace with an already loaded old allowlist.
await mkdir(resolve(folder,'data'),{recursive:true});
for(const id of Object.keys(cities))for(const suffix of ['','-bus'])await rename(resolve(staging,'network-'+id+suffix+'.json'),resolve(folder,'data/network-'+id+suffix+'.json'));
await writeFile(resolve(folder,'network-evidence.json'),JSON.stringify(evidence,null,2));
await writeFile(resolve(folder,'data/LICENSE.md'),await readFile('docs/OWN-DATA-NOTICES.md'));
console.log(JSON.stringify(evidence));
