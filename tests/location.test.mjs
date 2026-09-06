import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationRequest} from '../public/location.js';

const now=Date.parse('2026-09-06T10:00:00Z');
const result=(latitude=50.93)=>({coords:{latitude,longitude:6.95,accuracy:20},timestamp:now});
function harness(overrides={}){
  const states=[],positions=[],requests=[],timers=new Map();let id=0;
  const request=createLocationRequest({onState:s=>states.push(s),onPosition:p=>positions.push(p),secure:true,document:{},clock:()=>now,navigator:{geolocation:{getCurrentPosition:(ok,fail,options)=>requests.push({ok,fail,options})}},setTimer:(f,delay)=>{timers.set(++id,{f,delay});return id;},clearTimer:i=>timers.delete(i),...overrides});
  return {...request,states,positions,requests,timers,timeout(){const t=[...timers.values()][0];timers.clear();t?.f();}};
}
test('a native dialog that never responds ends with a persistent timeout; late callbacks are ignored',()=>{
  const h=harness();h.request();assert.deepEqual(h.states,['locating']);assert.equal([...h.timers.values()][0].delay,18000);
  h.timeout();assert.equal(h.states.at(-1),'timeout');assert.equal(h.timers.size,0);
  h.requests[0].ok(result());h.requests[0].fail({code:1});assert.equal(h.positions.length,0);assert.deepEqual(h.states,['locating','timeout']);
});
test('policy blocks, insecure contexts and unsupported WebViews are distinguished without a native request',()=>{
  for(const [overrides,state] of [[{document:{permissionsPolicy:{allowsFeature:()=>false}}},'blocked'],[{secure:false},'insecure'],[{navigator:{}},'unsupported']]){
    const h=harness(overrides);h.request();assert.deepEqual(h.states,[state]);assert.equal(h.requests.length,0);assert.equal(h.timers.size,0);
  }
});
test('synchronous host failures and explicit permission denial release the request',()=>{
  const h=harness({navigator:{geolocation:{getCurrentPosition(){throw Error('host unavailable');}}}});h.request();assert.deepEqual(h.states,['locating','unavailable']);assert.equal(h.timers.size,0);
  const denied=harness();denied.request();denied.requests[0].fail({code:1});assert.equal(denied.states.at(-1),'denied');assert.equal(denied.timers.size,0);
});
test('fresh accurate locations are requested once and retain their reported accuracy and provenance',()=>{
  const h=harness();h.request();assert.deepEqual(h.requests[0].options,{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  h.requests[0].ok(result());h.requests[0].ok(result(50.94));assert.equal(h.positions.length,1);
  assert.deepEqual(h.positions[0],{point:[50.93,6.95],accuracy:20,timestamp:now,source:'device'});assert.equal(h.timers.size,0);
});
test('old, future, invalid or impossible native locations cannot update the map',()=>{
  for(const r of [{...result(),timestamp:now-60000},{...result(),timestamp:now+60000},result(100),{coords:{...result().coords,accuracy:NaN},timestamp:now},null]){
    const h=harness();h.request();h.requests[0].ok(r);assert.equal(h.positions.length,0);assert.equal(h.states.at(-1),'unavailable');
  }
});
test('retry or manual selection invalidates an earlier native callback and its watchdog',()=>{
  const h=harness();h.request();h.request();assert.equal(h.timers.size,1);h.requests[0].ok(result());assert.equal(h.positions.length,0);
  h.cancel();h.requests[1].ok(result());assert.equal(h.positions.length,0);assert.equal(h.timers.size,0);
  h.request();h.requests[2].ok(result());assert.equal(h.positions.length,1);
});
