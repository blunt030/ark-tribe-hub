# ARK Tribe Hub – V1

Multi-Tribe-Organisationsplattform für ARK: Survival Ascended.
Kein UI-Prototyp: echte Datenbank, echte Authentifizierung, echte serverseitige
Berechtigungen – **und** eine fertige, getestete Weboberfläche im Look des
Moodboards, die direkt gegen dieses Backend läuft.

**Plattform-Developer:** Blunt · **Erster Tribe:** OaO

---

## 1. Schnellstart

Voraussetzung: **Node.js 22 oder neuer** (nutzt das eingebaute `node:sqlite`).

```bash
cd ark-tribe-hub
cp .env.example .env      # optional – Standardwerte funktionieren sofort
npm run seed              # legt DB an + Tribe OaO + kompletten ARK-Katalog
npm start                 # Server auf http://localhost:3000
npm test                  # 34 End-to-End- und Security-Tests
```

Für den lokalen Betrieb sind **keine npm-Pakete zu installieren** – das
Backend läuft auf Node-Bordmitteln (`node:sqlite`, `node:crypto`, `node:http`).
`package.json` listet `pg` als einzige Abhängigkeit; die wird nur für den
Postgres-Betrieb beim Hosting geladen (Abschnitt 10) und lokal nie angefasst.

### Demo-Zugänge (nur Entwicklung/Test)

| Benutzer | Tribe | Rollen | Passwort |
|---|---|---|---|
| `Blunt` | — (plattformweit) | developer | *(nur lokal, siehe unten)* |
| `OaO Admin` | OaO | member + admin | *(nur lokal, siehe unten)* |
| `OaO Breeder` | OaO | member + breeder_crafter | *(nur lokal, siehe unten)* |
| `Blunt OaO` | OaO | member | *(nur lokal, siehe unten)* |
| `BetaTribe Admin` | BetaTribe (Test-Tribe) | member + admin | *(nur lokal, siehe unten)* |
| `BetaTribe Member` | BetaTribe (Test-Tribe) | member | *(nur lokal, siehe unten)* |

„BetaTribe" ist ein zweiter, rein synthetischer Test-Tribe – ausschließlich dazu da,
um die Mandantentrennung nachzuprüfen (mit `BetaTribe Admin` einloggen und
versuchen, OaO-Bestellungen zu sehen: muss überall 404 geben).

> **Vor dem echten Einsatz:** Demo-Passwörter ändern oder die Accounts über
> `PATCH /api/admin/members/:id/disable` deaktivieren.

---

## 2. Was bereits vollständig funktioniert

| Bereich | Status |
|---|---|
| Registrierung, Login, Logout, persistente Session (30 Tage) | ✅ |
| Passwort-Hashing (scrypt + Salt), niemals Klartext | ✅ |
| Freischaltung durch Admin (`pending_approval` → `active`) | ✅ |
| Rollen: developer / admin / breeder_crafter / member (mehrere gleichzeitig) | ✅ |
| Mandantentrennung Tribe A ↔ Tribe B (serverseitig erzwungen) | ✅ |
| Bestellungen anlegen, Positionen, Priorität, Notiz (max. 300 Zeichen) | ✅ |
| Übernehmen / Freigeben / Neu zuweisen (race-condition-sicher) | ✅ |
| Item-Status: offen / nicht verfügbar / vorbereitet / ausgegeben | ✅ |
| Automatischer Gesamtstatus – abgeschlossen erst wenn **alles** ausgegeben | ✅ |
| Stornierung inkl. Benachrichtigungen an Zuständige und Admins | ✅ |
| Kommentare pro Bestellung mit Zugriffsschutz | ✅ |
| 13 Benachrichtigungstypen, **einzeln** pro Nutzer an/aus | ✅ |
| Bestellhistorie mit rollenabhängigem Umfang | ✅ |
| ARK-Katalog: 217 Kreaturen → 386 Items (Kreaturen, Eier, Embryos, Sättel) | ✅ |
| Mehrsprachigkeit DE / EN / FR / ES (i18n in der DB, nicht im Code) | ✅ |
| Bild-Uploads (Avatar, Item) mit Magic-Byte-Prüfung | ✅ |
| Audit-Log für kritische Aktionen | ✅ |
| CSRF-Schutz, Rate-Limiting, Brute-Force-Sperre, Security-Header | ✅ |
| Weboberfläche im Look des Moodboards, responsive, 4 Sprachen | ✅ |
| PWA (Manifest + Service Worker, installierbar) | ✅ |
| Datenbank-Backend wechselt automatisch: SQLite lokal, Postgres gehostet | ✅ |

