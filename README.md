# Rheinlive · Köln

An open-source, noncommercial web app showing Cologne Stadtbahn trips on an
OpenStreetMap map. It displays numbered moving markers, line filters, the next
stop, current arrival forecasts and delays. The German interface adapts to
desktop and mobile screens, with light floating panels, collapsible mobile
filters and a compact trip detail card.

The [extension plan](docs/EXPANSION.md) describes the next steps for buses,
additional cities and larger usage. These extensions are not enabled yet.

**Positions are estimated from current stop forecasts and route geometry,
not measured GPS locations.** The map shows only trips with realtime forecasts
by default; schedule-only trips can be enabled explicitly. Coverage counts
distinguish both groups. Failed or stale snapshots stop showing positions.

## Run

Requires Node.js 22 or later. There are no npm package dependencies.

```sh
npm start
# Open http://localhost:4173
npm test
npm run check
npm run build
```

Leaflet is loaded from unpkg with integrity checks. Tiles come from
OpenStreetMap. Transit data is fetched by the backend from Transitous's MOTIS
v6 API. Network access is required. The optional `PORT` variable changes the
local port. A Cloudflare Workers-compatible build is emitted in `dist/server`
and browser assets in `dist/client`; a hosted Worker needs an `ASSETS` binding.

## Data quality

The app uses current `departure` and `arrival` values to interpolate a position
along each stop-to-stop shape. Scheduled times are retained for delay display.
Its 30-second cache combines concurrent requests and backs off on errors.
`fetchedAt` is when Rheinlive received data, not the original operator message
timestamp. The latter is not provided by this map endpoint. Coordinates between
stops remain estimates, including when a train waits or an unreported disruption
changes its movement. If shape geometry is missing, the app labels the position
as a straight-line estimate. There is no claim of complete network coverage.

A direct Cologne check on 5 September 2026 at 10:48 CEST found 95 active trips,
84 carrying realtime forecasts, with route geometry for all 95. Some departures
were 7 or 12 minutes behind schedule. This is a historical observation, not a
guarantee of current coverage. A retained historical fixture tests the adapter;
all other test inputs are synthetic. No test fixture is used by the running app.

## Responsible use and licenses

This software is MIT licensed. Map, library and transit data have separate terms.
Transitous is a community service permitting noncommercial open-source projects
with light usage, a contact URL in the User-Agent and visible source attribution.
Before a wider deployment, review its policy and coordinate higher request loads.

- [Transitous API policy](https://transitous.org/api/)
- [Transit data sources and licenses](https://transitous.org/sources/)
- [MOTIS API contract](https://github.com/motis-project/motis/blob/master/openapi.yaml)
- [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright)
- [OSM tile usage](https://operations.osmfoundation.org/policies/tiles/)
- [Leaflet, BSD-2-Clause](https://leafletjs.com/)
- [Historical fixture provenance](tests/fixtures/README.md)

The app is independent of KVB and VRS. Report bugs or contact the maintainer
through [GitHub Issues](https://github.com/simongmk/rheinlive/issues).
