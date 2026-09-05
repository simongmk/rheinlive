import {cities} from '../lib/cities.mjs';

export const DETAIL_ZOOM=14.3;
export function coveredRailCity(bounds){
  return Object.values(cities).find(c=>bounds.getSouth()>=c.bounds[0][0]&&bounds.getWest()>=c.bounds[0][1]&&bounds.getNorth()<=c.bounds[1][0]&&bounds.getEast()<=c.bounds[1][1])?.id??null;
}

/** Load one regional source in MapLibre's worker, on demand. The ordinary
 * vector tracks remain visible until the new source is ready, and outside its
 * complete coverage. No geometry work or source updates in animation frames.
 */
export function createRailDetail(map,onChange=()=>{}){
  let enabled=true,requested=null,ready=null,active=false,mounted=false,destroyed=false;
  const failedUntil=new Map(),seenTimings=new Set();let transferBytes=0;
  const desired=()=>enabled&&map.getZoom()>=DETAIL_ZOOM?coveredRailCity(map.getBounds()):null;
  function show(value){if(value===active)return;active=value;onChange({active});}
  function evaluate(load=false){
    if(!mounted||destroyed)return;
    const city=desired();
    show(Boolean(city&&city===ready));
    if(load&&city&&city!==requested&&Date.now()>=(failedUntil.get(city)||0)){
      requested=city;ready=null;show(false);
      // setData URL parsing and tiling happen off the browser's main thread.
      map.getSource('detail-tracks').setData('/data/tracks-'+city+'.json?v=8');
    }
  }
  const move=()=>evaluate(false),end=()=>evaluate(true);
  const data=e=>{
    if(e.sourceId!=='detail-tracks')return;
    // Worker resource entries do not appear in the window performance timeline.
    // Metadata/content events repeat them, so count each request only once.
    for(const timing of e.resourceTiming||[]){
      const key=timing.name+':'+timing.startTime;
      if(Number.isFinite(timing.transferSize)&&!seenTimings.has(key)){transferBytes+=timing.transferSize;seenTimings.add(key);if(seenTimings.size>64)seenTimings.delete(seenTimings.values().next().value);}
    }
    if(requested&&map.isSourceLoaded('detail-tracks')){ready=requested;evaluate(false);}
  };
  const error=e=>{if(e.sourceId!=='detail-tracks')return;if(requested)failedUntil.set(requested,Date.now()+60000);ready=null;requested=null;show(false);};
  for(const [event,fn]of [['move',move],['moveend',end],['sourcedata',data],['error',error]])map.on(event,fn);
  return {
    mount(){mounted=true;requested=null;ready=null;show(false);evaluate(true);},
    setEnabled(value){enabled=value;evaluate(true);},
    stats(){return {transferBytes};},
    destroy(){destroyed=true;for(const [event,fn]of [['move',move],['moveend',end],['sourcedata',data],['error',error]])map.off(event,fn);},
  };
}
