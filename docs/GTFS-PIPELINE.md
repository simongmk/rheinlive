# Deutschland: Fahrplanimport und Echtzeitprüfung

Der eigenständige Import prüft die offenen GTFS.de-Feeds gegen ihre passenden
Echtzeitmeldungen. Er ist die Grundlage für einen eigenen Datenbetrieb. Die
bestehende Karte verwendet weiterhin Transitous; dieser Import ersetzt noch
keine ihrer APIs. Die separate [eigene MOTIS-Anbindung](OWN-BACKEND.md)
setzt darauf auf; die gehostete Karte wurde noch nicht umgestellt.

Erster realer Durchlauf: [Stichprobe vom 6. September 2026](assessments/2026-09-06/README.md).

## Ausführen

Python 3.10+ mit Zeitzonendaten, macOS oder Linux. Aus dem Repository:

```sh
python3 -m venv .venv-gtfs
source .venv-gtfs/bin/activate
python -m pip install -r scripts/gtfs/requirements.txt
npm run test:gtfs
python scripts/gtfs-audit.py fetch
python scripts/gtfs-audit.py import
python scripts/gtfs-audit.py sample --count 3 --interval 60
```

`--workdir /path` steht vor dem Unterbefehl und verlegt den Standardordner
`.cache/gtfs`. `import --sources /path` kann bereits vorhandene, mit den
Downloadmanifesten geprüfte ZIP-Dateien verwenden. `import --areas /path.json`
wählt andere Stichprobenorte; dafür muss der Index neu aufgebaut werden.
Es wird kein dauerhafter Prozess oder Zeitplan eingerichtet.

Der erste Import vom 6. September 2026 benötigte auf dem Entwicklungsrechner
66 Sekunden und erzeugte einen 1,13-GiB-Index. Er scannte rund 37,8 Millionen
Haltezeilen und indexierte rund 12,8 Millionen Zeilen in den Stichprobengebieten.
Das sind lokale Beobachtungen, keine Hosting- oder Lastgarantie. Die nationalen
Dateien werden zentral geladen und verarbeitet, niemals pro Browsernutzer.

## Quellen und Grenzen des Index

- Statisch: `https://download.gtfs.de/germany/{nv,rv,fv}_free/latest.zip`.
- Echtzeit: `https://realtime.gtfs.de/realtime-free.pb`.
- Nur diese ausdrücklich geprüften Anbieter-URLs sind zugelassen.
- Nationale Linien-, Fahrt-, Kalender- und Haltestellenmetadaten; **Haltezeiten
  nur in den 30 ausgewählten Kreisen**, keine vollständige nationale Routing-DB.
- Alle 16 Bundesländer sind durch Orte vertreten. Kreise mit 10 km Radius sind
  keine Gemeindegrenzen und keine repräsentative Deutschlandstichprobe.
- Die freien Dateien enthalten keine `shapes.txt`. Damit gibt es noch keinen
  nachgewiesenen präzisen Linienweg. Geraden zwischen Haltestellen wären kein
  Ersatz für die geforderte realistische Kartendarstellung.
- Dieser Adapter unterstützt die beobachteten GTFS.de-Tabellen und
  `Europe/Berlin`. Andere Zeitzonen und `frequencies.txt` werden abgelehnt.
  Ein universeller GTFS-Validator oder beliebiger Anbieteradapter ist er nicht.

## Was die Prüfung misst

Die Grundgesamtheit besteht aus eindeutigen Fahrten je Verkehrstag und Gebiet
mit mindestens einer geplanten Ankunft **oder** Abfahrt in den folgenden
30 Minuten. Halte am exakt rechten Fensterrand zählen erst im nächsten Fenster.
Die Fahrt wird je Gebiet einmal gezählt, auch wenn sie mehrere Haltestellen
bedient. Überlappende Gebiete dürfen nicht zu einer nationalen Quote addiert
werden; aufeinanderfolgende Messungen enthalten vielfach dieselben Fahrten.

Kalenderausnahmen, Fahrten nach 24 Uhr und der GTFS-Zeitursprung (lokaler Mittag
minus zwölf vergangene Stunden) werden berücksichtigt. Dateiübergreifende
Linien-IDs bleiben getrennt. Echtzeit wird über Fahrt-ID und Verkehrstag
zugeordnet; unklare Mehrfachzuordnungen werden nicht stillschweigend aufgelöst.

| Kategorie | Bedeutung |
|---|---|
| `explicit_forecast` | Mindestens ein direkt passender Halt im Fenster hat einen expliziten Ankunfts-/Abfahrtswert oder eine Verspätung, einschließlich ausdrücklich gemeldeter null Sekunden. |
| `trip_update_only` | Fahrtmeldung vorhanden, aber kein direkt passender Prognosewert an diesen Halten. |
| `cancelled` | Fahrt ausdrücklich abgesagt; eigene Kategorie, kein normaler Prognosetreffer. |
| `missing` | Keine passende Fahrtmeldung. Das bedeutet nicht pünktlich oder ausgefallen. |
| `ambiguous` | Fahrt-ID oder Echtzeitzuordnung mehrdeutig. |
| `unsupported` | Besondere Fahrtbeziehung benötigt zusätzliche Auswertung. |