**Noch offen (bewusst V2+):** Dino-Datenbank, Server- & Map-Management,
Map-Marker, Koordinatenliste, Tribe-Tasks, Tribe-News, Voice-Chat. Das Datenmodell und
die Modulstruktur sind dafür bereits vorbereitet.

---

## 3. Das Frontend

Eine vollständige, getestete Weboberfläche liegt unter `public/` und wird vom
Server direkt mitausgeliefert – `npm start` reicht.

- **Umsetzung des Moodboards:** dunkle Oberfläche, Rajdhani/Inter, die
  Statusfarben aus deiner Palette (Grün/Gelb/Blau/Rot/Lila), Card-basierte
  Bestellungen mit farbiger Prioritätskante.
- **Rollenabhängig:** Member, Breeder/Crafter, Admin und Developer sehen
  unterschiedliche Dashboards und Navigationspunkte. Wer mehrere Rollen hat
  (z. B. Admin + Breeder/Crafter), sieht alle passenden Bereiche gleichzeitig.
- **Responsive:** Sidebar-Navigation auf dem Desktop, Bottom-Navigation mit
  fünf festen Einträgen auf dem Handy (Übersicht, Bestellungen, Neu,
  Mitteilungen, Profil) – Admin- und Plattformbereiche sind von dort über das
  Profil erreichbar, damit die untere Leiste nicht je nach Rolle wackelt.
- **PWA-Grundlage:** Manifest + Service Worker (Network-first für die
  App-Hülle, `/api` und `/uploads` werden nie gecacht). Auf dem Handy über
  „Zum Startbildschirm hinzufügen" installierbar.
- **Vier Sprachen vollständig übersetzt** (nicht nur Gerüst): jeder sichtbare
  Text läuft über `public/js/i18n.js`, die Sprache erkennt sich beim ersten
  Besuch automatisch aus dem Browser.
- **Kein eigenes Framework, kein Build-Schritt:** natives ES-Module-JavaScript,
  läuft direkt im Browser. Wer später auf React/Vue wechseln möchte, kann das
  tun – die API dahinter ändert sich dadurch nicht.

### Frontend-Struktur

```
public/
├── index.html
├── manifest.webmanifest, sw.js       PWA
├── css/app.css                       Designsystem (Farben, Typografie, Komponenten)
├── assets/                           Logo, Icons (aus deinem Moodboard erzeugt)
└── js/
    ├── app.js                        Router, Navigation, Sitzungsverwaltung
    ├── api.js                        API-Client (hängt CSRF-Token automatisch an)
    ├── i18n.js                       DE/EN/FR/ES – jeder Text an einer Stelle
    ├── ui.js                         DOM-Helfer, Toasts, Bestellkarte, Modal
    └── views/                        auth, dashboard, orders, misc (Profil,
                                       Mitteilungen, Admin, Developer)
```

**Wichtig:** Das Ausblenden eines Navigationspunkts für eine Rolle ist reine
Bequemlichkeit. Die eigentliche Absicherung passiert – wie im ganzen Projekt –
ausschließlich serverseitig; wer eine URL von Hand aufruft, bekommt vom
Backend dieselbe 403/404 wie über die API.

### Frontend-Tests: echter Browser, nicht nur Behauptung

```bash
pip install playwright && playwright install chromium   # einmalig, nur für diesen Test
python3 test/ui_test.py
```

