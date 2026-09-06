# Eigener Deutschland-Server: Live-Integration

Geprüft am **6. September 2026, 13:09 Uhr Europe/Berlin**. Historische
Testbelege, keine live aktualisierten Daten. Der eigene MOTIS-Server läuft mit
GTFS.de und OpenStreetMap. In allen 30 ausgewählten Orten lieferte er
aktuelle Kartenantworten mit mindestens einer Prognosefahrt. Das bestätigt
weder vollständige Abdeckung noch die tatsächliche Position eines Fahrzeugs.

## Kartenprobe

Die Rechtecke sind ungefähr 20 km breit/hoch. Gezählt werden zum jeweiligen
Abrufzeitpunkt aktive, normalisierte Positionen innerhalb des Rechtecks.
„Prognose“ ist der aktuelle Abschnitt laut MOTIS, einschließlich möglicher
Verspätungsfortschreibung. „Fahrplan“ bleibt in der App standardmäßig verborgen.
Diese Zahlen haben eine andere Grundgesamtheit als das frühere Coverage-Audit.

| Ort | Mit Prognose | Nur Fahrplan | Gerade statt Streckenform |
|---|---:|---:|---:|
| Berlin | 92 | 619 | 3 |
| Hamburg | 344 | 146 | 2 |
| München | 363 | 38 | 1 |
| Köln | 168 | 35 | 0 |
| Frankfurt am Main | 251 | 37 | 1 |
| Stuttgart | 191 | 32 | 0 |
| Düsseldorf | 178 | 46 | 0 |
| Bonn | 31 | 104 | 0 |
| Leipzig | 144 | 11 | 0 |
| Dresden | 144 | 28 | 0 |
| Hannover | 151 | 4 | 0 |
| Bremen | 90 | 13 | 0 |
| Nürnberg | 124 | 13 | 0 |
| Essen | 160 | 81 | 0 |
| Kiel | 71 | 8 | 0 |
| Schwerin | 18 | 7 | 1 |
| Potsdam | 60 | 26 | 1 |
| Magdeburg | 48 | 12 | 4 |
| Erfurt | 44 | 3 | 0 |
| Wiesbaden | 54 | 90 | 0 |
| Mainz | 70 | 81 | 0 |
| Saarbrücken | 47 | 8 | 0 |
| Freiburg | 60 | 6 | 0 |
| Rostock | 52 | 17 | 0 |
| Münster | 53 | 15 | 0 |
| Passau | 2 | 16 | 1 |
| Neubrandenburg | 10 | 3 | 0 |
| Stendal | 9 | 3 | 0 |
| Prüm | 1 | 0 | 0 |
| Goslar | 14 | 4 | 0 |

Nicht addieren: Gebiete können sich überschneiden. Nur ein Zeitfenster, keine
repräsentative Deutschlandstichprobe und kein Vor-Ort-Genauigkeitstest.
Die Berliner Stadtbahn-/U-Bahn-Klasse hatte 0 Prognosen bei 199 Fahrplanpunkten;
die dortige S-Bahn hatte 81 Prognosepunkte. Die Quelle bleibt entscheidend.

## Durchgehende App-Abfragen

| App-Region | Kartenfahrten im API-Fenster | Geprüfte Fernverkehrslinie | Halte im Verlauf | Hbf-Abfahrten | Test-Gehzeit |
|---|---:|---|---:|---:|---:|
| cologne | 358 | ICE 41 | 8 | 60 | 161 s |
| bonn | 168 | ICE 49 | 6 | 61 | 254 s |
| duesseldorf | 311 | ICE 47 | 12 | 60 | 126 s |

Das API-Fenster umfasst drei Minuten und ist nicht die Zahl gerade sichtbarer
Fahrzeuge. Gehwege starten an ausdrücklich öffentlichen Testkoordinaten etwa
111 m nördlich der Stationskoordinate, nicht am Standort eines Nutzers.
Alle vier API-Pfade nutzten die eigene Quelle. Die drei geprüften ICE-Verläufe
enthielten **keine Gleisnummern**. Die ICE-Bezeichnungen stammen aus den
Liniennamen; individuelle Zugnummern werden daraus nicht erfunden.

