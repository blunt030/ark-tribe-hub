# Command Center – visueller Abgleich, 25.09.2026

**Visuelle Quelle:** `test/visual/visual-reference.jpeg`, bereitgestellte ARK-Command-Center-Vorlage, 1491 × 1055 px. Die generierten Profil-/Bestellkonzepte erweitern diesen Stil.

**Browserbelege:** `docs/design-comparison-final.jpg`, `docs/profile-desktop-final.jpg`, `docs/orders-desktop-final.jpg`, `docs/mobile-final.jpg`. Ausschließlich lokale, isolierte Beispieldaten; keine Testkonten oder Musterbestellungen in Produktion.

## Vergleich und Verlauf

1. Die frühere Mobilansicht hatte ein angeschnittenes Rex-Motiv, ein anderes Logo, Glyphen statt konsistenter Icons und eine flache gelbe Hauptaktion (P1). Neues Rex-Panorama, dreieckiges ARK-Logo, lokal gespeicherte Phosphor-Icons und Bronze-Textur sind eingesetzt.
2. Erster Vergleich: schmale Tribe-Überschrift, zu dunkle Sidebar, auf dem Handy links angeschnittener Rex und unlesbarer Bestellstatus auf dem Bild (P2). Überschrift verbreitert, Sidebar-Mischmodus korrigiert, mobiler Fokus auf 68 % gesetzt und Status mit dunklem Hintergrund versehen. Nachher-Beleg: finaler Vergleich und mobile Aufnahme.
3. Profil und Bestellungen hatten keine gemeinsame Gestaltung (P1). Einheitliche Navigation, Banner, Schrift, Formulare, Metallrahmen, bronzefarbene Aktionen und bebilderte Bestellkarten sind in beiden Ansichten vorhanden. Profilaktionen verwenden weiterhin die bisherigen API- und Passwortprüfungen.

## Geprüfte Oberflächen

- **Typografie:** lokal gespeicherte Barlow Semi Condensed (400/600/700), Rajdhani als große Tribe-Überschrift. Kleine Texte lesbar, Überschriften und Formlabels hierarchisch getrennt. Kein horizontales Abschneiden der mobilen Kernaktionen.
- **Layout:** Desktop-Sidebar 222 px, Hero 255 px, vier Kennzahlen, Aufträge/Map links und Status/Chat/Aktivität rechts. Mobile 390 × 844 CSS px, Kennzahlen zweispaltig, Bestellkarten horizontal auf Startseite und einspaltig auf Bestellseite; Profil einspaltig. Navigation und Formularaktionen bleiben erreichbar.
- **Farben:** blau-schwarze Flächen, dünne Metallrahmen, Bronze/Gold für Aktionen, semantisches Grün/Rot für Zustände. Der Status auf Bildkarten hat einen kontrastierenden Hintergrund.
- **Bilder:** neue Hero-/Logo-/Tek-Illustrationen und Bronze-Textur als WebP; reale Artikelzuordnung und Vorrang bestehender Uploads. Karten und Marker bleiben an den ausgewählten Server gebunden. Grafiken geladen und sichtbar geprüft.
- **Inhalte:** echte API-Zahlen statt fester Werte aus dem Mockup. Fehlende Online-/Lagerdaten, Avatare und Aktivitätsmeldungen werden nicht erfunden. Deutsche Beschriftungen und vorhandene Übersetzungen bleiben erhalten.

## Belege und Normalisierung

Der Gesamtvergleich zeigt Quelle und Anwendung gemeinsam bei identischen 1491 × 1055 CSS-px im selben Browserbild, beide auf 45 % skaliert. Browseraufnahme 1363 × 936 px bei Dichte 1. Fokusprüfung zusätzlich mit unskalierter Desktopansicht 1363 × 936 für Hero, Navigation und Bestellbilder sowie Formularansicht. Mobile Ansichten werden unskaliert in 390 × 844 Frames nebeneinander aufgenommen; keine nachgezeichnete Geräteoberfläche.

## Funktionsprüfung

- Mobile Profilnavigation und Mehr-Menü öffnen die richtigen Seiten.
- Bestellsuche „Argentavis“ zeigt ausschließlich die passende Karte.
- Historie ohne Bestellungen zeigt den Leerzustand.
- Neue Bestellung: Rex-Ei auswählen, Menge auf 2 erhöhen, lokal aufgeben; Detailroute zeigt Rex Ei × 2 und Erfolgsmeldung.
- Profileinstellungen „Alle deaktivieren“ schalten beide Testoptionen aus.
- Desktopprofil ohne horizontalen Überlauf, alle sichtbaren Bilder geladen.
- Keine App-Fehler in der Konsole festgestellt; separate Browser-Erweiterung protokolliert eigene Metadatenfehler.
- `npm test`: 77/77 erfolgreich. Zwei bestehende Strukturprüfungen wurden auf die bewusst ersetzten Profilsektionen aktualisiert.

