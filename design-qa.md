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
