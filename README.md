# Rheinlive

A noncommercial, open-source transit map for **Köln, Bonn and Düsseldorf**.
Explore buses, Stadtbahn, S-Bahn, regional and long-distance trains on a MapLibre vector map,
with current stop forecasts, delays and complete trip details. Ferry services
can appear when the source supplies them; verified Bonn examples were scheduled
only. The German interface supports desktop and mobile screens.

- Location-aware nearby stops and a departure monitor with a leave-home countdown.
- Walking time from the footpath network, adjustable time/buffer, Apple/Google walking links and DB journey planning.
- Dark and light maps, mapped rail tracks, optional bus/ferry routes, station search and map tilt.
- City, transport-mode and line filters, plus an accessible list of visible trips.
- Selected-trip direction, operator, stops, available alerts and platform changes.
- One stroke per mapped rail geometry, with rounded close-up tracks, distinct construction sections and a colored selected trip.
- Station dwell from reported arrival/departure, with duration and departure countdown.
- Estimated movement and optional following of a selected trip.
- One label per station, adaptive animation up to 30 fps, deferred bus network.
- Local load/animation measurements in the information dialog.

**Positions are estimated from stop forecasts and route geometry, not measured
GPS locations.** Trips without current forecasts are hidden by default. Failed
or stale snapshots stop showing positions. Data coverage is not guaranteed.

## Run

Requires Node.js 22 or later. No npm installation is required. MapLibre GL JS
5.7.1 is vendored with its license and checksums; no external script CDN is
required. Map tiles, fonts and style JSON come from OpenFreeMap.

```sh
npm start
# http://localhost:4173
npm test
npm run check
npm run build
```

Network access and a WebGL-capable browser are required. The optional `PORT`
variable changes the local port. A Cloudflare Workers-compatible build is emitted
in `dist/server`, with browser assets in `dist/client`; the Worker needs an
`ASSETS` binding. Source imports and data handling are shared between client and
server. There is no account database or coupling to another application.

## Data pipeline

The server requests Transitous MOTIS `/api/v6/map/trips` for a fixed three-minute
window in the chosen city. It validates geometry, mode and timestamps, retaining
scheduled times to calculate delays. Concurrent reads are combined, cached for
30 seconds and backed off after failures. Separate city keys prevent mixed data;
serialized upstream parsing bounds memory use. The browser polls while visible
and rejects responses from a city it has already left.

Selecting a currently known trip requests `/api/v6/trip` for its complete stop
sequence and operator. Static network snapshots come from the experimental
routes endpoint, processed separately from live data. Network geometry can be
computed by MOTIS from OSM; it is not proof of current diversions. Network files
carry their export date and source attribution.

`fetchedAt` is when Rheinlive received the response, not the original operator
observation timestamp. Coordinates between stops remain estimates even when a
vehicle waits or an unreported disruption changes its movement. Missing shapes
are disclosed as straight-line estimates.

The departure monitor separately requests `/api/v6/stoptimes` for one selected
source-observed station ID, coalesced and cached for 30 seconds. A location
permission selects a supported region and up to six nearby stations. A bounded
`/api/v1/one-to-many` WALK query calculates footpath durations, sent through
our `/api/walk` POST endpoint. Origin coordinates are not included in replies
or retained in application caches. They are sent to Transitous for the query.
Manual walking time and buffer are saved only on the device. A stale location
requires recalculation; missing routes never fall back to an invented straight-line
walking time. See [monitor behavior and limits](docs/MONITOR.md).

## Evidence and extension

- [Checked data sources, access conditions and live coverage](docs/DATA-SOURCES.md)
- [How to add another city or provider](docs/EXPANSION.md)
- [Historical fixture provenance](tests/fixtures/README.md)
- [Loading and animation performance](docs/PERFORMANCE.md)

The dated three-city check found current bus and rail forecasts and confirmed
KVB, SWB and Rheinbahn operators through actual trip responses. Repeatable tests
cover data normalization, stale data, delays, region isolation, concurrency,
replacement buses, cancellation handling and published network structure.
Historical fixtures are test-only; the app never serves them as live traffic.

## Responsible use and licenses

App code: MIT. Vendored MapLibre: BSD-3-Clause plus notices in its license file.
Map and transit data have separate licenses; see [network attribution](public/data/LICENSE.md).

Transitous permits noncommercial open-source projects with light usage, a contact
URL in the User-Agent and visible attribution. Higher loads must be coordinated
before wider rollout. A larger or commercial deployment needs an appropriate
provider agreement or its own data-import infrastructure.

- [Transitous API policy](https://transitous.org/api/)
- [Transit data sources and licenses](https://transitous.org/sources/)
- [MOTIS API contract](https://github.com/motis-project/motis/blob/master/openapi.yaml)
- [OpenFreeMap](https://openfreemap.org/)
- [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright)
- [OpenMapTiles](https://openmaptiles.org/)
- [MapLibre](https://maplibre.org/)

The app is independent of the transit operators and transport associations.
Report bugs or contact the maintainer through
[GitHub Issues](https://github.com/simongmk/rheinlive/issues).