## Verbleibende Unterschiede / Testgrenzen

- P3: Illustrationen sind eigenständige Motive im Referenzstil, keine identischen Pixelkopien. Avatare ohne Nutzerupload bleiben Initialen; das Logo im unteren Sidebarbereich ist wiederverwendet.
- Produktionsdaten ändern Anzahl, Höhe und Inhalt der Karten. Es werden keine fiktiven Lagerquoten oder Online-Zahlen gezeigt. Die konkrete Serverkarte unterscheidet sich daher vom dekorativen Inselpanorama der Vorlage.
- Bildabdeckung des Gesamtkatalogs ist weiterhin unvollständig; echtes Audio zwischen zwei Geräten steht aus. Dieser Durchlauf ist visuelle und funktionale Frontendprüfung, kein vollständiger Penetrationstest.

## Nachprüfung 26.09.2026 – Mitgliederseiten

- Desktop erneut bei identischen 1491 × 1055 Viewports verglichen: `docs/desktop-followup.jpg`. Mobile Ansichten bei 390 px: `docs/mobile-followup.jpg`, `docs/menu-followup.jpg`, `docs/member-pages-followup.jpg`.
- P1 behoben: öffentliche Bilder/Icons verbrauchten API-Limit. Regression prüft 130 Asset-Abrufe, danach API-Sperre mit Retry-After, inklusive kodiertem API-Pfad. Ingress-Schutz bleibt vorgeschaltet. Fehlerantworten gelangen nicht mehr in den Asset-Cache.
- P2 behoben: doppelte Navigation durch go()/hashchange; abgeschnittene Kartenbilder; mobile Kartenbreite; ungestaltetes Mehr-Menü. Menüöffnung und Navigation zu Aufgaben im Browser geprüft.
- Durchgängige gemeinsame Gestaltung für Aufgaben, Server, Chat, Voice, Mitglieder und weitere Seiten mit Überschrift; Bestell- und Profilgestaltung bleibt integriert.
- 78 Tests bestanden, keine fehlgeschlagen. Sichtbare UI im Browser geprüft; keine App-Konsolenfehler, nur Fehler einer Browsererweiterung. Vorschau verwendet isolierte Beispieldaten, keine Produktionseinträge.
- Grenzen bleiben: keine pixelidentische Kopie, fehlende einzelne Katalogbilder, kein echter Zwei-Geräte-Audiotest. Fehlende Echtzeit-/Lagerwerte werden nicht erfunden.

**final result: passed**

## Freigegebene Entwürfe – nächste Umsetzungsetappe

26.09.2026: Eigenes Werkstattpanorama für Unterseiten ergänzt. Profil in persönliche Daten links und aufklappbare Passwort-/E-Mail-Einstellungen rechts gegliedert; Desktop und 390px-Mobilansicht im Browser geprüft. Öffnen der Passwortsektion zeigt unverändert alle drei Eingaben. Nachweis: `docs/profile-approved.jpg`. Bestellungen mobil zweispaltig, redundante Einzelartikelzeile durch Mengenangabe ersetzt. Aufgaben nach Status gruppiert; Tastaturöffnung ergänzt. Drohnenillustration als Konzeptmotiv ergänzt. Desktop-Hero bewahrt das Seitenverhältnis seiner Bilddatei. 78 Tests bestanden. Diese Etappe ersetzt nicht die noch offene vollständige Katalogbebilderung und den echten Voice-Test.

## Umsetzung freigegebene Vorlagen 01–04 – 27.09.2026

**Quellen:** 01-Startseite-Zielvorlage, 02-Bestellungen-Desktop-und-Mobil, 03-Maps-und-Aufgaben, 04-Profil-Chat-Voice-Mitglieder.
**Ausgangsstand:** main `ca3e6cb` (laut Render-API Deploy `dep-das4c760…` live).

