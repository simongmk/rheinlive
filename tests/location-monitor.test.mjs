import test from 'node:test';
import assert from 'node:assert/strict';
import {createDepartureMonitor} from '../public/monitor.js';

class Node {
  constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.textContent='';this.dataset={};this.style={};this.attributes={};this.classList={toggle(){}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  get firstChild(){return this.children[0];}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelectorAll(selector){return this.children.flatMap(n=>[...(selector==='[data-event]'?n.dataset.event!==undefined:selector.startsWith('.')?n.className?.split(' ').includes(selector.slice(1)):n.tag===selector)?[n]:[],...n.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function withMonitor(run,{departures=[],startTime=Date.now()}={}){
  const originalNow=Date.now;let now=startTime;Date.now=()=>now;
  const saved=new Map(),nodes=new Map(),events=new Map(),requests=[],positions=[],picks=[],calls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};node('#buffer-minutes').value='2';
  const install=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
  install('document',{querySelector:node,createElement:tag=>new Node(tag),hidden:false,addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)});
  install('navigator',{geolocation:{getCurrentPosition:(ok,fail,options)=>requests.push({ok,fail,options})}});
  const prefs=new Map();install('window',{location:{origin:'https://example.test'}});install('localStorage',{getItem:k=>prefs.get(k)??null,setItem:(k,v)=>prefs.set(k,v),removeItem:k=>prefs.delete(k)});
  install('addEventListener',(k,f)=>events.set(k,f));install('removeEventListener',k=>events.delete(k));install('setInterval',()=>1);install('clearInterval',()=>{});
  install('fetch',async(url,options)=>{
    calls.push({url,body:options?.body?JSON.parse(options.body):null});
    if(url==='/api/walk'){const ids=JSON.parse(options.body).stopIds;return Response.json({walks:ids.map(id=>({stopId:id,seconds:id==='near'?30:400,meters:100}))});}
    const u=new URL(url,'https://example.test');return Response.json({city:'cologne',stopId:u.searchParams.get('stopId'),fetchedAt:Date.now(),serverTime:Date.now(),departures});
  });
  const stop=(id,lon)=>({type:'Feature',properties:{queryId:id,name:id,modes:['tram']},geometry:{type:'Point',coordinates:[lon,50.93]}});
  const old=stop('old',6.94),near=stop('near',6.955),network={city:'cologne',stops:{features:[old,near]}};
  const monitor=createDepartureMonitor({onCity:()=>{},onLocation:(p,focus)=>positions.push({p,focus}),onStation:()=>{},onExplore:()=>{},onPickLocation:value=>{picks.push(value);return true;}});
  monitor.setCity('cologne');monitor.setNetwork(network);
  try{await run({monitor,node,requests,positions,picks,calls,old,near,prefs,departures,advance:ms=>{now+=ms;}});}
  finally{Date.now=originalNow;events.get('pagehide')?.({persisted:false});for(const [key,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
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

// Synthetic monitor interaction inputs are test-only, never served by the app.
const T=Date.parse('2026-09-06T08:00:00Z');
const departure=(id,line,minutes,direction='out')=>({id,line,lineKey:'bus:'+line,mode:'bus',directionKey:line+':'+direction,headsign:direction,departure:T+minutes*60000,scheduledDeparture:T+minutes*60000,realtime:true,boarding:true,cancelled:false,color:'#5ac3ee',textColor:'#111111',stop:{}});
const cards=h=>h.node('#departure-cards').querySelectorAll('[data-event]');
const rows=h=>h.node('#departure-list').querySelectorAll('[data-event]');
const chip=(h,key)=>h.node('#departure-lines').children.find(b=>b.dataset.line===key);
test('line chips filter both timer cards and list, intersect directions, retain choices across refresh and isolate station preferences',()=>withMonitor(async h=>{
  h.monitor.choose(h.old);await flush();
  chip(h,'bus:106').onclick();assert.equal(chip(h,'bus:106').attributes['aria-pressed'],'true');assert.equal(chip(h,'').attributes['aria-pressed'],'false');
  assert.deepEqual(rows(h).map(r=>r.dataset.event),['106-out','106-back']);
  chip(h,'bus:132').onclick();assert.equal(rows(h).length,3);
  const select=h.node('#departure-direction');select.value='106:out';select.onchange();assert.deepEqual(cards(h).map(r=>r.dataset.event),['106-out']);
  chip(h,'bus:106').onclick();assert.equal(select.value,'');assert.deepEqual(rows(h).map(r=>r.dataset.event),['132-out']);
  const calls=h.calls.length;const button=chip(h,'bus:132');h.monitor.tick();assert.equal(h.calls.length,calls);assert.equal(chip(h,'bus:132'),button);
  h.node('#board-retry').onclick();await flush();assert.deepEqual(rows(h).map(r=>r.dataset.event),['132-out']);assert.equal(chip(h,'bus:132'),button);
  h.monitor.choose(h.near);await flush();assert.equal(chip(h,'').attributes['aria-pressed'],'true');assert.equal(rows(h).length,4);
  h.monitor.choose(h.old);await flush();assert.equal(chip(h,'bus:132').attributes['aria-pressed'],'true');assert.deepEqual(rows(h).map(r=>r.dataset.event),['132-out']);
  chip(h,'bus:132').onclick();assert.equal(rows(h).length,0);assert.match(h.node('#departure-cards').children[0].textContent,/mindestens eine Linie/);
  chip(h,'').onclick();assert.equal(rows(h).length,4);
},{startTime:T,departures:[departure('106-out','106',10),departure('106-back','106',11,'back'),departure('132-out','132',12),departure('3-out','3',13)]}));
test('a tight timer counts to departure, remains when walking time is insufficient and is replaced only at departure',()=>withMonitor(async h=>{
  h.monitor.choose(h.old);await flush();h.node('#walk-minutes').value='6';h.node('#walk-minutes').oninput();
  let card=cards(h)[0];assert.equal(card.dataset.event,'soon');assert.equal(card.dataset.state,'tight');assert.equal(card.querySelector('.leave-countdown').textContent,'2:00');assert.equal(card.querySelector('.leave-label').textContent,'Bis zur Abfahrt · knapp');
  assert.equal(rows(h)[0].querySelector('small').textContent,'Abfahrt in 2:00 · knapp');
  h.advance(119000);h.monitor.tick();assert.equal(cards(h)[0],card);assert.equal(card.querySelector('.leave-countdown').textContent,'0:01');
  h.advance(1000);h.monitor.tick();assert.equal(cards(h)[0].dataset.event,'later');assert.ok(!rows(h).some(r=>r.dataset.event==='soon'));
  h.advance(1000);h.monitor.tick();assert.equal(cards(h)[0].dataset.state,'stale');assert.equal(cards(h)[0].querySelector('.leave-countdown').textContent,'–');
},{startTime:T,departures:[departure('soon','106',2),departure('later','106',15)]}));
test('a selected line disappearing from a board refresh never silently enables unrelated lines',()=>withMonitor(async h=>{
  h.old.properties.lineKeys=['bus:106','bus:132'];h.monitor.choose(h.old);await flush();chip(h,'bus:106').onclick();
  h.departures.splice(0,1);h.node('#board-retry').onclick();await flush();
  assert.equal(chip(h,'bus:106').attributes['aria-pressed'],'true');assert.equal(rows(h).length,0);assert.equal(cards(h).length,0);
  h.departures.push(departure('106-back','106',9));h.node('#board-retry').onclick();await flush();assert.deepEqual(rows(h).map(r=>r.dataset.event),['106-back']);
},{startTime:T,departures:[departure('106-out','106',10),departure('132-out','132',12)]}));
test('opening a map search result cancels a pending location and cannot be pulled back into departures',()=>withMonitor(async h=>{
  h.monitor.locate();h.monitor.explore();h.requests[0].ok({coords:{latitude:50.93,longitude:6.955,accuracy:20},timestamp:Date.now()});await flush();
  assert.equal(h.monitor.getLocation(),null);assert.equal(h.node('#monitor-view').hidden,true);
  h.monitor.setManualLocation([50.93,6.955]);h.monitor.explore();await flush();await flush();
  assert.equal(h.node('#monitor-view').hidden,true);assert.equal(h.monitor.getStation(),null);
}));
