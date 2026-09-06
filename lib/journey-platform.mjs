import {MAX_SNAPSHOT_AGE_MS} from './cities.mjs';
export const freshDetail=(detail,now)=>Number.isFinite(detail?.fetchedAt)&&Number.isFinite(now)&&now-detail.fetchedAt<=MAX_SNAPSHOT_AGE_MS&&detail.fetchedAt-now<=30000&&(detail.validUntil===undefined||Number.isFinite(detail.validUntil)&&now<=detail.validUntil);
/** Match an occurrence of this exact stop in this exact trip. Scheduled event
 * times survive forecast shifts; without those, require a unique nearby event.
 * A platform change may change the stop ID; the official station identity and
 * event time must then agree. Never join by name or take the first loop visit.
 */
export function platformForStop(v,side,{detail,detailId,now,fetchedAt}={}){
  const segment=v.segment,stop=segment[side],event=side==='from'?'departure':'arrival',planned=side==='from'?'scheduledDeparture':'scheduledArrival';
  if(!Number.isFinite(fetchedAt)||!freshDetail({fetchedAt:segment.observedAt??fetchedAt},now))return null;
  if(detailId===v.id&&freshDetail(detail,now)&&detail.fetchedAt>=(segment.observedAt??fetchedAt)){
    const matches=(detail.stops??[]).filter(s=>s.id&&(s.id===stop.id||s.stationId&&s.stationId===stop.stationId));
    const samePlan=Number.isFinite(segment[planned])?matches.filter(s=>s[planned]===segment[planned]):[];
    const near=matches.filter(s=>Number.isFinite(s[event])&&Math.abs(s[event]-segment[event])<=120000);
    const match=samePlan.length===1?samePlan[0]:!samePlan.length&&near.length===1?near[0]:null;
    if(match)return {...match,plannedOnly:!detail.realtime};
  }
  return {...stop,plannedOnly:!segment.realtime};
}
export function platformText(stop,mode,{unknown=false}={}){
  const noun=mode==='bus'?'Steig':mode==='ferry'?'Anleger':'Gleis';
  if(stop?.cancelled)return {label:'Halt entfällt',note:'',changed:false,unknown:true};
  const current=stop?.track,planned=stop?.scheduledTrack,track=current||planned;
  const changed=stop?.trackChanged===true||!!(current&&planned&&current!==planned);
  if(!track||changed&&!current)return {label:changed?noun+' geändert':unknown?noun+' nicht gemeldet':'',note:changed?'Nummer noch nicht verfügbar':'',changed,unknown:true};
  return {label:noun+' '+track,note:changed?(planned&&current!==planned?'statt '+planned:'Änderung gemeldet'):(!current||stop.plannedOnly)?'laut Fahrplan':'',changed,unknown:false};
}