36 Tests in einem echten Chromium: Login, Bestellung mit Live-Suche im
386-Item-Katalog anlegen, Übernehmen, Item-Status durchklicken, automatischer
Abschluss, Kommentare, Rollenwechsel (Member → Breeder → Admin → Developer),
Sprachumschaltung, Mobilansicht, Konsole auf JavaScript-Fehler geprüft. Der
Test startet Server und Browser selbst und räumt danach auf.

Dieser Testlauf hat unterwegs vier echte Fehler gefunden, die sonst erst im
echten Betrieb aufgefallen wären:

| Gefunden | Fehler | Behoben |
|---|---|---|
| Nach „Übernehmen" | Statusknöpfe blieben unsichtbar | Berechtigungen werden bei jedem Neuzeichnen neu berechnet, nicht nur beim ersten Laden |
| Bei zwei offenen Tabs | CSRF-Token rotierte bei jedem `/me`-Aufruf und hätte den zweiten Tab ausgesperrt | Token wird deterministisch aus einem Server-Secret abgeleitet statt zufällig neu vergeben |
| Mobilansicht | „Mehr" verdrängte „Profil" aus der unteren Leiste – Admins kämen nicht mehr ans Abmelden | Bottom-Nav hat fünf feste Einträge, Verwaltungsbereiche hängen zusätzlich am Profil |
| Bestellkopf | „Blunt OaO OaO" – ARK-Namen enthalten den Tribe oft schon | Tribe wird nur angehängt, wenn er nicht bereits im Namen steckt |

Zusätzlich beim manuellen Sichten der Screenshots gefunden: Toasts stapelten
sich bei mehreren schnellen Aktionen übereinander und verdeckten Inhalte
(jetzt auf maximal 3 begrenzt), und die Katalogliste im Developer-Bereich
ergab ungefiltert eine über 16.000px lange Seite (jetzt auf 60 Treffer
begrenzt mit Hinweis, die Suche zu nutzen).

---

## 4. Der ARK-Katalog

Der Katalog ist **nicht im Code hartcodiert**, sondern kommt aus
`data/catalog/creatures.json` und landet beim Seed in der Datenbank.

**386 Katalog-Items** aus 217 Kreaturen:

| Typ | Anzahl |
|---|---|
| Kreaturen | 217 |
| Eier | 56 |
| Embryos | 42 |
| Sättel | 71 |

Die Liste wurde gegen aktuelle Quellen abgeglichen (Stand: aktuelle ASA-Version inkl.
Lost Colony). Zwei Hinweise dazu:

1. **Yutyrannus legt ein Ei, keinen Embryo.** In deiner Spezifikation stand
   „Yutyrannus Embryo“ als Beispiel. Nach den Spieldaten ist der Yuty ein Eierleger
   (Brutzeit ca. 4 h 59 min, 32–34 °C). Embryos gibt es bei Säugetieren wie
   Sabertooth, Direwolf oder Thylacoleo. Ich habe es fachlich korrekt angelegt –
   wenn dein Tribe intern trotzdem „Embryo“ sagt, kannst du das Item über die API in
   einer Sekunde umbenennen, ohne Code anzufassen.

2. **Eier/Embryos/Sättel wurden nur dort erzeugt, wo die Recherche sicher war.**
   Bei unklaren Fällen (viele Bosse, Event-Kreaturen, brandneue Lost-Colony-Tiere)
   ist bewusst nur die Basis-Kreatur angelegt. Lieber ein Eintrag zu wenig als ein
   erfundener – Nachpflegen geht per API oder JSON-Datei.

### Katalog erweitern – ohne Code

Neue Kreatur zur JSON-Datei hinzufügen und `npm run seed` erneut ausführen
(bestehende Einträge bleiben unangetastet). Format pro Zeile:

```json
["key", "Anzeigename", "L|W|F|M", "egg|embryo|null", true]
```
(`L`=Land, `W`=Wasser, `F`=Flieger, `M`=Sonstiges; letzter Wert = hat Sattel)

Oder live über die API als Developer:
`POST /api/categories`, `POST /api/items`, `POST /api/items/:id/image`.

