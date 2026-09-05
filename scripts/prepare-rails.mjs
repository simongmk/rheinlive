// Import an actual, complete Overpass response; never creates transport activity.
// Query each city's bounds with a .01-degree margin, sequentially:
// [out:json][timeout:45];way[railway~"^(light_rail|tram|rail|subway|narrow_gauge|construction)$"](south,west,north,east);out geom;
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {cities} from '../lib/cities.mjs';
import {buildRailDetail} from '../lib/rail-geometry.mjs';
const [id,input]=process.argv.slice(2);if(!cities[id]||!input)throw Error('Usage: node scripts/prepare-rails.mjs city raw-osm.json');
const result=buildRailDetail(JSON.parse(await readFile(input,'utf8')),cities[id]);
const text=JSON.stringify(result);if(text.length>8_000_000)throw Error('Rail detail exceeds per-city budget');
await writeFile(new URL('../public/data/tracks-'+id+'.json',import.meta.url),text);
console.log(JSON.stringify({city:id,sourceDate:result.sourceDate,...result.stats,bytes:Buffer.byteLength(text),gzipBytes:gzipSync(text).length}));
