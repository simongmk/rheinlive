import test from 'node:test';
import assert from 'node:assert/strict';
import {createDepartureMonitor} from '../public/monitor.js';

class Node {
  constructor(){this.children=[];this.value='';this.hidden=false;this.textContent='';this.dataset={};this.style={};this.attributes={};this.classList={toggle(){}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  get firstChild(){return this.children[0];}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelectorAll(){return [];}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function withMonitor(run){
  const saved=new Map(),nodes=new Map(),events=new Map(),requests=[],positions=[],picks=[],calls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};node('#buffer-minutes').value='2';
  const install=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
  install('document',{querySelector:node,createElement:()=>new Node(),hidden:false,addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)});
  install('navigator',{geolocation:{getCurrentPosition:(ok,fail,options)=>requests.push({ok,fail,options})}});
  install('window',{location:{origin:'https://example.test'}});install('localStorage',{getItem:()=>null,setItem(){},removeItem(){}});
  install('addEventListener',(k,f)=>events.set(k,f));install('removeEventListener',k=>events.delete(k));install('setInterval',()=>1);install('clearInterval',()=>{});
  install('fetch',async(url,options)=>{
    calls.push({url,body:options?.body?JSON.parse(options.body):null});
    if(url==='/api/walk'){const ids=JSON.parse(options.body).stopIds;return Response.json({walks:ids.map(id=>({stopId:id,seconds:id==='near'?30:400,meters:100}))});}
    const u=new URL(url,'https://example.test');return Response.json({city:'cologne',stopId:u.searchParams.get('stopId'),fetchedAt:Date.now(),serverTime:Date.now(),departures:[]});
  });
  const stop=(id,lon)=>({type:'Feature',properties:{queryId:id,name:id,modes:['tram']},geometry:{type:'Point',coordinates:[lon,50.93]}});
  const old=stop('old',6.94),near=stop('near',6.955),network={city:'cologne',stops:{features:[old,near]}};
  const monitor=createDepartureMonitor({onCity:()=>{},onLocation:(p,focus)=>positions.push({p,focus}),onStation:()=>{},onExplore:()=>{},onPickLocation:value=>{picks.push(value);return true;}});
  monitor.setCity('cologne');monitor.setNetwork(network);
  try{await run({monitor,node,requests,positions,picks,calls,old,near});}
  finally{events.get('pagehide')?.({persisted:false});for(const [key,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
test('denied location remains visible and manual map selection still supplies nearby stops and walking times',()=>withMonitor(async h=>{
  h.monitor.start();h.requests[0].fail({code:1});const message=h.node('#location-status').textContent;
  assert.match(message,/blockiert/);assert.equal(h.node('#locate').disabled,false);assert.equal(h.node('#location-pick').hidden,false);
  h.monitor.tick();assert.equal(h.node('#location-status').textContent,message);
  h.node('#location-pick').onclick();assert.equal(h.picks.at(-1),true);
  h.monitor.setManualLocation([50.93,6.955]);await flush();await flush();
  assert.equal(h.picks.at(-1),false);assert.equal(h.monitor.getLocation().source,'manual');assert.equal(h.monitor.getLocation().accuracy,null);
  assert.equal(h.monitor.getStation().properties.queryId,'near');assert.equal(h.node('#walk-minutes').value,'1');
  assert.equal(h.requests.length,1);assert.deepEqual(h.calls.find(c=>c.url==='/api/walk').body.origin,[50.93,6.955]);
}));
test('a new successful locate replaces the previous station; an explicit station choice cancels a pending locate',()=>withMonitor(async h=>{
  h.monitor.choose(h.old);await flush();h.monitor.locate();
  h.requests[0].ok({coords:{latitude:50.93,longitude:6.955,accuracy:20},timestamp:Date.now()});await flush();await flush();
  assert.equal(h.monitor.getStation().properties.queryId,'near');assert.equal(h.monitor.getLocation().source,'device');
  h.monitor.locate();h.monitor.choose(h.old);h.requests[1].ok({coords:{latitude:50.93,longitude:6.955,accuracy:20},timestamp:Date.now()});await flush();
  assert.equal(h.monitor.getStation().properties.queryId,'old');assert.equal(h.monitor.getLocation(),null);assert.equal(h.node('#locate').disabled,false);
}));