### Bilder

Es sind bewusst **keine ARK-Spielgrafiken eingebettet** – die gehören Studio Wildcard.
Genau wie in deiner Spezifikation (Abschnitt 27) gefordert, kann stattdessen jedes Item
über `POST /api/items/:id/image` ein eigenes, rechtmäßig nutzbares Bild bekommen.
Dein Logo liegt bereits unter `assets/branding/logo.png` im Projekt.

---

## 5. Sicherheitsmodell

Alle Rechte werden **serverseitig** geprüft. Ein Verstecken im Frontend gibt es nicht,
weil es das Frontend gar nicht braucht, um sicher zu sein.

- **Passwörter:** scrypt mit zufälligem 16-Byte-Salt, 64-Byte-Key, Vergleich per
  `timingSafeEqual` (kein Timing-Leak). Klartext wird nie gespeichert oder geloggt.
- **Sessions:** Cookie `atb_session` (HttpOnly, SameSite=Lax, Secure in Produktion).
  In der DB liegt nur der SHA-256-Hash des Tokens – ein DB-Leak erlaubt keine
  Session-Übernahme. Sliding Expiration: aktive Nutzer bleiben eingeloggt.
- **CSRF:** Synchronizer-Token. Das Token kommt beim Login **nur im JSON-Body**
  (nicht als Cookie) und muss bei jedem POST/PATCH/PUT/DELETE als Header
  `X-CSRF-Token` mitgeschickt werden. Ein fremdes Formular kann diesen Header nicht
  setzen – ein mitgeschicktes Session-Cookie allein reicht also nicht.
- **Mandantentrennung:** Jede Bestellungs-Query filtert serverseitig auf `tribe_id`.
  Zugriff auf einen fremden Tribe liefert bewusst **404 statt 403**, damit nicht einmal
  die Existenz fremder Daten bestätigt wird.
- **Rechteeskalation:** Ein Tribe-Admin kann ausschließlich die Breeder/Crafter-Rolle
  vergeben. Admin- und Developer-Rechte gibt es nur über `/api/developer/...`, und dort
  kommt ausschließlich Blunt hinein.
- **SQL-Injection:** Ausnahmslos parametrisierte Queries, auch in der Item-Suche
  (inkl. Escaping der LIKE-Wildcards `%` und `_`).
- **Uploads:** Max. 3 MB, nur PNG/JPEG/WEBP, und der behauptete MIME-Type wird gegen
  die tatsächlichen **Magic Bytes** der Datei geprüft. Dateinamen sind immer zufällige
  UUIDs – Path Traversal über den Dateinamen ist konstruktiv unmöglich.
- **Brute Force:** 5 Fehlversuche pro Benutzer+IP in 15 Minuten sperren den Login –
  auch mit anschließend korrektem Passwort.
- **Rate Limiting:** 120 Requests/Min. allgemein, 10/Min. auf Login und Registrierung
  (konfigurierbar über `RATE_LIMIT_*`).
- **Fehlerbehandlung:** Interne Fehler und DB-Meldungen erreichen den Client nie – nur
  eine generische Meldung; Details landen ausschließlich im Server-Log.

### Race Condition beim „Übernehmen“

Wenn zwei Breeder gleichzeitig auf „Übernehmen“ klicken, darf nicht beiden die
Bestellung zugewiesen werden. Gelöst durch ein einziges bedingtes UPDATE:

```sql
UPDATE orders SET assigned_to = ?
WHERE id = ? AND assigned_to IS NULL AND status NOT IN ('completed','cancelled')
```

Wer 0 geänderte Zeilen zurückbekommt, hat verloren und erhält `409 Conflict`.
Test 19 der Suite feuert beide Requests tatsächlich parallel ab und prüft, dass
**genau einer** 200 und **genau einer** 409 bekommt.

---

## 6. Testsuite (Backend)

```bash
npm test
```

32 Tests, alle grün. Sie starten einen echten Server mit echter Datenbank und sprechen
ihn über echte HTTP-Requests an – nichts ist gemockt. Abgedeckt sind unter anderem alle
Fälle aus Abschnitt 48 deiner Spezifikation:

