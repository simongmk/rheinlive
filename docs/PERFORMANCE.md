# Ladezeiten und Fahrzeuganimation

Stand: 5. September 2026. Die Änderungen beheben sowohl redundante Kartenobjekte
als auch unnötige Arbeit beim Animieren. Die Messungen unten sind Datei-, CPU-
und HTTP-Messungen, keine Behauptung getesteter Browser-FPS oder GPU-Leistung.

## Haltestellen

Severinstraße war mit elf Steig-/Linienkombinationen im Netz enthalten. Jetzt
steht dort ein Stationsobjekt mit einer Beschriftung. Die gemeinsame deutsche
Haltestellen-ID wird vor der Aufteilung in Steige verwendet. Ohne diese ID
werden nur gleichnamige Einträge in höchstens 180 Metern Abstand zum festen
Gruppenanker zusammengefasst. Verschiedene bekannte Eltern-IDs und entfernte
gleichnamige Haltestellen bleiben getrennt. Alle Verkehrsmittel und Linien
bleiben für die Filter erhalten; die Live-Haltefolge behält ihre Steigdetails.

In der Übersicht werden Gleise unmittelbar aus der Transportation-Ebene der bereits
geladenen OpenFreeMap-Vektorkacheln gezeichnet: eine dünne Linie je gelieferter
Gleisgeometrie, ohne zusätzliche Fahrtrouten je Linie oder Verkehrsmittel.
Tunnelgleise bleiben enthalten; parallele Gleise werden nicht durch räumliche
Toleranz zusammengezogen. Die bisherigen Strich-/Umrandungsebenen der Basiskarte
werden ersetzt. Eine ausgewählte Fahrt hebt ihren berechneten Weg separat hervor.
Kartendaten können je Zoomstufe vereinfacht oder unvollständig sein.
Bus-/Fährwege bleiben optionale, pro Verkehrsmittel komprimierte Routen.

## Detaillierte Gleise bei naher Ansicht

Ab Zoom 14,3 lädt Rheinlive genau einen regionalen Gleisabzug, sofern der
sichtbare Ausschnitt vollständig darin liegt. Erst nach erfolgreicher
Verarbeitung ersetzt er die normale Gleisebene; bis dahin, bei Fehlern und
außerhalb des abgedeckten Gebiets bleibt die Basiskarte sichtbar. Ein Wechsel
zwischen Regionen ersetzt die vorherige Detailquelle. Ausgeschaltete Gleise
und die Übersicht lösen keinen Download aus. Wiederholte Bewegungen innerhalb
eines bereits geladenen Gebiets bauen die Quelle nicht neu auf. Nach einem
Fehler werden weitere Versuche eine Minute gebremst.

Die Rundung wird beim Export berechnet. Laden, JSON-Verarbeitung und
Kachelaufbereitung der Detaildatei erfolgen im MapLibre-Worker. Es gibt keine
zusätzlichen Rechenschritte pro Fahrzeugbild. Die Detailquelle verwendet
`maxzoom: 18` und `tolerance: 0.05`, damit die Nahansicht die feinere Geometrie
nicht wieder grob vereinfacht. MapLibre/GPU-Speicher und tatsächliche Renderzeit
hängen weiterhin vom Gerät ab; das ist keine Browser-FPS-Messung.

| Region | Gleis-Ways | Detaildatei | Lokales gzip |
|---|---:|---:|---:|
| Köln | 7.838 | 3.527.381 Bytes | 1.071.520 Bytes |
| Bonn | 1.596 | 625.178 Bytes | 195.802 Bytes |
| Düsseldorf | 4.974 | 2.708.145 Bytes | 811.434 Bytes |

Die Dateien gehören zum Nahzoom, nicht zum Startnetz unten. Tests begrenzen
jeden Abzug auf 8 MB JSON / 1,25 MB lokales gzip. Der Informationsdialog zählt
auch diese Transfers unter „Zusatznetze übertragen“. Die normale Kartenansicht
bleibt während des Downloads benutzbar. Quelle und datierte Klassifikation
der Bauabschnitte stehen in [DATA-SOURCES.md](DATA-SOURCES.md).

