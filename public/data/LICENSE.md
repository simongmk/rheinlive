# Network data attribution

These JSON files are static network snapshots, not live vehicle positions.
They are excluded from the application's MIT license grant.

Source: Transitous / MOTIS `/api/experimental/map/routes`, captured on
5 September 2026. Underlying timetable providers and source-specific licenses:
https://transitous.org/sources/

The observed German services use DELFI timetable data (CC BY 4.0); Transitous's
configured realtime inputs also include CC BY-SA 4.0 data. Full current source
configuration: https://github.com/public-transport/transitous/blob/main/feeds/de.json

Route geometry marked ROUTED was computed by MOTIS using OpenStreetMap data.
© OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright
MOTIS: https://github.com/motis-project/motis

Rheinlive changes: selected regional extent and transport modes, grouped line
names, decoded polylines, simplified shapes at approximately 7 metres, rounded
coordinates, removed duplicated shapes and exported GeoJSON. Computed paths
are not a guarantee of current diversions. `generatedAt` records export time.
Retain this attribution and respect the underlying licenses when redistributing.

## Detailed rail geometry

`tracks-*.json` are derived OpenStreetMap databases, © OpenStreetMap
contributors, licensed under ODbL 1.0, separately from the app's MIT code:
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

Source: https://overpass-api.de/api/interpreter, actual `out geom` responses
for each configured region plus a 0.01-degree margin. `sourceDate` is the
source database timestamp on 5 September 2026, not a realtime operation update.
Changes: regional selection, rail-type filtering, grouping by display style,
seven-decimal coordinates and bounded cosmetic rounding (about 0.6 metres).
Endpoints/shared nodes are preserved. Construction is separate and dashed;
no new connections or vehicle coordinates are inferred. Regeneration query
and importer: `scripts/prepare-rails.mjs`, `lib/rail-geometry.mjs` in the public
source repository. Preserve this attribution and ODbL share-alike conditions.
