# Standort, Abfahrtsmonitor und Losgehzeit

Stand: 5. September 2026. Der Monitor ist in Köln, Bonn und Düsseldorf verfügbar.
Die [KVB-Monitor-Referenz](https://kvb-monitor.de/) des Nutzers war die inhaltliche
Anregung; übernommen werden weder deren Layout noch deren Datenabruf.

## Vom Öffnen zum Losgehen

Die App bittet beim Öffnen über die Browser-Standortfunktion um Freigabe. Nach
Erlaubnis wählt sie die unterstützte Region und zeigt die Umgebung samt blauem
Standortpunkt. Bei verweigerter Freigabe bleibt die Haltestellensuche verfügbar;
Gehzeit kann dann manuell eingegeben werden. Außerhalb der drei Regionen wird
fehlende Abdeckung ausdrücklich gemeldet. Manuelle Stadtauswahl hat Vorrang
vor einem noch ausstehenden Standortergebnis.

Aus den bereits geladenen Stationen werden höchstens sechs innerhalb von drei
Kilometern gesucht. Eine gemeinsame Fußwegabfrage liefert berechnete Gehzeiten.
Die erste automatisch gewählte Station hat die kürzeste gelieferte Gehzeit in
dieser kleinen Auswahl. Die anderen Stationen bleiben auswählbar. Nicht
berechenbare Wege werden nicht durch Luftlinie / Gehgeschwindigkeit ersetzt.
Luftlinie dient nur zur Vorauswahl und ist bei den Entfernungen so beschriftet.

Der Monitor bevorzugt zwei erreichbare Abfahrten unterschiedlicher Richtungen,
wahlweise mit Linien-/Richtungsfilter, sowie weitere gemeldete Abfahrten
am Halt. Er verwendet einen eigenen Haltestellen-Endpunkt und ist unabhängig
vom kurzen Fahrzeugfenster und den Verkehrsmittelfiltern der Karte.

    Losgehzeit = prognostizierte Abfahrt − Gehzeit − Puffer

Gehzeit wird auf ganze Minuten aufgerundet. Der Puffer beginnt bei zwei Minuten
und ist wie die Gehzeit einstellbar. Abfahrtsprognosen berücksichtigen gemeldete
Verspätungen. Ausfälle, gesperrter Einstieg, fehlende Gehzeit, reine Sollzeiten
und veraltete Antworten erzeugen keine positive Losgeh-Empfehlung. Ist der
Puffer unterschritten, lautet die Anzeige „Knapp“; sie fordert nicht zum Rennen
auf. Eine abgelaufene Abfahrt wird entfernt. Sekunden sind eine Anzeige der
Berechnung, keine Behauptung sekundengenauer Betreiberprognosen.

## Daten und Grenzen

Die [offizielle MOTIS-Spezifikation](https://github.com/motis-project/motis/blob/master/openapi.yaml)
definiert `/api/v6/stoptimes` und `/api/v1/one-to-many` mit dem WALK-Profil.
Die echte Prüfung an Severinstraße lieferte 59 normalisierte Abfahrten, davon
44 mit Prognosen. Eine gewählte öffentliche Testkoordinate nordöstlich des
Halts ergab 316 Sekunden und rund 381 Meter Fußweg zum Stationspunkt. Das ist
keine Messung des Nutzerstandorts. Ein älterer kleiner Abfahrtsausschnitt ist
als historische Test-Fixture gespeichert und wird niemals live ausgeliefert.

Der Fußweg endet am erfassten Stationspunkt. Bahnsteigzugang, Treppen, aktuelle
Sperrungen, Ampeln, individuelles Tempo und Standortungenauigkeit können mehr
Zeit erfordern. Es gibt keine Zusage zur Barrierefreiheit. Bei mehr als 300 m
Standortungenauigkeit wird keine automatische Gehzeit eingesetzt. Nach fünf
Minuten braucht eine automatisch ermittelte Gehzeit einen neuen Standortabruf
oder eine manuelle Eingabe. Die App führt kein fortlaufendes Standorttracking aus.

Abfahrten werden alle 30 Sekunden aktualisiert, nur für den ausgewählten Halt
und während der Monitor sichtbar ist. Der Server fasst gleiche Abfragen
zusammen, begrenzt Warteschlange und Cache und hält nur bekannte Stations-IDs
der gewählten Region für Abfragen frei. Antworten über 1 MB und Geh-Anfragen
über 4 KB werden abgewiesen. Nach spätestens zwei Minuten fehlen frische
Prognosen; der Countdown pausiert. Bei Abruffehlern werden alte Daten entfernt.

## Standort und Navigation

Die [Browser-Geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)
braucht HTTPS bzw. localhost und die Freigabe des Browsers. Eingebettete Ansichten
können sie zusätzlich sperren. Die App bietet dann einen Link zum Öffnen im
Browser und die manuelle Haltestellenauswahl. Die eigene Worker-Policy erlaubt
Geolocation für die eigene Origin; eine übergeordnete Browser-/Frame-Policy
kann die App nicht überschreiben.

Standortkoordinaten bleiben im Sitzungsspeicher des Browsers, werden jedoch zur
Fußwegberechnung durch den Rheinlive-Server an Transitous gesendet. Rheinlive
schreibt sie weder in dauerhaften Speicher noch in seine Antwort-Caches. Der
POST-Aufruf und seine Antwort verwenden keine Browser-Caches. Dies ist keine
Aussage über mögliche technische Logs des Hosters oder von Transitous. Nur
manuelle Gehzeit pro Halt, Puffer und vorhandene Anzeigepräferenzen bleiben im
lokalen Gerätespeicher.

[Apple Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html)
und [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
öffnen den Fußweg zu den Haltestellenkoordinaten; der jeweilige Dienst bestimmt
den Start selbst. Rheinlive überträgt seinen Standort nicht zusätzlich in
diesen Links. [DB Reiseplanung](https://www.bahn.de/buchung/fahrplan/suche) öffnet
die reguläre Suche, ohne eine ungesicherte Ziel-/Stations-ID vorzutäuschen.
Eine eigene Verbindungssuche wäre ein weiterer sinnvoll abgegrenzter Schritt;
Umstiege, Alternativen und laufende Navigation sind hier nicht implementiert.
