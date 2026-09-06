# Eigener Datenbetrieb: Quellen und Weitergabe

Stand der Anbieterprüfung: 6. September 2026. App-Code und Daten sind getrennt
lizenziert. Diese Hinweise betreffen die eigene GTFS.de/MOTIS-Anbindung;
die bisherigen `public/data/network-*.json` stammen weiterhin aus Transitous.

| Bestandteil | Quelle / Rechteinhaber | Lizenz |
|---|---|---|
| Deutschland-Fahrplan | [GTFS.de, Grundlage DELFI e.V.](https://gtfs.de/de/feeds/de_full/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Fahrtprognosen und Meldungen | [GTFS.de, zusammengeführte Anbieter laut Quellenseite](https://gtfs.de/de/realtime/) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Straßen, Schienen und daraus berechnete Wege | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [Geofabrik Deutschland](https://download.geofabrik.de/europe/germany.html) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |
| Fahrplan- und Wegeengine | [MOTIS Project, v2.11.2](https://github.com/motis-project/motis/tree/v2.11.2) | [MIT](https://github.com/motis-project/motis/blob/v2.11.2/LICENSE) |
| App | [Rheinlive / Linien](https://github.com/simongmk/rheinlive) | MIT, ausschließlich eigener Programmcode |

Die Anbieter veröffentlichen die verwendeten GTFS-Downloads ohne erforderliche
Registrierung oder individuellen Vertrag. CC BY, CC BY-SA und ODbL erlauben
kommerzielle Nutzung unter ihren jeweiligen Bedingungen. Das ist keine Zusage
für Vollständigkeit, Verfügbarkeit oder Positionsgenauigkeit. GTFS ist das
Dateiformat; GTFS.de ist hier der Datenanbieter.

Änderungen durch diese Anwendung: Import in MOTIS, Zusammenführung von
Fahrplan und TripUpdates, berechnete OSM-Wege, regionale Auswahl, Umbenennung
von Verkehrsmittelklassen aus eindeutigen Linienpräfixen, Gruppierung von
Haltestellen, vereinfachte/gerundete Geometrien und geschätzte Fahrzeugbewegung.
Ankunft, Abfahrt und Verspätung bleiben von der Quelle abhängig. Ein modellierter
Halt oder eine interpolierte Koordinate ist keine gemessene Fahrzeugposition.

Namensnennung, Lizenzlinks und Änderungshinweise bleiben bei Weitergabe
erhalten. Weitergegebene abgeleitete Prognosedaten stehen unter CC BY-SA 4.0;
die OSM-Datenbank und abgeleitete Geometriedatenbanken bleiben unter ODbL 1.0.
Das zusammen verwendete Material wird nicht pauschal unter MIT umgelabelt.
Die Lizenzen sind keine automatische gegenseitige Kompatibilitätsfreigabe für
ein zusammengeführtes, neu lizenziertes Gesamt-Datenbankprodukt.

Die lokale Integration hält Quelldateien, Importprovenienz und Geometriedateien
getrennt. Vor einer öffentlichen Datenweitergabe müssen die zum konkreten
Export passenden Rechte, Hinweise und maschinenlesbaren Daten bzw.
Reproduktionsmethoden zugänglich sein; ODbL §4.6 beschreibt diese Anforderung.
Die öffentlichen Importskripte und die festgelegte MOTIS-Version dokumentieren
die Verfahren. Detaillierte Gleis-Geometrien der bestehenden Karte haben
bereits ihre eigenen Hinweise in `public/data/LICENSE.md`.

Die neue Anbindung nutzt keine Transitous-Abfrage. Die gehostete Standard-App
tut das weiterhin und bleibt bis zum vollständigen Produktionswechsel ein
nichtkommerzielles Experiment. Laufender Serverbetrieb, Aktualisierungen,
Quellenhinweise und Abdeckungs-/Genauigkeitsprüfung gehören zu diesem Wechsel.
