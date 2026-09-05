import {createVehicleLayer} from './vehicles.js';
import {bindMapPicking} from './map-picking.js';
import {createRailDetail,DETAIL_ZOOM} from './rail-detail.js';
// Static network layers stay in MapLibre; vehicle animation uses its own cached canvas.
const collection=features=>({type:'FeatureCollection',features});
const empty=()=>collection([]);
export async function createTransitMap(city,{theme:initialTheme='dark',onSelect=()=>{},onStation=()=>{},onMove=()=>{},onClear=()=>{},onError=()=>{},onRailDetail=()=>{}}={}){
  if(!window.maplibregl)throw new Error('Kartenbibliothek konnte nicht geladen werden.');
  const map=new maplibregl.Map({container:'map',style:await mapStyle(initialTheme),center:[city.center[1],city.center[0]],zoom:11.7,minZoom:9,maxZoom:18,pitch:0,attributionControl:false,collectResourceTiming:true,canvasContextAttributes:{antialias:true}});
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'<a href="https://transitous.org/sources/" target="_blank">Verkehrsdaten: Transitous</a>'}),'bottom-right');
  map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
  const vehicleLayer=createVehicleLayer(map);vehicleLayer.setBounds(city.bounds);vehicleLayer.setTheme(initialTheme);map.on('remove',()=>vehicleLayer.destroy());
  let selected=null,network=empty(),stops=empty(),selectedGeometry=empty(),userLocation=empty(),boardStation=empty(),theme=initialTheme,networkOn=true,tilted=false,detailActive=false,hasRails=true,filter=['literal',true],stationFilter=['literal',true],trackFilter=['in',['get','class'],['literal',['rail','transit']]];
  const railDetail=createRailDetail(map,state=>{detailActive=state.active;applyFilter();onRailDetail(state);});
  map.on('remove',()=>railDetail.destroy());
  function mount(){
    for(const [id,data]of [['network',network],['stations',stops],['selected-route',selectedGeometry],['user-location',userLocation],['board-station',boardStation]])map.addSource(id,{type:'geojson',data});
    map.addSource('detail-tracks',{type:'geojson',data:empty(),maxzoom:18,tolerance:.05,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>'});
    map.addLayer({id:'buildings-3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:13,layout:{visibility:tilted?'visible':'none'},paint:{'fill-extrusion-color':theme==='dark'?'#28465a':'#c7d7e1','fill-extrusion-height':['coalesce',['get','render_height'],0],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.8}});
    // One stroke per supplied physical rail feature. Never merge nearby parallel tracks
    // or draw a second copy for every route using a track. Tunnel tracks stay included.
    map.addLayer({id:'track-lines',type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:10,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':theme==='dark'?'#7493a5':'#708b9d','line-width':['interpolate',['linear'],['zoom'],10,.65,13,1,16,1.25,18,1.8],'line-opacity':['case',['==',['get','brunnel'],'tunnel'],.55,.85]}});
    map.addLayer({id:'detail-track-lines',type:'line',source:'detail-tracks',minzoom:DETAIL_ZOOM,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':theme==='dark'?'#7493a5':'#708b9d','line-width':['interpolate',['linear'],['zoom'],14,1.08,16,1.25,18,1.8],'line-opacity':['case',['==',['get','brunnel'],'tunnel'],.55,.85]}});
    map.addLayer({id:'construction-track-lines',type:'line',source:'detail-tracks',minzoom:DETAIL_ZOOM,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':theme==='dark'?'#cfab75':'#986122','line-width':['interpolate',['linear'],['zoom'],14,1.08,16,1.25,18,1.8],'line-opacity':.7,'line-dasharray':[4,3]}});
    map.addLayer({id:'network-glow',type:'line',source:'network',paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],9,3,14,8],'line-opacity':.12,'line-blur':3}});
    map.addLayer({id:'network-lines',type:'line',source:'network',paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],9,.7,12,1.6,16,3],'line-opacity':['case',['==',['get','mode'],'bus'],.3,.65]}});
    map.addLayer({id:'station-dots',type:'circle',source:'stations',minzoom:12.2,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,2,16,4],'circle-color':theme==='dark'?'#17293a':'#ffffff','circle-stroke-color':theme==='dark'?'#9ab1be':'#536573','circle-stroke-width':1.1}});
    map.addLayer({id:'station-labels',type:'symbol',source:'stations',minzoom:13.5,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.1],'text-anchor':'top','text-max-width':12},paint:{'text-color':theme==='dark'?'#b7cbd5':'#4b6473','text-halo-color':theme==='dark'?'#102130':'#ffffff','text-halo-width':1.4}});
    map.addLayer({id:'selected-route-glow',type:'line',source:'selected-route',paint:{'line-color':['get','color'],'line-width':11,'line-opacity':.2,'line-blur':3}});
    map.addLayer({id:'selected-route-line',type:'line',source:'selected-route',paint:{'line-color':['get','color'],'line-width':4,'line-opacity':.95}});
    map.addLayer({id:'board-station-dot',type:'circle',source:'board-station',paint:{'circle-radius':7,'circle-color':'#ff826b','circle-stroke-color':'#ffffff','circle-stroke-width':2}});
    map.addLayer({id:'user-location-halo',type:'circle',source:'user-location',paint:{'circle-radius':18,'circle-color':'#428fff','circle-opacity':.18}});
    map.addLayer({id:'user-location-dot',type:'circle',source:'user-location',paint:{'circle-radius':6,'circle-color':'#428fff','circle-stroke-color':'#ffffff','circle-stroke-width':2}});
    applyFilter();railDetail.mount();
  }
  function applyFilter(){
    for(const id of ['track-lines','detail-track-lines','construction-track-lines','network-glow','network-lines','station-dots','station-labels'])if(map.getLayer(id)){
      const isDetail=id==='detail-track-lines'||id==='construction-track-lines';
      const visible=networkOn&&(id==='track-lines'?!detailActive:isDetail?detailActive:true);
      map.setLayoutProperty(id,'visibility',visible?'visible':'none');
      map.setFilter(id,isDetail?['all',trackFilter,['==',['get','status'],id==='construction-track-lines'?'construction':'active']]:id==='track-lines'?trackFilter:id.startsWith('station-')?stationFilter:filter);
    }
  }
  map.on('style.load',mount);
  let stationIndex=new Map();
  const removePicking=bindMapPicking(map,{vehicles:vehicleLayer,stationById:id=>stationIndex.get(id),onVehicle:onSelect,onStation,onClear});
  map.on('remove',removePicking);
  map.on('moveend',onMove);map.on('error',e=>{if(e.sourceId!=='detail-tracks')onError(e.error?.message||'Die Karte konnte nicht vollständig geladen werden.');});
  return {
    raw:map,
    getBounds:()=>{const bounds=map.getBounds();return {contains:([lat,lon])=>bounds.contains([lon,lat])};},
    zoomIn:()=>map.zoomIn(),zoomOut:()=>map.zoomOut(),
    fitBounds:(bounds)=>{vehicleLayer.setBounds(bounds);map.fitBounds([[bounds[0][1],bounds[0][0]],[bounds[1][1],bounds[1][0]]],{padding:{top:100,right:60,bottom:innerWidth<760?250:70,left:innerWidth<760?40:390},maxZoom:12.3});},
    update:(next,fetchedAt,now,options)=>vehicleLayer.update(next,fetchedAt,now,options),
    performance:()=>({...vehicleLayer.stats(),railTransferBytes:railDetail.stats().transferBytes}),
    setLocation:p=>{userLocation=collection(p?[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[p.point[1],p.point[0]]}}]:[]);map.getSource('user-location')?.setData(userLocation);},
    centerLocation:p=>map.easeTo({center:[p.point[1],p.point[0]],zoom:p.accuracy>300?13.2:14.8,pitch:0,duration:700,padding:{top:100,bottom:innerWidth<760?380:60,left:innerWidth<760?25:370,right:60}}),
    setBoardStation:f=>{boardStation=collection(f?[f]:[]);map.getSource('board-station')?.setData(boardStation);},
    select:(v,geometry)=>{selected=v?.id??null;selectedGeometry=geometry||collection(v?v.segments.filter(s=>s.geometry==='shape').map(s=>({type:'Feature',geometry:{type:'LineString',coordinates:s.points.map(p=>[p[1],p[0]])},properties:{color:v.color}})):[]);map.getSource('selected-route')?.setData(selectedGeometry);vehicleLayer.select(selected);},
    setNetwork:data=>{network=data.lines;stops=data.stops;stationIndex=new Map(stops.features.filter(f=>f.properties.queryId).map(f=>[f.properties.queryId,f]));map.getSource('network')?.setData(network);map.getSource('stations')?.setData(stops);},
    // Physical tracks are infrastructure context; route filters apply to trips and stops.
    setFilter:(modes,lineKeys)=>{
      const classes=[];if(modes.includes('tram'))classes.push('transit');if(modes.some(m=>['suburban','regional','long_distance'].includes(m)))classes.push('rail');
      trackFilter=['in',['get','class'],['literal',classes]];hasRails=classes.length>0;
      const lineMatch=lineKeys?['any',modes.includes('long_distance')?['in','long_distance',['get','modes']]:['literal',false],...lineKeys.map(k=>['in',k,['get','lineKeys']])]:['literal',true];
      stationFilter=['all',modes.length?['any',...modes.map(m=>['in',m,['get','modes']])]:['literal',false],lineMatch];
      filter=['all',['in',['get','mode'],['literal',modes]],...(lineKeys?[['any',['==',['get','mode'],'long_distance'],...lineKeys.map(k=>['in',k,['get','lineKeys']])]]:[])];applyFilter();railDetail.setEnabled(networkOn&&hasRails);
    },
    showNetwork:value=>{networkOn=value;applyFilter();railDetail.setEnabled(networkOn&&hasRails);},
    setTheme:async next=>{const style=await mapStyle(next);theme=next;map.setStyle(style);vehicleLayer.setTheme(next);},
    setTilt:value=>{tilted=value;if(map.getLayer('buildings-3d'))map.setLayoutProperty('buildings-3d','visibility',value?'visible':'none');map.easeTo({pitch:value?45:0,bearing:value?-12:0,duration:500});},
    follow:v=>map.easeTo({center:[v.lon,v.lat],duration:800}),
  };
}
async function mapStyle(theme){
  const r=await fetch('https://tiles.openfreemap.org/styles/'+(theme==='dark'?'dark':'positron'),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Kartenstil nicht erreichbar.');const style=await r.json();
  for(const l of style.layers){
    if(l.type==='background')l.paint['background-color']=theme==='dark'?'#0c1926':'#eaf0f3';
    if(l.id==='water')l.paint['fill-color']=theme==='dark'?'#103d58':'#accfdf';
    if(l.id==='building')l.paint['fill-color']=theme==='dark'?'#1b2c3a':'#d9e1e5';
    if(l.type==='symbol'&&/poi|housenumber/.test(l.id))l.layout={...l.layout,visibility:'none'};
  }
  // The base style uses rail casing + dashes. Our single track layer replaces both.
  style.layers=style.layers.filter(l=>!(l.type==='line'&&/railway/.test(l.id)));
  return style;
}
