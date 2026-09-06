# Standort, Abfahrtsmonitor und Losgehzeit

Stand: 6. September 2026. Der Monitor ist in Köln, Bonn und Düsseldorf verfügbar.
Die [KVB-Monitor-Referenz](https://kvb-monitor.de/) des Nutzers war die inhaltliche
Anregung; übernommen werden weder deren Layout noch deren Datenabruf.

## Vom Öffnen zum Losgehen

Ein gemeinsames Suchfeld bleibt in Karten- und Abfahrtsansicht erreichbar.
Städte werden auch vor dem Laden der Kartendaten gefunden; Linien und
Haltestellen stammen aus der gerade gewählten Region. Ein Stadttreffer wechselt
die Region, ein Linientreffer wählt diese Linie auf der Karte, ein Haltestellentreffer
öffnet deren Abfahrten. „Koeln“ und „Duesseldorf“ sind ebenfalls suchbar.
Die Suche lädt keine weiteren Regionen beim Tippen. Weitere Verkehrsfilter
sowie Kartenstil, Netz und 3D sind eingeklappt; Dateninfo und Prognosestatus
teilen sich einen kleinen Button unten, die Uhr steht oben rechts.

Die App bittet beim Öffnen über die Browser-Standortfunktion um Freigabe. Nach
Erlaubnis wählt sie die unterstützte Region und zeigt die Umgebung samt blauem
Standortpunkt. „Meine Umgebung“ und das Standortsymbol rechts fragen den Standort
erneut ab und wählen die nahe Station neu, auch nach einer früheren manuellen
Haltestellenauswahl. Bei verweigerter Freigabe kann ein Startpunkt auf der Karte
gesetzt werden; die Haltestellensuche und manuelle Gehzeit bleiben verfügbar.
Ein Kartenpunkt wird ausdrücklich als selbst gewählter Startpunkt behandelt,
ohne vorgetäuschte GPS-Genauigkeit. Außerhalb der drei Regionen wird fehlende
Abdeckung ausdrücklich gemeldet. Manuelle Stadt- oder Haltestellenauswahl hat
Vorrang vor einem noch ausstehenden Standortergebnis.

Aus den bereits geladenen Stationen werden höchstens sechs innerhalb von drei
Kilometern gesucht. Eine gemeinsame Fußwegabfrage liefert berechnete Gehzeiten.
Die erste automatisch gewählte Station hat die kürzeste gelieferte Gehzeit in
dieser kleinen Auswahl. Die anderen Stationen bleiben auswählbar. Nicht
berechenbare Wege werden nicht durch Luftlinie / Gehgeschwindigkeit ersetzt.
Luftlinie dient nur zur Vorauswahl und ist bei den Entfernungen so beschriftet.

Direkt über den Timern lassen sich mehrere relevante Linien auswählen. Die
Auswahl wirkt auf Timer, Richtungsauswahl und Abfahrtsliste und wird pro Stadt
und Haltestelle nur auf diesem Gerät gemerkt. „Alle“ setzt sie zurück. Die
Linien stammen aus dem erfassten Stationsnetz und den gemeldeten Abfahrten;
gleichnamige Bus- und Bahnlinien bleiben getrennt. Eine ausgewählte Linie ohne
kommende Meldungen erzeugt eine leere Anzeige, keinen Wechsel auf andere Linien.

Der Monitor zeigt die nächsten zwei Fahrten verschiedener Linien/Richtungen
mit Prognose und bekannter Gehzeit. Auch knappe Fahrten bleiben dabei sichtbar,
statt durch eine spätere erreichbare Fahrt derselben Linie/Richtung ersetzt zu
werden. Weitere gemeldete Abfahrten stehen in der aufklappbaren Liste. Bei
fehlenden Prognosen oder Gehzeiten bleiben die bekannten Einschränkungen sichtbar.
Der eigene Haltestellen-Endpunkt ist unabhängig vom kurzen Fahrzeugfenster und
von den Verkehrsmittelfiltern der Karte.

    Losgehzeit = prognostizierte Abfahrt − Gehzeit − Puffer

Gehzeit wird auf ganze Minuten aufgerundet. Der Puffer beginnt bei zwei Minuten
und ist wie die Gehzeit einstellbar. Abfahrtsprognosen berücksichtigen gemeldete
Verspätungen. Ausfälle, gesperrter Einstieg, fehlende Gehzeit, reine Sollzeiten
und veraltete Antworten erzeugen keine positive Losgeh-Empfehlung. Ist der
Puffer unterschritten, wechselt der Timer zu „Bis zur Abfahrt · knapp“ und zeigt
die verbleibenden Sekunden bis zur gemeldeten Abfahrt. Das gilt auch, wenn diese
Zeit kürzer als die eingestellte Gehzeit ist. Die App verändert dafür weder das
Gehtempo noch verspricht sie, dass die Fahrt erreichbar bleibt. Erst nach der
gemeldeten Abfahrt wird die Fahrt entfernt. Sekunden sind eine Anzeige der
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
braucht HTTPS bzw. localhost sowie die Freigaben von Browser und Gerät.
[Eingebettete Ansichten](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/geolocation)
können sie zusätzlich sperren. Eine erkennbar blockierte Policy, verweigerte
Freigabe, fehlende Unterstützung oder Zeitüberschreitung bleibt als konkrete
Meldung mit erneuter Anfrage und Kartenpunkt-Alternative sichtbar. „Separat
öffnen“ öffnet die eigene URL in einem neuen Fenster/Tab; welche Browser-App
dafür verwendet wird, bestimmt die Umgebung. Die eigene Worker-Policy erlaubt
Geolocation für die eigene Origin. Die App kann weder eine übergeordnete
Frame-Policy noch fehlende Betriebssystemfreigaben überschreiben.

Die einmalige Anfrage fordert hohe Genauigkeit und keinen gespeicherten Fix
an (`enableHighAccuracy: true`, `maximumAge: 0`, nativer Timeout 12 Sekunden).
Ein zusätzlicher 18-Sekunden-Abbruch beendet auch hängen gebliebene Dialoge
oder ausbleibende Callbacks im App-Zustand; einen fremden nativen Dialog kann
die Webseite nicht selbst schließen. Ungültige oder mehr als 30 Sekunden alte
Ergebnisse werden verworfen. Abgebrochene oder ersetzte Anfragen dürfen später
weder Karte noch Station überschreiben. Eine neue Anfrage verwirft alte
automatische Gehzeiten und laufende Fußwegantworten.

Standortkoordinaten beziehungsweise ein selbst gewählter Kartenpunkt bleiben im
Arbeitsspeicher der geöffneten Seite, werden jedoch zur Fußwegberechnung durch
den Rheinlive-Server an Transitous gesendet. Rheinlive
schreibt sie weder in dauerhaften Speicher noch in seine Antwort-Caches. Der
POST-Aufruf und seine Antwort verwenden keine Browser-Caches. Dies ist keine
Aussage über mögliche technische Logs des Hosters oder von Transitous. Nur
manuelle Gehzeit und Linienauswahl pro Halt, Puffer und Anzeigepräferenzen bleiben im
lokalen Gerätespeicher.

[Apple Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html)
und [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
öffnen den Fußweg zu den Haltestellenkoordinaten; der jeweilige Dienst bestimmt
den Start selbst. Rheinlive überträgt seinen Standort nicht zusätzlich in
diesen Links. [DB Reiseplanung](https://www.bahn.de/buchung/fahrplan/suche) öffnet
die reguläre Suche, ohne eine ungesicherte Ziel-/Stations-ID vorzutäuschen.
Eine eigene Verbindungssuche wäre ein weiterer sinnvoll abgegrenzter Schritt;
Umstiege, Alternativen und laufende Navigation sind hier nicht implementiert.
