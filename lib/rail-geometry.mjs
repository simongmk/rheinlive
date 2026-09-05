import {segmentIntersectsBounds} from './cities.mjs';

const railTypes=new Set(['rail','light_rail','tram','subway','narrow_gauge']);
const round=p=>p.map(n=>+n.toFixed(7));
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];

/** Cosmetic corner rounding in metres. Ends and shared OSM nodes are fixed.
 * A quadratic stays inside the corner triangle: its greatest distance from
 * either incident segment is cut * sin(turn) / 4. No extrapolation or snapping.
 */
export function roundRailCorners(points,locked=new Set(),maxDeviation=.6){
  if(points.length<3)return points.map(p=>[...p]);
  const out=[[...points[0]]],sx=111320*Math.cos(points[0][1]*Math.PI/180),sy=111320;
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1];
    const u=[(b[0]-a[0])*sx,(b[1]-a[1])*sy],v=[(c[0]-b[0])*sx,(c[1]-b[1])*sy];
    const before=Math.hypot(...u),after=Math.hypot(...v);
    if(locked.has(i)||before<.1||after<.1){out.push([...b]);continue;}
    const angle=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(before*after))));
    // Keep sharp or degenerate source geometry intact; never invent a rail bend.
    if(angle<.015||angle>Math.PI/3){out.push([...b]);continue;}
    const cut=Math.min(before*.4,after*.4,4*maxDeviation/Math.sin(angle));
    if(cut*Math.sin(angle)/4<.02){out.push([...b]);continue;}
    const start=[b[0]-(b[0]-a[0])*cut/before,b[1]-(b[1]-a[1])*cut/before];
    const end=[b[0]+(c[0]-b[0])*cut/after,b[1]+(c[1]-b[1])*cut/after];
    out.push(round(start));
    const steps=Math.max(3,Math.ceil(angle/.07));
    for(let j=1;j<=steps;j++){const t=j/steps,s=1-t;out.push(round([s*s*start[0]+2*s*t*b[0]+t*t*end[0],s*s*start[1]+2*s*t*b[1]+t*t*end[1]]));}
  }
  out.push([...points.at(-1)]);
  return out.filter((p,i)=>!i||!same(p,out[i-1]));
}

export function buildRailDetail(raw,{id,bounds}){
  if(raw.remark||!raw.osm3s?.timestamp_osm_base||!Array.isArray(raw.elements))throw Error('Incomplete OSM rail response');
  const ways=raw.elements.filter(w=>w.type==='way'&&(railTypes.has(w.tags?.railway)||(w.tags?.railway==='construction'&&railTypes.has(w.tags['construction:railway']||w.tags.construction))));
  const occurrences=new Map();
  for(const w of ways){
    if(w.nodes?.length<2||w.nodes?.length!==w.geometry?.length||w.geometry.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>85||Math.abs(p.lon)>180))throw Error('Invalid OSM rail way '+w.id);
    for(const node of w.nodes)occurrences.set(node,(occurrences.get(node)||0)+1);
  }
  const groups=new Map();let sourcePoints=0,renderedPoints=0,wayCount=0;
  for(const w of ways){
    const status=w.tags.railway==='construction'?'construction':'active',subclass=status==='construction'?(w.tags['construction:railway']||w.tags.construction):w.tags.railway;
    const properties={class:['rail','narrow_gauge'].includes(subclass)?'rail':'transit',status,brunnel:w.tags.tunnel&&w.tags.tunnel!=='no'?'tunnel':w.tags.bridge&&w.tags.bridge!=='no'?'bridge':'ground'};
    const key=JSON.stringify(properties);let pieces=[],current=[];
    // Keep immediately adjacent outside vertices. Coverage is checked against
    // the inner city bounds; the Overpass query includes a further margin.
    for(let i=1;i<w.geometry.length;i++){
      const a=w.geometry[i-1],b=w.geometry[i];
      if(segmentIntersectsBounds([a.lat,a.lon],[b.lat,b.lon],bounds)){if(!current.length)current.push(i-1);current.push(i);}
      else if(current.length){pieces.push(current);current=[];}
    }
    if(current.length)pieces.push(current);if(!pieces.length)continue;wayCount++;
    if(!groups.has(key))groups.set(key,{type:'Feature',properties,geometry:{type:'MultiLineString',coordinates:[]}});
    for(const indices of pieces){
      const points=indices.map(i=>[w.geometry[i].lon,w.geometry[i].lat]);
      const locked=new Set(indices.flatMap((i,j)=>occurrences.get(w.nodes[i])>1?[j]:[]));
      const smooth=roundRailCorners(points,locked);sourcePoints+=points.length;renderedPoints+=smooth.length;
      groups.get(key).geometry.coordinates.push(smooth);
    }
  }
  if(!wayCount)throw Error('No mapped rail ways in region');
  return {type:'FeatureCollection',city:id,bounds,source:'OpenStreetMap contributors / Overpass API',license:'ODbL-1.0',sourceDate:raw.osm3s.timestamp_osm_base,geometry:'Mapped tracks, gently rounded for display. Construction is not an operational railway.',maxRoundingDeviationMetres:.6,stats:{ways:wayCount,sourcePoints,renderedPoints},features:[...groups.values()]};
}
