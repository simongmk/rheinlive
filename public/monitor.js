import {cityAt,nearestStations,departureReadiness,navigationLinks} from '/lib/monitor.mjs';
import {distance} from '/lib/transit.mjs';
const $=s=>document.querySelector(s),el=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls;if(value!==undefined)n.textContent=value;return n;};
const time=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});
const minutes=(input,max)=>input.value.trim()!==''&&Number.isInteger(Number(input.value))&&Number(input.value)>=0&&Number(input.value)<=max?Number(input.value):null;
const countdown=s=>Math.floor(Math.max(0,s)/60)+':'+String(Math.max(0,s)%60).padStart(2,'0');
const pref=key=>{try{return localStorage.getItem('rheinlive:'+key);}catch{return null;}};
const save=(key,value)=>{try{localStorage.setItem('rheinlive:'+key,String(value));}catch{}};
export function createDepartureMonitor({onCity,onLocation,onStation,onExplore}){
  let cityId=null,network=null,location=null,station=null,board=null,boardOffset=0,active=true,boardLoading=false,boardController=null,walkController=null,walkRevision=0,geoRevision=0,near=[],walks=new Map(),walkMode='unknown',walkAt=0,cardKey='';
  const status=(id,value)=>{$('#'+id).textContent=value;};
  const stationId=()=>station?.properties.queryId;
  function setActive(value,load=true){active=value;$('.overview').classList.toggle('monitor-active',value);$('#monitor-view').hidden=!value;$('#explore-view').hidden=value;for(const [id,chosen] of [['departures',value],['map',!value]]){$('#view-'+id).setAttribute('aria-selected',String(chosen));$('#view-'+id).tabIndex=chosen?0:-1;}if(value){if(load)refresh();}else{boardController?.abort();boardLoading=false;onExplore();}}
  $('#view-departures').onclick=()=>setActive(true);$('#view-map').onclick=()=>setActive(false);
  for(const id of ['departures','map'])$('#view-'+id).onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setActive(id==='map');$('#view-'+(id==='map'?'departures':'map')).focus();}};
  function search(){const parent=$('#monitor-search-results'),q=$('#monitor-search').value.trim().toLocaleLowerCase('de');parent.replaceChildren();parent.hidden=q.length<2;if(q.length<2)return;const matches=(network?.stops.features??[]).filter(f=>f.properties.queryId&&f.properties.name.toLocaleLowerCase('de').includes(q)).slice(0,8);for(const f of matches){const b=el('button','stop-result',f.properties.name);b.onclick=()=>choose(f,true);parent.append(b);}if(!matches.length)parent.append(el('p','monitor-note',network?'Keine Haltestelle gefunden.':'Haltestellen werden geladen …'));}
  $('#monitor-search').oninput=search;
  function renderNear(){const p=$('#nearby-stops');p.replaceChildren();for(const item of near){const f=item.feature,w=walks.get(f.properties.queryId),b=el('button','nearby-stop');b.setAttribute('aria-pressed',String(stationId()===f.properties.queryId));b.append(el('strong','',f.properties.name),el('span','',Number.isFinite(w?.seconds)?Math.ceil(w.seconds/60)+' Min. zu Fuß':Math.round(item.meters)+' m Luftlinie'));b.onclick=()=>choose(f,true);p.append(b);}}
  function effectiveWalk(){return walkMode==='automatic'&&Date.now()-walkAt>300000?null:minutes($('#walk-minutes'),60);}
  function applyWalk(){
    const saved=pref('walk:'+stationId()),known=walks.get(stationId());
    if(saved!==null&&/^\d+$/.test(saved)&&Number(saved)<=60){$('#walk-minutes').value=saved;walkMode='manual';status('walk-status','Deine Gehzeit. Zugang zum Bahnsteig beim Puffer berücksichtigen.');}
    else if(Number.isFinite(known?.seconds)){const n=Math.ceil(known.seconds/60);$('#walk-minutes').value=String(n);walkMode='automatic';walkAt=location?.timestamp??Date.now();status('walk-status','Ca. '+n+' Min. über Fußwege'+(known.meters!=null?' · '+Math.round(known.meters)+' m':'')+'. Zugang zum Gleis kann länger dauern.');}
    else{$('#walk-minutes').value='';walkMode='unknown';status('walk-status',location?'Fußweg noch nicht verfügbar. Gehzeit selbst eintragen oder berechnen.':'Deine Gehzeit bis zur Haltestelle eintragen.');}
    $('.walk-config').open=walkMode==='unknown';$('#walk-recalculate').hidden=!location||cityAt(location.point)?.id!==cityId;cardKey='';renderBoard();
  }
  function choose(f,focus=false,requestWalk=true){
    if(!f?.properties.queryId)return;station=f;setActive(true,false);boardController?.abort();boardLoading=false;board=null;cardKey='';$('#monitor-search').value='';$('#monitor-search-results').hidden=true;$('#station-monitor').hidden=false;$('#monitor-empty').hidden=true;status('monitor-station-name',f.properties.name);$('#departure-direction').replaceChildren(el('option','','Alle Linien & Richtungen'));$('#departure-direction').firstChild.value='';
    const parent=$('#navigation-links');parent.replaceChildren();for(const link of navigationLinks({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]})){const a=el('a','',link.label+' ↗');a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}
    renderNear();applyWalk();onStation(f,focus);refresh();if(requestWalk&&location&&!walks.has(stationId()))calculateWalks(false);
  }
  $('#walk-minutes').oninput=()=>{const n=minutes($('#walk-minutes'),60);walkMode=n===null?'unknown':'manual';$('#walk-minutes').setAttribute('aria-invalid',String(n===null));if(n!==null)save('walk:'+stationId(),n);status('walk-status',n===null?'Gehzeit zwischen 0 und 60 Minuten eintragen.':'Deine Gehzeit. Der Puffer kommt zusätzlich dazu.');cardKey='';renderBoard();};
  const savedBuffer=pref('buffer');if(savedBuffer!==null&&/^\d+$/.test(savedBuffer)&&Number(savedBuffer)<=15)$('#buffer-minutes').value=savedBuffer;
  $('#buffer-minutes').oninput=()=>{const n=minutes($('#buffer-minutes'),15);$('#buffer-minutes').setAttribute('aria-invalid',String(n===null));if(n!==null)save('buffer',n);cardKey='';renderBoard();};
  $('#walk-recalculate').onclick=()=>{try{localStorage.removeItem('rheinlive:walk:'+stationId());}catch{}requestLocation(false);};
  $('#departure-direction').onchange=()=>{cardKey='';renderBoard();};$('#board-retry').onclick=()=>refresh(true);
  function updateDirections(){const select=$('#departure-direction'),before=select.value,groups=new Map();for(const e of board.departures)if(!groups.has(e.directionKey))groups.set(e.directionKey,e.line+' → '+e.headsign);select.replaceChildren(el('option','','Alle Linien & Richtungen'));select.firstChild.value='';for(const [key,label]of groups){const o=el('option','',label);o.value=key;select.append(o);}if(groups.has(before))select.value=before;}
  async function refresh(force=false){
    if(!active||document.hidden||!station||boardLoading||!force&&board&&Date.now()+boardOffset-board.fetchedAt<30000)return;
    boardController?.abort();const c=new AbortController();boardController=c;const id=stationId(),city=cityId;boardLoading=true;$('#board-retry').hidden=true;status('board-status','Abfahrtsprognosen werden geladen …');
    try{const r=await fetch('/api/departures?'+new URLSearchParams({city,stopId:id}),{signal:AbortSignal.any([c.signal,AbortSignal.timeout(20000)])});const data=await r.json();if(c.signal.aborted||id!==stationId()||city!==cityId)return;if(!r.ok||data.stale||data.stopId!==id||data.city!==city||!Array.isArray(data.departures)||!Number.isFinite(data.fetchedAt)||!Number.isFinite(data.serverTime))throw Error(data.error||'Abfahrten gerade nicht verfügbar.');board=data;boardOffset=data.serverTime-Date.now();updateDirections();cardKey='';renderBoard();}
    catch(e){if(c.signal.aborted)return;board=null;cardKey='';renderBoard();status('board-status',e.name==='TimeoutError'?'Abfahrten brauchen gerade zu lange.':e.message);$('#board-retry').hidden=false;}
    finally{if(boardController===c)boardLoading=false;}
  }
  function readiness(e){return departureReadiness(e,{now:Date.now()+boardOffset,fetchedAt:board?.fetchedAt,walkMinutes:effectiveWalk(),bufferMinutes:minutes($('#buffer-minutes'),15)});}
  const label=r=>({stale:'Prognose veraltet',cancelled:'Fällt aus','no-boarding':'Einstieg nicht möglich',departed:'Abfahrt vorbei',schedule:'Nur Fahrplan','no-walk':'Gehzeit prüfen',tight:'Puffer unterschritten',leave:'Jetzt bereitmachen',ready:'Bis zum Losgehen'}[r.state]);
  function renderBoard(){
    const walk=effectiveWalk(),buffer=minutes($('#buffer-minutes'),15);status('walk-summary',walk===null?'Gehzeit & Puffer einstellen':walk+' Min. Gehzeit + '+(buffer??'–')+' Min. Puffer');
    const parent=$('#departure-cards'),list=$('#departure-list');if(!station)return;
    if(!board){parent.replaceChildren();list.replaceChildren();cardKey='';return;}
    const now=Date.now()+boardOffset,stale=now-board.fetchedAt>120000,filter=$('#departure-direction').value;
    status('board-status',stale?'Prognosen veraltet – Countdown pausiert.':board.departures.filter(e=>e.realtime&&!e.cancelled&&e.departure>now).length+' Abfahrten mit Prognose · Abruf vor '+Math.max(0,Math.floor((now-board.fetchedAt)/1000))+' Sek.');
    $('#board-retry').hidden=!stale;
    if(walkMode==='automatic'&&Date.now()-walkAt>300000)status('walk-status','Standort älter als fünf Minuten. Neu bestimmen oder Gehzeit selbst eintragen.');
    const upcoming=board.departures.filter(e=>e.departure>now&&(!filter||e.directionKey===filter));
    const primary=[],directions=new Set();for(const e of upcoming){const r=readiness(e);if(['ready','leave'].includes(r.state)&&!directions.has(e.directionKey)){primary.push(e);directions.add(e.directionKey);if(primary.length===2)break;}}
    if(!primary.length)primary.push(...upcoming.filter(e=>!e.cancelled&&e.boarding).slice(0,2));
    const key=[board.fetchedAt,filter,effectiveWalk(),$('#buffer-minutes').value,stale,...primary.map(e=>e.id),...upcoming.map(e=>e.id)].join('|');
    if(key!==cardKey){cardKey=key;parent.replaceChildren();list.replaceChildren();
      for(const e of primary){const card=el('article','departure-card'),head=el('div','departure-head'),badge=el('span','departure-badge',e.line);badge.style.background=e.color;badge.style.color=e.textColor;head.append(badge,el('h3','',e.headsign));card.append(head,el('strong','leave-countdown','–'),el('p','leave-label',''),el('p','departure-meta','Abfahrt '+time.format(e.departure)+(e.realtime&&e.scheduledDeparture!=null&&e.departure!==e.scheduledDeparture?' · '+(e.departure>e.scheduledDeparture?'+':'')+Math.round((e.departure-e.scheduledDeparture)/60000)+' Min.':'')));card.dataset.event=e.id;const platform=e.stop.description||(e.stop.track?'Steig / Gleis '+e.stop.track:'');if(platform)card.append(el('p','departure-platform',platform));parent.append(card);}
      if(!primary.length)parent.append(el('p','monitor-note',upcoming.some(e=>e.cancelled)?'Die gemeldeten Fahrten fallen aus.':'Keine passenden Abfahrten gemeldet. Andere Richtung oder Haltestelle wählen.'));
      for(const e of upcoming){const row=el('div','departure-row'),badge=el('span','departure-badge',e.line);badge.style.background=e.color;badge.style.color=e.textColor;const body=el('span','departure-row-text',e.headsign),note=el('small','','');body.append(note);row.append(badge,body,el('time','',time.format(e.departure)));row.dataset.event=e.id;list.append(row);}
    }
    for(const card of parent.querySelectorAll('[data-event]')){const e=primary.find(e=>e.id===card.dataset.event),r=readiness(e);card.dataset.state=r.state;card.querySelector('.leave-countdown').textContent=['ready','leave'].includes(r.state)?countdown(r.seconds):r.state==='tight'?'Knapp':r.state==='schedule'?'◷':'–';card.querySelector('.leave-label').textContent=label(r);}
    for(const row of list.querySelectorAll('[data-event]')){const e=upcoming.find(e=>e.id===row.dataset.event),r=readiness(e);row.dataset.state=r.state;row.querySelector('small').textContent=['ready','leave'].includes(r.state)?'Los in '+countdown(r.seconds):label(r);}
  }
  async function calculateWalks(autoSelect){
    if(!location||!network||cityAt(location.point)?.id!==cityId)return;const point=[...location.point];near=nearestStations(network,point);renderNear();
    const targets=[...(station?[station]:[]),...near.map(n=>n.feature)].filter((f,i,a)=>a.findIndex(g=>g.properties.queryId===f.properties.queryId)===i).filter(f=>distance(point,[f.geometry.coordinates[1],f.geometry.coordinates[0]])<=4000).slice(0,6);
    if(!targets.length){status('location-status','Keine erfasste Haltestelle in drei Kilometern Nähe. Du kannst einen Halt suchen.');return;}
    if(location.accuracy>300){status('location-status','Standort nur auf ca. '+Math.round(location.accuracy)+' m genau. Bitte Halt wählen und Gehzeit prüfen.');if(autoSelect&&!station&&near[0])choose(near[0].feature,false,false);return;}
    walkController?.abort();const controller=new AbortController();walkController=controller;const rev=++walkRevision;status('walk-status','Fußwege werden berechnet …');
    try{const r=await fetch('/api/walk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city:cityId,origin:point,stopIds:targets.map(f=>f.properties.queryId)}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});const data=await r.json();if(rev!==walkRevision||controller.signal.aborted)return;if(!r.ok||!Array.isArray(data.walks))throw Error(data.error||'Gehzeit nicht verfügbar.');walks=new Map(data.walks.map(w=>[w.stopId,w]));renderNear();
      if(autoSelect&&!station){const best=near.filter(n=>Number.isFinite(walks.get(n.feature.properties.queryId)?.seconds)).sort((a,b)=>walks.get(a.feature.properties.queryId).seconds-walks.get(b.feature.properties.queryId).seconds)[0]??near[0];if(best)choose(best.feature);}
      else if(station)applyWalk();
    }catch(e){if(controller.signal.aborted)return;if(autoSelect&&!station&&near[0])choose(near[0].feature,false,false);status('walk-status','Fußweg nicht berechenbar. Gehzeit bitte selbst eintragen.');}
  }
  function requestLocation(focus=true){
    const seq=++geoRevision;$('#locate').disabled=true;$('#location-browser').hidden=true;status('location-status','Standort wird bestimmt. Bitte im Browser freigeben.');
    const fail=error=>{if(seq!==geoRevision)return;$('#locate').disabled=false;status('location-status',error?.code===1?'Standort nicht freigegeben. Browserfreigabe prüfen oder Halt suchen und Gehzeit eintragen.':'Standort gerade nicht verfügbar. Erneut versuchen oder Haltestelle suchen.');if(error?.code===1){$('#location-browser').href=window.location.origin;$('#location-browser').hidden=false;}};
    if(!navigator.geolocation){fail();return;}
    navigator.geolocation.getCurrentPosition(result=>{
      if(seq!==geoRevision)return;$('#locate').disabled=false;const p=result.coords,point=[p.latitude,p.longitude],region=cityAt(point);if(!point.every(Number.isFinite)||!Number.isFinite(p.accuracy)||p.accuracy<0||!Number.isFinite(result.timestamp)){fail();return;}location={point,accuracy:p.accuracy,timestamp:result.timestamp};walks.clear();if(walkMode==='automatic'){walkMode='unknown';$('#walk-minutes').value='';renderBoard();}status('location-status','Standort gefunden · Genauigkeit ca. '+Math.round(p.accuracy)+' m');
      if(!region){onLocation(location,focus);status('location-status','Hier gibt es noch keine Verkehrsdaten. Aktuell sind Köln, Bonn und Düsseldorf verfügbar.');return;}
      if(region.id!==cityId){onCity(region.id);}else if(network)calculateWalks(!station);onLocation(location,focus);
    },fail,{enableHighAccuracy:false,timeout:12000,maximumAge:30000});
  }
  $('#locate').onclick=()=>requestLocation(true);
  const timer=setInterval(()=>refresh(),30000),visibility=()=>{if(!document.hidden){renderBoard();refresh();}else{boardController?.abort();boardLoading=false;}};
  document.addEventListener('visibilitychange',visibility);addEventListener('pagehide',()=>{clearInterval(timer);boardController?.abort();walkController?.abort();geoRevision++;document.removeEventListener('visibilitychange',visibility);},{once:true});
  return {
    start:()=>requestLocation(true),tick:()=>{if(active&&!document.hidden)renderBoard();},getLocation:()=>location,getStation:()=>station,
    setCity:(id,{manual=false}={})=>{cityId=id;network=null;station=null;board=null;near=[];walks.clear();cardKey='';walkMode='unknown';boardController?.abort();walkController?.abort();walkRevision++;boardLoading=false;if(manual){geoRevision++;$('#locate').disabled=false;}$('#station-monitor').hidden=true;$('#monitor-empty').hidden=false;$('#nearby-stops').replaceChildren();$('#departure-cards').replaceChildren();$('#departure-list').replaceChildren();$('#monitor-search-results').hidden=true;$('#monitor-search').value='';},
    setNetwork:data=>{if(data.city!==cityId)return;network=data;search();if(location&&cityAt(location.point)?.id===cityId){calculateWalks(!station);}},
    choose,
  };
}
