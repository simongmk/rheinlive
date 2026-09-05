# Erweiterbarkeit

Umgesetzt: Köln, Bonn und Düsseldorf mit Stadtbahn, Bussen, S-Bahn und
Regional- und Fernzügen (einschließlich Nachtzügen, wenn geliefert). Fähren werden angezeigt, wenn passende Daten vorhanden sind;
bisher wurden für Bonn nur Fahrplanpositionen nachgewiesen. Die tatsächlichen
Messungen und Anbieteroptionen stehen in [DATA-SOURCES.md](DATA-SOURCES.md).

## Eine weitere Stadt ergänzen

1. Gebiet, Zentrum und Zeitzone in `lib/cities.mjs` definieren. Bestehende
   Verkehrsmittel verwenden oder den gemeinsamen Modus-Katalog erweitern.
2. Aktuelle Antworten des öffentlichen Transitous-Endpunkts mit genau diesem
   Gebiet prüfen. Prognosen, Ausfälle, Formen und Betreiber mindestens
   stichprobenartig kontrollieren. Gleiche Liniennummern sind keine Fahrt-IDs.
3. Einen begrenzten Routenabzug speichern und mit
   `node scripts/prepare-network.mjs CITY raw-routes.json` aufbereiten. Netzdatei
   datieren und Quellenangaben beibehalten. Keine Fahrzeug-Fixtures ausliefern.
4. Die Region im Auswahlmenü erscheint aus der gemeinsamen Stadt-Konfiguration.
   API und Cache verwenden automatisch getrennte Schlüssel. Tests, Build und
   echte API-Prüfung vor Veröffentlichung ausführen.

Der Browser lädt nur das Netz und die Fahrtdaten der gewählten Region. Alte
Antworten einer zuvor gewählten Stadt werden verworfen. Gleichzeitige Nutzer
teilen serverseitige und Edge-Caches. Regionale Antworten werden seriell
geparst, damit die speicherbegrenzte Worker-Umgebung nicht mehrere große
Antworten gleichzeitig verarbeitet.

## Verkehrsdaten aus weiteren Quellen

Provider-spezifische Adapter müssen in dasselbe normalisierte Modell liefern.
Daten dürfen erst nach Prüfung von Lizenz, Abdeckung, Identitäten und
Zeitstempeln zusammengeführt werden. Prognosen, Fahrplan und gemessene
VehiclePositions benötigen getrennte Qualitätstypen. Bei fehlenden Daten darf
kein vermeintlich lebendiger Demo-Verkehr entstehen.

Der aktuelle Browser zeichnet Fahrzeuge gemeinsam in einer GPU-Ebene, statt
für jede Fahrt ein eigenes HTML-Element zu bewegen. Für deutlich größere
Gebiete sind zusätzlich begrenzte Gebietskacheln und zoomabhängige Zusammenfassung
sinnvoll. Nationale GTFS-Importe gehören in einen eigenen MOTIS-Datenservice;
die Web-App bleibt ein schlanker Client. Größere Last oder kommerzielle Nutzung
benötigt einen passenden Datenzugang, nicht nur weitere Stadt-Konfigurationen.
