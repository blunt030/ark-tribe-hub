# Dashboard: visueller Abgleich

**Quelle:** Nutzerbild `/workspace/scratch/d71278a6d28e/upload/B82E09F4-4E8A-4B2D-8112-8E644CED241C.jpeg` (1493 × 1055 px).  
**Umsetzung:** [Browseraufnahme](docs/dashboard-review.jpg) (1363 × 936 px, CSS-Viewport 1363 × 936, Pixeldichte 1). Für den Vergleich wurde die Browseraufnahme proportional auf die Breite der Vorlage skaliert und mit dieser in `/workspace/scratch/dashboard-comparison-final.jpg` nebeneinander betrachtet. Die vertikale Differenz von 30 px nach Skalierung erklärt, warum die Aktivitätskarte in der Browseraufnahme erst unterhalb des sichtbaren Bereichs beginnt.

**Zustand:** Desktopansicht für ein angemeldetes OaO-Mitglied. Die lokale Vorschau verwendete ausschließlich temporäre Beispieldaten für den visuellen Abgleich; im eigentlichen Dashboard kommen Bestellungen, Aufgaben, Server, Marker, Chat und Benachrichtigungen aus den Tribe-APIs. Die Kennzahlen der Vorlage dürfen deshalb abweichen.

## Vergleich und Befunde

- Typografie: große Tribe-Überschrift, gesperrte Unterzeile und kompaktes Dashboard mit dem vorhandenen Rajdhani-/Inter-System. Die echte Tribe-Bezeichnung kann breiter sein; Umbruch ist erlaubt.
- Layout: breite Bildbühne, vier Kennzahlen, dreiteilige Auftragsübersicht, Kartenbereich und rechte Spalte entsprechen der Vorlage. Die Seitenleiste bleibt bedienbar und scrollt bei geringer Höhe.
- Farben: dunkle blaugraue Flächen, Gold für die primäre Aktion, Grün/Rot für Status sind konsistent.
- Bilder: eigenständiges Rex-/Obeliskenbild, Lagerbild, Rex-Ei und passende bestehende Katalogbilder. Map und Marker stammen aus dem angemeldeten Tribe.
- Inhalte: Abweichende Mitglieder-/Voice-Zahlen sind echte Daten. Die Vorlage enthält Bestands- und Online-Zahlen, die derzeit nicht als vollständige, verlässliche Tribe-Metriken vorliegen; sie werden nicht vorgetäuscht.
- Feinschliff P3: Die Funktionsicons sind einfacher als die aufwendig illustrierten Icons der Vorlage. Sie beeinträchtigen die Bedienung nicht.

## Vergleichsverlauf

1. Erste Browseraufnahme: Die Rex-Ei-Karte zeigte ein Rex-Tierbild (P1), weil der bestehende Bild-Fallback auf die Kreatur verweist. Ein eigenes Ei-Motiv wurde erzeugt und in der Dashboard-Karte eingebunden.
2. Erste Browseraufnahme: Der Rex-Kopf war oben angeschnitten (P2). Bildposition und Zoom des Heldenbildes wurden angepasst.
3. Neue Browseraufnahme `docs/dashboard-review.jpg`: Ei und Rex vollständig sichtbar; keine offenen P0/P1/P2-Befunde.

**Interaktionen geprüft:** „Neue Bestellung“ öffnet `#/orders/new`; eine Auftragskarte öffnet `#/orders/1`. Kein horizontaler Überlauf bei 1363 px. Alle drei relevanten Bilder luden mit positiver natürlicher Breite. Keine App-Fehler in der Browser-Konsole; die Meldungen der Browser-Erweiterung stammen außerhalb der App.

**final result: passed**
