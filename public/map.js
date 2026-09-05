import {createVehicleLayer} from './vehicles.js';
// Static network layers stay in MapLibre; vehicle animation uses its own cached canvas.
const collection=features=>({type:'FeatureCollection',features});
const empty=()=>collection([]);
export async function createTransitMap(city,{theme:initialTheme='dark',onSelect=()=>{},onMove=()=>{},onClear=()=>{},onError=()=>{}}={}){
  if(!window.maplibregl)throw new Error('Kartenbibliothek konnte nicht geladen werden.');
  const map=new maplibregl.Map({container:'map',style:await mapStyle(initialTheme),center:[city.center[1],city.center[0]],zoom:11.7,minZoom:9,maxZoom:18,pitch:0,attributionControl:false,canvasContextAttributes:{antialias:true}});
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'<a href="https://transitous.org/sources/" target="_blank">Verkehrsdaten: Transitous</a>'}),'bottom-right');
  map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
  const vehicleLayer=createVehicleLayer(map);vehicleLayer.setBounds(city.bounds);vehicleLayer.setTheme(initialTheme);map.on('remove',()=>vehicleLayer.destroy());
  let selected=null,network=empty(),stops=empty(),selectedGeometry=empty(),theme=initialTheme,networkOn=true,tilted=false,filter=['literal',true],stationFilter=['literal',true];
  function mount(){
    for(const [id,data]of [['network',network],['stations',stops],['selected-route',selectedGeometry]])map.addSource(id,{type:'geojson',data});
    map.addLayer({id:'buildings-3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:13,layout:{visibility:tilted?'visible':'none'},paint:{'fill-extrusion-color':theme==='dark'?'#28465a':'#c7d7e1','fill-extrusion-height':['coalesce',['get','render_height'],0],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.8}});
    map.addLayer({id:'network-glow',type:'line',source:'network',paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],9,3,14,8],'line-opacity':.12,'line-blur':3}});
    map.addLayer({id:'network-lines',type:'line',source:'network',paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],9,.7,12,1.6,16,3],'line-opacity':['case',['==',['get','mode'],'bus'],.3,.65]}});
    map.addLayer({id:'station-dots',type:'circle',source:'stations',minzoom:12.2,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,2,16,4],'circle-color':theme==='dark'?'#17293a':'#ffffff','circle-stroke-color':theme==='dark'?'#9ab1be':'#536573','circle-stroke-width':1.1}});
    map.addLayer({id:'station-labels',type:'symbol',source:'stations',minzoom:13.5,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.1],'text-anchor':'top','text-max-width':12},paint:{'text-color':theme==='dark'?'#b7cbd5':'#4b6473','text-halo-color':theme==='dark'?'#102130':'#ffffff','text-halo-width':1.4}});
    map.addLayer({id:'selected-route-glow',type:'line',source:'selected-route',paint:{'line-color':['get','color'],'line-width':11,'line-opacity':.2,'line-blur':3}});
    map.addLayer({id:'selected-route-line',type:'line',source:'selected-route',paint:{'line-color':['get','color'],'line-width':4,'line-opacity':.95}});
    applyFilter();
  }
  function applyFilter(){for(const id of ['network-glow','network-lines','station-dots','station-labels'])if(map.getLayer(id)){map.setLayoutProperty(id,'visibility',networkOn?'visible':'none');map.setFilter(id,id.startsWith('station-')?stationFilter:filter);}}
  map.on('style.load',mount);
  map.on('click',e=>{const id=vehicleLayer.hitTest(e.point);if(id)onSelect(id);else onClear();});
  map.on('mousemove',e=>{map.getCanvas().style.cursor=vehicleLayer.hitTest(e.point)?'pointer':'';});
  map.on('moveend',onMove);map.on('error',e=>onError(e.error?.message||'Die Karte konnte nicht vollständig geladen werden.'));
  return {
    raw:map,
    getBounds:()=>{const bounds=map.getBounds();return {contains:([lat,lon])=>bounds.contains([lon,lat])};},
    zoomIn:()=>map.zoomIn(),zoomOut:()=>map.zoomOut(),
    fitBounds:(bounds)=>{vehicleLayer.setBounds(bounds);map.fitBounds([[bounds[0][1],bounds[0][0]],[bounds[1][1],bounds[1][0]]],{padding:{top:100,right:60,bottom:innerWidth<760?250:70,left:innerWidth<760?40:390},maxZoom:12.3});},
    update:(next,fetchedAt,now)=>vehicleLayer.update(next,fetchedAt,now),
    performance:()=>vehicleLayer.stats(),
    select:(v,geometry)=>{selected=v?.id??null;selectedGeometry=geometry||collection(v?v.segments.filter(s=>s.geometry==='shape').map(s=>({type:'Feature',geometry:{type:'LineString',coordinates:s.points.map(p=>[p[1],p[0]])},properties:{color:v.color}})):[]);map.getSource('selected-route')?.setData(selectedGeometry);vehicleLayer.select(selected);},
    setNetwork:data=>{network=data.lines;stops=data.stops;map.getSource('network')?.setData(network);map.getSource('stations')?.setData(stops);},
    // Long-distance network routes are context; only a selected trip supplies its exact itinerary.
    setFilter:(modes,lineKeys)=>{
      const lineMatch=lineKeys?['any',modes.includes('long_distance')?['in','long_distance',['get','modes']]:['literal',false],...lineKeys.map(k=>['in',k,['get','lineKeys']])]:['literal',true];
      stationFilter=['all',modes.length?['any',...modes.map(m=>['in',m,['get','modes']])]:['literal',false],lineMatch];
      filter=['all',['in',['get','mode'],['literal',modes]],...(lineKeys?[['any',['==',['get','mode'],'long_distance'],...lineKeys.map(k=>['in',k,['get','lineKeys']])]]:[])];applyFilter();
    },
    showNetwork:value=>{networkOn=value;applyFilter();},
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
    if(l.type==='line'&&/railway/.test(l.id)){l.minzoom=Math.min(l.minzoom??9,10);l.paint['line-color']=theme==='dark'?'#566b7d':'#8a9ba8';}
    if(l.type==='symbol'&&/poi|housenumber/.test(l.id))l.layout={...l.layout,visibility:'none'};
  }
  return style;
}
