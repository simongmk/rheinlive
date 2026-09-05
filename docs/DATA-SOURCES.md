# Datenquellen und geprüfte Abdeckung

Recherche und Live-Prüfung: 5. September 2026. Rheinlive nutzt aktuelle
Ankunfts-/Abfahrtsprognosen und berechnete Wege. **Keine der für Köln, Bonn oder
Düsseldorf geprüften, frei nutzbaren Antworten belegt GPS-Messungen aller
Fahrzeuge.** Eine als „Realtime“ vermarktete Karte ist dafür kein Nachweis.

## Der tatsächlich integrierte Datenweg

1. **Fahrpläne und Identitäten:** Transitous importiert unter anderem die
   deutschlandweiten DELFI-Daten. Die in unseren Stichproben beobachteten
   Fahrt-IDs tragen den Präfix `de-DELFI`.
2. **Prognosen:** Transitous verbindet Fahrplan-IDs mit Echtzeit-Updates.
   Die veröffentlichte [Deutschland-Konfiguration](https://github.com/public-transport/transitous/blob/main/feeds/de.json)
   enthält für DELFI mehrere GTFS-RT-Zuführungen. Interne Serveradressen aus der
   Konfiguration werden von Rheinlive nicht direkt angesprochen.
3. **Bewegung:** `/api/v6/map/trips` liefert Stop-zu-Stop-Abschnitte,
   Sollzeiten, Prognosezeiten, `realTime` und Polylines. Rheinlive interpoliert
   auf deren Länge. Beispiel: Zwei Minuten spätere Prognose verschieben das
   Betriebsfenster und die Position; die Verspätung ist kein bloßes Textetikett.
4. **Fahrtdetails:** `/api/v6/trip` wird nur für eine ausgewählte, gerade
   bekannte Fahrt angefragt. Es liefert Betreiber, Richtung, vollständige
   Haltefolge, Streckenform, Gleisänderungen und vorhandene Störungsmeldungen.
   Gemeldete ausgefallene Fahrten/Halte werden berücksichtigt. Die Stichproben
   enthielten keine Meldungen; deren Anzeige ist zusätzlich synthetisch geprüft.
5. **Liniennetz:** Ein separat datierter Abzug von
   `/api/experimental/map/routes` liefert Strecken und Haltestellen für die
   Karte. Dieser experimentelle Endpunkt wird nur beim bewussten Aktualisieren
   des Netz-Artefakts benutzt, nicht von jedem Browser oder bei jeder Abfrage.
   Viele Geometrien haben `pathSource: ROUTED`: MOTIS berechnet sie anhand von
   Kartendaten. Sie sind keine bestätigten GPS-Spuren oder aktuellen Umleitungen.

[API-Vertrag](https://github.com/motis-project/motis/blob/master/openapi.yaml),
[Transitous-Dokumentation](https://transitous.org/doc/),
[Nutzungsrichtlinie](https://transitous.org/api/).

## Gemessene aktuelle Abdeckung

Prüfung über die tatsächlich laufende Rheinlive-API, 5. September 2026,
14:08:10 Europe/Berlin. Gezählt wurden aktive, innerhalb der konfigurierten
Region positionierte Fahrten. Angaben: **mit Prognose / insgesamt**.

| Region | Stadtbahn | Bus | S-Bahn | Regionalzug |
|---|---:|---:|---:|---:|
| Köln & Umgebung | 95 / 96 | 334 / 351 | 14 / 14 | 15 / 15 |
| Bonn & Umgebung | 30 / 32 | 180 / 205 | 1 / 1 | 4 / 4 |
| Düsseldorf & Umgebung | 23 / 25 | 325 / 362 | 11 / 11 | 8 / 8 |

Diese Momentaufnahme ist keine Garantie vollständiger Netzabdeckung. Die
Regionen sind Rechtecke einschließlich Umland; „Köln“ bedeutet deshalb nicht
„ausschließlich KVB“. In Köln fehlte bei einer Busfahrt die Streckenform.

Zusätzliche Fahrtabfragen bestätigten konkret:

- Köln: Bus 153, Betreiber **Kölner VB**, Richtung Bf Deutz/Messe LANXESS arena,
  `agencyId: 7969`, `realTime: true`.
- Bonn: Bus 607, **Stadtwerke Bonn**, Richtung Medinghoven Hardtberg Klinikum,
  `agencyId: 7971`, `realTime: true`.
- Düsseldorf: Bus 724, **Rheinbahn Bus**, Richtung Sportpark Niederheid,
  `agencyId: 7764`, `realTime: true`.

Die spätere App-Prüfung zeigte zusätzlich RSVG, wupsi und DB SEV GmbH. Ein Bus
kann „RE8“ heißen: Der Verkehrsmitteltyp wird deshalb aus dem Datenfeld gelesen,
nicht aus dem Namen geraten. Filter gruppieren Nummern innerhalb eines
Verkehrsmittels; Fahrzeugidentitäten werden dadurch niemals zusammengelegt.

Eine vorherige Bonner Abfrage um 13:48 CEST enthielt zwei Fährfahrten, beide
**ohne** Prognose. Fähren sind deshalb nur bei tatsächlich vorhandenen Daten
und aktivierter Fahrplan-Ergänzung sichtbar. Es gibt keinen behaupteten
GPS- oder Live-Fährfeed.

Kleine, ausdrücklich historische Antworten liegen in `tests/fixtures/` und
werden nie von der laufenden App als aktuelle Verkehrsdaten ausgeliefert.

## Andere geprüfte Quellen

| Quelle | Tatsächliches Angebot / Zugang | Entscheidung |
|---|---|---|
| [GTFS.de](https://gtfs.de/de/realtime/) | Frei zugänglicher, alle zehn Sekunden aktualisierter GTFS-RT-Stream mit TripUpdates und ServiceAlerts; VRS und VRR gelistet, VRR-Busse teilweise unvollständig. Passende statische Feeds erforderlich. | Konkrete Alternative für einen eigenen Importdienst. Kein dokumentierter VehiclePositions-Stream; würde ohne Abgleich doppelte Fahrten erzeugen. |
| [VRS OpenService](https://www.vrs.de/fuer-unternehmen/open-data-service) | ASS, TRIAS und GTFS-RT; Antrag mit unterschriebener Nutzungsvereinbarung, danach Zugangsdaten und definierte Abfragefrequenz. Öffentliche statische GTFS-Daten sind separat verfügbar. | Ein direkter Zugang ist möglich, aktuell nicht freigeschaltet. Keine fremden Schlüssel benutzt und keine Vereinbarung unterschrieben. |
| [MDD / go.Rheinland](https://download.vrs.de/mdd/Factsheet_360.pdf) | Dokumentiertes VRS-Datenprofil 360 mit GTFS, GraphQL, Routen, Halten und Shapes. | Der dokumentierte Endpunkt `https://mdd.gorheinland.com/gtfs-output/360` antwortete auf einen unautorisierten HEAD-Aufruf mit HTTP 401. Kein frei nutzbarer Direktzugang nachgewiesen. |
| [MOBIDROM](https://www.mobilitaetsdaten.nrw/landingpage) | NRW-Datenplattform mit Mobilitätsdaten und OGC-Schnittstellen; [Registrierung kostenlos](https://www.mobilitaetsdaten.nrw/landingpage/hilfe/faq/). | Zugang, Datensatz-Lizenz und Inhalt pro Feed prüfen; „GTFS-RT“ allein beweist keine Fahrzeugkoordinaten. |
| [geOps](https://developer.geops.io/) | Realtime-WebSocket, Trajektorien und Haltefolgen. Persönlicher API-Schlüssel nach Kontakt; Produktionsnutzung abstimmen. | Gute Anbieteroption. [Technische Doku](https://backend.developer.geops.io/tralis-docs/asyncapi_html/) beschreibt ausdrücklich Interpolation von Trajektorien anhand Fahrplan und Updates. Auch hier ist „Realtime“ kein automatischer GPS-Nachweis. |
| [OpenVRR](https://www.opendata-oepnv.de/ht/de/organisation/verkehrsverbuende/vrr/openvrr/start) | Öffentliche Soll-Fahrplandaten, Linien und Haltestellen; weitere Daten auf Anfrage. | Hilfreich für statische Grundlagen, kein dort belegter vollständiger GPS-Feed für Düsseldorf. |
| [KVB Open Data](https://www.kvb.koeln/service/open_data.html) | Offizielle offene Datensätze, unter anderem Aufzugsstatus. | Sinnvolle spätere Ergänzung; kein auf dieser Seite belegter vollständiger frei zugänglicher Fahrzeug-GPS-Feed. |
| [DB Timetables](https://developers.deutschebahn.com/db-api-marketplace/apis/product/timetables/api/160160) | Bahnhofsinformationen, Solltafeln und Änderungen, mit Client-ID und Schlüssel. | Ergänzung für Eisenbahn-Abfahrten; kein Ersatz für die Bus-/Stadtbahnkarte. |
| [OpenTrafficMap](https://wiki.opentrafficmap.org/en_alt%3Acoverage) | Empfängt lokale V2X-Funksignale. Die Betreiber-Dokumentation nennt für Düsseldorf einen früheren Forschungskorridor, dessen fortdauernder Betrieb unbekannt ist. | Interessanter Weg zu gemessenen Positionen, aber keine belastbare flächendeckende Abdeckung unserer drei Städte. |

## Warum jetzt kein ungeprüfter Quellen-Mix?

Ein zweiter Feed kann dieselbe Fahrt unter einer anderen ID enthalten. Die
saubere Zusammenführung benötigt Feed-Version, Betreiber, Route, Verkehrstag,
Fahrt-ID, Halte-ID und Zeitpunkt der Beobachtung. Übereinstimmende Liniennummern
oder nahe Koordinaten reichen nicht. Vor einer zusätzlichen Quelle werden
Abdeckung und Lizenz geprüft und eine Priorität für widersprüchliche Updates
festgelegt. GPS-Daten würden einen eigenen Qualitätstyp mit Messzeitstempel
bekommen; sie werden nie aus Prognosedaten erfunden.

## Kartenbasis und größere Nutzung

[OpenFreeMap](https://openfreemap.org/) liefert freie OpenStreetMap-Vektorkacheln,
auch für kommerzielle Nutzung, ohne Schlüssel und derzeit ohne Aufruflimit.
Das ist ein anderer Dienst als die Verkehrsdatenquelle. Ein SLA wird nicht
zugesagt. Rheinlive rendert mit [MapLibre](https://maplibre.org/) und bezieht
Kacheln nur für die sichtbare Karte; keine Offline-Massendownloads.

Transitous bleibt ein nichtkommerzieller Gemeinschaftsdienst. Rheinlive fragt
nur die ausgewählte Region ab, bündelt gleichzeitige Anfragen, cached 30 Sekunden
und pausiert im versteckten Browser-Tab. Größere Abfragemengen müssen vorab
abgestimmt werden. Für einen großen oder kommerziellen Betrieb wäre ein eigener
MOTIS-Importdienst oder ein vereinbarter Anbieterzugang erforderlich. Eine
unbegrenzte kostenlose Verkehrsdatenversorgung wird nicht versprochen.
