// Rebuild a static, attributed network snapshot. Never creates vehicle positions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {cities,modeFor,lineName,lineKey,lineColor,pointInBounds,segmentIntersectsBounds} from '../lib/cities.mjs';
import {decodePolyline,validPoint} from '../lib/transit.mjs';
import {groupStations,compactLines} from '../lib/network.mjs';
const id=process.argv[2],input=process.argv[3];if(!cities[id]||!input)throw Error('Usage: node scripts/prepare-network.mjs city raw-routes.json');
const city=cities[id],raw=JSON.parse(await readFile(input,'utf8'));
if(!Array.isArray(raw.routes)||!Array.isArray(raw.polylines)||!Array.isArray(raw.stops))throw Error('Invalid network response');
const features=new Map(),stops=new Map(),lines=new Map(),paths=new Map();
function simplify(points){
  if(points.length<3)return points;
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]],tolerance=.00006**2;
  while(stack.length){const [first,last]=stack.pop(),a=points[first],b=points[last];let max=tolerance,at=-1;
    for(let i=first+1;i<last;i++){const p=points[i],dx=(b[1]-a[1])*.63,dy=b[0]-a[0],px=(p[1]-a[1])*.63,py=p[0]-a[0];const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy||1)));const d=(px-t*dx)**2+(py-t*dy)**2;if(d>max){max=d;at=i;}}
    if(at>=0){keep.add(at);stack.push([first,at],[at,last]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
function clippedPieces(points){
  // Retain inside vertices and the immediately adjacent vertex across each boundary.
  // MapLibre clips at the viewport; never join separate excursions into one line.
  const out=[];let current=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],inside=segmentIntersectsBounds(a,b,city.bounds);
    if(inside){if(!current.length)current.push(a);current.push(b);}else if(current.length){out.push(current);current=[];}
  }
  if(current.length)out.push(current);return out;
}
for(const route of raw.routes){
  const mode=modeFor(route.mode)?.id;if(!mode)continue;
  for(const line of route.transitRoutes||[]){
    const name=lineName(line.shortName||line.longName,mode);if(!name||name==='?')continue;
    const key=lineKey(mode,name),color=lineColor(mode,name,line.color);let used=false;
    for(const segment of route.segments||[]){
      const poly=raw.polylines[segment.polyline]?.polyline;if(!poly)continue;
      if(!paths.has(segment.polyline)){let p=[];try{p=decodePolyline(poly.points,poly.precision??5);}catch{}paths.set(segment.polyline,clippedPieces(p).map(simplify));}
      const pieces=paths.get(segment.polyline);if(!pieces.length)continue;used=true;
      const rounded=pieces.map(path=>path.map(([lat,lon])=>[+lon.toFixed(5),+lat.toFixed(5)]));
      const directionA=JSON.stringify(rounded),directionB=JSON.stringify(rounded.map(p=>[...p].reverse()).reverse());
      const featureKey=key+':'+(directionA<directionB?directionA:directionB);
      // Rail infrastructure comes directly from the vector basemap. Retain routes
      // only for bus/ferry overlays; catalog and station membership still cover rail.
      if(['bus','ferry'].includes(mode)&&!features.has(featureKey))features.set(featureKey,{type:'Feature',properties:{mode,line:name,lineKey:key,color,pathSource:route.pathSource},geometry:{type:'MultiLineString',coordinates:rounded}});
      for(const index of [segment.from,segment.to]){const p=raw.stops[index];if(!p||!validPoint([p.lat,p.lon])||!pointInBounds([p.lat,p.lon],city.bounds))continue;const id=(p.stopId||p.name)+':'+key;stops.set(id,{type:'Feature',properties:{id:p.stopId,name:p.name,mode,line:name,lineKey:key},geometry:{type:'Point',coordinates:[p.lon,p.lat]}});}
    }
    if(used)lines.set(key,{key,line:name,mode,color});
  }
}
const collection=features=>({type:'FeatureCollection',features});
const compact=compactLines([...features.values()]),generatedAt=new Date().toISOString();
const data={city:id,generatedAt,kind:'static-network-not-live-vehicles',source:'Transitous / MOTIS, DELFI and OpenStreetMap contributors',sourceUrl:'https://transitous.org/sources/',geometry:'Rail tracks are supplied by OpenFreeMap/OpenMapTiles, not by route overlays. Bus/ferry routes are static MOTIS paths; current diversions may differ.',lines:collection(compact.features.filter(f=>f.properties.mode==='ferry')),stops:groupStations([...stops.values()]),catalog:[...lines.values()],parts:{bus:'/data/network-'+id+'-bus.json?v=7'}};
const bus={city:id,generatedAt,kind:'static-network-part',lines:collection(compact.features.filter(f=>f.properties.mode==='bus'))};
await mkdir('public/data',{recursive:true});await writeFile('public/data/network-'+id+'-bus.json',JSON.stringify(bus));await writeFile('public/data/network-'+id+'.json',JSON.stringify(data));console.log(JSON.stringify({city:id,lines:lines.size,paths:compact.features.length,stops:data.stops.features.length,initialBytes:Buffer.byteLength(JSON.stringify(data)),busBytes:Buffer.byteLength(JSON.stringify(bus))}));
