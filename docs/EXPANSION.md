# Busse und weitere Städte

Stand: 5. September 2026. Dies ist ein Ausbauplan; die veröffentlichte App
zeigt derzeit ausschließlich die konfigurierten Kölner Stadtbahnlinien.

## Was bereits nachgewiesen ist

Eine zusätzliche Abfrage des Transitous-Endpunkts `/api/v6/map/trips` für das
konfigurierte Kölner Gebiet und ein dreiminütiges Zeitfenster ergab am
2026-09-05 um 11:21:47 UTC (13:21:47 Europe/Berlin):

- 390 unterschiedliche Busfahrt-IDs, mit mindestens einem Segment, dessen
  Start oder Ziel innerhalb der konfigurierten Stadtgrenzen lag.
- 351 dieser IDs hatten im abgefragten Fenster mindestens ein Segment mit
  `realTime: true`.

Das sind keine 351 gleichzeitig positionierbaren KVB-Busse. Die Abfrage
enthält auch regionale Angebote und Ersatzverkehre; sie prüft weder den
aktuellen Abschnitt jeder Fahrt noch deren Betreiber. Beispielsweise kamen
Liniennamen wie 117, 157, SB20 und S6 vor. Diese Momentaufnahme wurde zur
Machbarkeitsprüfung ausgewertet, nicht als dauerhaftes Testfixture gespeichert.

Die Quelle liefert Prognosezeiten und Streckenverläufe. Auch Buspositionen
wären mit diesem Adapter geschätzt; GPS-Koordinaten sind dadurch nicht belegt.

## Nächste Ausbaustufe: Köln mit Bussen

1. Betreiber und Linien anhand stabiler Quell-IDs zuordnen. Liniennamen allein
   sind nicht eindeutig; Bus, Stadtbahn und Ersatzverkehr können dieselbe
   Nummer oder Bezeichnung tragen.
2. Auswahl für Stadtbahn und Busse ergänzen. Linien aus validierten Daten
   erzeugen, statt die bisherige Stadtbahn-Whitelist auf Busse zu übertragen.
3. Prognoseabdeckung, fehlende Strecken, Ausfälle und Aktualität pro Betreiber
   überprüfen. Das vorhandene Ausblenden veralteter Daten bleibt erforderlich.
4. Bei vielen Fahrzeugen Kartenobjekte über Canvas/WebGL zeichnen oder abhängig
   von der Zoomstufe zusammenfassen. Im Detail muss jede Fahrt auswählbar bleiben.

## Weitere Städte

`lib/cities.mjs` enthält bereits eine Stadt-Konfiguration; der Normalisierer
nimmt sie als Parameter. API-Aufruf, Browser und Cache-Schlüssel sind derzeit
jedoch auf Köln festgelegt. Für mehrere Städte müssen sie ebenfalls umgestellt
werden. Eine Konfiguration je Stadt sollte Gebiet, Zentrum, Zeitzone,
Verkehrsmittel, Datenanbieter und geprüfte Abdeckung enthalten.

Die nächste sinnvolle Prüfung wäre Bonn, danach Düsseldorf. Die Verfügbarkeit
von Echtzeitdaten wird für jede Stadt und jeden Verkehrsträger gesondert
nachgewiesen. Eine Stadt darf bei fehlenden Prognosen nicht als live erscheinen.
Eine Stadt-Auswahl ersetzt dann die statische Ortsanzeige.

## Größere Nutzung

Der Browser sollte nur den sichtbaren Bereich und einen begrenzten Puffer
abfragen. Der Server begrenzt erlaubte Gebiete und Zeitfenster, teilt aktuelle
Ergebnisse zwischen Nutzern und führt getrennte Cache-Schlüssel je Region und
Verkehrsmittel. Feed-Qualität und Ausfälle werden je Quelle beobachtet.

Transitous ist ein gemeinschaftlicher Dienst für nichtkommerzielle Nutzung.
Größere Abfragemengen müssen abgestimmt werden. Für einen großen oder
kommerziellen Betrieb kommen eine eigene MOTIS-Instanz oder ein vereinbarter
Datenzugang in Betracht. Nationale GTFS-Daten und deren Verarbeitung gehören
in einen separaten Datenservice, nicht in den kleinen Web-App-Worker.
Auch der Kartenanbieter muss zur Nutzung passen; öffentliche OSM-Tiles sind
kein unbegrenzter Download- oder Offline-Dienst.

## Primärquellen

- [Transitous: API und Nutzungsbedingungen](https://transitous.org/api/)
- [Transitous: Projekt und internationale Datenbasis](https://transitous.org/)
- [Datenquellen und individuelle Lizenzen](https://transitous.org/sources/)
- [MOTIS: Quellcode und API-Vertrag](https://github.com/motis-project/motis)
- [OpenStreetMap: Tile-Nutzungsrichtlinie](https://operations.osmfoundation.org/policies/tiles/)
