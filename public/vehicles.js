import {positionAt} from '../lib/transit.mjs';
import {MAX_SNAPSHOT_AGE_MS} from '../lib/cities.mjs';

const FADE_IN_MS=450,FADE_OUT_MS=650;
const opacity=(entry,ts)=>{const t=Math.max(0,Math.min(1,(ts-entry.changedAt)/(entry.target?FADE_IN_MS:FADE_OUT_MS))),ease=t*t*(3-2*t);return entry.from+(entry.target-entry.from)*ease;};
function transition(entry,target,ts){if(entry.target===target)return;entry.from=opacity(entry,ts);entry.target=target;entry.changedAt=ts;}

/** The map and API do not participate in the vehicle animation clock. */
export class FrameBudget {
  constructor(){this.fps=30;this.average=0;this.slow=0;this.fast=0;this.last=0;}
  ready(ts){return ts-this.last>=1000/this.fps-1;}
  record(ts,cost){const gap=this.last?ts-this.last:0;this.last=ts;this.average=this.average*.9+cost*.1;
    const slow=cost>10||(gap>1000/this.fps*1.8&&gap<1000);
    this.slow=slow?this.slow+1:Math.max(0,this.slow-1);this.fast=!slow&&this.average<4?this.fast+1:0;
    if(this.slow>=6){this.fps=this.fps===30?20:12;this.slow=0;this.fast=0;}
    if(this.fast>=180){this.fps=this.fps===12?20:30;this.fast=0;}
  }
}

