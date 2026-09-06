# Historische Stichprobe: 6. September 2026

**Ergebnis: Der freie Datenimport funktioniert deutschlandweit als Grundlage,
die Echtzeitabdeckung weist regionale Lücken auf.** Drei Abrufe um 11:45,
11:46 und 11:47 Europe/Berlin wurden in 30 Gebieten mit 10 km Radius gegen die
folgenden 30 Fahrplanminuten verglichen. Die Orte decken alle Bundesländer ab,
sind aber keine repräsentative Deutschlandstichprobe oder Gemeindegrenzen.

Ausgewählte Ergebnisse des letzten Abrufs, **direkte Prognose / geplant**:

| Gebiet | Tram / U-Bahn | Bus | S-Bahn | Regionalzug | Fernzug |
|---|---:|---:|---:|---:|---:|
| Berlin | 0 / 313 | 2 / 795 | 133 / 147 | 25 / 31 | 6 / 9 |
| Hamburg | 44 / 67 | 237 / 667 | 28 / 70 | 16 / 20 | 6 / 7 |
| München | 146 / 219 | 331 / 590 | 49 / 55 | 13 / 20 | 3 / 7 |
| Köln | 90 / 115 | 83 / 185 | 14 / 16 | 13 / 18 | 7 / 8 |
| Stuttgart | 146 / 170 | 176 / 253 | 15 / 24 | 12 / 18 | 6 / 9 |

Die Berliner Tram-/U-Bahn-Lücke wurde bis in die Rohmeldungen zurückverfolgt:
keine der 313 geplanten Fahrten hatte eine passende Fahrtmeldung. Der VBB
[meldet selbst eine Teilstörung](https://production.gtfsrt.vbb.de/) seit dem
4. Juni. Das ist ein plausibler Hinweis, keine bewiesene Ursache jeder Lücke.

Alle drei Feed-Veröffentlichungen waren beim Empfang 19–20 Sekunden alt und
enthielten rund 37.000 Fahrtmeldungen. Keine enthielt Fahrzeugkoordinaten oder
individuelle Fahrt-Zeitstempel. Die Frische der ursprünglichen Betreibermeldung
ist dadurch nicht bestimmbar. Alle drei freien Fahrplanarchive waren ohne
`shapes.txt`. Für präzise Strecken braucht der spätere Datendienst andere,
passend lizenzierte Geometrien.

## Messung und Interpretation

`coverage.csv` enthält alle 630 Gebiet-/Verkehrsmittelzeilen einschließlich
Null-Grundgesamtheiten; `observations.json` enthält Definition, Grenzen,
Downloadbelege und Prüfsummen. `planned-window.sql` bewahrt die tatsächlich
verwendete SQL-Auswahl des letzten Abrufs mit eingesetzten Bindewerten.
Die anschließende Zuordnung und Klassifikation steht in
[`scripts/gtfs/pipeline.py`](../../../scripts/gtfs/pipeline.py).

Eine Fahrt zählt einmal je Gebiet und Verkehrstag. Eine direkte Prognose
erfordert einen passenden Halt im Fenster. Reine Fahrtmeldungen, Absagen,
fehlende und mehrdeutige Daten bleiben separat. Es gibt keine stille
Verspätungsfortschreibung. Daher ist die direkte Quote konservativer als die
mögliche Prognoseabdeckung einer vollständigen Fahrplanengine.

Überlappende Gebiete und aufeinanderfolgende Aufnahmen dürfen nicht zu einer
nationalen Gesamtquote addiert werden. Es handelt sich um Sonntagvormittag;
Werktage, andere Tageszeiten, längerfristige Verfügbarkeit und physische
Positionsgenauigkeit wurden nicht gemessen. Fehlende Betreiber im statischen
Fahrplan sind mit diesem Nenner nicht erkennbar. Kein Snapshot wird als Live-
Datenstrom ausgeliefert. Die bestehende Karte ist noch nicht migriert.

## Qualität und nächste Entscheidung

- Hohe Sicherheit für die beobachteten Abdeckungslücken: Rohprotokollprüfung,
  unabhängige SQL-Gegenprüfung vier wichtiger Nenner und Abgleich aller
  Kategorien mit eindeutigen Fahrtinstanzen.
- Hohe Bedeutung für eine Markteinführung: keine GPS-/Frischegarantie je
  Fahrzeug, keine flächendeckende Prognosegarantie. Eigene Positionsmodelle
  müssen vor Ort validiert werden.
- Begrenzte zeitliche Aussage: drei stark überlappende Fenster sind ein
  Funktionstest, keine Verfügbarkeitsmessung oder Anbieterbewertung.
- Nächster Schritt: eigenen Datendienst mit Geometrien vervollständigen,
  weitere Zeitfenster prüfen und Zusatzquellen anhand konkreter Lücken
  bewerten. Noch keine Begründung für einen kostenpflichtigen Feed.

Ausführung und Adaptergrenzen: [GTFS-Pipeline](../../GTFS-PIPELINE.md).

## Datenlizenz

Diese abgeleitete Auswertung und die Dateien `coverage.csv` und
`observations.json` stehen unter **CC BY-SA 4.0**, nicht unter der MIT-Lizenz
des App-Codes. Quelle: **GTFS.de und die auf seiner Echtzeitseite genannten
Lieferanten**. Änderungen durch Linien: Gebietsauswahl, Verknüpfung mit
Fahrplan, Klassifikation und Aggregation.

- [GTFS.de Echtzeitdaten und Lieferanten](https://gtfs.de/de/realtime/)
- [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- [Statische GTFS.de-Feeds, CC BY 4.0](https://gtfs.de/de/feeds/)
- Die mitgelieferten ursprünglichen Namensnennungen stehen unverändert in
  `source-notices.json`. OSM-Beiträge behalten ihre gesonderte ODbL-Zuordnung:
  [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

Code und SQL sind MIT. Rohfeeds und SQLite sind nicht Teil des Git-Repositories;
ihre lokalen Aufbewahrungspfade und Hashes sind in der Prüfdokumentation bekannt.
