import {cities,transportModes} from '../lib/cities.mjs';

const fold=value=>String(value??'').toLocaleLowerCase('de').replace(/ä|ae/g,'a').replace(/ö|oe/g,'o').replace(/ü|ue/g,'u').replaceAll('ß','ss').normalize('NFD').replace(/\p{M}/gu,'').trim();
const matches=(text,query)=>query.split(/\s+/).every(word=>fold(text).includes(word));
export function placeMatches({query,city,network,catalog=[]}){
  const q=fold(query);if(!q)return [];
  const places=Object.values(cities).filter(c=>q.length>=2&&matches(c.name+' '+c.id,q)).map(c=>({kind:'city',key:c.id,title:c.name,subtitle:'Stadt',cityId:c.id}));
  const lineQuery=q.replace(/^(?:linie|line)\s+/,'');
  const lines=catalog.filter(l=>matches(l.line+' '+(transportModes.find(m=>m.id===l.mode)?.name??l.mode),lineQuery)).sort((a,b)=>Number(fold(b.line)===lineQuery)-Number(fold(a.line)===lineQuery)||a.line.localeCompare(b.line,'de',{numeric:true})).slice(0,5).map(line=>({kind:'line',key:line.key,title:line.line,subtitle:(transportModes.find(m=>m.id===line.mode)?.name??line.mode)+' · '+city.name,cityId:city.id,line}));
  const stops=new Map();if(q.length>=2)for(const f of network?.stops?.features??[]){if(f.properties.queryId&&matches(f.properties.name,q)&&!stops.has(f.properties.queryId))stops.set(f.properties.queryId,f);}
  const stations=[...stops.values()].sort((a,b)=>Number(fold(b.properties.name).startsWith(q))-Number(fold(a.properties.name).startsWith(q))).slice(0,6).map(station=>({kind:'station',key:station.properties.queryId,title:station.properties.name,subtitle:'Haltestelle · '+city.name,cityId:city.id,station}));
  return [...places,...lines,...stations];
}

/** One search surface; filtering/rendering never loads additional regional networks. */
export function createPlaceSearch({input,results,getContext,onChoose,document:doc=globalThis.document}){
  let choices=[],signature='',open=false;
  const close=()=>{open=false;results.hidden=true;input.setAttribute('aria-expanded','false');};
  const clear=()=>{input.value='';choices=[];signature='';results.replaceChildren();close();};
  function choose(item){clear();onChoose(item);}
  function render(){
    const query=input.value.trim();if(!query){clear();return;}
    const context=getContext();choices=placeMatches({...context,query});
    const note=choices.length?'':!context.network?(context.networkError||'Haltestellen werden geladen …'):'Keine Treffer in '+context.city.name+'.';
    const key=JSON.stringify([query,choices.map(c=>[c.kind,c.key,c.title,c.subtitle]),note]);
    if(key!==signature){signature=key;results.replaceChildren();
      for(const item of choices){const button=doc.createElement('button');button.type='button';button.className='place-result';button.dataset.key=item.kind+':'+item.key;
        const title=doc.createElement('span');title.className='place-title';title.textContent=item.title;
        const subtitle=doc.createElement('small');subtitle.textContent=item.subtitle;button.append(title,subtitle);button.onclick=()=>choose(item);
        button.onkeydown=e=>{const buttons=[...results.querySelectorAll('button')],i=buttons.indexOf(button);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=i+(e.key==='ArrowDown'?1:-1);if(next<0)input.focus();else buttons[next]?.focus();}else if(e.key==='Escape'){e.preventDefault();clear();input.focus();}};
        results.append(button);
      }
      if(note){const p=doc.createElement('p');p.className='monitor-note';p.textContent=note;results.append(p);}
    }
    results.hidden=false;open=true;input.setAttribute('aria-expanded','true');
  }
  input.oninput=render;input.onfocus=()=>{if(input.value.trim())render();};
  input.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();clear();}else if(e.key==='ArrowDown'){e.preventDefault();if(!open)render();results.querySelector('button')?.focus();}else if(e.key==='Enter'&&choices[0]){e.preventDefault();choose(choices[0]);}};
  return {clear,close,refresh:()=>{if(open)render();}};
}
