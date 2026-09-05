import {positionAt} from '../lib/transit.mjs';

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
  const sprites=new Map(),budget=new FrameBudget(),motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let frames=0,since=perf.now(),observedFps=0,firstFrameAt=null;
  function resize(){const base=map.getCanvas(),w=base.clientWidth,h=base.clientHeight,scale=Math.min(2,globalThis.devicePixelRatio||1);if(w===width&&h===height&&dpr===scale)return;width=w;height=h;dpr=scale;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);sprites.clear();}
  function sprite(v,radius,fontSize){
    const planned=v.quality==='schedule',label=v.mode==='long_distance'?v.line.replace(/\s+(?=\d)/,'\n'):v.line,key=[label,v.color,v.textColor,planned,theme,radius,fontSize,dpr].join('|');
    if(sprites.has(key))return sprites.get(key);
    const node=doc.createElement('canvas'),size=(radius+3)*2;node.width=Math.ceil(size*dpr);node.height=Math.ceil(size*dpr);const c=node.getContext('2d');c.scale(dpr,dpr);c.globalAlpha=planned?.65:1;c.beginPath();c.arc(size/2,size/2,radius,0,Math.PI*2);c.fillStyle=planned?(theme==='dark'?'#142838':'#ffffff'):v.color;c.fill();c.lineWidth=planned?1:1.8;c.strokeStyle=planned?'#8c9eab':'#ffffff';c.stroke();c.fillStyle=planned?(theme==='dark'?'#a8b9c5':'#475a66'):(v.textColor||'#ffffff');c.font=`700 ${fontSize}px system-ui, sans-serif`;c.textAlign='center';c.textBaseline='middle';const lines=label.split('\n');for(let i=0;i<lines.length;i++)c.fillText(lines[i],size/2,size/2+(i-(lines.length-1)/2)*fontSize,radius*1.75);const result={node,size};if(sprites.size>=512)sprites.delete(sprites.keys().next().value);sprites.set(key,result);return result;
  }
  function paint(){
    const start=perf.now();resize();ctx.clearRect(0,0,width,height);hits=[];
    if(doc.hidden||!vehicles.length)return;
    const now=clock()+offset,zoom=map.getZoom(),normalRadius=Math.round(Math.min(17,Math.max(10,10+(zoom-9)*1.4))),fontSize=zoom<11?10:12,bounds=map.getBounds();
    for(const v of vehicles){const p=positionAt(v,now,fetchedAt);if(!p||p.quality!==v.quality||!bounds.contains([p.lon,p.lat]))continue;if(region&&(p.lat<region[0][0]||p.lat>region[1][0]||p.lon<region[0][1]||p.lon>region[1][1]))continue;const xy=map.project([p.lon,p.lat]);if(xy.x< -30||xy.x>width+30||xy.y< -30||xy.y>height+30)continue;const radius=v.mode==='long_distance'?normalRadius+4:normalRadius;
      if(v.id===selected){ctx.beginPath();ctx.arc(xy.x,xy.y,radius+7,0,Math.PI*2);ctx.fillStyle=v.color;ctx.globalAlpha=.2;ctx.fill();ctx.globalAlpha=1;ctx.lineWidth=2;ctx.strokeStyle=v.color;ctx.stroke();}
      const s=sprite(v,radius,fontSize);ctx.drawImage(s.node,xy.x-s.size/2,xy.y-s.size/2,s.size,s.size);hits.push({id:v.id,x:xy.x,y:xy.y,radius});
    }
    const end=perf.now();if(firstFrameAt===null&&hits.length)firstFrameAt=end;budget.record(end,end-start);frames++;if(end-since>=1000){observedFps=Math.round(frames*1000/(end-since));frames=0;since=end;}
  }
  function loop(ts){frame=null;if(destroyed||doc.hidden||!vehicles.length)return;if(!map.isMoving()&&ts-budget.last>=(motion?.matches?1000:1000/budget.fps)-1)paint();frame=raf(loop);}
  function schedule(){if(frame===null&&!destroyed&&!doc.hidden&&vehicles.length)frame=raf(loop);}
  function wake(){if(frame!==null){caf(frame);frame=null;}paint();schedule();}
  const onRender=()=>{if(!doc.hidden&&map.isMoving())paint();};
  map.on('render',onRender);map.on('resize',wake);doc.addEventListener('visibilitychange',wake);motion?.addEventListener('change',wake);
  return {
    update(next,age=fetchedAt,now=clock()+offset){vehicles=next;fetchedAt=age;offset=now-clock();wake();},
    select(id){selected=id;paint();},
    setBounds(bounds){region=bounds;paint();},
    setTheme(next){theme=next;sprites.clear();paint();},
    hitTest(p){let result=null,nearest=Infinity;for(const h of hits){const d=Math.hypot(p.x-h.x,p.y-h.y);if(d<=h.radius+5&&d<nearest){nearest=d;result=h.id;}}return result;},
    stats:()=>({firstFrameAt,targetFps:motion?.matches?1:budget.fps,observedFps:doc.hidden||!vehicles.length?0:observedFps,drawMs:+budget.average.toFixed(2),visible:hits.length,sprites:sprites.size}),
    destroy(){destroyed=true;if(frame!==null)caf(frame);map.off('render',onRender);map.off('resize',wake);doc.removeEventListener('visibilitychange',wake);motion?.removeEventListener('change',wake);sprites.clear();canvas.remove();},
  };
}