export function createVehicleLayer(map,{document:doc=document,clock=Date.now,perf=performance,raf=requestAnimationFrame,caf=cancelAnimationFrame}={}){
  const canvas=doc.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Fahrzeugdarstellung wird von diesem Browser nicht unterstützt.');
  canvas.className='vehicle-canvas';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'absolute',inset:'0',pointerEvents:'none'});map.getCanvasContainer().appendChild(canvas);
  let vehicles=[],fetchedAt=0,offset=0,selected=null,theme='dark',frame=null,width=0,height=0,dpr=1,hits=[],destroyed=false,region=null;
  const sprites=new Map(),entries=new Map(),budget=new FrameBudget(),motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let frames=0,since=perf.now(),observedFps=0,firstFrameAt=null;
  const fresh=now=>Number.isFinite(fetchedAt)&&now-fetchedAt<=MAX_SNAPSHOT_AGE_MS&&fetchedAt-now<=30000;
  function reconcile(){
    const ts=perf.now(),ids=new Set(vehicles.map(v=>v.id));
    for(const [id,e]of entries)if(!ids.has(id)){e.present=false;transition(e,0,ts);}
    for(const v of vehicles){const e=entries.get(v.id);if(e){e.vehicle=v;e.age=fetchedAt;e.present=true;}else entries.set(v.id,{vehicle:v,age:fetchedAt,present:true,position:null,from:0,target:1,changedAt:ts});}
    // Exits are decorative and short-lived. Bound them even under rapid filter churn.
    let exits=0;for(const [id,e]of entries)if(!e.present&&++exits>512)entries.delete(id);
  }
  function resize(){const base=map.getCanvas(),w=base.clientWidth,h=base.clientHeight,scale=Math.min(2,globalThis.devicePixelRatio||1);if(w===width&&h===height&&dpr===scale)return;width=w;height=h;dpr=scale;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);sprites.clear();}
  function sprite(v,radius,fontSize,stopped){
    const planned=v.quality==='schedule',label=v.mode==='long_distance'?v.line.replace(/\s+(?=\d)/,'\n'):v.line,key=[label,v.color,v.textColor,planned,theme,radius,fontSize,dpr,stopped].join('|');
    if(sprites.has(key))return sprites.get(key);
    const node=doc.createElement('canvas'),size=(radius+7)*2;node.width=Math.ceil(size*dpr);node.height=Math.ceil(size*dpr);const c=node.getContext('2d');c.scale(dpr,dpr);c.globalAlpha=planned?.65:1;c.beginPath();c.arc(size/2,size/2,radius,0,Math.PI*2);c.fillStyle=planned?(theme==='dark'?'#142838':'#ffffff'):v.color;c.fill();c.lineWidth=planned?1:1.8;c.strokeStyle=planned?'#8c9eab':'#ffffff';c.stroke();c.fillStyle=planned?(theme==='dark'?'#a8b9c5':'#475a66'):(v.textColor||'#ffffff');c.font=`700 ${fontSize}px system-ui, sans-serif`;c.textAlign='center';c.textBaseline='middle';const lines=label.split('\n');for(let i=0;i<lines.length;i++)c.fillText(lines[i],size/2,size/2+(i-(lines.length-1)/2)*fontSize,radius*1.75);if(stopped){const x=size/2+radius*.7,y=size/2+radius*.7;c.beginPath();c.arc(x,y,5,0,Math.PI*2);c.fillStyle=theme==='dark'?'#142838':'#ffffff';c.fill();c.strokeStyle=v.color;c.lineWidth=1;c.stroke();c.fillStyle=theme==='dark'?'#ffffff':'#142838';c.font='700 8px system-ui, sans-serif';c.fillText('Ⅱ',x,y+.3,6);}const result={node,size};if(sprites.size>=512)sprites.delete(sprites.keys().next().value);sprites.set(key,result);return result;
  }
  function paint(){
    const start=perf.now();resize();ctx.clearRect(0,0,width,height);hits=[];
    if(doc.hidden){entries.clear();return;}
    const now=clock()+offset,zoom=map.getZoom(),normalRadius=Math.round(Math.min(17,Math.max(10,10+(zoom-9)*1.4))),fontSize=zoom<11?10:12,bounds=map.getBounds();
    if(!fresh(now)){entries.clear();vehicles=[];return;}
    for(const [id,e]of entries){
      const v=e.vehicle,current=e.present?positionAt(v,now,e.age):null,active=current&&current.quality===v.quality;
      const observation=e.position?.segment.observedAt??e.age;
      if(!active&&(now-observation>MAX_SNAPSHOT_AGE_MS||observation-now>30000)){entries.delete(id);continue;}
      if(active){e.position=current;transition(e,1,start);}
      else{
        // Reach the supplied endpoint, then freeze. Never extrapolate a departing icon.
        const last=v.segments.at(-1);
        if(e.present&&e.target===1&&e.position?.segment===last&&now>last.arrival&&now-last.arrival<1000)e.position=positionAt(v,last.arrival,e.age)??e.position;
        transition(e,0,start);
      }
      const alpha=motion?.matches?(active?1:0):opacity(e,start),p=e.position;
      if(!p||!e.target&&(motion?.matches||start-e.changedAt>=FADE_OUT_MS)){entries.delete(id);continue;}
      if(!bounds.contains([p.lon,p.lat]))continue;if(region&&(p.lat<region[0][0]||p.lat>region[1][0]||p.lon<region[0][1]||p.lon>region[1][1]))continue;const xy=map.project([p.lon,p.lat]);if(xy.x< -30||xy.x>width+30||xy.y< -30||xy.y>height+30)continue;const radius=v.mode==='long_distance'?normalRadius+4:normalRadius;
      if(v.id===selected&&active){ctx.beginPath();ctx.arc(xy.x,xy.y,radius+7,0,Math.PI*2);ctx.fillStyle=v.color;ctx.globalAlpha=.2*alpha;ctx.fill();ctx.globalAlpha=alpha;ctx.lineWidth=2;ctx.strokeStyle=v.color;ctx.stroke();}
      const s=sprite(v,radius,fontSize,p.state==='stopped');ctx.globalAlpha=alpha;ctx.drawImage(s.node,xy.x-s.size/2,xy.y-s.size/2,s.size,s.size);ctx.globalAlpha=1;if(active&&alpha>=.2)hits.push({id:v.id,x:xy.x,y:xy.y,radius});
    }
    const end=perf.now();if(firstFrameAt===null&&hits.length)firstFrameAt=end;budget.record(end,end-start);frames++;if(end-since>=1000){observedFps=Math.round(frames*1000/(end-since));frames=0;since=end;}
  }
  function loop(ts){frame=null;if(destroyed||doc.hidden||!entries.size)return;if(!map.isMoving()&&ts-budget.last>=(motion?.matches?1000:1000/budget.fps)-1)paint();schedule();}
  function schedule(){if(frame===null&&!destroyed&&!doc.hidden&&entries.size)frame=raf(loop);}
  function wake(){if(frame!==null){caf(frame);frame=null;}paint();schedule();}
  function onVisibility(){if(!doc.hidden)reconcile();wake();}
  const onRender=()=>{if(!doc.hidden&&map.isMoving())paint();};
  map.on('render',onRender);map.on('resize',wake);doc.addEventListener('visibilitychange',onVisibility);motion?.addEventListener('change',wake);
  return {
    update(next,age=fetchedAt,now=clock()+offset,{immediate=false,discard=[]}={}){for(const id of discard)entries.delete(id);vehicles=next;fetchedAt=age;offset=now-clock();if(immediate)entries.clear();reconcile();wake();},
    select(id){selected=id;paint();},
    setBounds(bounds){if(region&&JSON.stringify(region)!==JSON.stringify(bounds)){entries.clear();vehicles=[];}region=bounds;paint();},
    setTheme(next){theme=next;sprites.clear();paint();},
    hitTest(p){let result=null,nearest=Infinity;for(const h of hits){const d=Math.hypot(p.x-h.x,p.y-h.y);if(d<=h.radius+5&&d<nearest){nearest=d;result=h.id;}}return result;},
    stats:()=>({firstFrameAt,targetFps:motion?.matches?1:budget.fps,observedFps:doc.hidden||!entries.size?0:observedFps,drawMs:+budget.average.toFixed(2),visible:hits.length,sprites:sprites.size,transitions:entries.size}),
    destroy(){destroyed=true;if(frame!==null)caf(frame);map.off('render',onRender);map.off('resize',wake);doc.removeEventListener('visibilitychange',onVisibility);motion?.removeEventListener('change',wake);sprites.clear();entries.clear();canvas.remove();},
  };
}