### Behobene Fehler
1. Seitenleiste: zweites Emblem entfernt; Camp-Motiv ist reiner Hintergrund, Menüpunkte bleiben klickbar (Profil, Mitteilungen, Allianzen, Tier-Stats im Browser geklickt).
2. Genau ein aktiver Menüpunkt (längster passender Pfad); mobil wird bei „Neue Bestellung“ „Bestellungen“ markiert.
3. „Meine Aufgaben“ zählt überall dieselbe Menge; Tribe-Status zeigt „Offene Aufgaben“ (tribeweit) getrennt.
4. Bestellfortschritt in Stück (ausgegebene Menge / Gesamtmenge) statt Positionen.
5. Datums-/Zeitangaben lokalisiert (`fmtDate`, `fmtStamp`), Chat ohne Sekunden.

### Gestaltung
- Ein gemeinsames Theme (`command-center.css` neu geschrieben, alte Dashboard-/Karten-/Laufband-Regeln aus `app.css` entfernt).
- Startseite: Hero 5:1 (Desktop ≈ 234 px bei 1440 px Breite), mobil 200 px mit Rex rechts; vier Kennzahlen; drei vollflächige Bestellkarten; Karte mit Markern, Legende, Kompass; Tribe-Status, Chat, letzte Aktivität (News dort statt Laufband).
- Jede Unterseite hat ein eigenes Bildbanner (`public/assets/banners/`, Zuschnitte vorhandener Motive; Profil- und Mitteilungsbanner aus den freigegebenen Tafeln 04/02 zugeschnitten).
- Bestellungen: Tabs mit Zählern, Suche, Filter, Karten mit Status oben links, Schnellleiste mit Kategorie-Kacheln; Neue Bestellung mit Bildkacheln, Unterfiltern, gleich hohen Artikelkacheln, −/+-Menge, Auswahlpanel, mobil Sticky-Leiste; Detail mit Bild, Status, Fortschritt, Zuständigkeit, Positionen, Kommentaren, ⋯-Menü.
- Eier/Embryos zeigen Ei bzw. Embryo mit Tier-Abzeichen statt des Tiers; fehlende Motive als gestaltete Platzhalter.
- Aufgaben: Statusgruppen, Themenbild, Initialen-Avatar, Datum mit Icon, Status-Pill, ⋯-Menü; Formular und Detail im selben Design.
- Server & Maps: Server-Auswahl im Banner, Karte im exakten Seitenverhältnis (keine Verzerrung, Marker auf ±0,6 % gemessen), Filter, Legende, Kompass, Markerliste; „Server löschen“ im Verwaltungsmenü.
- Chat kompakte Zeilen, einzeilige Eingabe mit Senden-Knopf; Voice mit Teilnehmer-Kreisen, Beitreten/Verlassen, Mikro, lokalem Ton-aus, Einstellungen; Mitglieder als Liste mit Rollen-Badges und ⋯-Menü; Profil mit Banner, Initialen-Avatar, Schaltern, einem Sicherheitsbereich.
- Tier-Stats als Bildkarten, Detail mit Stat-Raster; Allianzen als Beziehungskarten.

### Prüfung
- Lokaler, isolierter Server mit temporärer SQLite-Datenbank und Beispieldaten (nur Scratchpad, keine Produktion).
- Desktop 1440 × 900 und Mobil 390 × 844 im Browser aufgenommen; alle Member-Seiten, Detail- und Formularseiten; FR/ES stichprobenartig.
- 36 automatisierte Bedienschritte (Navigation, Bestellung aufgeben, Menge, Kommentar, Suche/Filter, Chat, Aufgabe übernehmen, Kartenfilter/-klick, Profil-Schalter, Rollen-Menü, Voice-Steuerung, Mehr-Menü); 35 bestanden, 1 Rundungsabweichung (69,8 statt 70,0 % beim Testklick). Keine Konsolenfehler. Kein horizontaler Überlauf auf 14 mobilen Seiten.
- `npm test`: 79 bestanden, 0 fehlgeschlagen (Strukturtests für Karte, Profil und Bestellbereiche auf die neue Gestaltung umgestellt, ein Regressionstest für die fünf Fehler ergänzt).

### Grenzen
- Keine erfundenen Online-Status, Lagerbestände oder Bestellfristen – die API liefert sie nicht („Noch X Tage“ entfällt daher).
- Banner-Zuschnitte aus den Tafeln haben begrenzte Auflösung (Profil 938 px, Mitteilungen 628 px breit).
- Katalogbilder weiterhin nicht vollständig (fehlende Motive als Platzhalter); echter Mehrgeräte-Voicetest mit Mikrofon steht aus.
