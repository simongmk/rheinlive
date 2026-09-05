// Only source-observed station IDs in configured regions can be queried by the monitor.
import {readFile,writeFile} from 'node:fs/promises';
import {cities} from '../lib/cities.mjs';
const index={};
for(const city of Object.keys(cities)){
  const data=JSON.parse(await readFile('public/data/network-'+city+'.json','utf8'));
  index[city]=Object.fromEntries(data.stops.features.filter(f=>f.properties.queryId).map(f=>[f.properties.queryId,[f.geometry.coordinates[1],f.geometry.coordinates[0]]]));
}
await writeFile('lib/station-index.mjs','// Generated from attributed static station snapshots. No user locations.\nexport const stationIndex='+JSON.stringify(index)+';\n');
