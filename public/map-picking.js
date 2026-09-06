// Resolve visible features to original stations: MapLibre may stringify arrays.
export function bindMapPicking(map,{vehicles,stationById,onVehicle,onStation,onClear,isPickingLocation=()=>false,onLocation=()=>{},raf=requestAnimationFrame,caf=cancelAnimationFrame}){
  const canvas=map.getCanvas();let dragging=false,hoverFrame=null,hoverPoint=null;
  function stationAt(point){
    const layers=['station-dots','station-labels','board-station-dot'].filter(id=>map.getLayer(id));
    if(!layers.length)return null;
    const box=[[point.x-12,point.y-12],[point.x+12,point.y+12]];
    let nearest=null,best=Infinity;const seen=new Set();
    for(const feature of map.queryRenderedFeatures(box,{layers})){
      const id=feature.properties?.queryId;if(!id||seen.has(id))continue;seen.add(id);
      const station=stationById(id);if(!station)continue;
      const p=map.project(station.geometry.coordinates),d=Math.hypot(point.x-p.x,point.y-p.y);
      if(d<best){nearest=station;best=d;}
    }
    return nearest;
  }
  function cursor(value){if(canvas.style.cursor!==value)canvas.style.cursor=value;}
  const click=e=>{if(dragging)return;if(isPickingLocation()){if(e.lngLat)onLocation([e.lngLat.lat,e.lngLat.lng]);return;}const id=vehicles.hitTest(e.point);if(id){onVehicle(id);return;}const station=stationAt(e.point);if(station)onStation(station);else onClear();};
  const hover=e=>{if(dragging||e.originalEvent?.buttons)return;hoverPoint=e.point;if(hoverFrame===null)hoverFrame=raf(()=>{hoverFrame=null;cursor(isPickingLocation()?'crosshair':vehicles.hitTest(hoverPoint)||stationAt(hoverPoint)?'pointer':'');});};
  const leave=()=>{if(hoverFrame!==null)caf(hoverFrame);hoverFrame=null;hoverPoint=null;cursor('');};
  const start=()=>{dragging=true;leave();},end=()=>{dragging=false;leave();if(isPickingLocation())cursor('crosshair');};
  const events=[['click',click],['mousemove',hover],['dragstart',start],['dragend',end],['mouseout',leave]];
  for(const [event,fn]of events)map.on(event,fn);
  return ()=>{for(const [event,fn]of events)map.off(event,fn);leave();};
}
