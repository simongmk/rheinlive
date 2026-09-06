/** Called by the vehicle frame clock, never by a second timer or easing loop. */
export function createFollowCamera(map){
  let offset=null,startedAt=0;
  function reset(){offset=null;}
  return {
    start(){reset();map.stop();},
    reset,
    step(position,ts,reducedMotion=false){
      if(!position){reset();return false;}
      const current=map.getCenter(),target=[position.lon,position.lat];
      if(!offset){offset=[current.lng-target[0],current.lat-target[1]];startedAt=ts;}
      const t=reducedMotion?1:Math.max(0,Math.min(1,(ts-startedAt)/450)),remaining=1-t*t*(3-2*t);
      const center=[target[0]+offset[0]*remaining,target[1]+offset[1]*remaining];
      if(Math.abs(center[0]-current.lng)<1e-11&&Math.abs(center[1]-current.lat)<1e-11)return false;
      // Preserve zoom, pitch, bearing and padding. Mark generated movement so
      // expensive viewport UI can stay on its own slower update cadence.
      map.jumpTo({center},{vehicleFollow:true});return true;
    },
  };
}
