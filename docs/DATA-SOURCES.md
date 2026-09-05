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

## Stillstehende Icons und Anfahren

Eine tatsächliche Kölner Kartenantwort vom 5. September 2026, 14:39:38 UTC,
enthielt 179 zusammenhängende Stadtbahn-Haltepaare: **177 mit identischer
Ankunfts- und Abfahrtsminute**, nur zwei mit positiver Zeit dazwischen. Bei
Bussen waren es 597 gleiche Minuten von 610 Paaren. Auch ein gesonderter
aktueller Fahrtverlauf der Linie 16 lieferte für Wesseling Süd, Urfeld und
Widdig gleiche Minuten, trotz regulären Ein-/Ausstiegs. Allein die vorhandenen
Zeiten linear zu interpolieren ließ die Icons deshalb praktisch durchfahren.
Das belegt fehlende zeitliche Auflösung, nicht eine tatsächliche Durchfahrt.

Die Animation berücksichtigt nun:

- Positive gemeldete Ankunft-/Abfahrtsintervalle unverändert als Aufenthalt.
- Bei gleicher Minute einen **modellierten** Aufenthalt, endend an der
  vorhandenen Abfahrtsprognose. Richtwerte: Stadtbahn 20 s, Bus 15 s,
  S-Bahn 25 s, Regionalzug 30 s, Fernzug 45 s. Dies sind ausdrücklich
  Darstellungsannahmen, keine gemessenen oder statistisch kalibrierten Werte.
- Höchstens 25 % der vorherigen Fahrzeit; mindestens 15 s bleiben zum Fahren.
  Ein konservatives Geschwindigkeitsbudget verkürzt oder verhindert zusätzliche
  Standzeit bei kurzen/schnellen Abschnitten. Unter 3 s wird kein Halt ergänzt.
- Anfahren und Bremsen mit einem integrierten Geschwindigkeitsprofil, ohne
  Überschwingen, Rückwärtsbewegung oder Verschieben nachfolgender Abfahrten.
  Kleine Form-Endpunktabweichungen bis 15 m werden am mitgelieferten Halt
  verankert, um einen Sprung vom Gleisverlauf zum Haltepunkt zu vermeiden.
- Ein Pausenzeichen am stationären Icon; Details unterscheiden „Aufenthalt
  geschätzt“ von einem Aufenthalt laut Prognose/Fahrplan. Der Losgeh-Monitor
  verwendet weiterhin direkt die Abfahrtsprognosen, nie modellierte Zeiten.

Das Modell gilt ausschließlich zwischen zwei tatsächlich gelieferten,
zusammenhängenden Fahrtabschnitten. Es erzeugt keine Halte an bloß
vorbeifahrenden Stationen, keine fehlenden Fahrten und keine verlängerte
Gültigkeit alter Prognosen. Unterschiedliche Prognosequalität, widersprüchliche
Zeiten, sekundengenau unterschiedliche Werte und unbekannte Folgesegmente
begründen keinen zusätzlichen Modellhalt. Vollständige Fahrtverläufe werden
weiterhin nur für die ausgewählte Fahrt abgefragt, nicht für jedes Fahrzeug.

Dies verbessert die Bewegungsdarstellung, **belegt aber keine genaueren
realen Positionen**. Tatsächliche Türöffnungszeiten, Anfahrkurven und spontane
Zwischenhalte bleiben ohne Messdaten unbekannt. Ein Testabzug mit KVB 16 und
Bus 790 liegt in `tests/fixtures/zero-dwell-2026-09-05.json`; er wird niemals
als aktueller Verkehr ausgeliefert.

## Gleiskurven und Bauabschnitte

Die Nahansicht verwendet zusätzlich einen tatsächlichen OpenStreetMap-Abzug
vom 5. September 2026 (Overpass, `out geom`). Die Übersicht verwendet weiterhin
OpenFreeMap. Die ursprünglichen OSM-Koordinaten vermeiden die gröbere
Quantisierung und Vereinfachung der bis Zoom 14 gelieferten Basiskacheln.
Eine einmalige grafische Rundung bleibt ungefähr 0,6 Meter innerhalb der
Originalsegmente. Gemeinsame OSM-Knoten, Weichen und Endpunkte bleiben fest;
parallele Gleise werden nicht räumlich zusammengezogen. Dies erhöht die
Darstellungsqualität, liefert aber keine vermessene Gleis- oder GPS-Genauigkeit.