Köln Severinstraße hat auch im neuen Netz genau einen Stationseintrag mit den
Linien 3, 4, 17, 106 und 132. Die Abfrage verwendet dessen tatsächlich gelieferte
Eltern-ID. Alte Transitous-IDs werden nicht übernommen.

## Geometrie und Ressourcen

Die Engine meldete berechnete Pfade für 3.309 von 3.474 Kölner Netzrouten,
1.577 von 1.753 Bonner und 2.980 von 3.189 Düsseldorfer Netzrouten.
Routenvarianten sind keine einzigartigen Linien. `ROUTED` bedeutet aus OSM
berechnet, nicht auf das tatsächlich befahrene Einzelgleis verifiziert.
Fehlende Bus-Geometrien werden nicht als erfundene Linien eingeblendet.

Der einmalige lokale Import brauchte 21,46 Sekunden für den Fahrplan und
41 Minuten 24 Sekunden für OSM, Shapes und Haltestellenzuordnung. Die erzeugten
Daten belegten rund 11 GiB. Ein RSS-Messpunkt des laufenden Servers nach den
Abfragen lag bei rund 3,35 GiB; das ist weder sein Spitzenbedarf noch eine
Garantie, dass ein 4-GB-Server genügt. Bei der Shape-Berechnung waren vier
Threads aktiv und in Stichproben etwa 5–7 GiB resident.

Die 30 lokalen Kartenproben brauchten im Median 17 ms und im 95. Perzentil
91 ms inklusive HTTP-Lesen und Normalisierung. Die drei Kombinationen aus
Karte, Fahrt, Netz, Board und Gehweg benötigten 153/95/81 ms. Das sind lokale
Messungen mit teilweise warmen Caches, ohne Internet-Latenz, Kartentiles oder
Browser-Zeichenzeit; keine Nutzer-Ladezeit- oder FPS-Garantie.

## Ausfall und Wiederanlauf

Der Relay wurde nach einem erfolgreichen Kartenabruf bewusst beendet.
Karten- und Abfahrts-API antworteten danach mit 503 und leeren Prognosedaten,
obwohl MOTIS `/api/v1/health` weiterhin `rt: true` meldete. Gehzeiten blieben
erreichbar. Anschließend startete der gemeinsame Startbefehl alle Dienste neu;
die Karten-API lieferte wieder 360 Fahrten mit frischer GTFS.de-Veröffentlichung.
Zum Testende beendete SIGTERM am gemeinsamen Starter auch dessen Engine,
Relay und Vorschau. Alle drei Ports waren danach geschlossen; es bleibt kein
dauerhafter Datenabruf auf dem Entwicklungsrechner aktiv.

## Reproduktion und Rechte

- [Ausführen und technische Grenzen](../../OWN-BACKEND.md)
- [Quellen, Lizenzen und Änderungshinweise](../../OWN-DATA-NOTICES.md)
- [Karten-/API-Belege](integration.json), [Netzrouten](network.json)
- [Ausfallprüfung](outage.json), [Wiederanlauf](restart.json), [Eingaben und Messwerte](inputs.json)
- [Gemeinsames Beenden](shutdown.json)

Eigener Text und Code: MIT. Abgeleitete Prognose-/Auswertungsdaten: CC BY-SA 4.0,
GTFS.de; zugrunde liegender Fahrplan GTFS.de / DELFI e.V., CC BY 4.0.
OSM-Daten und abgeleitete Geometriedatenbanken: © OpenStreetMap contributors,
ODbL 1.0. Diese Dokumente enthalten keine Rohfeed-Downloads oder GPS-Messungen.

Die gehostete Standardkarte bleibt vorerst bei Transitous und nichtkommerziell.
Der echte Deutschland-Backendtest ist abgeschlossen; eine öffentlich gehostete
eigene Engine, täglicher Importbetrieb und flächendeckende Produkterweiterung
sind damit noch nicht ausgeliefert.