Die direkte Quote ist `explicit_forecast / scheduled`. Bei null geplanten
Fahrten lautet der Wert `null`, niemals 0 %. Sie ist eine **konservative
Datenabdeckung**, keine gemessene Positionsgenauigkeit. Eine eigene Engine
könnte mehr Prognosen durch die spezifizierte Verspätungsfortschreibung
ableiten. Fahrtmeldungen allein sind aber kein Nachweis für eine aktuelle
Prognose im Kartenabschnitt. Stop-ID ohne Sequenz wird bei wiederholtem Besuch
desselben Halts nicht als eindeutiger Treffer akzeptiert.

Fehlende, übersprungene und abgesagte Halte bleiben unterscheidbar. Zusätzliche,
außerplanmäßige Fahrten liegen außerhalb dieses Fahrplan-Nenners. Lücken in der
statischen Quelle selbst sind mit diesem Vergleich nicht messbar.

## Frische, Fehler und Belege

Jeder Abruf bekommt URL, Empfangszeit, Header, Größe und SHA-256. Die Auswertung
verwendet die damalige Empfangszeit, damit eine spätere Wiederholung nicht
vorgibt, historische Daten seien aktuell. Ein vollständiger Echtzeitdatensatz
muss einen Header haben, der höchstens 120 Sekunden alt bzw. 30 Sekunden in der
Zukunft liegt. Differenzfeeds benötigen einen eigenen Zustandsaufbau und werden
abgelehnt. Vorhandene Fahrtzeitstempel werden separat profiliert; eine frische
Feed-Veröffentlichung beweist keinen frischen Messzeitpunkt beim Betreiber.

Downloads haben Größen- und Zeitlimits. Ein Dateilock verhindert konkurrierende
Befehle im selben Arbeitsordner. Ein neuer Index ersetzt den alten erst nach
erfolgreichem Import. Prüfsummenfehler, ungültige Kalender und defekte Quellen
führen zum Abbruch. Ein fehlgeschlagener Abruf schreibt `failure.json` mit
`unavailable`; er wird weder als Nullabdeckung noch als frische alte Lieferung
ausgegeben. Es gibt keine automatische Endloswiederholung.

Die beobachteten Rohdaten und SQLite-Dateien bleiben im ignorierten Cache.
Die Auswertung lässt sich mit `gtfs.pipeline.assess` aus den aufbewahrten
Downloads reproduzieren. Die ursprünglichen Hinweise aus `attributions.txt`
und `feed_info.txt` stehen in `import.json` und im Index.

## Lizenzen und nächster Integrationsschritt

Der Importcode ist MIT. Das gilt **nicht** für die Daten:
[statische GTFS.de-Feeds](https://gtfs.de/de/feeds/) verweisen auf CC BY 4.0;
der [Echtzeitfeed](https://gtfs.de/de/realtime/) steht unter CC BY-SA 4.0.
Namensnennung, Lizenzlink und Änderungshinweis müssen bei Weitergabe erhalten
bleiben; abgeleitete Echtzeitdaten werden unter CC BY-SA 4.0 weitergegeben.
Die enthaltenen OSM-Hinweise und die ODbL bleiben separat bestehen.

Die veröffentlichten offenen Downloads benötigen weder Anmeldung noch eine
individuelle Freigabe per E-Mail. Die Anbieter-Lizenz ersetzt keine Garantie
für Vollständigkeit, Verfügbarkeit oder Genauigkeit. Der gesamte aktuelle
App-Datenpfad muss vor einem kommerziellen Start umgestellt werden:

1. Eigener zentraler Fahrplan-/Echtzeitdienst mit passenden Geometrien und
   getesteter Verspätungsfortschreibung; keine nationalen Vollfeeds im Edge-Request.
2. Kartenfahrten, Fahrtverlauf, Abfahrten und Fußwege jeweils ersetzen; auch
   bisher aus Transitous abgeleitete Such- und Netzdaten neu erzeugen.
3. Quellenstatus und Datenalter durch alle Adapter mitführen; echte Koordinaten,
   Prognosen und reine Fahrpläne unterscheidbar halten.
4. Abdeckung über verschiedene Wochentage/Zeitfenster und Positionsgenauigkeit
   vor Ort prüfen. Freie Zusatzfeeds nur nach Prüfung ihrer tatsächlichen Lücke,
   IDs, Lizenz und Redundanz aufnehmen. Ein anderes Format allein ist keine
   zusätzliche unabhängige Quelle.

Solange das nicht erledigt ist, bleibt die gehostete Karte das bestehende
nichtkommerzielle Experiment. Das Assessment meldet keinen abgeschlossenen
bundesweiten Produktstart.
