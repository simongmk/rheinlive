import {cities,transportModes,MAX_SNAPSHOT_AGE_MS,pointInBounds} from '/lib/cities.mjs';
import {prepareTrips,vehiclesAt,vehicleView} from '/lib/transit.mjs';
import {createTransitMap} from '/map.js';
import {createDepartureMonitor} from '/monitor.js';
import {createVisibleTicker} from '/ui-clock.js';
import {platformForStop,platformText,freshDetail} from '/lib/journey-platform.mjs';
const $=s=>document.querySelector(s),text=(s,v)=>{const n=$(s),value=String(v);if(n.textContent!==value)n.textContent=value;};
const element=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
const icon=id=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-'+id);svg.append(use);return svg;};
const readPref=(key,fallback)=>{try{return localStorage.getItem('rheinlive:'+key)||fallback;}catch{return fallback;}};
const savePref=(key,value)=>{try{localStorage.setItem('rheinlive:'+key,value);}catch{}};
const preferredCity=readPref('city','cologne');
let city=Object.hasOwn(cities,preferredCity)?cities[preferredCity]:cities.cologne,map=null,snapshot=null,trips=[],network=null,catalog=[],visible=[],candidates=[],selected=null,detail=null,detailId=null,detailKey='',offset=0,revision=0,loading=false,requestController=null,detailController=null,networkController=null,following=false,listLimit=50,tab='lines',lastList=0,theme='dark';
const networkCache=new Map(),timings={started:performance.now(),firstVehicles:null,mapReady:null,networkMs:null,feedMs:null};
const activeModes=new Set(['tram','suburban','regional','long_distance']),hiddenLines=new Set(),cancelled=new Map();
const timeFormat=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hour12:false}),secondsFormat=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',second:'2-digit'}),dateFormat=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'short',day:'numeric',month:'short'});
const time=t=>Number.isFinite(t)?timeFormat.format(new Date(t)):'–';
const cleanName=s=>String(s||'').replace(/^(?:Köln|Koeln|Bonn)[, ]+/,'').replace(/^D-/,'');
let viewBounds=null;
let pendingLocationFocus=false;
const monitor=createDepartureMonitor({onCity:id=>changeCity(id,{fromLocation:true}),onLocation:(p,focus)=>{clearSelected();map?.setLocation(p);if(!p)pendingLocationFocus=false;else if(focus){pendingLocationFocus=!map;map?.centerLocation(p);}},onStation:(f,focus)=>{clearSelected();map?.setBoardStation(f);if(focus)map?.raw.flyTo({center:f.geometry.coordinates,zoom:15,pitch:0,duration:700});},onExplore:()=>clearSelected(),onPickLocation:active=>{map?.setLocationPicking(active);return Boolean(map);}});
const inView=v=>pointInBounds([v.lat,v.lon],city.bounds)&&(!viewBounds||viewBounds.contains([v.lat,v.lon]));
const isFresh=()=>snapshot&&!snapshot.stale&&Date.now()+offset-snapshot.fetchedAt<=MAX_SNAPSHOT_AGE_MS;
const filters=v=>activeModes.has(v.mode)&&!hiddenLines.has(v.lineKey);
function notify(title,body){text('#notice-title',title);text('#notice-body',body);$('#notice').hidden=false;}
function setFollowing(value){following=value;$('#follow').setAttribute('aria-pressed',String(value));$('#follow').replaceChildren(icon('target'),document.createTextNode(value?'Folgen aktiv':'Fahrt folgen'));}
function clearSelected(){selected=null;detail=null;detailId=null;detailKey='';detailController?.abort();$('#vehicle-detail').hidden=true;map?.select(null);setFollowing(false);}
$('#detail-close').onclick=clearSelected;
$('#journey-fold').addEventListener('toggle',()=>{if(!$('#journey-fold').open)return;const list=$('.journey-stops'),next=list?.querySelector('li:not(.passed)');if(next)list.scrollTop=Math.max(0,next.offsetTop-list.offsetTop-15);});
$('#follow').onclick=()=>{setFollowing(!following);const v=visible.find(v=>v.id===selected);if(following&&v)map?.follow(v);};
$('#panel-toggle').onclick=()=>{const open=$('#panel-toggle').getAttribute('aria-expanded')!=='true';$('#panel-toggle').setAttribute('aria-expanded',String(open));$('.overview').classList.toggle('expanded',open);};
function showInfo(){renderPerformance();$('#info-dialog').showModal();}
$('#info-open').onclick=showInfo;$('#quality-open').onclick=showInfo;$('#info-close').onclick=()=>$('#info-dialog').close();
$('#info-dialog').onclick=e=>{if(e.target===$('#info-dialog'))$('#info-dialog').close();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){monitor.cancelLocationPick();clearSelected();}});
$('#map-retry').onclick=()=>location.reload();
function renderModes(){
  const all=isFresh()?vehiclesAt(trips,Date.now()+offset,snapshot.fetchedAt).filter(inView):[];
  $('#modes').replaceChildren();
  for(const mode of transportModes){
    const b=element('button','mode-button');b.style.setProperty('--mode-color',mode.color);b.setAttribute('aria-pressed',String(activeModes.has(mode.id)));b.setAttribute('aria-label',`${mode.name} anzeigen`);
    const count=all.filter(v=>v.mode===mode.id&&v.quality==='realtime'&&!cancelled.has(v.id)).length;
    b.append(element('span','mode-dot'),element('span','',mode.name),element('span','mode-count',count));
    b.onclick=()=>{activeModes.has(mode.id)?activeModes.delete(mode.id):activeModes.add(mode.id);renderModes();renderLines();draw(true);syncNetworkFilter();};$('#modes').append(b);
  }
}
function updateCatalog(){
  // Timetable network numbers are not individual long-distance train numbers.
  const lines=new Map((network?.catalog||[]).filter(l=>l.mode!=='long_distance').map(l=>[l.key,l]));
  for(const trip of trips)lines.set(trip.lineKey,{key:trip.lineKey,line:trip.line,mode:trip.mode,color:trip.color});
  catalog=[...lines.values()].sort((a,b)=>transportModes.findIndex(m=>m.id===a.mode)-transportModes.findIndex(m=>m.id===b.mode)||a.line.localeCompare(b.line,'de',{numeric:true}));renderLines();syncNetworkFilter();
}
function renderLines(){
  const query=$('#search').value.trim().toLocaleLowerCase('de'),lines=catalog.filter(l=>activeModes.has(l.mode)&&(!query||l.line.toLocaleLowerCase('de').includes(query)));
  text('#line-count',`${lines.length} Linien`);$('#lines').replaceChildren();$('#lines-empty').hidden=lines.length>0;
  for(const line of lines){const b=element('button','line-filter'+(line.line.length>4?' long-label':''),line.line);b.style.setProperty('--line-color',line.color);b.setAttribute('aria-pressed',String(!hiddenLines.has(line.key)));const mode=transportModes.find(m=>m.id===line.mode);b.setAttribute('aria-label',`${mode.name} ${line.line} anzeigen`);b.title=mode.name+' '+line.line;b.onclick=()=>{hiddenLines.has(line.key)?hiddenLines.delete(line.key):hiddenLines.add(line.key);b.setAttribute('aria-pressed',String(!hiddenLines.has(line.key)));draw(true);syncNetworkFilter();};$('#lines').append(b);}
  renderStopSearch(query);
}
function renderStopSearch(query){
  const results=$('#stop-results');results.replaceChildren();results.hidden=true;if(query.length<2||!network)return;
  const found=new Map();for(const f of network.stops.features){if(!f.properties.name.toLocaleLowerCase('de').includes(query))continue;const p=f.geometry.coordinates,key=f.properties.name+':'+p.map(n=>n.toFixed(3)).join(',');if(!found.has(key))found.set(key,f);if(found.size>=6)break;}
  for(const f of found.values()){const b=element('button','stop-result');b.append(icon('pin'),document.createTextNode(f.properties.name));b.onclick=()=>{monitor.choose(f,true);if(innerWidth<=760){$('.overview').classList.remove('expanded');$('#panel-toggle').setAttribute('aria-expanded','false');}setFollowing(false);};results.append(b);}results.hidden=found.size===0;
}
$('#search').addEventListener('input',()=>{renderLines();renderVehicleList();});
$('#all-lines').onclick=()=>{hiddenLines.clear();renderLines();draw(true);syncNetworkFilter();};
$('#include-schedule').onchange=()=>draw(true);
function syncNetworkFilter(){map?.setFilter([...activeModes],hiddenLines.size?catalog.filter(l=>activeModes.has(l.mode)&&!hiddenLines.has(l.key)).map(l=>l.key):null);loadBusPart(revision);}
function switchTab(next){tab=next;for(const id of ['lines','vehicles']){$('#tab-'+id).setAttribute('aria-selected',String(next===id));$('#tab-'+id).tabIndex=next===id?0:-1;$('#'+id+'-panel').hidden=next!==id;}if(next==='vehicles')renderVehicleList();}
for(const id of ['lines','vehicles']){$('#tab-'+id).onclick=()=>switchTab(id);$('#tab-'+id).onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=id==='lines'?'vehicles':'lines';switchTab(next);$('#tab-'+next).focus();}};}
$('#more-vehicles').onclick=()=>{listLimit+=50;renderVehicleList();};
function renderVehicleList(){
  const query=$('#search').value.trim().toLocaleLowerCase('de');const list=visible.filter(inView).filter(v=>!query||`${v.line} ${v.segment.from.name} ${v.segment.to.name}`.toLocaleLowerCase('de').includes(query)).sort((a,b)=>a.line.localeCompare(b.line,'de',{numeric:true})||a.segment.arrival-b.segment.arrival);
  const parent=$('#vehicle-list');parent.replaceChildren();if(!list.length)parent.append(element('p','empty',isFresh()?'Keine passenden Fahrten. Prüfe Filter und Kartenausschnitt.':'Warte auf aktuelle Fahrtdaten.'));
  for(const v of list.slice(0,listLimit)){const b=element('button','vehicle-row');const badge=element('span','vehicle-badge',v.line);badge.style.setProperty('--line-color',v.color);badge.style.setProperty('--line-text',v.textColor);const label=element('span','row-label',cleanName(v.segment.to.name));label.append(element('small','',transportModes.find(m=>m.id===v.mode)?.name+' · '+(v.quality==='realtime'?'mit Prognose':'nur Fahrplan')));b.append(badge,label);const delay=delayMinutes(v);if(v.quality==='realtime'&&delay>0)b.append(element('span','row-delay','+'+delay+'′'));b.onclick=()=>{showDetails(v);map?.raw.easeTo({center:[v.lon,v.lat],zoom:Math.max(13,map.raw.getZoom()),duration:600});};parent.append(b);}$('#more-vehicles').hidden=list.length<=listLimit;
}
function updateCount(){
  text('#vehicle-count',visible.filter(inView).length);
  if(!isFresh())return;
  const count=vehicleView(candidates.filter(inView));
  text('#feed-status',count.realtime?`${count.realtime} mit Prognose`:count.total?'Nur Fahrplan':'Keine Fahrten');
  text('#header-status',count.realtime?'Prognosen aktiv':'Keine Prognosen');$('#status-dot').classList.toggle('live',count.realtime>0);
  text('#coverage-info',`${count.realtime} mit Prognose · ${count.schedule} nur Fahrplan${$('#include-schedule').checked?'': ' (ausgeblendet)'}`);
}
const delayMinutes=v=>v.segment.scheduledArrival===null?null:Math.round((v.segment.arrival-v.segment.scheduledArrival)/60000);
const selectionKey=v=>[v.id,v.segment.key,v.segment.arrival,v.segment.observedAt,v.quality,v.state,v.dwell?.arrival,v.dwell?.departure,v.dwell?.kind,v.segment.from.track,v.segment.to.track].join('|');
const duration=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return s<60?s+' Sek.':Math.floor(s/60)+' Min.'+(s%60?' '+s%60+' Sek.':'');};
function updateDwell(v){const node=$('#dwell-remaining');if(node&&v.dwell)node.textContent='Ⅱ Abfahrt in '+duration(v.dwell.departure-Date.now()-offset);}
function renderPlatforms(v){
  const context={detail,detailId,now:Date.now()+offset,fetchedAt:snapshot?.fetchedAt};
  const stops={from:platformForStop(v,'from',context),to:platformForStop(v,'to',context)};
  const main=platformText(stops[v.state==='stopped'?'from':'to'],v.mode,{unknown:true}),node=$('#detail-platform');
  if(node){node.className='detail-platform'+(main.changed?' changed':'')+(main.unknown?' unavailable':'');node.replaceChildren(element('strong','',main.label));if(main.note)node.append(element('span','',main.note));}
  for(const side of ['from','to']){const row=$('#platform-'+side);if(!row)continue;const p=platformText(stops[side],v.mode);row.textContent=[p.label,p.note].filter(Boolean).join(' · ');row.classList.toggle('changed',p.changed);row.hidden=!p.label;}
}
function showDetails(v,{reload=true}={}){
  const changed=selected!==v.id;if(changed){detail=null;detailId=null;$('#journey-fold').open=false;$('#trip-alert').hidden=true;setFollowing(false);$('#follow').disabled=false;}
  selected=v.id;detailKey=selectionKey(v);$('#vehicle-detail').hidden=false;
  const parent=$('#detail-content');parent.replaceChildren();const badge=element('span','detail-line',v.line);badge.style.setProperty('--line-color',v.color);badge.style.setProperty('--line-text',v.textColor);
  const platform=element('div','detail-platform');platform.id='detail-platform';platform.setAttribute('role','status');
  const quality=element('button','detail-quality'+(v.quality==='schedule'?' planned':''),v.quality==='realtime'?'≈ Geschätzt':'◷ Fahrplan');quality.onclick=showInfo;quality.setAttribute('aria-label',v.quality==='realtime'?'Position aus Prognosen geschätzt. Dateninfo öffnen':'Position nach Fahrplan. Dateninfo öffnen');
  parent.append(badge,element('span','detail-type',transportModes.find(m=>m.id===v.mode)?.name),element('p','detail-direction',v.state==='stopped'?'AM HALT':'NÄCHSTER HALT'),element('h2','',cleanName(v.state==='stopped'?v.segment.from.name:v.segment.to.name)),platform,quality);
  const rows=element('div','stop-progress'),times=v.dwell?[[v.dwell.kind==='estimated'?'Ankunft ≈':'Ankunft',v.dwell.arrival,'previous'],['Abfahrt',v.dwell.departure,'next']]:[[cleanName(v.segment.from.name),v.segment.departure,'previous'],[cleanName(v.segment.to.name),v.segment.arrival,'next']];
  for(const [label,ts,cls]of times){const row=element('div','stop-row '+cls),labelNode=element('span','stop-label',label);if(!v.dwell){const p=element('small','stop-platform');p.id='platform-'+(cls==='previous'?'from':'to');labelNode.append(p);}row.append(labelNode,element('time','',time(ts)));rows.append(row);}parent.append(rows);renderPlatforms(v);
  if(v.dwell){const remaining=element('p','dwell-status');remaining.id='dwell-remaining';parent.append(remaining);updateDwell(v);if(v.dwell.kind==='estimated')parent.append(element('span','dwell-estimate','≈ Halt geschätzt'));}
  const delay=delayMinutes(v);if(v.quality==='realtime'&&delay!==null)parent.append(element('p','delay'+(delay>0?' is-late':''),delay>0?`+${delay} Min.`:delay<0?`${delay} Min.`:'Pünktlich'));
  if(v.segment.geometry!=='shape'){const note=element('button','geometry-note','≈ Direkte Verbindung');note.title='Streckenform fehlt. Dateninfo öffnen';note.onclick=showInfo;parent.append(note);}

  selectPath(v);if(changed||reload&&!detail)loadDetail(v);else if(detail)renderJourney();
}
function selectPath(v){
  const full=detailId===v.id&&freshDetail(detail,Date.now()+offset);
  const geo=full&&detail.paths.length?{type:'FeatureCollection',features:detail.paths.map(path=>({type:'Feature',geometry:{type:'LineString',coordinates:path.map(([lat,lon])=>[lon,lat])},properties:{color:v.color}}))}:undefined;
  map?.select(v,geo);
}
async function loadDetail(v){
  detailController?.abort();const controller=new AbortController();detailController=controller;const rev=revision,id=v.id;const parent=$('#journey-detail');if(!detail||detailId!==id||!freshDetail(detail,Date.now()+offset))parent.replaceChildren(element('p','','Fahrtverlauf wird geladen …'));
  try{const r=await fetch(`/api/trip?city=${city.id}&id=${encodeURIComponent(id)}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});const data=await r.json();if(rev!==revision||selected!==id||controller.signal.aborted)return;if(!r.ok)throw Error(data.error||'Fahrtverlauf nicht erreichbar');detail=data;detailId=id;if(data.cancelled)cancelled.set(id,Date.now());renderJourney();const current=visible.find(x=>x.id===id)||v;renderPlatforms(current);selectPath(current);if(data.cancelled){map?.update(visible.filter(x=>x.id!==id),undefined,undefined,{discard:[id]});$('#follow').disabled=true;}else $('#follow').disabled=false;
  }catch(e){if(controller.signal.aborted||rev!==revision||selected!==id)return;detail=null;detailId=null;$('#trip-alert').hidden=true;text('#journey-summary','Fahrtverlauf');const current=visible.find(x=>x.id===id)||v;renderPlatforms(current);selectPath(current);parent.replaceChildren(element('p','',e.name==='TimeoutError'?'Der Fahrtverlauf braucht gerade zu lange.':e.message));const retry=element('button','text-button','Verlauf erneut laden');retry.onclick=()=>loadDetail(v);parent.append(retry);}
}
function renderJourney(){
  if(!detail)return;const parent=$('#journey-detail'),previous=parent.querySelector('.journey-stops'),scroll=previous?.dataset.trip===selected?previous.scrollTop:null;parent.replaceChildren();const notice=$('#trip-alert');notice.hidden=!detail.cancelled&&!detail.alerts.length;notice.textContent=detail.cancelled?'Fahrt entfällt':detail.alerts[0]?.title||'Hinweis zu dieser Fahrt';text('#journey-summary','Fahrtverlauf'+(detail.alerts.length?' · '+detail.alerts.length+' Hinweise':''));
  parent.append(element('h3','',detail.cancelled?'Fahrt entfällt':'Richtung '+cleanName(detail.headsign)),element('p','operator',detail.agency||'Betreiber nicht mitgeliefert'));
  for(const a of detail.alerts){parent.append(element('div','journey-alert',[a.title,a.body].filter(Boolean).join('\n')));}
  const now=Date.now()+offset,list=element('ol','journey-stops');list.dataset.trip=selected;
  for(const stop of detail.stops){const ts=stop.departure??stop.arrival,scheduled=stop.scheduledDeparture??stop.scheduledArrival,li=element('li',(ts<now?'passed ':'')+(stop.cancelled?'cancelled':'')),label=element('span','',cleanName(stop.name));li.append(element('time','',time(ts)),label);const notes=[];if(stop.cancelled)notes.push('Halt entfällt');const p=platformText({...stop,plannedOnly:!detail.realtime},visible.find(v=>v.id===selected)?.mode);if(!stop.cancelled&&p.label)notes.push([p.label,p.note].filter(Boolean).join(' · '));if(detail.realtime&&Number.isFinite(ts)&&Number.isFinite(scheduled)&&ts-scheduled>=60000)notes.push('+'+Math.round((ts-scheduled)/60000)+' Min.');if(notes.length)label.append(element('small','',notes.join(' · ')));list.append(li);}parent.append(list);
  const target=[...list.children].find(li=>!li.classList.contains('passed'));list.scrollTop=scroll??(target?Math.max(0,target.offsetTop-list.offsetTop-15):0);
  parent.append(element('p','operator',(detail.realtime?'Mit Prognosen':'Nach Fahrplan')+' · Verlauf zuletzt '+time(detail.fetchedAt)));
}
function draw(forceList=false){
  viewBounds=map?.getBounds()??null;
  const now=Date.now()+offset;for(const[id,ts]of cancelled)if(Date.now()-ts>120000)cancelled.delete(id);
  candidates=isFresh()?vehiclesAt(trips,now,snapshot.fetchedAt).filter(v=>filters(v)&&pointInBounds([v.lat,v.lon],city.bounds)&&!cancelled.has(v.id)):[];
  visible=vehicleView(candidates,{includeSchedule:$('#include-schedule').checked}).visible;map?.update(visible,snapshot?.fetchedAt,now,{immediate:!isFresh()});
  if(selected){const v=visible.find(v=>v.id===selected);if(!v&&!cancelled.has(selected))clearSelected();else if(v){if(detailKey!==selectionKey(v))showDetails(v,{reload:false});updateDwell(v);if(following)map?.follow(v);}}
  updateCount();if(tab==='vehicles'&&(forceList||Date.now()-lastList>10000)){lastList=Date.now();renderVehicleList();}
  if(snapshot&&!isFresh()){
    text('#feed-status','Daten veraltet · Positionen ausgeblendet');text('#header-status','Daten veraltet');$('#status-dot').classList.remove('live');text('#coverage-info','Warte auf aktuelle Fahrtdaten.');notify('Warte auf aktuelle Fahrtdaten','Die letzten Positionen sind zu alt. Wir verbinden uns automatisch erneut.');
  }
  if(detail&&!freshDetail(detail,now)){detail=null;detailId=null;$('#trip-alert').hidden=true;$('#journey-detail').replaceChildren(element('p','','Fahrtverlauf veraltet. Wird beim nächsten Datenabruf erneuert.'));const v=visible.find(v=>v.id===selected);if(v){renderPlatforms(v);selectPath(v);}}
}
async function refresh(){
  if(loading||document.hidden)return;loading=true;const rev=revision,started=performance.now();requestController=new AbortController();const controller=requestController;$('#retry').disabled=true;
  try{const r=await fetch('/api/vehicles?city='+city.id,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)])});const result=await r.json();if(rev!==revision||controller.signal.aborted)return;if(!r.ok||result.stale)throw Error(result.error||'Datenquelle nicht erreichbar');if(result.city!==city.id||!Array.isArray(result.trips)||!Number.isFinite(result.fetchedAt)||!Number.isFinite(result.serverTime))throw Error('Fahrtdaten sind nicht lesbar');timings.feedMs=performance.now()-started;offset=result.serverTime-Date.now();snapshot=result;trips=prepareTrips(result.trips);$('#notice').hidden=true;updateCatalog();draw(true);renderModes();text('#dataset-info','Verkehr: '+city.region+'. Letzter erfolgreicher Abruf: '+new Date(result.fetchedAt).toLocaleString('de-DE',{timeZone:city.timezone})+'. Quelle: Transitous / MOTIS.');if(!trips.length)notify('Gerade keine Fahrten gemeldet','Das kann eine Datenlücke oder eine Betriebspause sein.');const v=visible.find(v=>v.id===selected);if(v)loadDetail(v);
  }catch(e){if(rev!==revision||controller.signal.aborted)return;snapshot=null;trips=[];clearSelected();draw(true);renderModes();text('#header-status','Verbindung fehlt');text('#feed-status','Verkehrsdaten nicht erreichbar');text('#coverage-info','Keine aktuellen Positionen verfügbar.');$('#status-dot').classList.remove('live');notify('Die Verbindung fehlt gerade',e.name==='TimeoutError'?'Die Datenquelle braucht zu lange. Der nächste Versuch erfolgt automatisch.':e.message);
  }finally{if(rev===revision){loading=false;$('#retry').disabled=false;}}
}
function applyNetwork(){
  if(!network)return;const bus=networkCache.get(city.id)?.bus;
  map?.setNetwork({...network,lines:bus?{type:'FeatureCollection',features:[...network.lines.features,...bus.lines.features]}:network.lines});
}
async function loadBusPart(rev){
  const id=city.id,record=networkCache.get(id);if(!network||!record||!activeModes.has('bus')||record.bus||record.pending)return;
  const controller=networkController;record.pending=true;
  try{const r=await fetch(network.parts.bus,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});if(!r.ok)throw Error('Busnetz fehlt');const data=await r.json();if(rev!==revision||controller.signal.aborted)return;if(data.city!==id||!Array.isArray(data.lines?.features))throw Error('Busnetz nicht lesbar');record.bus=data;applyNetwork();text('#network-age','Netzstand '+new Date(network.generatedAt).toLocaleDateString('de-DE'));}
  catch{if(rev===revision&&!controller.signal.aborted)text('#network-age','Busnetz fehlt gerade · Fahrten bleiben verfügbar');}
  finally{record.pending=false;}
}
async function loadNetwork(rev){
  networkController?.abort();const controller=new AbortController();networkController=controller;text('#network-age','Liniennetz wird geladen …');const id=city.id,started=performance.now();
  try{let record=networkCache.get(id);if(!record){const r=await fetch('/data/network-'+id+'.json?v=7',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});if(!r.ok)throw Error('Netz nicht erreichbar');const data=await r.json();if(data.city!==id)throw Error('Falsches Netz');record={data,bus:null,pending:false};}
    if(rev!==revision||controller.signal.aborted)return;networkCache.delete(id);networkCache.set(id,record);if(networkCache.size>2)networkCache.delete(networkCache.keys().next().value);
    network=record.data;timings.networkMs=performance.now()-started;applyNetwork();updateCatalog();monitor.setNetwork(network);text('#network-age','Netzstand '+new Date(network.generatedAt).toLocaleDateString('de-DE'));loadBusPart(rev);
  }catch{if(rev!==revision||controller.signal.aborted)return;text('#network-age','Liniennetz nicht erreichbar');}
}
function renderPerformance(){
  const stats=map?.performance(),seconds=n=>n===null?'noch nicht verfügbar':(n/1000).toFixed(2)+' s';
  text('#perf-first',seconds(stats?.firstFrameAt!=null?stats.firstFrameAt-timings.started:null));text('#perf-map',seconds(timings.mapReady));text('#perf-network',seconds(timings.networkMs));text('#perf-feed',seconds(timings.feedMs));
  text('#perf-frames',stats?stats.observedFps+' B/s · Ziel '+stats.targetFps+' B/s':'noch nicht verfügbar');text('#perf-draw',stats?stats.drawMs+' ms':'–');
  const entries=performance.getEntriesByType('resource').filter(e=>e.name.startsWith(location.origin+'/data/network-'));
  text('#perf-transfer',entries.length||stats?.railTransferBytes?((entries.reduce((n,e)=>n+e.transferSize,0)+(stats?.railTransferBytes||0))/1024).toFixed(0)+' KB':'noch nicht verfügbar');
}
function changeCity(id,{fromLocation=false}={}){
  monitor.setCity(id,{manual:!fromLocation});if(!fromLocation)pendingLocationFocus=false;map?.setBoardStation(null);
  if(!Object.hasOwn(cities,id))return;revision++;city=cities[id];savePref('city',id);$('#city-select').value=id;requestController?.abort();loading=false;clearSelected();snapshot=null;trips=[];network=null;catalog=[];hiddenLines.clear();cancelled.clear();$('#search').value='';map?.setNetwork({lines:{type:'FeatureCollection',features:[]},stops:{type:'FeatureCollection',features:[]}});map?.fitBounds(city.bounds);map?.update([]);text('#region-label',city.region.toLocaleUpperCase('de'));text('#feed-status','Aktuelle Fahrten werden geladen …');text('#header-status','Verbinden');text('#coverage-info','Warte auf aktuelle Prognosen.');text('#refresh-label','');text('#vehicle-count','–');$('#notice').hidden=true;$('#status-dot').classList.remove('live');renderModes();renderLines();renderVehicleList();loadNetwork(revision);refresh();
}
$('#city-select').onchange=e=>changeCity(e.target.value);
$('#retry').onclick=refresh;
$('#recenter').onclick=()=>{setFollowing(false);monitor.locate();};$('#zoom-in').onclick=()=>map?.zoomIn();$('#zoom-out').onclick=()=>map?.zoomOut();
$('#tilt').onclick=()=>{const next=$('#tilt').getAttribute('aria-pressed')!=='true';$('#tilt').setAttribute('aria-pressed',String(next));map?.setTilt(next);};
$('#network-toggle').onclick=()=>{const next=$('#network-toggle').getAttribute('aria-pressed')!=='true';$('#network-toggle').setAttribute('aria-pressed',String(next));map?.showNetwork(next);};
async function setTheme(next){
  if(!map)return;$('#theme-dark').disabled=true;$('#theme-light').disabled=true;
  try{await map.setTheme(next);theme=next;document.documentElement.dataset.theme=next;document.querySelector('meta[name="theme-color"]').content=next==='dark'?'#0c1926':'#eaf0f3';savePref('theme',next);for(const id of ['dark','light'])$('#theme-'+id).setAttribute('aria-pressed',String(next===id));}
  catch{notify('Kartenstil nicht erreichbar','Die aktuelle Ansicht bleibt erhalten. Versuche es später erneut.');}
  finally{$('#theme-dark').disabled=false;$('#theme-light').disabled=false;}
}
$('#theme-dark').onclick=()=>setTheme('dark');$('#theme-light').onclick=()=>setTheme('light');
async function init(){
  $('#city-select').replaceChildren(...Object.values(cities).map(c=>{const option=element('option','',c.name);option.value=c.id;return option;}));
  changeCity(city.id,{fromLocation:true});monitor.start();const pref=readPref('theme','dark')==='light'?'light':'dark';theme=pref;document.documentElement.dataset.theme=pref;for(const id of ['dark','light'])$('#theme-'+id).setAttribute('aria-pressed',String(pref===id));
  try{map=await createTransitMap(city,{theme:pref,onStation:f=>monitor.choose(f,false),onPickLocation:point=>monitor.setManualLocation(point),onSelect:id=>{const v=visible.find(v=>v.id===id);if(v)showDetails(v);},onMove:()=>{viewBounds=map?.getBounds()??null;updateCount();renderModes();if(tab==='vehicles')renderVehicleList();},onClear:clearSelected,onRailDetail:({active})=>{$('#track-legend').hidden=!active;},onError:message=>{text('#map-error-text',message);$('#map-error').hidden=false;}});map.raw.once('idle',()=>{timings.mapReady=performance.now()-timings.started;});map.raw.on('idle',()=>{$('#map-error').hidden=true;});map.raw.on('dragstart',()=>setFollowing(false));map.raw.on('zoomstart',e=>{if(e.originalEvent)setFollowing(false);});if(network)applyNetwork();syncNetworkFilter();map.fitBounds(city.bounds);map.setBoardStation(monitor.getStation());const position=monitor.getLocation();if(position){map.setLocation(position);if(pendingLocationFocus)map.centerLocation(position);}draw(true);}
  catch(e){text('#map-error-text',e.message+' Eine WebGL-fähige Browseransicht wird benötigt.');$('#map-error').hidden=false;}
}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',init,{once:true});else init();
function tick(){const now=Date.now()+offset;text('#clock',time(now));text('#clock-seconds',secondsFormat.format(new Date(now)).padStart(2,'0'));text('#date',dateFormat.format(new Date(now)));if(isFresh())text('#refresh-label',`Abruf vor ${Math.max(0,Math.floor((now-snapshot.fetchedAt)/1000))} Sek. · Update alle 30 Sek.`);draw();monitor.tick();if($('#info-dialog').open)renderPerformance();}
createVisibleTicker(tick);setInterval(refresh,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});addEventListener('online',refresh);
// Optional WebMCP. The same state transitions serve clicks and agent requests.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController(),register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_visible_trains',title:'Sichtbare Verkehrsfahrten lesen',description:'Liest sichtbare Bus- und Bahnfahrten; Positionen sind Schätzungen, keine GPS-Messungen.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){return{city:city.name,fetchedAt:snapshot?.fetchedAt??null,positionType:'estimated',trains:visible.filter(inView).map(v=>({id:v.id,line:v.line,lineKey:v.lineKey,mode:v.mode,nextStop:v.segment.to.name,quality:v.quality,latitude:v.lat,longitude:v.lon}))};}});
  register({name:'set_visible_lines',title:'Linien auf der Karte auswählen',description:'Wählt Linien anhand mode:Linie-Schlüsseln aus der sichtbaren Datenquelle; eine leere Liste blendet alle aus.',inputSchema:{type:'object',properties:{lines:{type:'array',items:{type:'string'},uniqueItems:true}},required:['lines'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='lines')||!Array.isArray(input.lines)||input.lines.some(k=>!catalog.some(l=>l.key===k)))throw Error('Unbekannte Linienauswahl');hiddenLines.clear();for(const l of catalog)if(!input.lines.includes(l.key))hiddenLines.add(l.key);for(const key of input.lines)activeModes.add(catalog.find(l=>l.key===key).mode);renderModes();renderLines();syncNetworkFilter();draw(true);return{lines:input.lines,city:city.id,visible:visible.filter(inView).length};}});
  addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
