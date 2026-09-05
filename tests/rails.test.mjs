import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {roundRailCorners,buildRailDetail} from '../lib/rail-geometry.mjs';
import {coveredRailCity,createRailDetail} from '../public/rail-detail.js';
import {cities} from '../lib/cities.mjs';

const xy=p=>[p[0]*111320*Math.cos(51*Math.PI/180),p[1]*111320];
function distanceToSegment(p,a,b){p=xy(p);a=xy(a);b=xy(b);const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
test('rounding respects a sub-metre corridor, endpoints, junctions and reversal',()=>{
  const points=[[7,51],[7.001,51],[7.002,51.0003],[7.003,51.001]];
  const smooth=roundRailCorners(points,new Set([2]));assert.ok(smooth.length>points.length);
  assert.deepEqual(smooth[0],points[0]);assert.deepEqual(smooth.at(-1),points.at(-1));assert.ok(smooth.some(p=>JSON.stringify(p)===JSON.stringify(points[2])));
  for(const p of smooth)assert.ok(Math.min(...points.slice(1).map((b,i)=>distanceToSegment(p,points[i],b)))<=.62);
  assert.deepEqual(roundRailCorners([...points].reverse(),new Set([1])).reverse(),smooth);
  assert.deepEqual(roundRailCorners([[7,51],[7.001,51]]),[[7,51],[7.001,51]]);
});
test('sharp corners and degenerate segments are not rounded into invented track paths',()=>{
  for(const p of [[[7,51],[7.001,51],[7.001,51.001]],[[7,51],[7,51],[7.001,51]]]){
    const output=roundRailCorners(p);assert.ok(output.every(point=>p.some(original=>JSON.stringify(point)===JSON.stringify(original))));
  }
});
test('actual Severinstraße track ends meet construction ways at unchanged OSM nodes',async()=>{
  const raw=JSON.parse(await readFile(new URL('fixtures/severin-osm-2026-09-05.json',import.meta.url)));
  const data=buildRailDetail(raw,cities.cologne),active=data.features.filter(f=>f.properties.status==='active').flatMap(f=>f.geometry.coordinates),construction=data.features.filter(f=>f.properties.status==='construction').flatMap(f=>f.geometry.coordinates);
  for(const id of [385760001,385760002]){
    const w=raw.elements.find(w=>w.id===id),p=id===385760001?w.geometry[0]:w.geometry.at(-1),point=[p.lon,p.lat];
    for(const group of [active,construction])assert.ok(group.some(line=>[line[0],line.at(-1)].some(end=>JSON.stringify(end)===JSON.stringify(point))));
  }
  assert.equal(active.length,9);assert.equal(construction.length,3);
  const source=raw.elements.find(w=>w.id===4759604);assert.ok(active.some(line=>line.length>source.nodes.length&&line[0][0]===source.geometry[0].lon));
  // Both parallel ways remain distinct; no station-to-station connector is made.
  assert.ok(active.some(line=>line[0][0]===6.9538059));assert.ok(active.some(line=>line.at(-1)[0]===6.9538366));
});
test('incomplete source exports fail instead of replacing the working rail map',()=>{
  assert.throws(()=>buildRailDetail({elements:[],remark:'runtime error'},cities.cologne));
  assert.throws(()=>buildRailDetail({elements:[],osm3s:{timestamp_osm_base:'2026-09-05T00:00:00Z'}},cities.cologne));
});
const bounds=([s,w,n,e])=>({getSouth:()=>s,getWest:()=>w,getNorth:()=>n,getEast:()=>e});
function harness(){
  let zoom=12,view=bounds([50.928,6.95,50.93,6.96]),loaded=false;const listeners=new Map(),loads=[],states=[];
  const map={getZoom:()=>zoom,getBounds:()=>view,isSourceLoaded:()=>loaded,getSource:()=>({setData:url=>{loads.push(url);loaded=false;}}),on:(e,f)=>listeners.set(e,f),off:e=>listeners.delete(e)};
  const layer=createRailDetail(map,s=>states.push(s.active));layer.mount();
  return{layer,loads,states,listeners,zoom:n=>zoom=n,view:v=>view=bounds(v),event:(name,arg={})=>listeners.get(name)?.(arg),ready(){loaded=true;listeners.get('sourcedata')({sourceId:'detail-tracks'});}};
}
test('detail rails defer loading until close zoom and keep the base until source completion',()=>{
  const h=harness();assert.equal(h.loads.length,0);h.zoom(17);h.event('move');assert.equal(h.loads.length,0);h.event('moveend');assert.equal(h.loads.length,1);assert.deepEqual(h.states,[]);
  h.ready();assert.deepEqual(h.states,[true]);for(let i=0;i<100;i++)h.event('move');assert.equal(h.loads.length,1);
  h.layer.setEnabled(false);assert.equal(h.states.at(-1),false);h.layer.setEnabled(true);assert.equal(h.states.at(-1),true);assert.equal(h.loads.length,1);
  h.zoom(12);h.event('move');assert.equal(h.states.at(-1),false);
});
test('coverage edges, region changes, source errors and style reloads preserve fallback',()=>{
  assert.equal(coveredRailCity(bounds([50.928,6.95,50.93,6.96])),'cologne');assert.equal(coveredRailCity(bounds([50.5,6,52,8])),null);
  const h=harness();h.zoom(17);h.event('moveend');h.ready();h.view([50.92,6.74,50.94,6.80]);h.event('move');assert.equal(h.states.at(-1),false);
  h.view([50.73,7.10,50.74,7.11]);h.event('moveend');assert.match(h.loads.at(-1),/bonn/);assert.equal(h.states.at(-1),false);h.ready();assert.equal(h.states.at(-1),true);
  h.layer.mount();assert.equal(h.states.at(-1),false);h.event('error',{sourceId:'detail-tracks'});const count=h.loads.length;h.event('moveend');assert.equal(h.loads.length,count);h.ready();assert.equal(h.states.at(-1),false);
  h.layer.destroy();assert.equal(h.listeners.size,0);
});
test('worker transfer measurements count metadata/content duplicates only once',()=>{
  const h=harness(),entry={name:'tracks-cologne.json',startTime:100,transferSize:1000};
  for(let i=0;i<2;i++)h.event('sourcedata',{sourceId:'detail-tracks',resourceTiming:[entry]});
  h.event('sourcedata',{sourceId:'detail-tracks',resourceTiming:[{...entry,startTime:200,transferSize:300}]});
  assert.equal(h.layer.stats().transferBytes,1300);
});
test('published regional rail details have bounded downloads and separate construction',async()=>{
  for(const city of Object.values(cities)){
    const buffer=await readFile(new URL('../public/data/tracks-'+city.id+'.json',import.meta.url)),data=JSON.parse(buffer);
    assert.equal(data.city,city.id);assert.deepEqual(data.bounds,city.bounds);assert.ok(Date.parse(data.sourceDate));assert.equal(data.license,'ODbL-1.0');assert.ok(data.stats.ways>100);
    assert.ok(buffer.length<8_000_000);assert.ok(gzipSync(buffer).length<1_250_000);
    assert.ok(data.features.some(f=>f.properties.class==='transit'));assert.ok(data.features.some(f=>f.properties.class==='rail'));
    for(const f of data.features){assert.ok(['active','construction'].includes(f.properties.status));for(const line of f.geometry.coordinates){assert.ok(line.length>=2);assert.ok(line.every(p=>p.length===2&&p.every(Number.isFinite)));}}
  }
});