| # | Getestetes Szenario | Erwartung |
|---|---|---|
| 8 | Member ruft Admin-API auf | 403 |
| 10 | Gültiges Cookie ohne CSRF-Token | 403 |
| 12 | Member ruft fremde Bestellung/Kommentare ab | 403 |
| 15 | Tribe XYZ greift auf OaO-Daten zu | 404 |
| 16 | Admin verschafft sich Developer-Rechte | 403 |
| 17 | Manipulierte IDs (`-1`, Text, nicht existent) | 400 / 404 |
| 19 | Zwei Breeder übernehmen parallel | genau 1× 200, 1× 409 |
| 20 | Fremder Breeder ändert Item-Status | 403 |
| 22 | Abschluss erst wenn **alle** Positionen ausgegeben | korrekt |
| 26 | Member liest Audit-Log | 403 |
| 28 | Brute-Force-Sperre | greift |
| 29 | Datei mit falschem Typ hochladen | 400 |
| 30 | Member sieht fremde Server/Map-Daten | ausgeblendet |

Beim ersten Durchlauf hat die Suite direkt einen echten Bug gefunden: in
`setPreferences` wurde eine nicht existierende Spalte abgefragt, wodurch das
Speichern von Benachrichtigungseinstellungen mit einem 500er fehlschlug. Behoben und
durch Test 23 abgesichert.

---

## 7. API-Referenz

Alle Endpunkte unter `/api`. Verändernde Requests brauchen den Header `X-CSRF-Token`.

### Auth
| Methode | Pfad | Wer |
|---|---|---|
| POST | `/auth/register` | alle |
| POST | `/auth/login` | alle |
| POST | `/auth/logout` | eingeloggt |
| GET | `/auth/me` | eingeloggt |

### Profil & Tribe
`GET/PATCH /users/me` · `POST /users/me/avatar` · `GET /users/:id` ·
`GET /tribes/me` · `PATCH /tribes/me` (Admin)

### Katalog
`GET /categories` · `GET /items?search=&categoryId=&lang=` · `GET /i18n/:lang`
Developer zusätzlich: `POST/PATCH /categories`, `POST/PATCH /items`, `POST /items/:id/image`

### Bestellungen
| Methode | Pfad | Wer |
|---|---|---|
| POST | `/orders` | Member |
| GET | `/orders?scope=own\|open\|history` | rollenabhängig gefiltert |
| GET | `/orders/:id` | Beteiligte + Admin |
| POST | `/orders/:id/claim` | Breeder/Crafter, Admin |
| POST | `/orders/:id/release` | Zuständiger, Admin |
| POST | `/orders/:id/assign` | Admin |
| PATCH | `/orders/:id/items/:itemId` | Zuständiger, Admin |
| POST | `/orders/:id/cancel` | Ersteller, Admin |
| GET/POST | `/orders/:id/comments` | Beteiligte + Admin |

### Benachrichtigungen
`GET /notifications` · `PATCH /notifications/:id/read` · `POST /notifications/read-all` ·
`GET/PUT /notifications/preferences`

### Admin (eigener Tribe)
`GET /admin/members` · `PATCH /admin/members/:id/approve|reject|disable|roles` ·
`GET /admin/audit-logs`

### Developer (nur Blunt, plattformweit)
`GET/POST /developer/tribes` · `PATCH /developer/tribes/:id` ·
`GET /developer/users` · `PATCH /developer/users/:id/roles` · `GET /developer/audit-logs`

### Beispiel: Bestellung anlegen

```bash
# 1. Login – csrfToken aus der Antwort merken
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Blunt OaO","password":"DEIN_PASSWORT"}'

# 2. Bestellung anlegen
curl -b cookies.txt -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token-aus-schritt-1>" \
  -d '{"priority":"urgent","note":"Bitte vor dem Abendraid",
       "items":[{"itemId":1,"quantity":10},{"itemId":2,"quantity":1}]}'
```

---

