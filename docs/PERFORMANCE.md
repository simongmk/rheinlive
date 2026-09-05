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

Die Gleise werden jetzt unmittelbar aus der Transportation-Ebene der bereits
geladenen OpenFreeMap-Vektorkacheln gezeichnet: eine dünne Linie je gelieferter
Gleisgeometrie, ohne zusätzliche Fahrtrouten je Linie oder Verkehrsmittel.
Tunnelgleise bleiben enthalten; parallele Gleise werden nicht durch räumliche
Toleranz zusammengezogen. Die bisherigen Strich-/Umrandungsebenen der Basiskarte
werden ersetzt. Eine ausgewählte Fahrt hebt ihren berechneten Weg separat hervor.
Kartendaten können je Zoomstufe vereinfacht oder unvollständig sein.
Bus-/Fährwege bleiben optionale, pro Verkehrsmittel komprimierte Routen.

## Bewegung

- Eigene transparente Canvas-Ebene; keine GeoJSON-Übertragung an MapLibre pro
  Animationsbild und kein eigenes DOM-Element pro Fahrzeug.
- Fahrzeugsymbole werden einmal gezeichnet und aus einem auf 512 Einträge
  begrenzten Cache wiederverwendet. Die Pixeldichte ist auf 2 begrenzt.
- Ziel 30 Bilder pro Sekunde; bei anhaltender Last 20 bzw. 12, bei ausreichend
  Reserven langsame Rückkehr. Kartenbewegungen synchronisieren die Zeichenfläche
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