## Halten, Bremsen und Anfahren

Die Vorbereitung einer Antwort berechnet die Halteintervalle einmal pro
Fahrt. Pro Animationsbild kommt nur die Auswertung des Zeit-/Geschwindigkeits-
profils hinzu; Streckenlängen und die binäre Ortssuche werden weiterverwendet.
Ein modellierter Aufenthalt endet an der mitgelieferten Abfahrtsprognose.
Die Quelle wird dadurch nicht häufiger angefragt. Es gibt keine zusätzliche
Anfrage pro Fahrzeug. Das stationäre Pausenzeichen wird im bestehenden,
auf 512 Einträge begrenzten Sprite-Cache gespeichert.

Tests verwenden echte historische KVB-Minutenwerte und prüfen die tatsächlichen
Canvas-Zeichenaufrufe mit abgefangenem Zeichenkontext: identische Pixelpositionen
über mehrere Haltebilder, anschließende zunehmende Bewegung und keine
Kartenquellen-Updates. Das ist kein Browser-/GPU-Test. Reale Haltezeiten können
weiter von den ausdrücklich als geschätzt markierten Modellwerten abweichen.

Bei einer CPU-Stichprobe mit derselben realen Kölner Antwort und 300
Durchläufen nach 30 Aufwärmrunden lag die reine Positionsberechnung im Median
bei 0,107 ms statt zuvor 0,096 ms; das 95. Perzentil lag in beiden Fällen bei
0,192 ms. Die Fahrzeugzahl wechselte mit dem ausgewerteten Zeitpunkt; ein
Vergleichszeitpunkt enthielt 485 Positionen. Diese lokalen Node-Messwerte
schließen Canvas, WebGL und Netzwerk aus und versprechen keine Geräte-FPS.

## Bewegung

Ein aktiver Drag kann in MapLibre weiterhin als Bewegung gelten, obwohl die
gedrückte Maus stillsteht und keine neuen Kartenbilder entstehen. Die eigene
Animationsuhr läuft deshalb auch während eines Drags weiter. Tatsächliche
Kamerabewegungen markieren die Projektion als geändert; das folgende Kartenbild
zeichnet die Icons synchron neu, auch beim letzten Bild nach dem Loslassen.
Diese Zeichnung zählt bereits für den Animationstakt. Reine Kachel-/Stilbilder
lösen keine weitere Fahrzeugzeichnung aus. Die Leistungsbremse bewertet die
gemessene CPU-Zeichenzeit, nicht die Abstände zwischen Mausereignissen.

Eine deterministische Canvas-Prüfung mit 500 Fahrzeugen erzeugt bei gehaltener
Maustaste ohne Kartenbilder 60 Fahrzeugbilder in zwei simulierten Sekunden.
Bei 120 Kamerabildern zeichnen beide Reihenfolgen der RAF-/Karten-Callbacks
genau 120 Fahrzeugbilder, ohne zusätzliche Animationszeichnungen. Langsame
Eingaben drosseln den Takt nicht; tatsächliche teure Zeichnungen tun es weiterhin.
Das prüft den Scheduler und die Koordinaten, nicht reale Browser-/GPU-FPS.

- Eigene transparente Canvas-Ebene; keine GeoJSON-Übertragung an MapLibre pro
  Animationsbild und kein eigenes DOM-Element pro Fahrzeug.
- Fahrzeugsymbole werden einmal gezeichnet und aus einem auf 512 Einträge
  begrenzten Cache wiederverwendet. Die Pixeldichte ist auf 2 begrenzt.
- Start mit 30 Bildern pro Sekunde; nach 180 günstigen Zeichenbildern bis zu
  60. Bei anhaltender Last zurück auf 30, 20 bzw. 12, mit langsamer Erholung. Kartenbewegungen synchronisieren die Zeichenfläche
  mit der Kartenprojektion. Die erreichbare Rate hängt vom Gerät ab.
- Unsichtbare Tabs stoppen die Animationsschleife. Ohne Fahrzeuge läuft keine
  Schleife. Die Systemeinstellung für reduzierte Bewegung begrenzt automatische
  Positionsänderungen auf einmal pro Sekunde.
