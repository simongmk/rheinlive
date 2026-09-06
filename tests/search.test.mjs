import test from 'node:test';
import assert from 'node:assert/strict';
import {cities} from '../lib/cities.mjs';
import {placeMatches,createPlaceSearch} from '../public/search.js';
const stop=(id,name)=>({type:'Feature',properties:{queryId:id,name},geometry:{type:'Point',coordinates:[6.95,50.93]}});
const station=stop('severin','Köln Severinstr.'),muelheim=stop('muelheim','Köln Mülheim Bf');
const catalog=[{key:'tram:13',line:'13',mode:'tram'},{key:'tram:3',line:'3',mode:'tram'},{key:'bus:3',line:'3',mode:'bus'},{key:'bus:106',line:'106',mode:'bus'}];
const context={city:cities.cologne,network:{stops:{features:[station,station,muelheim]}},catalog};
const search=query=>placeMatches({...context,query});
test('city navigation works before network loading and accepts common German spellings without inventing coverage',()=>{
  for(const [query,id]of [['Bonn','bonn'],['Düsseldorf','duesseldorf'],['Dusseldorf','duesseldorf'],['duesseldorf','duesseldorf'],['Koeln','cologne'],['Köln','cologne']])assert.equal(placeMatches({query,city:cities.cologne})[0].cityId,id);
  assert.deepEqual(placeMatches({query:'Berlin',city:cities.cologne}),[]);assert.deepEqual(search(''),[]);
});
test('single-digit lines rank exact matches first and keep bus/tram choices separate regardless of map filters',()=>{
  const result=search('3').filter(e=>e.kind==='line');assert.deepEqual(result.slice(0,2).map(e=>e.key),['tram:3','bus:3']);assert.ok(result.every(e=>e.cityId==='cologne'));
  assert.equal(search('Bus 106')[0].key,'bus:106');assert.equal(search('Linie 106')[0].key,'bus:106');
  assert.equal(search('3')[1].subtitle,'Bus · Köln');
});
test('stop search keeps the observed station ID, deduplicates platforms and handles umlauts',()=>{
  assert.equal(search('Severin').length,1);assert.equal(search('Severin')[0].station,station);assert.equal(search('Muelheim')[0].station,muelheim);
  assert.equal(search('Köln Mülheim')[0].station,muelheim);assert.equal(search('3').some(e=>e.kind==='station'),false);
});
class Node {
  constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.attributes={};this.dataset={};this.hidden=true;}
  setAttribute(k,v){this.attributes[k]=v;}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}
  querySelectorAll(tag){return this.children.filter(n=>n.tag===tag);}querySelector(tag){return this.querySelectorAll(tag)[0]??null;}focus(){this.focused=true;this.onfocus?.();}
}
function harness(initial=context){let current=initial;const input=new Node('input'),results=new Node(),chosen=[],document={createElement:tag=>new Node(tag)};const controller=createPlaceSearch({input,results,getContext:()=>current,onChoose:item=>chosen.push(item),document});return {input,results,chosen,controller,context:v=>current=v,type:v=>{input.value=v;input.oninput();}};}
const key=(node,key)=>{const event={key,preventDefault(){this.prevented=true;}};node.onkeydown(event);return event;};
test('one search offers city, line and station actions to keyboard and pointer users and clears after selection',()=>{
  const h=harness();h.type('Bonn');key(h.input,'Enter');assert.equal(h.chosen.at(-1).cityId,'bonn');assert.equal(h.input.value,'');assert.equal(h.results.hidden,true);
  h.type('106');key(h.input,'ArrowDown');const button=h.results.children[0];assert.equal(button.focused,true);button.onclick();assert.equal(h.chosen.at(-1).line.key,'bus:106');
  h.type('Severin');h.results.children[0].onclick();assert.equal(h.chosen.at(-1).station,station);assert.equal(h.input.attributes['aria-expanded'],'false');
});
test('search refresh retains focused results, updates after region loading, and Escape does not reopen them',()=>{
  const h=harness({city:cities.cologne});h.type('Severin');assert.match(h.results.children[0].textContent,/geladen/);
  h.context(context);h.controller.refresh();const first=h.results.children[0];first.focus();h.controller.refresh();assert.equal(h.results.children[0],first);
  key(first,'Escape');assert.equal(h.results.hidden,true);assert.equal(h.input.value,'');assert.equal(h.input.focused,true);
  h.type('3');const buttons=h.results.children;key(buttons[0],'ArrowDown');assert.equal(buttons[1].focused,true);key(buttons[0],'ArrowUp');assert.equal(h.input.focused,true);
  key(h.input,'Escape');h.context({...context,city:cities.bonn,network:null,catalog:[]});h.controller.refresh();assert.equal(h.results.hidden,true);
  h.type('Bonn');assert.equal(h.results.children[0].dataset.key,'city:bonn');
});
