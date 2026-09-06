# Eigene Datenengine für Deutschland

MOTIS v2.11.2 verarbeitet den kombinierten Deutschland-Fahrplan von GTFS.de,
den dazu passenden freien Echtzeitfeed und OpenStreetMap. Der Code stellt
Kartenfahrten, komplette Fahrtverläufe, Abfahrten und Gehzeiten auf einen
gemeinsam konfigurierten Anbieter um. Die gehostete Standard-App bleibt bis
zum vollständigen Betriebswechsel bei Transitous. Keine nationale Datei wird
im Browser oder innerhalb eines Cloudflare-Requests eingelesen.

Die Engine hat einen Deutschland-Datensatz. Die App-Integration verwendet
zunächst die bereits vorhandenen Oberflächen für Köln, Bonn und Düsseldorf.
Das ist kein fertig veröffentlichter deutschlandweiter Produktstart.

## Lokal reproduzieren

Node 22+, Python mit `scripts/gtfs/requirements.txt`, macOS ARM64 oder Linux
ARM64/AMD64. Engine-Binaries stammen vom festgelegten offiziellen Release und
werden gegen dessen SHA-256 geprüft. Keine Docker-Installation erforderlich.

```sh
python3 -m venv .venv-gtfs
source .venv-gtfs/bin/activate
python -m pip install -r scripts/gtfs/requirements.txt
python scripts/motis-download.py gtfs
python scripts/motis-download.py osm --osm-date 2026-09-05
python scripts/motis-setup.py --osm .cache/motis/sources/germany-260905.osm.pbf
nice -n 10 .cache/motis/bin/motis import -c .cache/motis/config.yml -d .cache/motis/data
```

Der Geofabrik-Tag muss als datierter Download noch vorhanden sein. Bei einem
neueren Erstaufbau einen aktuellen Tag wählen und denselben Dateinamen an
`motis-setup.py` geben. Der erste Deutschland-Download umfasste 284 MB GTFS und
4,83 GB OSM. SHA-256, Downloadzeit, URL und Header liegen neben den Quellen;
die OSM-Datei wird zusätzlich mit der Geofabrik-Prüfsumme abgeglichen.
Archive werden nicht beliebig ins Dateisystem entpackt.

Danach in getrennten Terminals mit derselben Python-Umgebung:

```sh
python scripts/motis-relay.py
```

```sh
.cache/motis/bin/motis server -d .cache/motis/data
```

Nach dem ersten erfolgreichen Echtzeitzyklus:

```sh
node scripts/motis-network.mjs
npm run dev:own
# http://localhost:4174
```

Alle Dienste binden nur an `127.0.0.1`. Die zusätzliche Vorschau übernimmt
keine alten Transitous-Haltestellen-IDs. Ihre sechs Netzdateien kommen aus dem
eigenen Import; Basis-Karte und separat lizenzierte OSM-Gleisdetails bleiben
die bestehenden Assets. Die Vorschau nennt ihre eigene Quelle und korrigiert
den Standort-/Gleishinweis. Es gibt keinen automatischen Transitous-Fallback.

Nach dem abgeschlossenen Erstaufbau startet `npm run start:own` alle drei
Prozesse gemeinsam. Dafür müssen die Daten und Netze bereits vorliegen und
die Ports 8787, 8788 und 4174 frei sein. Die Python-Umgebung wird aus
`.venv-gtfs/bin/python` oder `PYTHON` gewählt. Strg-C beendet ausschließlich
diese gestarteten Prozesse; es wird kein Login-Autostart installiert.

## Frische und Aussagekraft

Der zentrale Relay lädt höchstens alle 25 Sekunden einen vollständigen Feed;
MOTIS fragt ihn alle 30 Sekunden ab. Gleichzeitige Leser teilen denselben
Download. Ungültige, veraltete oder differenzielle Feeds werden abgelehnt;
ein Abruffehler entfernt die zuletzt angebotenen Rohdaten.

Die App prüft nicht nur MOTIS `/api/v1/health`: Dieser Status kann nach einem
einmal erfolgreichen Echtzeitzyklus weiterhin positiv bleiben. Stattdessen
müssen der Relay-Empfang, die Feed-Veröffentlichung und die **von MOTIS
tatsächlich übernommene** Veröffentlichung höchstens 120 Sekunden alt sein;
der letzte MOTIS-Updatezyklus höchstens 90 Sekunden. Gesundheitsprüfungen
werden gebündelt und fünf Sekunden zwischengespeichert. Auch innerhalb dieser
fünf Sekunden gilt das echte Ablaufdatum.