## 8. Projektstruktur

```
ark-tribe-hub/
├── public/                      Frontend – siehe Abschnitt 3
├── src/
│   ├── config.js                Konfiguration + .env-Loader
│   ├── server.js                HTTP-Server, Middleware-Kette, liefert public/ + API
│   ├── db/
│   │   ├── schema.sql           Vollständiges relationales Datenmodell
│   │   ├── client.js            DB-Verbindung, Transaktionen
│   │   └── seed.js              Rollen, Tribe OaO, Katalog-Import, Demo-Nutzer
│   ├── lib/                     password, tokens, http, router, validate,
│   │                            rateLimiter, imageUpload
│   ├── middleware/              auth (Session/RBAC/CSRF), security (Header/CORS/Limits)
│   ├── services/                authService, orderService, notificationService,
│   │                            auditService  ← die gesamte Geschäftslogik
│   └── routes/                  auth, users, tribes, catalog, orders,
│                                notifications, admin, developer
├── data/catalog/creatures.json  217 Kreaturen (Katalogquelle)
├── assets/branding/              dein Logo + Moodboard (Rohdaten)
└── test/
    ├── run.mjs                   32 Backend-E2E- und Security-Tests
    └── ui_test.py                 36 Frontend-Tests im echten Browser
```

Die Trennung ist bewusst: **Routen** validieren Eingaben und prüfen Rollen,
**Services** enthalten die Regeln, **public/** weiß nichts über die Datenbank und
spricht nur über die HTTP-API. Deshalb lässt sich später eine native App oder ein
Discord-Bot anschließen, ohne die Logik zu duplizieren – und das Frontend
komplett austauschen, ohne das Backend anzufassen.

---

## 9. Vor dem Produktivbetrieb

1. `NODE_ENV=production` setzen (aktiviert Secure-Cookies und HSTS).
2. HTTPS davorschalten – ohne TLS funktionieren Secure-Cookies nicht.
3. Demo-Accounts deaktivieren oder Passwörter ändern.
4. `CORS_ORIGINS` nur setzen, falls das Frontend von einer ANDEREN Domain läuft
   als das Backend (Standard-Setup hier ist same-origin, dann nicht nötig).
5. Backup für `data/ark-tribe-hub.db` einrichten (SQLite = eine Datei, gut sicherbar)
   – `data/.session-secret` gehört zum Backup dazu, sonst werden bestehende
   Sessions beim Wiederherstellen ungültig.
6. Bei mehreren Server-Instanzen: Rate-Limiter auf einen gemeinsamen Store (z. B.
   Redis) umstellen – die Middleware-Signatur bleibt dabei identisch.
7. Google Fonts lädt das Frontend extern (Rajdhani/Inter). Ohne Internetzugriff
   auf dem Client greift automatisch die System-Schrift – funktioniert immer,
   sieht mit den echten Fonts aber besser aus. Für ein Offline-taugliches Setup
   lassen sich die Fonts alternativ lokal in `public/` einbinden.

---

*Erstellt von Blunt*

---

## 10. Kostenlos hosten (Render)

Die App unterstützt zwei Datenbank-Backends, automatisch anhand der Umgebung
gewählt (`src/db/index.js`):

| Umgebung | Datenbank | Bilder |
|---|---|---|
| Lokal (kein `DATABASE_URL`) | SQLite-Datei | lokale Festplatte |
| Render Free Tier (`DATABASE_URL` gesetzt) | Postgres (dauerhaft) | Blob in der Datenbank |

**Warum überhaupt zwei Backends?** Render vergibt auf der kostenlosen Stufe
keine persistente Festplatte – jeder Neustart (auch das automatische
Einschlafen nach 15 Minuten Inaktivität) würde eine lokale SQLite-Datei
löschen. Genau das hätte deine Bestellungen verschwinden lassen. Die
Postgres-Datenbank bei Render bleibt davon unberührt.

### Was ich vorbereitet habe

- `src/db/pgClient.js` – Postgres-Anbindung mit identischer Schnittstelle wie
  der lokale SQLite-Client. Services und Routen kennen den Unterschied nicht.
- `src/db/schema.postgres.sql` – dasselbe Datenmodell in Postgres-Dialekt.
- `render.yaml` – Blueprint, der Web Service und Datenbank in einem Schritt anlegt
  und automatisch miteinander verbindet.
- Bild-Uploads (Avatar, Item-Bilder) landen bei Postgres-Betrieb als Blob in
  der Datenbank statt als Datei – bleiben damit genauso dauerhaft wie alles
  andere.

**Ehrlicher Hinweis zum Teststand:** Die komplette Umstellung auf async/await
(nötig, weil eine echte Netzwerk-Datenbank das verlangt) habe ich gegen die
lokale SQLite-Datenbank vollständig verifiziert – 34 Backend- und 50
Frontend-Tests laufen unverändert grün durch dieselbe Schnittstelle, die auch
der Postgres-Client bedient. Eine echte Postgres-Verbindung konnte ich in
dieser Umgebung nicht selbst testen (kein Internetzugriff in meiner Sandbox).
Sobald die Anwendung läuft, prüfe ich das live über die Logs nach.

### Die drei Schritte, die nur du machen kannst

Hosting-Konten sind an eine echte Identität gebunden – das kann ich nicht für
dich übernehmen. Danach mache ich weiter.

**1. Code zu GitHub bringen** (kein Terminal nötig):
1. Gehe zu [github.com/new](https://github.com/new), leg ein neues (privates
   oder öffentliches) Repository an, z. B. `ark-tribe-hub`.
2. Entpacke das mitgelieferte Archiv auf deinem Rechner.
3. Auf der leeren Repo-Seite auf „uploading an existing file" klicken, den
   kompletten entpackten Ordnerinhalt hineinziehen, committen.

**2. Render-Konto verbinden**: Über die Karte, die ich dir gleich zeige –
einmal anmelden (kein Kreditkarte nötig für den Free-Tier-Pfad), dein
GitHub-Repo auswählen. Danach übernehme ich Deployment, Logs und Tests wieder
selbst.

**3. Falls Render nach dem Blueprint fragt**: „New +" → „Blueprint" → das
Repository auswählen. Render erkennt `render.yaml` automatisch und schlägt
Web Service + Datenbank zusammen vor.

### Was danach automatisch passiert

Render führt beim ersten Start `npm run seed` **nicht** separat aus – das
übernimmt die App selbst (`seedIfEmpty` läuft beim Serverstart automatisch,
genau wie lokal). Die Postgres-Datenbank ist beim ersten Aufruf leer, füllt
sich also automatisch mit Tribe OaO, dem Katalog und den Demo-Zugängen.

### Bekannte Grenzen der kostenlosen Stufe (damit es dich nicht überrascht)

- **Einschlafen nach 15 Minuten Inaktivität.** Der erste Aufruf danach dauert
  30–60 Sekunden (Render fährt die App neu hoch). Das ist normal, kein Fehler.
- **Postgres Free Tier ist bei Render aktuell auf 30 Tage befristet**
  (danach 14 Tage Gnadenfrist, bevor die Datenbank gelöscht wird), Stand
  meiner Recherche. Für eine reine Testphase unkritisch – für den dauerhaften
  Einsatz mit deinem Tribe müsstest du rechtzeitig auf einen bezahlten
  Datenbank-Plan wechseln (kein Zwang, nur zur Kenntnis).



## Sicherheit

> **Demo-Konten gibt es ausschließlich lokal.** Sobald `DATABASE_URL` gesetzt ist
> (also in jeder gehosteten Umgebung), legt der Seed **keine** Konten mit
> Standardpasswort mehr an – nur noch den Katalog. Lokal lässt sich das Passwort
> über die Umgebungsvariable `SEED_DEMO_PASSWORD` frei setzen.
>
> Jeder Benutzer kann sein Passwort unter **Profil → Einstellungen → Passwort ändern**
> selbst wechseln. Dabei werden alle anderen angemeldeten Geräte abgemeldet.

