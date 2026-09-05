import {platformRegistry} from './platform-data.mjs';
const clean=value=>typeof value==='string'?value.trim().slice(0,30):'';
const stationPlates=new Map(Object.entries(platformRegistry.stations).map(([id,quays])=>[id,new Set(Object.values(quays))]));
/** Resolve the label of the supplied stop assignment, not a train's location.
 * DELFI contains internal codes in platform_code (e.g. Deutz 91 rather than 9).
 * Only an exact DHID -> explicit OpenStation PlateCode match can repair it.
 * A reported change with an undecodable track stays unknown, never the old track.
 */
export function platformFields(place){
  const current=clean(place.track),scheduled=clean(place.scheduledTrack);
  const changed=!!(current&&scheduled&&current!==scheduled);
  const id=String(place.stopId??place.id??'').replace(/^de-DELFI_/,'');
  const station=id.split(':').slice(0,3).join(':'),quays=platformRegistry.stations[station];
  let track=current,scheduledTrack=scheduled,trackSource='transitous';
  if(quays){
    const plates=stationPlates.get(station);
    if(!plates.has(scheduled))scheduledTrack='';
    if(current&&!plates.has(current))track='';
    if(!track&&!changed&&Object.hasOwn(quays,id)){
      track=quays[id];trackSource='openstation';
      if(scheduled)scheduledTrack=track;
    }
  }
  return {track:track||null,scheduledTrack:scheduledTrack||null,trackChanged:changed,trackSource,stationId:quays?station:null};
}