Die Prüfung erfolgt vor und nach Karten-/Abfahrts-/Detailabfragen, auch vor
Antworten aus deren Cache. `validUntil` wird bis zur Animation und den
Countdowns mitgegeben; ein neuer HTTP-Empfang verlängert die Quelle nicht.
Ausfälle lassen unabhängige Gehzeitabfragen weiterhin zu. Nutzerkoordinaten
werden nicht in Cache-Antworten gespiegelt oder dauerhaft protokolliert.

Ein aktueller Feed-Header beweist keinen aktuellen Messzeitpunkt je Fahrzeug.
Die beobachteten GTFS.de-Feeds enthalten TripUpdates und Alerts, keine
VehiclePositions. MOTIS kann Verspätungen entlang einer Fahrt fortschreiben.
Diese Kartenprognosen sind nicht mit der konservativen direkten
Halteprognose-Quote im [Coverage-Assessment](GTFS-PIPELINE.md) gleichzusetzen.

## Geometrie, Verkehrsmittel und Gleise

Der freie GTFS-Datensatz enthält keine Shapes. MOTIS berechnet sie aus OSM.
Ein `ROUTED`-Pfad ist eine berechnete Strecke, kein Beweis für das tatsächlich
genutzte Gleis oder eine aktuelle Umleitung. Zwei-Punkt-Geometrien werden
vorsichtig als gerade Schätzung gekennzeichnet. Unbekannte Vollverläufe
werden nicht durch erfundene Zusatzstrecken ersetzt.

Generische Bahnklassen werden nur bei passenden Präfixen als S-Bahn, ICE,
IC/EC oder Nachtzug eingeordnet. Andere Bahnlinien bleiben Regionalverkehr;
ein Ersatzbus namens ICE bleibt Bus. Bei gemeinsam gelieferten Segmenten
mit unterschiedlichen Fahrtklassen bleiben diese getrennt. Die gleiche
Einordnung gilt für Kartenfahrten, Haltestellenabfahrten und Linienkataloge.

Die freien GTFS.de-Stop-IDs sind keine DHIDs. Daher werden sie nicht mit alten
Transitous- oder OpenStation-IDs gleichgesetzt. Plattformnummern stammen bei
diesem Anbieter aus der Fahrtmeldung; fehlende Werte bleiben unbekannt.
Gemeldete Elternhaltestellen werden zur Stationsgruppierung verwendet.

## Betrieb und Aktualisierung

Der Import ist ein lokaler, begrenzter Erstaufbau mit vier Shape-Threads,
14 Tagen Fahrplan und ohne künstliche Kalenderverlängerung. Alle Cachedateien
bleiben außerhalb von Git. Datenverzeichnis nie während eines laufenden
MOTIS-Servers importieren oder verändern. Vor der Netzregeneration auch die
Vorschau beenden, da sie ihre Stationsliste beim Start lädt.

Für den späteren Dienst: neue Fahrplandaten in einem separaten Verzeichnis
importieren, Lizenz-/Quellen- und Gesundheitsprüfungen durchführen, passende
Netz-Snapshots erzeugen, dann Engine und App-Datensatz gemeinsam umschalten.
Alte Generation bis zur erfolgreichen Prüfung für einen kontrollierten
Rollback behalten. Shapes können zwischengespeichert werden; MOTIS weist
darauf hin, dass dieser Cache beim Fortschreiben wachsen kann.

Der Betrieb benötigt einen dauerhaft laufenden Server mit Arbeitsspeicher
und SSD; der bisherige kleine Edge-Worker ist dafür ungeeignet. Noch kein
Cloud-Server, Abo oder Domainkauf. Vor öffentlicher Bereitstellung fehlen
insbesondere TLS/Proxy, Zugriffslimits, automatischer Importwechsel,
Restart-/Outage-Prüfung, längerfristige Abdeckung und Vor-Ort-Positionsvergleich.
Keine ungemessene Hosting-Größe oder Verfügbarkeitsgarantie ableiten.

Siehe [Datenhinweise](OWN-DATA-NOTICES.md),
[MOTIS-Setup](https://github.com/motis-project/motis/blob/v2.11.2/docs/setup.md),
[GTFS.de Fahrplan](https://gtfs.de/de/feeds/de_full/) und
[GTFS.de Echtzeit](https://gtfs.de/de/realtime/).
