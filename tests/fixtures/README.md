# Historical data fixture

`long-distance-2026-09-05.json` contains historical ICE/IC segments captured
around 12:29 UTC in all three regions, including an ICE passing Bonn without
a stop inside its rectangle. Capture times and request URLs are retained.
It is only test evidence, never served as current traffic. The same attribution
and separate data-license requirements described below apply.

`transitous-cologne-2026-09-05.json` is a small historical API capture, received
at 2026-09-05 08:48:38 UTC. It is used only in tests and is never served as live
data. The original URL and capture timestamps are recorded in the file.

Data source and attribution: [Transitous source list](https://transitous.org/sources/).
The captured trips have the `de-DELFI` source prefix. The published Transitous
configuration identifies DELFI timetable data as CC BY 4.0 and its attached
realtime feeds as CC BY-SA 4.0 / CC BY 4.0. These data terms apply separately
from the MIT license of Rheinlive's software. Preserve this attribution and the
original provenance when reusing the fixture; treat the combined data fixture
under CC BY-SA 4.0.

- https://github.com/public-transport/transitous/blob/main/feeds/de.json
- https://creativecommons.org/licenses/by/4.0/
- https://creativecommons.org/licenses/by-sa/4.0/

## Three-region capture, 5 September 2026

`regions-2026-09-05.json` contains one historical segment per available local
transport mode for Köln, Bonn and Düsseldorf plus three bus itinerary responses.
The segment capture time is recorded per sample (around 11:48 UTC); itinerary
responses were subsequently fetched on the same day. Provenance: the public
Transitous MOTIS `/api/v6/map/trips` and `/api/v6/trip` endpoints, with the
Rheinlive contact User-Agent. Operators include Kölner VB, Stadtwerke Bonn and
Rheinbahn Bus. These files are test evidence, never current production data.
Source licenses: https://transitous.org/sources/ (German realtime inputs include
CC BY-SA 4.0; timetable inputs include CC BY 4.0; computed OSM geometry is ODbL).

## Station dwell and departure monitor

`transitous-dwell-2026-09-05.json` contains three real RB26/S11 waiting
intervals from the 13:18 UTC map response. `departures-severin-2026-09-05.json`
contains eight historical departures from the public MOTIS `/api/v6/stoptimes`
response for `de-DELFI_de:05315:11311:1:13`. Receipt time is recorded from
the original capture file timestamp. Both are test-only and use the separate
Transitous/DELFI data attribution and licenses described above.

## Physical track and construction evidence

`severin-osm-2026-09-05.json` is the actual response from
https://overpass-api.de/api/interpreter, database timestamp
2026-09-05T14:12:00Z. Query: `way[railway~"^(light_rail|tram|rail|construction|proposed)$"](50.927,6.952,50.933,6.964);out geom;`
with JSON output. It records twelve OSM ways and their original nodes/tags.
This fixture is © OpenStreetMap contributors, ODbL 1.0, **not** covered by
the transit-fixture licenses above or the application's MIT license.
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

## Unresolved departure/arrival minutes

`zero-dwell-2026-09-05.json` contains three actual trips (two KVB 16 and Bus
790) from the public MOTIS map response captured at 2026-09-05T14:39:38.470Z.
Original stop coordinates, minute timestamps and trip IDs are preserved; only
unrelated trips were removed. The source URL and capture time are recorded.
This is historical test evidence, never served as current activity. Transitous,
DELFI, OSM attribution and the separate data licenses described above apply.
The fixture proves the timestamps supplied, not the actual time doors stayed open.

## Polling discontinuity, 6 September 2026

`polling-dwell-2026-09-06.json` retains three actual trips (S6, KVB 4 and 16)
from consecutive successful Cologne app snapshots at approximately 11:27 UTC.
They are normalized Transitous responses; original trip/stop IDs, geometry,
prediction times, observation times and response clocks are unchanged. Only
unrelated trips were removed. An additional outgoing leg appears in the second
capture while the current leg's shape and times stay identical. Applying its
estimated dwell retroactively reproduced 190–500 m jumps for these examples.
The fixture is historical regression evidence only and is never served as current
data. The separate Transitous/DELFI/OSM attribution and licenses above apply.