- Positionen werden weiter aus denselben Prognosen und Wegen berechnet, inklusive
  Ablaufgrenze für alte Daten. Ankunftsprognosen kommen weiterhin alle 30 Sekunden.
  Mehr Animationsbilder sind keine häufigeren Betreiber-Messungen.
- Die Ortssuche entlang langer Strecken nutzt binäre Suche. Zähler und Listen
  werden nicht mit der höheren Bildrate neu aufgebaut.

Die Empfehlungen zum Wiederverwenden vorgezeichneter Symbole und zu getrennten
Zeichenebenen sind in der [Canvas-Dokumentation](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
beschrieben. Die Positionierung verwendet MapLibres dokumentierte
[Projektions- und Kartenereignisse](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/).

## Ladevolumen

Gemessene Dateigrößen in dezimalen MB; gzip lokal mit Node/zlib. Der Hoster kann
eine andere Kompression wählen. Das Busnetz wird erst bei aktiviertem Busfilter
geladen. Haltestellensuche und Linienkatalog sind schon im kleinen Startnetz.

| Region | Vorher gesamt | Neues Startnetz | Busnetz bei Bedarf | Startnetz gzip vorher → jetzt |
|---|---:|---:|---:|---:|
| Köln | 6,18 MB | 0,48 MB | 1,56 MB | 565 → 61 KB |
| Bonn | 3,17 MB | 0,25 MB | 0,80 MB | 273 → 32 KB |
| Düsseldorf | 6,52 MB | 0,35 MB | 1,45 MB | 579 → 43 KB |

Die Zahl der Stationsobjekte sinkt von 10.420 / 6.019 / 11.742 auf
2.121 / 1.088 / 1.502. Der Browser hält höchstens zwei Regionen im Speichercache.
Der gespeicherte Hell-/Dunkelmodus wird direkt geladen, ohne zunächst einen
zweiten Kartenstil anzufordern. Die App startet nach DOM-Bereitschaft.

Diese Größen schließen Basiskarten-Kacheln, Kartenbibliothek und aktuelle
Fahrtdaten nicht ein. Die Kölner lokale API lieferte bei der Messung um 12:55 UTC
557 Fahrten in 1,92 MB JSON und 286 ms einschließlich Antwortlesen. Das ist eine
Momentaufnahme, kein zugesagtes Ladezeit-Ziel.

Die folgende HTTP-Messung bezieht sich auf die vorherige Veröffentlichung mit
dem 1,03-MB-Startnetz; sie ist kein Messwert der aktuellen Gleisumstellung:
Das Kölner Startnetz wurde direkt über die private Site gemessen: HTTP 200, gzip, Cache HIT, **121.140 tatsächlich übertragene
Bytes**, erster Antwort-Byte nach 1.536 ms, vollständig nach 1.555 ms. Diese
authentifizierte HTTP-Abfrage misst ein einzelnes Netz-Artefakt und den Zugriff
über den Hoster, nicht die Ladezeit der gesamten Browseransicht. Die separat
geprüften Busdateien lagen bei 1,57–2,07 s. Es gibt deshalb weiterhin messbaren
Netzwerk-/Hosting-Overhead; kleine Dateien allein garantieren kein sofortiges
Rendering. Die Anzeige im Informationsdialog ergänzt diese Server-Stichprobe
um Messungen auf dem tatsächlich verwendeten Gerät.

## CPU-Prüfung und laufende Messwerte

Bei der vorherigen Animationsänderung wurden mit derselben Kölner Antwort
300 Interpolationsschritte nach
30 Aufwärmschritten in Node gemessen, jeweils 516 aktive Fahrzeuge:

| Reine Positionsberechnung | Vorher | Jetzt |
|---|---:|---:|
| Median pro Durchlauf | 0,100 ms | 0,091 ms |
| 95. Perzentil | 0,165 ms | 0,125 ms |

Das misst weder MapLibre-Projektion noch Canvas-/GPU-Zeichenzeit. Die wichtige
Änderung für flüssige Bewegung ist die Trennung der Animation vom Neuaufbau der
Kartenquelle. Vertragstests prüfen 500 Fahrzeuge, Symbolwiederverwendung,
Lastanpassung, versteckte Tabs, veraltete Daten, Regionsgrenzen und Klickziele.

Unter **Information → Ladezeiten & Darstellung** zeigt die laufende App die
Zeit bis zu den ersten Fahrten und zur ersten ruhenden Kartenansicht, die letzte
Netz-/Datenabfrage, gezählte Animationsbilder, mittlere CPU-Zeichenzeit und die
übertragenen Zusatznetze dieser Sitzung. Die Zeichenzeit misst JavaScript-Arbeit;
GPU-Fertigstellung und Web-Vitals/LCP sind darin nicht enthalten. Es werden keine
Messwerte an einen Analysedienst gesendet. Browser- und Sichttests wurden für
diese Änderung nicht angefordert und nicht durchgeführt.

## Haltezeiten ohne zusätzliche Abfrage pro Fahrzeug

Ankunft und nächste Abfahrt derselben Fahrt am exakt gleichen Halt begrenzen
den Aufenthalt. In diesem Intervall bleibt die Position unverändert. Beide
Zeitgrenzen brauchen Prognosen, damit der Halt als prognosebasiert zählt.
Im Detail stehen Aufenthaltsdauer und verbleibende Zeit bis zur Abfahrt.

Der Server kann einen gerade aus dem kurzen Abfragefenster verschwundenen
Ankunftsabschnitt für dieselbe weiterhin gelieferte Fahrt übernehmen. Das
sind höchstens ein Abschnitt pro Fahrt und zwei Minuten ab Empfang bzw.
Ankunft. Der alte Empfangszeitstempel wird nicht erneuert. Neue Zeitprognosen
haben Vorrang; fehlende Fahrten und explizit ausgefallene Abschnitte werden
nicht ergänzt. Ein Neustart des Servers kann diese kurze Kontinuität verlieren.
Fehlende oder gleichzeitige Ankunft/Abfahrt erzeugen keine erfundene Wartezeit.
Längere Aufenthalte sind nur darstellbar, solange beide Zeitgrenzen frisch
vorliegen. Es werden keine zusätzlichen Einzelabfragen für alle Fahrzeuge
gestartet und keine Prognosen öfter als bisher abgefragt.

## Abfahrtsmonitor: zusätzlicher Aufwand

Die Netzdateien enthalten zusätzlich die originalen Stations-IDs für gezielte
Abfahrtsabfragen. Dadurch beträgt das aktuelle Startnetz 567.282 / 295.898 /
414.610 Bytes in Köln / Bonn / Düsseldorf. Die frühere Größentabelle oben
beschreibt die Gleisumstellung vor dieser Monitor-Ergänzung. Die IDs erweitern
die Stationssuche und müssen nicht separat geladen werden.

Nur der gewählte Halt wird alle 30 Sekunden abgefragt; die Antworten werden
serverseitig mit begrenztem Cache und Warteschlange geteilt. Gehzeiten für
höchstens sechs Kandidaten kommen aus einer gemeinsamen Fußwegabfrage nach
Standortabruf bzw. bewusster Neuberechnung. Der Sekunden-Countdown aktualisiert
nur Texte und Zustände, ohne Netzaufrufe pro Sekunde. Geolocation läuft einmal
beim Öffnen und erneut auf Anforderung, nicht als dauerndes GPS-Tracking.


## Kurze Übergänge, kompakte Oberfläche (05.09.2026)

Neue Icons blenden über 450 ms ein, auslaufende über 650 ms aus (Smoothstep).
Am Ende eines bekannten Abschnitts erreicht das Icon dessen gemeldeten Endpunkt
und bleibt während des Ausblendens stehen. Das ist ein visueller Übergang,
keine extrapolierte Weiterfahrt oder zusätzlich behauptete Betriebszeit.
Eine zurückkehrende Fahrt-ID dreht ihren Übergang um, ohne ein zweites Icon.
Polling startet bestehende Übergänge nicht neu. Ausblendende Icons sind nicht
anklickbar und zählen nicht als aktuelle Fahrzeuge. Der Canvas-Sprite wird
weiterverwendet; nur seine Deckkraft ändert sich. Maximal 512 entfernte Icons
bleiben kurz für Übergänge gespeichert. Es gibt keine zusätzlichen Netzabfragen.

Veraltete Beobachtungen, Abfrageausfälle, bestätigte Ausfälle und Stadtwechsel
entfernen Icons sofort. Unsichtbare Tabs leeren die Übergänge und stoppen die
Animation. Ohne aktive oder ausblendende Icons endet die Schleife. Die
Systemeinstellung für reduzierte Bewegung deaktiviert Ein-/Ausblendungen.
Canvas-Vertragstests prüfen Deckkraft im Zeitverlauf, feststehende Endpunkte,
fehlende Klickziele, wiederkehrende IDs, Abbruchzustände und Speichergrenzen.

Die Hauptansicht enthält kurze Statusangaben und Bedienelemente. Der vollständige
Fahrtverlauf ist aufklappbar; Gleiswechsel, Störungen und Ausfälle bleiben davor
sichtbar. Positionsschätzung und geschätzte Halte bleiben knapp markiert.
Abrufalter, Quellen und Methodik stehen in der Dateninfo. Der Monitor aktualisiert
seine gesunde Anzeige ohne jede Sekunde wechselnde Abruf-Erklärung. Bei fehlenden
oder alten Prognosen bleiben Handlungs- und Fehlerhinweise erhalten.


## Flüssiger Takt und direkte Haltestellenwahl (05.09.2026)

Die Animationsfrist bleibt jetzt auf einem festen Zeitraster. Die CPU-Zeichenzeit
wird nicht mehr zum Abstand bis zum nächsten Bild addiert. In deterministischen
Prüfungen mit 500 Icons und simulierten 3 ms Zeichenzeit bleiben deshalb sowohl
30 als auch 60 Bilder pro Sekunde erhalten, bei 60- und 120-Hz-Callbacks.
60 B/s werden erst nach anhaltender Reserve freigegeben; mehr als ca. 6,7 ms
Zeichenzeit pro Bild lösen dort nach mehreren Bildern die Rückkehr zu 30 aus.
Das sind Scheduler-Prüfungen, keine gemessenen Browser-/GPU-FPS.

Aktuelle Kamerabilder haben Vorrang. Die eigene Uhr wartet höchstens 50 ms nach
dem letzten Kamerabild, bevor sie bei stillgehaltener Maus übernimmt. Tests
prüfen beide Callback-Reihenfolgen bei 30/60 Kamerabildern pro Sekunde: keine
zusätzlichen Fahrzeugzeichnungen und kein Nachholen verpasster Bilder in Bursts.
Fades, reale Zeitanker, Haltedauer, Datenablauf und Abfrageintervalle bleiben gleich.

Uhr und Countdown verwenden einen an Sekundengrenzen ausgerichteten Timer statt
einer zusätzlichen Display-RAF-Schleife. Versteckte oder verlassene Seiten
stoppen ihn; beim Zurückkehren läuft ein aktueller Tick ohne Nachholschleife.
Der Abfahrtsmonitor behält seine Wiederaufnahme beim Browser-Zurück vor.

Stationspunkte und Namen sind direkt auswählbar. Sichtbare Kartenobjekte werden
anhand ihrer Original-ID ins geladene Stationsnetz zurückgeführt; unbekannte IDs
werden verworfen. Fahrzeuge haben bei überlappenden Klickzielen Vorrang. Hover
wird höchstens einmal pro Bildschirmbild ausgewertet und während Drags ausgesetzt.
Es gibt keinen zusätzlichen Download, keine Suche über unsichtbare Haltestellen
und keine neuen Netzwerkabfragen nur durch Hover. Ein Klick nutzt den bestehenden
Monitor und dessen begrenzte Abfahrtsabfragen.

Ein frischer geöffneter Fahrtverlauf bleibt beim Nachladen lesbar. Aktualisierte
Stopps behalten für dieselbe Fahrt die Scrollposition. Das Öffnen des Verlaufs
orientiert weiterhin am nächsten Halt; Wechsel zu einer anderen Fahrt beginnt neu.
