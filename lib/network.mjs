import {distance} from './transit.mjs';
const collection=features=>({type:'FeatureCollection',features});
const parentId=id=>String(id||'').match(/(?:^|_)(de:\d{5}:\d+)(?::|$)/)?.[1];
/** One named station per parent stop; retain all line/mode memberships for filtering. */
export function groupStations(features){
  const groups=[],parents=new Map(),names=new Map();
  for(const f of features){
    const p=f.properties,xy=f.geometry.coordinates,name=p.name.trim(),key=name.toLocaleLowerCase('de'),parent=parentId(p.id);
    let g=parent?parents.get(parent):undefined;
    if(!g)g=(names.get(key)||[]).find(g=>(!parent||!g.parent||g.parent===parent)&&distance([xy[1],xy[0]],[g.anchor[1],g.anchor[0]])<=180);
    if(!g){g={parent,name,id:parent||String(p.id||name+':'+xy.join(',')),anchor:xy,points:new Map(),modes:new Set(),lineKeys:new Set()};groups.push(g);if(!names.has(key))names.set(key,[]);names.get(key).push(g);}
    if(parent){g.parent=parent;g.id=parent;parents.set(parent,g);}
    g.points.set(xy.map(n=>n.toFixed(5)).join(','),xy);g.modes.add(p.mode);g.lineKeys.add(p.lineKey);
  }
  return collection(groups.map(g=>{const ps=[...g.points.values()],mean=ps.reduce((a,p)=>[a[0]+p[0]/ps.length,a[1]+p[1]/ps.length],[0,0]);return {type:'Feature',properties:{id:g.id,name:g.name,modes:[...g.modes].sort(),lineKeys:[...g.lineKeys].sort()},geometry:{type:'Point',coordinates:mean.map(n=>+n.toFixed(5))}};}));
}
/** Identical geometry is stored once per mode, with every line that uses it. */
export function compactLines(features){
  const groups=new Map();
  for(const f of features){const p=f.properties,coords=f.geometry.coordinates,a=JSON.stringify(coords),b=JSON.stringify(coords.map(path=>[...path].reverse()).reverse()),key=p.mode+':'+(a<b?a:b);let g=groups.get(key);if(!g){g={type:'Feature',properties:{mode:p.mode,color:p.color,lineKeys:[]},geometry:f.geometry};groups.set(key,g);}if(!g.properties.lineKeys.includes(p.lineKey))g.properties.lineKeys.push(p.lineKey);}
  return collection([...groups.values()]);
}
