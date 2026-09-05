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
