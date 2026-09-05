/** Coordinates use [latitude, longitude]; only the renderer converts to GeoJSON. */
export const transportModes=[
  {id:'tram',name:'Stadtbahn',short:'Bahn',color:'#ff735c',sources:['TRAM','SUBWAY']},
  {id:'bus',name:'Bus',short:'Bus',color:'#5ac3ee',sources:['BUS']},
  {id:'suburban',name:'S-Bahn',short:'S',color:'#68cdab',sources:['SUBURBAN']},
  {id:'regional',name:'Regionalzug',short:'RE',color:'#b4a1f6',sources:['REGIONAL_RAIL']},
  {id:'long_distance',name:'Fernzug',short:'ICE / IC',color:'#ed648b',sources:['HIGHSPEED_RAIL','LONG_DISTANCE','NIGHT_RAIL']},
  {id:'ferry',name:'Fähre',short:'F',color:'#e4b874',sources:['FERRY']},
];
const modes=transportModes.flatMap(m=>m.sources);
export const cities={
  cologne:{id:'cologne',name:'Köln',region:'Köln & Umgebung',timezone:'Europe/Berlin',center:[50.944,6.965],bounds:[[50.80,6.76],[51.10,7.18]],modes,lines:[]},
  bonn:{id:'bonn',name:'Bonn',region:'Bonn & Umgebung',timezone:'Europe/Berlin',center:[50.734,7.105],bounds:[[50.62,6.99],[50.82,7.27]],modes,lines:[]},
  duesseldorf:{id:'duesseldorf',name:'Düsseldorf',region:'Düsseldorf & Umgebung',timezone:'Europe/Berlin',center:[51.225,6.785],bounds:[[51.10,6.62],[51.36,6.95]],modes,lines:[]},
};
export const city=cities.cologne;
export const MAX_SNAPSHOT_AGE_MS=120_000;
export const modeFor=source=>transportModes.find(m=>m.sources.includes(source));
export const pointInBounds=(p,bounds)=>p[0]>=bounds[0][0]&&p[0]<=bounds[1][0]&&p[1]>=bounds[0][1]&&p[1]<=bounds[1][1];
/** Clip a geographic segment to a rectangle, including crossings with no inside vertex. */
export function segmentIntersectsBounds(a,b,bounds){
  let enter=0,leave=1;
  for(let axis=0;axis<2;axis++){
    const delta=b[axis]-a[axis];
    if(delta===0){if(a[axis]<bounds[0][axis]||a[axis]>bounds[1][axis])return false;continue;}
    const t0=(bounds[0][axis]-a[axis])/delta,t1=(bounds[1][axis]-a[axis])/delta;
    enter=Math.max(enter,Math.min(t0,t1));leave=Math.min(leave,Math.max(t0,t1));
    if(enter>leave)return false;
  }
  return true;
}
export function lineName(value,mode){
  let name=String(value??'').replace(/^(?:Tram|STR|Stadtbahn|Bus)\s+/i,'').replace(/\s*\(\d+\)$/,'').trim().slice(0,32);
  if(mode==='ferry'&&/^\d{6,}$/.test(name))name='Fähre';
  return name;
}
// Filters group a line name within its transport mode, never merge individual trips.
export const lineKey=(mode,line)=>`${mode}:${line}`;
export function lineColor(mode,line,upstream){
  if(typeof upstream==='string'&&/^#?[0-9a-f]{6}$/i.test(upstream))return '#'+upstream.replace('#','');
  const palette=['#ec7866','#55bedd','#82bf65','#b092e9','#e8b458','#60bbae','#dc85b9'];
  if(mode!=='tram')return transportModes.find(m=>m.id===mode)?.color||'#769fc3';
  let hash=0;for(const char of line)hash=(hash*31+char.charCodeAt(0))>>>0;return palette[hash%palette.length];
}
export function contrastText(hex){const rgb=hex.slice(1).match(/../g)?.map(n=>parseInt(n,16)/255)||[0,0,0];const c=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722>.38?'#102432':'#ffffff';}
