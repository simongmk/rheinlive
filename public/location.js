import {validPoint} from '../lib/transit.mjs';

export const locationMessages={
  locating:'Standort wird bestimmt …',
  blocked:'Diese Ansicht erlaubt keinen Standortzugriff. Öffne die App separat oder setze deinen Standort auf der Karte.',
  denied:'Browser oder Gerät blockiert den Standort. Prüfe die Standortfreigabe oder setze ihn auf der Karte.',
  timeout:'Der Standort antwortet nicht. Erneut versuchen oder auf der Karte setzen.',
  unavailable:'Standort gerade nicht verfügbar. Erneut versuchen oder auf der Karte setzen.',
  unsupported:'Diese Ansicht unterstützt die Ortung nicht. Standort auf der Karte setzen.',
  insecure:'Die Ortung braucht eine sichere Verbindung. Standort auf der Karte setzen.',
  found:'',
};

/** One bounded request. Neither missing callbacks nor late native responses own the UI. */
export function createLocationRequest({onState,onPosition,navigator:nav=globalThis.navigator,document:doc=globalThis.document,secure=globalThis.isSecureContext,clock=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let revision=0,timer=null;
  function cancel(){revision++;if(timer!==null)clearTimer(timer);timer=null;}
  function request(){
    cancel();const seq=revision;let complete=false;
    function finish(state,position){if(seq!==revision||complete)return;complete=true;if(timer!==null)clearTimer(timer);timer=null;onState(state);if(position)onPosition(position);}
    if(secure===false){finish('insecure');return;}
    try{const policy=doc?.permissionsPolicy??doc?.featurePolicy;if(policy?.allowsFeature('geolocation')===false){finish('blocked');return;}}catch{/* Optional browser capability. */}
    if(!nav?.geolocation?.getCurrentPosition){finish('unsupported');return;}
    onState('locating');
    // Native timeout may exclude the permission prompt or never fire in a WebView.
    timer=setTimer(()=>finish('timeout'),18000);
    try{nav.geolocation.getCurrentPosition(result=>{
      const p=result?.coords,point=[p?.latitude,p?.longitude],timestamp=result?.timestamp;
      if(!validPoint(point)||!Number.isFinite(p.accuracy)||p.accuracy<0||!Number.isFinite(timestamp)||clock()-timestamp>30000||timestamp-clock()>30000){finish('unavailable');return;}
      finish('found',{point,accuracy:p.accuracy,timestamp,source:'device'});
    },error=>finish(error?.code===1?'denied':error?.code===3?'timeout':'unavailable'),{enableHighAccuracy:true,timeout:12000,maximumAge:0});}
    catch{finish('unavailable');}
  }
  return {request,cancel};
}
