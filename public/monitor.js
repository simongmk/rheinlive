import {platformText} from '../lib/journey-platform.mjs';
import {cityAt,nearestStations,departureReadiness,navigationLinks,stationLineOptions,selectMonitorDepartures} from '../lib/monitor.mjs';
import {transportModes} from '../lib/cities.mjs';
import {distance,validPoint} from '../lib/transit.mjs';
import {createLocationRequest,locationMessages} from './location.js';
const $=s=>document.querySelector(s),el=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls;if(value!==undefined)n.textContent=value;return n;};
const time=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});
const minutes=(input,max)=>input.value.trim()!==''&&Number.isInteger(Number(input.value))&&Number(input.value)>=0&&Number(input.value)<=max?Number(input.value):null;
const countdown=s=>Math.floor(Math.max(0,s)/60)+':'+String(Math.max(0,s)%60).padStart(2,'0');
const pref=key=>{try{return localStorage.getItem('rheinlive:'+key);}catch{return null;}};
const save=(key,value)=>{try{localStorage.setItem('rheinlive:'+key,String(value));}catch{}};
export function createDepartureMonitor({onCity,onLocation,onStation,onExplore,onPickLocation=()=>false}){
  let cityId=null,network=null,location=null,station=null,board=null,boardOffset=0,active=true,boardLoading=false,boardController=null,walkController=null,walkRevision=0,near=[],walks=new Map(),walkMode='unknown',walkAt=0,cardKey='';
  const status=(id,value)=>{$('#'+id).textContent=value;};
  let locating=false,pickingLocation=false,locateFocus=true;
  const stationId=()=>station?.properties.queryId;
  let selectedLines=null,lineOptionsKey='';
  const linePreference=()=>'monitor-lines:'+cityId+':'+stationId();
  function restoreLines(){selectedLines=null;try{const value=JSON.parse(pref(linePreference()));if(Array.isArray(value)&&value.length<=200&&value.every(k=>typeof k==='string'&&k.length<=80))selectedLines=new Set(value);}catch{}lineOptionsKey='';updateLineFilters();}
  function updateLineFilters(){
    const options=stationLineOptions(station,board?.departures??[],network?.catalog??[]),parent=$('#departure-lines');
    const key=JSON.stringify(options);parent.hidden=!options.length;
    if(key!==lineOptionsKey){lineOptionsKey=key;parent.replaceChildren();
      const all=el('button','departure-line','Alle');all.dataset.line='';all.onclick=()=>changeLines(null);parent.append(all);
      for(const option of options){const b=el('button','departure-line'),sameName=options.filter(o=>o.line===option.line).length>1,mode=transportModes.find(m=>m.id===option.mode)?.name??option.mode;
        b.dataset.line=option.key;b.setAttribute('aria-label',mode+' '+option.line);b.title=mode+' '+option.line;
        const dot=el('span','line-swatch');dot.style.background=option.color;dot.setAttribute('aria-hidden','true');b.append(dot,el('span','',sameName?mode+' '+option.line:option.line));
        b.onclick=()=>{const next=new Set(selectedLines??[]);if(next.has(option.key))next.delete(option.key);else next.add(option.key);changeLines(next);};parent.append(b);
      }
    }
    for(const b of parent.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.line?Boolean(selectedLines?.has(b.dataset.line)):selectedLines===null));
  }
  function changeLines(next){selectedLines=next;save(linePreference(),JSON.stringify(next===null?null:[...next]));updateLineFilters();updateDirections();cardKey='';renderBoard();}
  function setActive(value,load=true){active=value;$('.overview').classList.toggle('monitor-active',value);$('#monitor-view').hidden=!value;$('#explore-view').hidden=value;for(const [id,chosen] of [['departures',value],['map',!value]]){$('#view-'+id).setAttribute('aria-selected',String(chosen));$('#view-'+id).tabIndex=chosen?0:-1;}if(value){if(load)refresh();}else{boardController?.abort();boardLoading=false;onExplore();}}
  $('#view-departures').onclick=()=>setActive(true);$('#view-map').onclick=()=>setActive(false);
  for(const id of ['departures','map'])$('#view-'+id).onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setActive(id==='map');$('#view-'+(id==='map'?'departures':'map')).focus();}};
  function renderNear(){const p=$('#nearby-stops');p.replaceChildren();for(const item of near){const f=item.feature,w=walks.get(f.properties.queryId),b=el('button','nearby-stop');b.setAttribute('aria-pressed',String(stationId()===f.properties.queryId));b.append(el('strong','',f.properties.name),el('span','',Number.isFinite(w?.seconds)?Math.ceil(w.seconds/60)+' Min. zu Fuß':Math.round(item.meters)+' m Luftlinie'));b.onclick=()=>choose(f,true);p.append(b);}}
  function effectiveWalk(){return walkMode==='automatic'&&Date.now()-walkAt>300000?null:minutes($('#walk-minutes'),60);}
  function applyWalk(){
    const saved=pref('walk:'+stationId()),known=walks.get(stationId());
    if(saved!==null&&/^\d+$/.test(saved)&&Number(saved)<=60){$('#walk-minutes').value=saved;walkMode='manual';status('walk-status','Gehzeit gespeichert.');}
    else if(Number.isFinite(known?.seconds)){const n=Math.ceil(known.seconds/60);$('#walk-minutes').value=String(n);walkMode='automatic';walkAt=location?.timestamp??Date.now();status('walk-status','Fußweg ca. '+n+' Min.'+(known.meters!=null?' · '+Math.round(known.meters)+' m':''));}
    else{$('#walk-minutes').value='';walkMode='unknown';status('walk-status',location?'Gehzeit eintragen oder berechnen.':'Gehzeit eintragen.');}
    $('.walk-config').open=walkMode==='unknown';$('#walk-recalculate').hidden=!location||cityAt(location.point)?.id!==cityId;cardKey='';renderBoard();
  }
  function choose(f,focus=false,requestWalk=true){
    if(!f?.properties.queryId)return;cancelLocationRequest();cancelLocationPick();station=f;setActive(true,false);boardController?.abort();boardLoading=false;board=null;cardKey='';restoreLines();$('#station-monitor').hidden=false;$('#monitor-empty').hidden=true;status('monitor-station-name',f.properties.name);$('#departure-direction').replaceChildren(el('option','','Alle Richtungen'));$('#departure-direction').firstChild.value='';$('#departure-direction').value='';
    const parent=$('#navigation-links');parent.replaceChildren();for(const link of navigationLinks({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]})){const a=el('a','',link.label+' ↗');a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}
    renderNear();applyWalk();onStation(f,focus);refresh();if(requestWalk&&location&&!walks.has(stationId()))calculateWalks(false);
  }
  $('#walk-minutes').oninput=()=>{const n=minutes($('#walk-minutes'),60);walkMode=n===null?'unknown':'manual';$('#walk-minutes').setAttribute('aria-invalid',String(n===null));if(n!==null)save('walk:'+stationId(),n);status('walk-status',n===null?'Gehzeit zwischen 0 und 60 Minuten eintragen.':'Gehzeit gespeichert.');cardKey='';renderBoard();};
  const savedBuffer=pref('buffer');if(savedBuffer!==null&&/^\d+$/.test(savedBuffer)&&Number(savedBuffer)<=15)$('#buffer-minutes').value=savedBuffer;
  $('#buffer-minutes').oninput=()=>{const n=minutes($('#buffer-minutes'),15);$('#buffer-minutes').setAttribute('aria-invalid',String(n===null));if(n!==null)save('buffer',n);cardKey='';renderBoard();};
  $('#walk-recalculate').onclick=()=>{try{localStorage.removeItem('rheinlive:walk:'+stationId());}catch{}requestLocation(false);};
  $('#departure-direction').onchange=()=>{cardKey='';renderBoard();};$('#board-retry').onclick=()=>refresh(true);
  function updateDirections(){const select=$('#departure-direction'),before=select.value,groups=new Map();for(const e of board?.departures??[])if((selectedLines===null||selectedLines.has(e.lineKey))&&!groups.has(e.directionKey))groups.set(e.directionKey,e.line+' → '+e.headsign);select.replaceChildren(el('option','','Alle Richtungen'));select.firstChild.value='';for(const [key,label]of groups){const o=el('option','',label);o.value=key;select.append(o);}select.value=groups.has(before)?before:'';}
  async function refresh(force=false){
    if(!active||document.hidden||!station||boardLoading||!force&&board&&Date.now()+boardOffset-board.fetchedAt<30000)return;
    boardController?.abort();const c=new AbortController();boardController=c;const id=stationId(),city=cityId;boardLoading=true;$('#board-retry').hidden=true;if(!board)status('board-status','Abfahrten laden …');
    try{const r=await fetch('/api/departures?'+new URLSearchParams({city,stopId:id}),{signal:AbortSignal.any([c.signal,AbortSignal.timeout(20000)])});const data=await r.json();if(c.signal.aborted||id!==stationId()||city!==cityId)return;if(!r.ok||data.stale||data.stopId!==id||data.city!==city||!Array.isArray(data.departures)||!Number.isFinite(data.fetchedAt)||!Number.isFinite(data.serverTime))throw Error(data.error||'Abfahrten gerade nicht verfügbar.');board=data;boardOffset=data.serverTime-Date.now();updateLineFilters();updateDirections();cardKey='';renderBoard();}
    catch(e){if(c.signal.aborted)return;board=null;cardKey='';renderBoard();status('board-status',e.name==='TimeoutError'?'Abfahrten brauchen gerade zu lange.':e.message);$('#board-retry').hidden=false;}
    finally{if(boardController===c)boardLoading=false;}
  }
  function readiness(e){return departureReadiness(e,{now:Date.now()+boardOffset,fetchedAt:board?.fetchedAt,validUntil:board?.validUntil,walkMinutes:effectiveWalk(),bufferMinutes:minutes($('#buffer-minutes'),15)});}
  const label=r=>({stale:'Prognose veraltet',cancelled:'Fällt aus','no-boarding':'Einstieg nicht möglich',departed:'Abfahrt vorbei',schedule:'Nur Fahrplan','no-walk':'Gehzeit prüfen',tight:'Bis zur Abfahrt · knapp',leave:'Jetzt bereitmachen',ready:'Bis zum Losgehen'}[r.state]);
  function renderBoard(){
    const walk=effectiveWalk(),buffer=minutes($('#buffer-minutes'),15);status('walk-summary',walk===null?'Gehzeit & Puffer einstellen':walk+' Min. zu Fuß · '+(buffer??'–')+' Min. Puffer');
    const parent=$('#departure-cards'),list=$('#departure-list');if(!station)return;
    if(!board){parent.replaceChildren();list.replaceChildren();cardKey='';return;}
    const now=Date.now()+boardOffset,stale=now-board.fetchedAt>120000||(board.validUntil!==undefined&&(!Number.isFinite(board.validUntil)||now>board.validUntil)),filter=$('#departure-direction').value;
    status('board-status',stale?'Prognose veraltet · Countdown pausiert':'');
    $('#board-retry').hidden=!stale;
    if(walkMode==='automatic'&&Date.now()-walkAt>300000)status('walk-status','Standort älter als fünf Minuten. Neu bestimmen oder Gehzeit selbst eintragen.');
    const {upcoming,primary}=selectMonitorDepartures(board.departures,{now,fetchedAt:board.fetchedAt,validUntil:board.validUntil,walkMinutes:walk,bufferMinutes:buffer,lines:selectedLines,direction:filter});
    const key=[board.fetchedAt,filter,effectiveWalk(),$('#buffer-minutes').value,stale,...primary.map(e=>e.id),...upcoming.map(e=>e.id)].join('|');
    if(key!==cardKey){cardKey=key;parent.replaceChildren();list.replaceChildren();
      for(const e of primary){const card=el('article','departure-card'),head=el('div','departure-head'),badge=el('span','departure-badge',e.line);badge.style.background=e.color;badge.style.color=e.textColor;head.append(badge,el('h3','',e.headsign));card.append(head,el('strong','leave-countdown','–'),el('p','leave-label',''),el('p','departure-meta','Abfahrt '+time.format(e.departure)+(e.realtime&&e.scheduledDeparture!=null&&e.departure!==e.scheduledDeparture?' · '+(e.departure>e.scheduledDeparture?'+':'')+Math.round((e.departure-e.scheduledDeparture)/60000)+' Min.':'')));card.dataset.event=e.id;const p=platformText({...e.stop,plannedOnly:!e.realtime},e.mode);const platform=[p.label,p.note].filter(Boolean).join(' · ')||e.stop.description;if(platform)card.append(el('p','departure-platform',platform));parent.append(card);}
      if(!primary.length)parent.append(el('p','monitor-note',selectedLines?.size===0?'Wähle mindestens eine Linie.':upcoming.some(e=>e.cancelled)?'Die gemeldeten Fahrten fallen aus.':'Keine passenden Abfahrten.'));
      for(const e of upcoming){const row=el('div','departure-row'),badge=el('span','departure-badge',e.line);badge.style.background=e.color;badge.style.color=e.textColor;const body=el('span','departure-row-text',e.headsign),note=el('small','','');body.append(note);row.append(badge,body,el('time','',time.format(e.departure)));row.dataset.event=e.id;list.append(row);}
    }
    for(const card of parent.querySelectorAll('[data-event]')){const e=primary.find(e=>e.id===card.dataset.event),r=readiness(e);card.dataset.state=r.state;card.querySelector('.leave-countdown').textContent=['ready','leave'].includes(r.state)?countdown(r.seconds):r.state==='tight'?countdown(r.departureSeconds):r.state==='schedule'?'◷':'–';card.querySelector('.leave-label').textContent=label(r);}
    for(const row of list.querySelectorAll('[data-event]')){const e=upcoming.find(e=>e.id===row.dataset.event),r=readiness(e);row.dataset.state=r.state;row.querySelector('small').textContent=['ready','leave'].includes(r.state)?'Los in '+countdown(r.seconds):r.state==='tight'?'Abfahrt in '+countdown(r.departureSeconds)+' · knapp':label(r);}
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
  const locationRequest=createLocationRequest({onState(state){
    locating=state==='locating';$('#locate').disabled=locating;status('location-status',locationMessages[state]);
    const error=state!=='locating'&&state!=='found';$('#location-browser').hidden=!error;$('#location-browser').href=window.location.origin;$('#location-pick').hidden=!error;
  },onPosition:p=>acceptLocation(p,locateFocus)});
  function cancelLocationRequest(){locationRequest.cancel();if(locating)status('location-status','');locating=false;$('#locate').disabled=false;}
  function cancelLocationPick(){if(!pickingLocation)return;pickingLocation=false;onPickLocation(false);$('#location-pick').setAttribute('aria-pressed','false');$('#location-pick').textContent='Standort auf Karte setzen';status('location-status','');}
  function acceptLocation(p,focus){
    location=p;walkController?.abort();walkRevision++;walks.clear();near=[];renderNear();
    if(walkMode==='automatic'){walkMode='unknown';$('#walk-minutes').value='';renderBoard();}
    if(focus){station=null;board=null;boardController?.abort();boardLoading=false;cardKey='';$('#station-monitor').hidden=true;$('#monitor-empty').hidden=false;onStation(null,false);}
    const region=cityAt(p.point);setActive(true,false);
    status('location-status',p.source==='manual'?'Startpunkt auf der Karte gesetzt.':p.accuracy>300?'Standort nur auf ca. '+Math.round(p.accuracy)+' m genau.':'');
    $('#location-pick').hidden=p.source!=='manual'&&p.accuracy<=300;$('#location-browser').hidden=true;
    if(!region){onLocation(p,focus);status('location-status','Hier gibt es noch keine Verkehrsdaten. Aktuell sind Köln, Bonn und Düsseldorf verfügbar.');return;}
    if(region.id!==cityId)onCity(region.id);else if(network)calculateWalks(!station);
    onLocation(p,focus);
  }
  function requestLocation(focus=true){
    setActive(true,false);cancelLocationPick();locateFocus=focus;walkController?.abort();walkRevision++;walks.clear();near=[];renderNear();location=null;onLocation(null,false);
    if(walkMode==='automatic'){walkMode='unknown';$('#walk-minutes').value='';renderBoard();}
    locationRequest.request();
  }
  $('#location-pick').onclick=()=>{
    if(pickingLocation){cancelLocationPick();return;}cancelLocationRequest();
    if(!onPickLocation(true)){status('location-status','Die Karte ist noch nicht bereit. Haltestelle suchen oder gleich erneut versuchen.');return;}
    pickingLocation=true;$('#location-pick').setAttribute('aria-pressed','true');$('#location-pick').textContent='Auswahl abbrechen';status('location-status','Tippe deinen Startpunkt auf der Karte an.');
  };
  $('#locate').onclick=()=>requestLocation(true);
  const timer=setInterval(()=>refresh(),30000),visibility=()=>{if(!document.hidden){renderBoard();refresh();}else{boardController?.abort();boardLoading=false;}};
  const pageShow=e=>{if(e.persisted&&!document.hidden){renderBoard();refresh();}};
  const pageHide=e=>{boardController?.abort();boardLoading=false;walkController?.abort();walkRevision++;cancelLocationRequest();cancelLocationPick();if(!e.persisted){clearInterval(timer);document.removeEventListener('visibilitychange',visibility);removeEventListener('pageshow',pageShow);removeEventListener('pagehide',pageHide);}};
  document.addEventListener('visibilitychange',visibility);addEventListener('pagehide',pageHide);addEventListener('pageshow',pageShow);
  return {
    start:()=>requestLocation(true),locate:()=>requestLocation(true),cancelLocationPick,setManualLocation:point=>{if(!validPoint(point))return;cancelLocationRequest();cancelLocationPick();acceptLocation({point:[...point],accuracy:null,timestamp:Date.now(),source:'manual'},true);},tick:()=>{if(active&&!document.hidden)renderBoard();},getLocation:()=>location,getStation:()=>station,
    setCity:(id,{manual=false}={})=>{cityId=id;network=null;station=null;board=null;near=[];walks.clear();cardKey='';walkMode='unknown';boardController?.abort();walkController?.abort();walkRevision++;boardLoading=false;if(manual){cancelLocationRequest();cancelLocationPick();}$('#station-monitor').hidden=true;$('#monitor-empty').hidden=false;$('#nearby-stops').replaceChildren();$('#departure-cards').replaceChildren();$('#departure-list').replaceChildren();},
    setNetwork:data=>{if(data.city!==cityId)return;network=data;if(location&&cityAt(location.point)?.id===cityId){calculateWalks(!station);}},
    choose,explore:()=>{cancelLocationRequest();cancelLocationPick();walkController?.abort();walkRevision++;setActive(false);},
  };
}
