/** Text/countdown updates need one timer per visible second, not a display RAF. */
export function createVisibleTicker(tick,{document:doc=document,window:win=globalThis,clock=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let timer=null,paused=false,destroyed=false;
  function stop(){if(timer!==null)clearTimer(timer);timer=null;}
  function schedule(){if(!destroyed&&!paused&&!doc.hidden)timer=setTimer(run,1000-clock()%1000);}
  function run(){timer=null;if(destroyed||paused||doc.hidden)return;tick();schedule();}
  function resume(){stop();if(!destroyed&&!paused&&!doc.hidden){tick();schedule();}}
  const hide=()=>{paused=true;stop();},show=()=>{paused=false;resume();};
  doc.addEventListener('visibilitychange',resume);win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);resume();
  return ()=>{destroyed=true;stop();doc.removeEventListener('visibilitychange',resume);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show);};
}
