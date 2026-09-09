# Allianzen und General-Chat

## Verhalten und Rechte

- Die Navigation enthält **Allianzen** statt Dino-Datenbank. Bestehende Dino-Daten,
  API-Endpunkte und direkte Dino-URLs bleiben erhalten.
- Freigeschaltete Mitglieder können die Beziehungen ihres Tribes lesen.
  Tribe-Admins können anlegen, bearbeiten und löschen. Developer mit eigenem
  Tribe können dessen Beziehungen verwalten; ein fremder Tribe ist auch über
  manipulierte IDs oder Query-Parameter nicht erreichbar.
- Beziehungen enthalten Tribe-Name, Server, Map und einen beschrifteten Status:
  Allianz (blau), Freunde (grün), Feinde (rot). Änderungen werden protokolliert.
- General speichert Textnachrichten pro Tribe mit Autor und Zeitpunkt.
  Die sichtbare Chat-Seite fragt alle fünf Sekunden neue Nachrichten ab und
  pausiert im Hintergrund. Nach Verlassen der Seite endet die Aktualisierung.
- Initial werden die neuesten 50 Nachrichten geladen. Ältere Seiten lassen sich
  nachladen. Die API erlaubt höchstens 100 Nachrichten je Seite und verwendet
  stabile ID-Cursor. Home zeigt die drei zuletzt gespeicherten Nachrichten.
- Nachrichten dürfen höchstens 2.000 Zeichen enthalten. Pro Autor und Tribe sind
  zehn Nachrichten pro Minute erlaubt. Diese Begrenzung wird in der Datenbank
  geprüft, serialisiert gleichzeitige Sendungen und übersteht Serverneustarts.
- Der Chat verwendet ausschließlich Textdarstellung, aktive Sessions und CSRF.
  Eine fehlgeschlagene Sendung behält den Entwurf für einen erneuten Versuch.

## Daten und Betrieb

`tribe_relationships` und `tribe_messages` werden beim Öffnen bestehender SQLite-
oder PostgreSQL-Datenbanken mit `CREATE TABLE IF NOT EXISTS` ergänzt. Bestehende
Tabellen werden für diese Funktionen nicht gelöscht oder umgebaut.

`.node-version` legt Node 24.20.0 fest. `package-lock.json` fixiert die aufgelösten
Abhängigkeiten, einschließlich Nodemailer 10.0.1. Brevo bleibt der bevorzugte
Versandweg; der SMTP-Code bleibt erhalten.

Die Bilddarstellung verwendet vorhandene Dateien direkt unter `/assets/`.
Fehlgeschlagene Upload-Bilder fallen auf das mitgelieferte Motiv und danach auf
die passende Silhouette zurück. Home liest `map_name` und zeigt Tribe-Inhalte
auch für Developer mit tatsächlicher Tribe-Mitgliedschaft.

## Tests lokal ausführen

Mit Node 24.20.0 und einer lokalen Testumgebung ohne Produktionskonfiguration:

```sh
npm ci
npm test
npm run test:postgres
python -m pip install -r test/requirements.txt
python -m playwright install chromium
python test/ui_test.py
python test/community_ui.py
```

Die Browser-Suites starten jeweils einen eigenen Server mit temporärer
SQLite-Datenbank. `ATH_SHOTS` kann ein Ausgabeziel für Screenshots festlegen.
Der PostgreSQL-Test verwendet PGlite, also eine eingebettete PostgreSQL-Engine;
er ersetzt keinen vollständigen Netzwerktest gegen den Render-PostgreSQL-Server.

Verifiziert am 9. September 2026: 44 Backend-Testeinträge (einschließlich zweier
übergeordneter Tests), ein PostgreSQL-Schematest, 106 bestehende Browser-Prüfungen
und 23 zusätzliche Community-Browser-Prüfungen. Der Mailtest erzeugt lokal eine
Multipart-Mail und versendet sie nicht.

## Weiterhin offen

- Echte Voice-Audioübertragung und die dafür nötige Infrastrukturentscheidung.
- Kartenhintergründe mit nutzbaren Bildquellen und vollständige Katalogbilder.
- Persönliche Auswahl des Dashboard-Servers; derzeit wird der erste Server der
  alphabetischen Liste angezeigt.
- Physischer iPhone-/Tastaturtest und Anmeldung mit einem Produktionskonto.
- Vollständiger Security-Audit sowie echter Mailzustellungstest.
- Datenbanksicherung und dauerhafter Betrieb vor dem in der Übergabe genannten
  Ablaufdatum 4. Oktober 2026.
