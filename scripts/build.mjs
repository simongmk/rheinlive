import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
// The standalone fallback has no compilation dependencies or generated app shell.
await rm(resolve(root,'dist'),{recursive:true,force:true});
await mkdir(resolve(root,'dist/server/lib'),{recursive:true});
await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await cp(resolve(root,'public'),resolve(root,'dist/client'),{recursive:true});
await mkdir(resolve(root,'dist/client/lib'),{recursive:true});
for(const file of ['cities.mjs','transit.mjs','trip.mjs','api.mjs','monitor.mjs','monitor-api.mjs','station-index.mjs'])await cp(resolve(root,'lib',file),resolve(root,'dist/server/lib',file));
for(const file of ['cities.mjs','transit.mjs','monitor.mjs'])await cp(resolve(root,'lib',file),resolve(root,'dist/client/lib',file));
// A public source checkout can build or run locally without private hosting metadata.
try{await cp(resolve(root,'.openai/hosting.json'),resolve(root,'dist/.openai/hosting.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
await cp(resolve(root,'worker.mjs'),resolve(root,'dist/server/index.js'));
const html=await readFile(resolve(root,'dist/client/index.html'),'utf8');
for(const required of ['id="map"','id="lines"','/app.js','/style.css','transitous.org/sources/'])if(!html.includes(required))throw new Error(`Missing required page element: ${required}`);
const worker=await import(resolve(root,'dist/server/index.js'));
if(typeof worker.default?.fetch!=='function')throw new Error('Worker entry has no fetch handler');
await writeFile(resolve(root,'dist/build-info.json'),JSON.stringify({builtAt:new Date().toISOString(),runtime:'Cloudflare Workers',entry:'server/index.js'}));
console.log('Built Rheinlive: Worker + browser assets.');