**Severinstraße:** Der am 5. September gelesene OpenFreeMap-Abzug endet mit den
Nord-Süd-Tunnelgleisen bei etwa 50.9295293/6.9570795 und
50.9295686/6.9572487. Beide liegen innerhalb der Kachel, nicht an ihrem Rand.
Im OSM-Abzug schließen die Ways 49809820 und 193546041 genau an dieselben
Knoten der Betriebsabschnitte 385760001 und 385760002 an. Sie sind als
`railway=construction`, `construction=light_rail`, `tunnel=yes` erfasst.
Die bisher fehlende Fortsetzung war deshalb eine Auslassung der Kartenebene.
Sie darf nicht als durchgehend befahrbare Strecke ergänzt werden: Die
[KVB beschreibt die Unterbrechung zwischen Severinstraße und Heumarkt](https://www.kvb.koeln/unternehmen/projekte/nord-sued-stadtbahn/index.html)
wegen des noch nicht fertiggestellten Gleiswechsels Waidmarkt.

Rheinlive zeigt solche erfassten Bauabschnitte in der Nahansicht ocker
**gestrichelt**, mit eigener Legende. Das ist eine datierte OSM-Klassifikation,
keine aktuelle Baustellenmeldung oder zugesagte Befahrbarkeit. Geplante,
abgebaute und stillgelegte Strecken werden nicht als Betriebsstrecken importiert.
Die reale Severinstraßen-Antwort liegt als ODbL-Testbeleg im Quellcode; der
reproduzierbare Import steht in `scripts/prepare-rails.mjs`. Der Browser fragt
Overpass nicht ab. Lücken in der Quelle werden nicht durch erfundene
Verbindungen oder verlängerte Linien verdeckt.

## Gemessene aktuelle Abdeckung

### Fernzüge ergänzt

Der Filter **Fernzug** umfasst die dokumentierten MOTIS-Typen `HIGHSPEED_RAIL`,
`LONG_DISTANCE` und `NIGHT_RAIL` und ist standardmäßig aktiv. ICE-/IC-Prognosen
wurden am 5. September 2026 tatsächlich abgerufen. Die anschließende App-Prüfung
zeigte innerhalb der Regionen vier Fernzüge in Köln, einen in Bonn und drei in
Düsseldorf, jeweils mit Prognose. Ausgewählte Fahrtverläufe bestätigten
**DB Fernverkehr AG** für ICE 918, ICE 315 und ICE 926; auch IC 2201 war sichtbar.
EC und Nachtzüge werden unterstützt, waren in dieser Stichprobe aber nicht aktiv.

Fahrten ohne Halt im Rechteck bleiben erhalten, wenn ihre gelieferte Streckenform
die Region schneidet. Der Marker wird nur innerhalb der Region gezeigt. Das
statische Fernzugnetz ist Hintergrund; dessen Liniennummern werden nicht mit
einzelnen Zugnummern gleichgesetzt. Die Filter zeigen bekannte Zugnummern,
und eine ausgewählte Fahrt zeigt ihren eigenen Verlauf. Auch bei Fernzügen
handelt es sich um Prognosepositionen, nicht GPS-Messungen.

### Frühere regionale Stichprobe

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

## Gleise und Aufenthalte – ergänzende Prüfung vom 5. September

Die Grundkarte nutzt `class=rail/transit` aus OpenMapTiles Transportation,
einschließlich `brunnel=tunnel`, direkt aus den vorhandenen Vektorkacheln.
Das [offizielle Schema](https://openmaptiles.org/schema/#transportation) trennt
diese Infrastruktur von einer Fahrplanroute. Die reale Kachel bei Severinstraße
(Zoom 14, x 8508, y 5490, Datenstand 30. August) enthält Light-Rail-Tunnel auf
den Ebenen −1/−2, oberirdische Gleise und Weichen. Sie wurde als Protobuf gelesen,
nicht aus einem Screenshot geschätzt. Eine Kartenlinie entspricht einer
gelieferten Gleisgeometrie; weder vollständige Einzelgleise in jeder Zoomstufe
noch eine gleisgenaue Zuordnung jedes Fahrzeugmarkers werden behauptet.

Der [MOTIS-Vertrag](https://github.com/motis-project/motis/blob/master/openapi.yaml)
liefert Ankunft/Abfahrt pro Fahrtabschnitt. Die echte Antwort vom 5. September
2026, 13:18:22 UTC, enthielt unter anderem jeweils eine Minute Aufenthalt für
RB26 an Köln Süd und S11 in Holweide bzw. Nippes, jeweils mit Prognosen auf
beiden angrenzenden Abschnitten. Ein kleiner historischer Ausschnitt prüft
den Übergang Anfahrt → Halt → Abfahrt in Tests; er wird niemals live ausgeliefert.

Getrennte Zeitgrenzen erlauben eine bessere Positionsschätzung am Halt.
Minutengenaue Prognosen verraten jedoch keine sekundengenaue Türöffnung,
Beschleunigung oder ungeplante Zwischenstopps. Unbekannte Aufenthalte werden
nicht mit pauschalen 20 oder 30 Sekunden ergänzt. Details und Alterungsgrenzen
stehen in [PERFORMANCE.md](PERFORMANCE.md).

## Abfahrtsmonitor und Fußwege

Der neue Monitor verwendet zwei zusätzliche öffentliche MOTIS-Endpunkte:
`/api/v6/stoptimes` für den ausgewählten Halt und `/api/v1/one-to-many` mit
WALK für Gehzeiten zu einer begrenzten Stationsauswahl. Echte Abfahrten und
Fußwegantworten wurden geprüft. Verhalten, Anfragegrenzen, Standortverarbeitung
und Navigationslinks sind in [MONITOR.md](MONITOR.md) dokumentiert.
