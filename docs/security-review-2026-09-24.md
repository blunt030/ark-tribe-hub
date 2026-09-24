# Sicherheits- und Funktionsprüfung – 24.09.2026

Status: lokale Änderungen, nicht veröffentlicht. Kein vollständiger Penetrationstest und keine Garantie gegen alle Angriffe.

## Behoben
- E-Mail-Login und bestehende Sitzungen respektieren deaktivierte Tribes. Gesperrte/abgelehnte Konten verlieren Sitzungen.
- Wechselnde Tribe-Kürzel umgehen nicht mehr das E-Mail-Anmeldelimit.
- Scrypt-Hashes mit expliziter Version und OWASP-Profil N=16384, r=8, p=5; bisherige Hashes bleiben gültig und werden beim erfolgreichen Login aktualisiert. Passwörter bleiben gehasht, niemals reversibel verschlüsselt.
- Passwortprüfung weist ungültige Datentypen, überlange Eingaben und beschädigte Hashes zurück.
- E-Mail-Änderung/Entfernung verlangt aktuelles Passwort; alte Bestätigung wird zurückgesetzt und alte Links entwertet.
- Private API-Antworten und Uploads: no-store. CSP um base-uri/object-src/frame-ancestors/form-action ergänzt.
- Ungültiges JSON-Objekt, Cookie-Encoding und URL-Encoding werden abgefangen.
- Produktion startet ohne ausreichend langes dauerhaftes SESSION_SECRET nicht mehr. Vor Deployment muss der bestehende Schlüssel geprüft werden; niemals einfach ersetzen, weil gespeicherte PINs davon abhängen.
- Demo-Konten werden auch bei Produktion mit SQLite nicht angelegt.
- Proxy-IP-Auswertung lehnt ungültige Werte/fehlende konfigurierte Hops ab. Login verwendet dieselbe IP-Auswertung.
- Allgemeines Limit gilt pro angemeldetem Nutzer; zusätzlicher IP-Eingangsschutz vor Session-Abfragen bleibt erhalten. Damit blockieren sich mehrere Voice-Nutzer im selben WLAN nicht schon gegenseitig.

Quelle Passwortprofil: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt

## Voice
- Mikrofon und Peer-Verbindungen stoppen vor Netzwerkabmeldung.
- Raumwechsel verwirft verspätete Poll-Ergebnisse.
- Mehrfachklicks während des Beitritts abgefangen; verspätete Mikrofonfreigabe nach Seitenwechsel wird geschlossen.
- Beitrittsfehler räumen lokale Sitzung auf; verlorene Mitgliedschaft beendet lokale Audioverbindung.
- Kanalnamen validiert, TURN-Konfiguration verlangt Tribe-Kontext.

## Bilder
58 zusätzliche Struktur-Einträge nutzen exakt zugeordnete Ausschnitte des bereitgestellten Strukturhandbuchs. Quelle bleibt unverändert; Ausschnitte entstehen in der Darstellung. Vorhandene Einzelbilder und eigene Uploads haben Vorrang.
Lokale Abdeckung: Strukturen 69/127, Kreaturen 26/217, Eier 19/60, Embryos 7/47, Sättel 10/71, Karten 8/8. Produktionsuploads sind hier nicht mitgezählt. Nicht alle Bilder sind fertig.

## Verifikation
- npm test: 74 Tests erfolgreich, einschließlich sieben neuer Passwort-/HTTP-Sicherheitstests.
- npm run test:postgres: 1 Test erfolgreich (PGlite-Schema/Constraints).
- npm audit --omit=dev: 0 bekannte Schwachstellen gemeldet.
- Bildquelle visuell geprüft. Browserprüfung der neuen Ausschnitte war wegen nicht erreichbarer lokaler Vorschau nicht möglich.

## Vor Veröffentlichung / verbleibend
- Echter Voice-Test PC + Handy, getrennte Netze, Mikrofonberechtigung, Stumm/Entstumm, Raumwechsel, Hintergrund und Netzwechsel. Keine Audio-Funktionsgarantie ohne diesen Test.
- Produktives TURN, TLS, Proxy-Hops, dauerhaftes Secret, DB-/Render-Zugriffe, Backups/Wiederherstellung und bestehende Standardpasswort-Konten prüfen. Externe Einstellungen wurden nicht verändert.
- Weitere Katalogbilder ergänzen und neue Ausschnitte im Browser prüfen.
- Weitergehende Prüfung aller Rollen-/Mandantenpfade, paralleler Anmeldungen, verteilter Angriffe und Lasttests. In-memory Limits sind für eine Serverinstanz; mehrere Instanzen brauchen gemeinsamen Rate-Limit-Store.
- E-Mail-Verifikationstokens jetzt gehasht; alte Tokens werden beim Start idempotent migriert. Anmeldung unbekannter Konten führt ebenfalls eine Scrypt-Prüfung aus.
- Veröffentlichung gemeinsam am PC, wie beauftragt. Kein Push/Deploy erfolgt.

## Fortsetzung: Bestätigungslinks und erneute Passwortprüfung
- Neue Bestätigungslinks werden nur als SHA-256-Hash gespeichert; die versendete URL enthält weiterhin den zufälligen Originaltoken.
- Bestehende Tokens werden beim DB-Start umgestellt, ohne schon verschickte Links zu ändern. Ein aus der DB kopierter Hash ist kein gültiger Bestätigungslink.
- Atomare Einmalverwendung verhindert doppelte Bestätigung und Bestätigung einer neuen Adresse durch einen alten Link bei gleichzeitigem E-Mail-Wechsel. Ungültige Ablaufdaten werden abgelehnt.
- Passwort- und E-Mail-Änderungen teilen ein Limit von zehn Passwortprüfungen pro Konto innerhalb von 15 Minuten (pro Serverinstanz).
- Unbekannte Konten führen dieselbe Scrypt-Ableitung wie aktuelle Hashes aus; Unterschiede bei Legacy-Hashes und DB-Abfragen sind dadurch nicht vollständig verborgen.
- Aktuelle Prüfung: 77 Haupttests + 2 PostgreSQL-Engine-Tests erfolgreich. Darunter Migration, Einmalverwendung, Ablauf und Wechsel zwischen den Profil-Endpunkten.
- Weiterhin lokal, kein Push oder Deploy.

## Fortsetzung: Katalogbilder
- Zusätzliche Motive: Otter, Otter-Embryo (zugeordnetes Tiermotiv), Beelzebufo, Holz-Lukenrahmen, Dinosaurier-Torrahmen/-Tor und Behemoth-Torrahmen/-Tor.
- Quellen: unveränderte bereitgestellte Poster, Darstellung über begrenzte CSS-Ausschnitte. Vorhandene Einzelbilder und Nutzeruploads haben Vorrang.
- Fehlgeschlagene Posterdateien entfernen den Bildplatz; Beschriftung und Bedienbarkeit bleiben erhalten.
- Stand: Kreaturen 28/217, Eier 19/60, Embryos 8/47, Sättel 10/71, Strukturen 74/127, Karten 8/8. Produktionsuploads nicht berücksichtigt.
- 77 Haupttests erneut erfolgreich. Keine neuen Aussagen zur vollständigen Bildabdeckung oder zum echten Audio-Betrieb.
- Echter VC-Test laut Nutzer morgen am PC. Bitte mit dem dann bereitgestellten neuen Stand testen; die derzeitige Live-Version enthält diese lokalen Änderungen noch nicht.
