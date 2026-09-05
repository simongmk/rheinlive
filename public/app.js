import {city,MAX_SNAPSHOT_AGE_MS} from '/lib/cities.mjs';
import {prepareTrips,vehiclesAt,vehicleView} from '/lib/transit.mjs';
const $=s=>document.querySelector(s),text=(s,value)=>$(s).textContent=value;
let map, snapshot=null,trips=[],markers=new Map(),selected=null,selectedPath=null,loading=false,offset=0,lastTick=-1,lastDraw=0,visible=[],candidates=[],detailKey=null;
const active=new Set(city.lines.map(l=>l.id));
const clockFormat=new Intl.DateTimeFormat('de-DE',{timeZone:city.timezone,hour:'2-digit',minute:'2-digit',hour12:false});
const secondsFormat=new Intl.DateTimeFormat('de-DE',{timeZone:city.timezone,second:'2-digit'});
const dateFormat=new Intl.DateTimeFormat('de-DE',{timeZone:city.timezone,weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
const time=t=>clockFormat.format(new Date(t));
const cleanName=s=>s.replace(/^(Köln|Koeln)[, ]+/,'');
function el(tag,cls,content){const node=document.createElement(tag);if(cls)node.className=cls;if(content!==undefined)node.textContent=content;return node;}
function notify(title,body){text('#notice-title',title);text('#notice-body',body);$('#notice').hidden=false;}
function setActiveLines(ids){active.clear();ids.forEach(id=>active.add(id));$('#lines').replaceChildren();setLines();draw();}
function setLines(){for(const line of city.lines){const b=el('button','line-filter',line.id);b.style.setProperty('--line-color',line.color);b.type='button';b.setAttribute('aria-pressed',String(active.has(line.id)));b.setAttribute('aria-label',`Linie ${line.id} anzeigen`);b.addEventListener('click',()=>{if(active.has(line.id))active.delete(line.id);else active.add(line.id);b.setAttribute('aria-pressed',String(active.has(line.id)));draw();});$('#lines').append(b);}}
setLines();
$('#all-lines').onclick=()=>setActiveLines(city.lines.map(l=>l.id));
$('#include-schedule').onchange=()=>draw();
const panelToggle=$('#panel-toggle');
panelToggle.onclick=()=>{
  const expanded=panelToggle.getAttribute('aria-expanded')!=='true';
  panelToggle.setAttribute('aria-expanded',String(expanded));
  $('.overview').classList.toggle('expanded',expanded);
};
function showInfo(){ $('#info-dialog').showModal(); }
$('#info-open').onclick=showInfo;$('#quality-open').onclick=showInfo;$('#info-close').onclick=()=>$('#info-dialog').close();
$('#info-dialog').addEventListener('click',e=>{if(e.target===$('#info-dialog'))$('#info-dialog').close();});
function clearSelected(){selected=null;detailKey=null;$('#vehicle-detail').hidden=true;if(selectedPath){selectedPath.remove();selectedPath=null;}for(const m of markers.values())m.getElement()?.querySelector('.train-dot')?.classList.remove('selected');}
$('#detail-close').onclick=clearSelected;
document.addEventListener('keydown',e=>{if(e.key==='Escape')clearSelected();});
function initMap(){if(!window.L){$('#map-error').hidden=false;return;}
  map=L.map('map',{zoomControl:false,attributionControl:true,minZoom:10,maxZoom:18,preferCanvas:true}).setView(city.center,12);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://transitous.org/sources/">Verkehrsdaten</a>'}).addTo(map);
  let errors=0;tiles.on('tileerror',()=>{if(++errors>=5)$('#map-error').hidden=false;});tiles.on('tileload',()=>{$('#map-error').hidden=true;errors=0;});
  $('#zoom-in').onclick=()=>map.zoomIn();$('#zoom-out').onclick=()=>map.zoomOut();$('#recenter').onclick=()=>{clearSelected();map.fitBounds(city.bounds,{padding:[30,30],maxZoom:12});};
  map.on('click',clearSelected);map.on('moveend',()=>updateCount());
}
if(document.readyState==='complete')initMap();else window.addEventListener('load',initMap,{once:true});
function markerIcon(v){const d=el('div',`train-dot ${v.quality==='schedule'?'planned':''} ${selected===v.id?'selected':''}`);d.style.setProperty('--line-color',v.color);d.style.setProperty('--bearing',`${v.bearing-90}deg`);d.append(el('span','number',v.line));return L.divIcon({html:d,className:'train-marker',iconSize:[32,32],iconAnchor:[16,16]});}
function updateCount(){
  const inView=v=>!map||map.getBounds().contains([v.lat,v.lon]);
  text('#vehicle-count',String(visible.filter(inView).length));
  if(!snapshot||snapshot.stale||Date.now()+offset-snapshot.fetchedAt>MAX_SNAPSHOT_AGE_MS)return;
  const coverage=vehicleView(candidates.filter(inView));
  text('#quality-label',`${coverage.realtime} mit Prognose · ${coverage.schedule} nur Fahrplan`);
  text('#feed-status',!coverage.total?'Keine Fahrten im Ausschnitt':!coverage.realtime?'Keine Echtzeitprognosen':coverage.schedule?'Echtzeitdaten · teilweise verfügbar':'Echtzeitprognosen verfügbar');
  $('#status-dot').classList.toggle('live',coverage.realtime>0);
  text('#coverage-info',coverage.total&&!coverage.realtime?'Für diese Fahrten fehlen Echtzeitprognosen. Verspätungen sind unbekannt.':$('#include-schedule').checked?'Gestrichelter Rand: Fahrt ohne Echtzeitprognose.':'Fahrten ohne Echtzeitprognose sind ausgeblendet.');
}
function showDetails(v){selected=v.id;detailKey=[v.id,v.segment.key,v.state,v.quality,v.segment.arrival,v.segment.geometry].join('|');$('#vehicle-detail').hidden=false;const content=$('#detail-content');content.replaceChildren();
  for(const[id,m]of markers)m.getElement()?.querySelector('.train-dot')?.classList.toggle('selected',id===v.id);
  const line=el('span','detail-line',v.line);line.style.setProperty('--line-color',v.color);content.append(line,el('p','detail-direction',v.state==='stopped'?'AN DER HALTESTELLE':'NÄCHSTER HALT'),el('h2','',cleanName(v.state==='stopped'?v.segment.from.name:v.segment.to.name)),el('span','detail-quality',v.quality==='realtime'?'≈ Mit Echtzeitprognose':'◷ Nach Fahrplan'));
  const stops=el('div','stop-progress');for(const [stop,ts,cls]of[[v.segment.from,v.segment.departure,'previous'],[v.segment.to,v.segment.arrival,'next']]){const row=el('div',`stop-row ${cls}`);row.append(el('span','',cleanName(stop.name)),el('time','',time(ts)));stops.append(row);}content.append(stops);
  const delay=v.segment.scheduledArrival===null?null:Math.round((v.segment.arrival-v.segment.scheduledArrival)/60_000);
  content.append(el('p',`delay ${v.quality==='realtime'&&delay>0?'is-late':''}`,v.quality==='schedule'?'Keine aktuelle Verspätungsinformation':delay===null?'Aktuelle Ankunftsprognose':delay>0?`+${delay} Min. · Ankunft später als geplant`:delay<0?`${Math.abs(delay)} Min. früher als geplant`:'Ankunft laut Prognose pünktlich'));
  if(v.segment.geometry==='straight')content.append(el('p','delay','Streckenverlauf fehlt: Position zwischen Haltestellen geschätzt.'));
  if(selectedPath)selectedPath.remove();selectedPath=L.polyline(v.segments.map(s=>s.points),{color:v.color,weight:4,opacity:.75,dashArray:v.segment.geometry==='straight'?'6 6':undefined,interactive:false}).addTo(map);
}
function draw(){const now=Date.now()+offset;candidates=snapshot&&!snapshot.stale?vehiclesAt(trips,now,snapshot.fetchedAt).filter(v=>active.has(v.line)):[];visible=vehicleView(candidates,{includeSchedule:$('#include-schedule').checked}).visible;
  if(map){const ids=new Set(visible.map(v=>v.id));for(const[id,m]of markers)if(!ids.has(id)){m.remove();markers.delete(id);}
    for(const v of visible){let marker=markers.get(v.id);if(!marker){marker=L.marker([v.lat,v.lon],{icon:markerIcon(v),title:`Linie ${v.line} · ${v.segment.to.name}`,alt:`Linie ${v.line}`,keyboard:true});marker.addTo(map);marker.on('click',()=>{const latest=visible.find(x=>x.id===v.id);if(latest)showDetails(latest);});markers.set(v.id,marker);}else{marker.setLatLng([v.lat,v.lon]);const dot=marker.getElement()?.querySelector('.train-dot');if(dot){dot.classList.toggle('planned',v.quality==='schedule');dot.classList.toggle('selected',selected===v.id);dot.style.setProperty('--bearing',`${v.bearing-90}deg`);}}
    }
    if(selected){const v=visible.find(x=>x.id===selected);if(!v)clearSelected();else if(detailKey!==[v.id,v.segment.key,v.state,v.quality,v.segment.arrival,v.segment.geometry].join('|'))showDetails(v);}
  }updateCount();
  if(snapshot&&!snapshot.stale&&now-snapshot.fetchedAt>MAX_SNAPSHOT_AGE_MS){text('#feed-status','Daten veraltet');text('#quality-label','Prognosen veraltet');text('#coverage-info','Keine aktuellen Positionen verfügbar.');$('#status-dot').classList.remove('live');notify('Warte auf aktuelle Fahrtdaten','Die letzten Positionen sind zu alt und werden nicht weiter angezeigt.');}
}
async function refresh(){if(loading||document.hidden)return;loading=true;$('#retry').disabled=true;
  try{const r=await fetch('/api/vehicles?city=cologne',{signal:AbortSignal.timeout(20_000)});const result=await r.json();if(!r.ok||result.stale)throw new Error(result.error||'Die Datenquelle ist nicht erreichbar.');
    if(!Array.isArray(result.trips)||!Number.isFinite(result.serverTime)||!Number.isFinite(result.fetchedAt))throw new Error('Die Datenquelle hat keine lesbaren Fahrtdaten geliefert.');
    offset=result.serverTime-Date.now();snapshot=result;trips=prepareTrips(result.trips);$('#notice').hidden=true;
    text('#dataset-info','Datenabruf: '+new Date(result.fetchedAt).toLocaleString('de-DE',{timeZone:city.timezone})+' Uhr (Köln). Quelle: Transitous / MOTIS.');
    if(!trips.length)notify('Gerade keine Fahrten gemeldet','Die Datenquelle liefert aktuell keine Stadtbahnfahrten für Köln. Das kann eine Datenlücke oder eine Betriebspause sein.');
    draw();
  }catch(e){snapshot=null;trips=[];draw();text('#feed-status','Daten nicht erreichbar');text('#quality-label','Keine aktuellen Fahrtdaten');text('#coverage-info','');$('#status-dot').classList.remove('live');notify('Die Verbindung fehlt gerade',e.name==='TimeoutError'?'Die Verkehrsdaten brauchen zu lange. Wir versuchen es automatisch erneut.':e.message);text('#refresh-label','Nächster Versuch in 30 Sekunden');
  }finally{loading=false;$('#retry').disabled=false;}
}
$('#retry').onclick=refresh;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',refresh);
function tick(timestamp){const now=Date.now()+offset;const second=Math.floor(now/1000);if(lastTick!==second){lastTick=second;text('#clock',time(now));text('#clock-seconds',secondsFormat.format(new Date(now)).padStart(2,'0'));text('#date','Köln · '+dateFormat.format(new Date(now)));if(snapshot&&!snapshot.stale)text('#refresh-label',`Daten vor ${Math.max(0,Math.floor((now-snapshot.fetchedAt)/1000))} Sek. abgerufen · Update alle 30 Sek.`);}
  if(!document.hidden&&timestamp-lastDraw>=1000){lastDraw=timestamp;draw();}requestAnimationFrame(tick);
}
requestAnimationFrame(tick);refresh();setInterval(refresh,30_000);

// Optional browser-native agent controls; ordinary browsers use the same UI actions.
const context=document.modelContext;
if(context?.registerTool){
  const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional API is not required for the map. */}};
  register({name:'read_visible_trains',title:'Sichtbare Stadtbahnfahrten lesen',description:'Liest die aktuell angezeigten Fahrten. Positionen sind Schätzungen aus Fahrplänen oder Prognosen, keine GPS-Messungen.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){return {city:city.name,fetchedAt:snapshot?.fetchedAt??null,positionType:'estimated',trains:visible.filter(v=>!map||map.getBounds().contains([v.lat,v.lon])).map(v=>({id:v.id,line:v.line,nextStop:v.segment.to.name,quality:v.quality,latitude:v.lat,longitude:v.lon}))};}});
  register({name:'set_visible_lines',title:'Stadtbahnlinien auf der Karte auswählen',description:'Wählt die sichtbaren Linien auf der Kölner Karte. Eine leere Liste blendet alle Fahrten aus.',inputSchema:{type:'object',properties:{lines:{type:'array',items:{type:'string',enum:city.lines.map(l=>l.id)},uniqueItems:true}},required:['lines'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>k!=='lines')||!Array.isArray(input.lines)||input.lines.some(id=>!city.lines.some(l=>l.id===id))||new Set(input.lines).size!==input.lines.length)throw new Error('Bitte eine Liste gültiger, eindeutiger Kölner Linien angeben.');setActiveLines(input.lines);return {lines:[...active],visibleTrains:visible.length};}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
