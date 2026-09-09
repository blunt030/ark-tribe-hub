"""
Echter Browser-Test des ARK-Tribe-Hub-Frontends.

Startet keinen eigenen Server – erwartet einen laufenden Server auf BASE_URL.
Klickt sich wie ein Mensch durch die App und prueft, was tatsaechlich auf dem
Bildschirm steht. Macht ausserdem Screenshots fuer die visuelle Kontrolle.
"""
import sys
import re
import os
import time
import shutil
import socket
import tempfile
import subprocess
from pathlib import Path
import urllib.request
from playwright.sync_api import sync_playwright, expect

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def free_port():
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


PORT = free_port()
BASE = f"http://localhost:{PORT}"
PW = "ChangeMe123!"
SHOTS = os.environ.get("ATH_SHOTS", os.path.join(PROJECT, "..", "ui-shots"))
os.makedirs(SHOTS, exist_ok=True)

results = []


def check(name, fn):
    try:
        fn()
        results.append((True, name, ""))
        print(f"  OK   {name}")
    except Exception as e:
        msg = str(e).split("\n")[0][:200]
        results.append((False, name, msg))
        print(f"  FAIL {name}\n       {msg}")


def sign_in(page, user):
    page.goto(BASE + "/#/", wait_until="networkidle")
    # Falls noch eine Sitzung aktiv ist, erst abmelden
    if page.locator("aside.sidebar").count() > 0:
        page.get_by_role("button", name=re.compile("Abmelden")).first.click()
        page.wait_for_selector(".auth-wrap")
    page.fill("#f-id", user)
    page.fill("#f-pw", PW)
    page.get_by_role("button", name="Anmelden").click()
    page.wait_for_selector(".content", timeout=15000)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        errors = []

        # Deutsche Browsersprache: die App uebernimmt sie automatisch beim ersten
        # Start, ohne dass etwas eingestellt werden muss.
        desktop = browser.new_context(locale="de-DE", viewport={"width": 1440, "height": 950})
        # Grosszuegiges Zeitlimit: die Views laden ihre Daten asynchron nach, und
        # auf langsamen Maschinen (CI, Container) war das knappe Standardlimit die
        # haeufigste Ursache fuer sporadische Fehlschlaege. Geprueft wird
        # unveraendert dasselbe - nur mit mehr Geduld.
        desktop.set_default_timeout(15000)
        page = desktop.new_page()
        page.on("console", lambda m: errors.append("console: " + m.text)
                if m.type == "error" and "Failed to load resource" not in m.text else None)
        page.on("pageerror", lambda e: errors.append("exception: " + str(e)))

        # ---------------------------------------------------------------- Login
        print("\n[1] Anmeldung und Grundgeruest")
        page.goto(BASE, wait_until="networkidle")
        check("Loginseite zeigt Logo genau einmal (kein doppeltes Branding)",
              lambda: expect(page.locator(".auth-logo img")).to_have_count(1))
        check("Sprache folgt automatisch der Browsereinstellung (Deutsch)",
              lambda: expect(page.locator('button[type="submit"]')).to_have_text("Anmelden"))
        page.screenshot(path=f"{SHOTS}/01-login.png")

        page.fill("#f-id", "Blunt OaO")
        page.fill("#f-pw", PW)
        page.get_by_role("button", name="Anmelden").click()
        page.wait_for_selector(".content", timeout=15000)

        check("Member-Dashboard begruesst mit Namen",
              lambda: expect(page.locator("h1")).to_contain_text("Blunt OaO"))
        check("Sidebar ist auf Desktop sichtbar",
              lambda: expect(page.locator("aside.sidebar")).to_be_visible())
        check("Member sieht KEINE Plattform-Navigation",
              lambda: expect(page.locator('[data-path="/tribes"]')).to_have_count(0))
        check("Member sieht KEINE Tribe-Verwaltung",
              lambda: expect(page.locator('[data-path="/members"]')).to_have_count(0))
        page.screenshot(path=f"{SHOTS}/02-dashboard-member.png", full_page=True)

        # ------------------------------------------------------- Bestellung neu
        print("\n[2] Bestellung anlegen")
        page.get_by_role("button", name=re.compile("Neue Bestellung")).first.click()
        page.wait_for_selector("#item-search")

        page.fill("#item-search", "Rex Egg")
        page.wait_for_selector(".pick:has-text('Rex Egg')", timeout=15000)
        check("Item-Suche liefert Treffer aus dem echten Katalog",
              lambda: expect(page.locator(".pick").first).to_be_visible())
        page.locator(".pick", has_text="Rex Egg").first.click()

        page.fill("#item-search", "Rex Saddle")
        page.wait_for_selector(".pick:has-text('Rex Saddle')", timeout=15000)
        page.locator(".pick", has_text="Rex Saddle").first.click()

        check("Zwei Positionen uebernommen",
              lambda: expect(page.locator(".list .row")).to_have_count(2))

        # ---------------- Neue Katalog-Navigation: aufklappbare Gruppen (Redesign)
        # Vorher: eine flache Reihe aus sechs Produkttyp-Knoepfen plus eine
        # zweite Reihe fuer Lebensraum/Baustufe. Der alte Test hat genau diese
        # zwei Chip-Reihen gezaehlt und bildet damit die abgeloeste Anforderung
        # ab. Jetzt gibt es aufklappbare Gruppen mit Unterpunkten - geprueft wird
        # dieselbe Fachlichkeit (Strukturen bestellbar, Lebensraum-Unterfilter
        # nur bei Kreaturen), nur an der neuen Oberflaeche.
        print("\n[2b] Katalog-Navigation: aufklappbare Gruppen mit Unterpunkten")
        check("Vier Gruppen vorhanden (Kreaturen/Strukturen/Saettel/Sonstiges)",
              lambda: expect(page.locator(".acc .acc-group")).to_have_count(4))

        # Strukturen durchstoebern und eine bestellen (Dokument-Test 5)
        page.locator(".acc-head", has_text="Strukturen").click()
        page.wait_for_selector('.acc-group[data-group="structures"].open .acc-item', timeout=15000)
        check("Strukturen-Gruppe zeigt die Baustufen als Unterpunkte",
              lambda: expect(page.locator('.acc-group[data-group="structures"] .acc-item')).to_have_count(6))
        page.locator('.acc-group[data-group="structures"] .acc-item', has_text="Stein").click()
        page.wait_for_selector(".pick", timeout=15000)
        check("Baustufe Stein zeigt echte Struktur-Items",
              lambda: expect(page.locator(".pick").first).to_be_visible())
        struct_count_before = page.locator(".list .row").count()
        page.locator(".pick").first.click()
        check("Struktur wurde zur Bestellung hinzugefuegt",
              lambda: expect(page.locator(".list .row")).to_have_count(struct_count_before + 1))
        # Wieder entfernen, damit die spaeteren Tests mit genau den erwarteten
        # zwei Positionen (Rex Egg, Rex Saddle) weiterlaufen koennen.
        page.locator(".list .row").last.locator("button", has_text="✕").click()
        page.wait_for_timeout(150)

        # Kreaturen-Gruppe: Lebensraum-Unterfilter muss erscheinen
        page.locator(".acc-head", has_text="Kreaturen").click()
        page.wait_for_selector(".chips.habitats button", timeout=15000)
        check("Lebensraum-Unterfilter erscheint nur bei Kreaturen",
              lambda: expect(page.locator(".chips.habitats button")).to_have_count(5))
        # Bei Strukturen darf es ihn nicht geben - die haben keinen Lebensraum.
        page.locator(".acc-head", has_text="Strukturen").click()
        page.wait_for_timeout(400)
        check("Kein Lebensraum-Unterfilter bei Strukturen",
              lambda: expect(page.locator(".chips.habitats button")).to_have_count(0))
        page.locator(".acc-head", has_text="Kreaturen").click()
        page.wait_for_timeout(400)

        # Suche nach einer Struktur (Dokument-Test 13)
        page.fill("#item-search", "Tresor")
        page.wait_for_selector(".pick:has-text('Tresor')", timeout=15000)
        check("Suche findet Strukturen genauso wie Kreaturen",
              lambda: expect(page.locator(".pick", has_text="Tresor").first).to_be_visible())
        page.fill("#item-search", "")
        page.wait_for_timeout(300)

        page.fill("#item-search", "Rex Egg")
        page.wait_for_selector(".pick:has-text('Rex Egg')", timeout=15000)
        page.locator(".pick", has_text="Rex Egg").first.click()

        page.fill("#item-search", "Rex Saddle")
        page.wait_for_selector(".pick:has-text('Rex Saddle')", timeout=15000)
        page.locator(".pick", has_text="Rex Saddle").first.click()

        # Menge auf 10 erhoehen
        plus = page.locator(".row").first.locator(".qty button").last
        for _ in range(9):
            plus.click()
        check("Menge laesst sich auf 10 stellen",
              lambda: expect(page.locator(".row").first.locator(".qty input")).to_have_value("10"))

        page.get_by_role("button", name="Dringend").click()
        page.fill("#note", "Bitte vor dem Abendraid")
        page.screenshot(path=f"{SHOTS}/03-neue-bestellung.png", full_page=True)

        page.get_by_role("button", name="Bestellung aufgeben").click()
        page.wait_for_url(re.compile(r"#/orders/\d+"), timeout=15000)
        order_url = page.url
        order_id = order_url.split("/")[-1]

        check("Kopf zeigt Benutzer und Tribe statt Bestellnummer",
              lambda: expect(page.locator("h1")).to_have_text("Blunt OaO"))
        check("Tribe-Name wird nicht doppelt angehängt (Charaktername enthält ihn schon)",
              lambda: expect(page.locator("h1")).not_to_have_text("Blunt OaO OaO"))
        check("Keine Bestellnummer sichtbar",
              lambda: expect(page.locator("body")).not_to_contain_text("#" + order_id + " "))
        check("Prioritaet 'Dringend' wird angezeigt",
              lambda: expect(page.locator(".badge.b-urgent")).to_be_visible())
        check("Notiz wird angezeigt",
              lambda: expect(page.locator(".notice.note").first).to_contain_text("Abendraid"))
        check("Member sieht KEINE Statusknoepfe (nicht zustaendig)",
              lambda: expect(page.get_by_role("button", name="Vorbereitet")).to_have_count(0))
        page.screenshot(path=f"{SHOTS}/04-bestellung-detail.png", full_page=True)

        # ---------------------------------------------------------- Kommentar
        print("\n[3] Nachricht in der Bestellung")
        page.fill('input[placeholder*="Nachricht"]', "Kann ich die heute Abend bekommen?")
        page.get_by_role("button", name="Senden").click()
        page.wait_for_selector(".comment", timeout=15000)
        check("Nachricht erscheint in der Bestellung",
              lambda: expect(page.locator(".comment").first).to_contain_text("heute Abend"))

        # -------------------------------------- Persistenz: Reload / Logout / Login
        print("\n[3b] Persistenz ueber Reload und Neuanmeldung (Phase 9 / Test I)")
        page.reload(wait_until="networkidle")
        check("Nach Reload: Bestellkopf weiterhin korrekt",
              lambda: expect(page.locator("h1")).to_have_text("Blunt OaO"))
        check("Nach Reload: Notiz weiterhin vorhanden",
              lambda: expect(page.locator(".notice.note").first).to_contain_text("Abendraid"))
        check("Nach Reload: Nachricht weiterhin vorhanden",
              lambda: expect(page.locator(".comment").first).to_contain_text("heute Abend"))

        page.get_by_role("button", name=re.compile("Abmelden")).click()
        page.wait_for_selector(".auth-wrap", timeout=15000)
        page.fill("#f-id", "Blunt OaO")
        page.fill("#f-pw", PW)
        page.get_by_role("button", name="Anmelden").click()
        page.wait_for_selector(".content", timeout=15000)
        page.goto(f"{BASE}/#/orders/{order_id}", wait_until="networkidle")
        check("Nach Logout+Login: dieselbe Bestellung weiterhin abrufbar",
              lambda: expect(page.locator(".notice.note").first).to_contain_text("Abendraid"))

        # --------------------------------------------------------- Breeder-Sicht
        print("\n[4] Breeder uebernimmt und arbeitet ab")
        sign_in(page, "OaO Breeder")
        check("Breeder-Dashboard zeigt offene Auftraege",
              lambda: expect(page.locator(".section-title", has_text="Offene Aufträge")).to_have_count(1))
        check("Bestellkarte des Members ist sichtbar",
              lambda: expect(page.locator(".order-card").first).to_contain_text("Blunt OaO"))
        page.screenshot(path=f"{SHOTS}/05-dashboard-breeder.png", full_page=True)

        page.goto(f"{BASE}/#/orders/{order_id}", wait_until="networkidle")
        page.get_by_role("button", name="Übernehmen").click()
        page.wait_for_selector(".toast", timeout=15000)
        check("Uebernahme wird bestaetigt",
              lambda: expect(page.locator(".assign-line").last).to_contain_text("OaO Breeder"))

        # Erste Position auf "vorbereitet", dann beide auf "ausgegeben"
        page.get_by_role("button", name="Vorbereitet").first.click()
        page.wait_for_timeout(600)
        check("Gesamtstatus wechselt auf 'Teilweise vorbereitet'",
              lambda: expect(page.locator(".badge.b-partially_prepared")).to_be_visible())
        page.screenshot(path=f"{SHOTS}/06-teilweise-vorbereitet.png", full_page=True)

        # Alles ausgeben -> muss auf "Abgeschlossen" springen
        for _ in range(6):
            btns = page.get_by_role("button", name=re.compile("^(Vorbereitet|Ausgegeben)$"))
            if btns.count() == 0:
                break
            btns.first.click()
            page.wait_for_timeout(500)

        check("Bestellung ist erst nach ALLEN Ausgaben abgeschlossen",
              lambda: expect(page.locator(".badge.b-completed")).to_be_visible())
        page.screenshot(path=f"{SHOTS}/07-abgeschlossen.png", full_page=True)

        # ------------------------------------------------------------- Admin
        print("\n[5] Adminbereich")
        sign_in(page, "OaO Admin")
        check("Admin sieht Tribe-Verwaltung in der Navigation",
              lambda: expect(page.locator('.sidebar [data-path="/members"]')).to_have_count(1))
        check("Admin sieht KEINE Plattform-Navigation",
              lambda: expect(page.locator('[data-path="/tribes"]')).to_have_count(0))
        page.goto(BASE + "/#/members", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=15000)
        check("Mitgliederliste laedt",
              lambda: expect(page.locator(".row").first).to_be_visible())
        page.screenshot(path=f"{SHOTS}/08-admin-mitglieder.png", full_page=True)

        page.goto(BASE + "/#/audit", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=15000)
        check("Protokoll zeigt Eintraege",
              lambda: expect(page.locator(".row").first).to_be_visible())

        # ------------------------------------------------------- News-Ticker (Test 14/15)
        print("\n[5b] News-Ticker: erstellen, im Ticker sehen, deaktivieren")
        page.goto(BASE + "/#/news", wait_until="networkidle")
        page.wait_for_selector("textarea", timeout=15000)
        page.fill("textarea", "Heute 20:00 Uhr Bossrun - bitte im Discord melden")
        page.get_by_role("button", name=re.compile("Dringend")).click()
        page.get_by_role("button", name=re.compile("Veröffentlichen")).click()
        page.wait_for_selector(".toast", timeout=15000)
        check("Neue News erscheint in der Verwaltungsliste",
              lambda: expect(page.locator(".list .row", has_text="Bossrun")).to_have_count(1))

        page.goto(BASE + "/#/", wait_until="networkidle")
        page.wait_for_selector(".news-ticker", timeout=15000)
        check("News-Ticker erscheint auf dem Dashboard",
              lambda: expect(page.locator(".news-ticker")).to_contain_text("Bossrun"))
        check("Ticker-Eintrag ist als dringend markiert",
              lambda: expect(page.locator(".nt-item.urgent")).to_have_count(2))  # zweimal: nahtlose Schleife dupliziert den Inhalt
        page.screenshot(path=f"{SHOTS}/13-news-ticker.png", full_page=True)

        # Bewusst umgedreht: das Laufband soll AUCH bei Mauszeiger weiterlaufen
        # (Wunsch: durchgehende Dauerschleife wie im Nachrichtenfernsehen).
        page.hover(".news-ticker")
        page.wait_for_timeout(250)
        check("Ticker laeuft auch bei Hover weiter (kein Anhalten)",
              lambda: expect(page.locator(".nt-track.paused")).to_have_count(0))
        check("Ticker laeuft in Dauerschleife (unendliche Wiederholung)",
              lambda: expect(page.locator(".nt-track")).to_have_css("animation-iteration-count", "infinite"))
        tempo = page.eval_on_selector(".nt-track", "el => parseFloat(getComputedStyle(el).animationDuration)")
        check("Ticker-Tempo ist zuegig (unter 40s pro Durchlauf)",
              lambda: (_ for _ in ()).throw(AssertionError(f"zu langsam: {tempo}s")) if tempo > 40 else None)

        page.goto(BASE + "/#/news", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=15000)
        page.get_by_role("button", name=re.compile("Deaktivieren")).first.click()
        page.wait_for_selector(".toast", timeout=15000)
        page.goto(BASE + "/#/", wait_until="networkidle")
        page.wait_for_timeout(400)
        check("Deaktivierte News verschwindet aus dem Ticker (Dokument-Test 15)",
              lambda: expect(page.locator(".news-ticker")).to_have_count(0))


        # --------------------------------------------------------- Developer
        print("\n[6] Developer-Bereich")
        sign_in(page, "Blunt")
        check("Developer sieht Plattform-Navigation",
              lambda: expect(page.locator('.sidebar [data-path="/tribes"]')).to_have_count(1))
        check("Developer sieht Benutzer- und Katalogverwaltung",
              lambda: expect(page.locator('.sidebar [data-path="/users"]')).to_have_count(1))
        page.goto(BASE + "/#/catalog", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=15000)
        check("Katalog meldet die volle Anzahl Eintraege",
              lambda: expect(page.locator(".page-head p")).to_contain_text("522"))
        page.screenshot(path=f"{SHOTS}/09-developer-katalog.png", full_page=True)

        # ------------------------------------------- Item-Bild hochladen (Dokument-Punkt 11)
        print("\n[6a] Item-Bild hochladen und in Bestellung/Picker wiederfinden")
        page.fill('input[type="search"]', "Rex Saddle")
        page.wait_for_timeout(300)
        row = page.locator(".row", has_text="Rex Saddle").first
        row.locator("button", has_text=re.compile("Bild")).click()
        row.locator('input[type="file"]').set_input_files(
            str(Path(__file__).parent.parent / "public" / "assets" / "icon-192.png")
        )
        page.wait_for_selector(".toast", timeout=15000)
        check("Hochgeladenes Bild erscheint sofort als Vorschau im Katalog",
              lambda: expect(row.locator("img")).to_have_count(1))

        page.goto(BASE + "/#/orders/new", wait_until="networkidle")
        page.wait_for_selector("#item-search", timeout=15000)
        page.fill("#item-search", "Rex Saddle")
        page.wait_for_selector(".pick:has-text('Rex Saddle')", timeout=15000)
        check("Hochgeladenes Bild erscheint auch im Bestell-Picker (nicht nur im Katalog)",
              lambda: expect(page.locator(".pick", has_text="Rex Saddle").first.locator("img")).to_have_count(1))

        page.goto(BASE + "/#/tribes", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=15000)
        check("Tribe-Liste ist sichtbar (inkl. OaO)",
              lambda: expect(page.locator(".row", has_text="OaO")).to_have_count(1))

        # ------------------------------------------------- Dino-Datenbank (neues Modul)
        print("\n[6c] Dino-Datenbank: anlegen, in Liste sehen, oeffnen, bearbeiten")
        sign_in(page, "OaO Breeder")
        check("Werkzeuge-Gruppe mit Allianzen in der Navigation sichtbar",
              lambda: expect(page.locator('.sidebar [data-path="/alliances"]')).to_have_count(1))
        page.goto(BASE + "/#/dinos/new", wait_until="networkidle")
        page.wait_for_selector('input[required]', timeout=15000)
        name_input = page.locator(".card").first.locator('input[type="text"]').first
        name_input.fill("Testosaurus")
        species_input = page.locator(".card").first.locator('input[type="text"]').nth(1)
        species_input.fill("Rex")
        page.get_by_role("button", name=re.compile("Anlegen")).click()
        page.wait_for_timeout(500)
        check("Nach dem Anlegen landet man auf der Detailseite (URL mit Dino-ID)",
              lambda: expect(page).to_have_url(re.compile(r"#/dinos/\d+$")))
        check("Detailseite zeigt den neu angelegten Namen",
              lambda: expect(page.locator(".card").first).to_contain_text("Testosaurus"))

        page.goto(BASE + "/#/dinos", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=15000)
        check("Neu angelegter Dino erscheint in der Liste",
              lambda: expect(page.locator(".row", has_text="Testosaurus")).to_have_count(1))

        # ------------------------------------------------- Server & Maps (neues Modul)
        print("\n[6d] Server & Maps: Server anlegen, Marker mit Koordinaten, Karte reagiert")
        page.goto(BASE + "/#/servers", wait_until="networkidle")
        page.get_by_role("button", name=re.compile("Neuer Server")).click()
        page.wait_for_selector(".modal", timeout=15000)
        modal_inputs = page.locator(".modal input[type='text']")
        modal_inputs.nth(0).fill("Testserver 1234")
        modal_inputs.nth(1).fill("The Island")
        page.locator(".modal").get_by_role("button", name=re.compile("Anlegen")).click()
        page.wait_for_selector(".modal", state="detached", timeout=15000)
        check("Neuer Server erscheint in der Liste",
              lambda: expect(page.locator(".row", has_text="Testserver 1234")).to_have_count(1))

        page.locator(".row", has_text="Testserver 1234").click()
        page.wait_for_selector(".map-grid-svg", timeout=15000)
        check("Schematische Karte wird als SVG gerendert",
              lambda: expect(page.locator(".map-grid-svg")).to_have_count(1))

        page.get_by_role("button", name=re.compile("Neue Markierung")).click()
        page.wait_for_selector(".modal", timeout=15000)
        page.locator(".modal input[type='text']").first.fill("Hauptbase")
        page.locator(".modal input[type='number']").nth(0).fill("40")
        page.locator(".modal input[type='number']").nth(1).fill("60")
        page.locator(".modal").get_by_role("button", name=re.compile("Anlegen")).click()
        page.wait_for_selector(".modal", state="detached", timeout=15000)
        check("Neue Markierung erscheint in der Liste unter der Karte",
              lambda: expect(page.locator(".row", has_text="Hauptbase")).to_have_count(1))
        check("Markierung erscheint auch als Punkt auf der Karte",
              lambda: expect(page.locator(".map-dot")).to_have_count(1))

        page.locator(".map-dot circle").click()
        page.wait_for_timeout(200)
        check("Klick auf den Kartenpunkt hebt die zugehoerige Zeile in der Liste hervor",
              lambda: expect(page.locator(".row.active-row")).to_have_count(1))

        # --------------------------------------------------------- Tasks (neues Modul)
        print("\n[6e] Tribe-Tasks: anlegen, Kommentar, Statuswechsel")
        page.goto(BASE + "/#/tasks/new", wait_until="networkidle")
        page.wait_for_selector('input[required]', timeout=15000)
        page.locator(".card input[type='text']").first.fill("Turm reparieren")
        page.get_by_role("button", name=re.compile("Anlegen")).click()
        page.wait_for_timeout(500)
        check("Nach dem Anlegen landet man auf der Aufgaben-Detailseite",
              lambda: expect(page).to_have_url(re.compile(r"#/tasks/\d+$")))

        comment_input = page.locator(".content").locator('input[type="text"]').last
        comment_input.fill("Erledige ich heute Abend.")
        page.get_by_role("button", name=re.compile("^Senden$")).click()
        page.wait_for_timeout(400)
        check("Kommentar erscheint in der Liste",
              lambda: expect(page.locator(".row", has_text="Erledige ich heute Abend.")).to_have_count(1))

        page.goto(BASE + "/#/tasks", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=15000)
        check("Neue Aufgabe erscheint in der Aufgabenliste",
              lambda: expect(page.locator(".row", has_text="Turm reparieren")).to_have_count(1))

        # -------------------------------------------------------- Inventar (neues Modul)
        print("\n[6f] Inventar: Eintrag anlegen, Status ableiten, +/- Knoepfe")
        page.goto(BASE + "/#/inventory", wait_until="networkidle")
        page.get_by_role("button", name=re.compile("Neuer Eintrag")).click()
        page.wait_for_selector(".modal", timeout=15000)
        page.locator(".modal input[type='search']").fill("Rex Egg")
        page.wait_for_selector(".modal .pick", timeout=15000)
        page.locator(".modal .pick").first.click()
        page.locator(".modal input[type='text']").fill("Warroom - Aberration")
        qty_inputs = page.locator(".modal input[type='number']")
        qty_inputs.nth(0).fill("3")
        qty_inputs.nth(1).fill("10")
        page.locator(".modal").get_by_role("button", name=re.compile("Anlegen")).click()
        page.wait_for_selector(".modal", state="detached", timeout=15000)
        check("Neuer Bestandseintrag erscheint unter seinem Standort",
              lambda: expect(page.locator(".row", has_text="Rex Egg")).to_have_count(1))
        check("Status wird korrekt als 'Nachfuellen' abgeleitet (3 < Mindestbestand 10)",
              lambda: expect(page.locator(".row", has_text="Rex Egg").locator(".badge", has_text="Nachfüllen")).to_have_count(1))

        row = page.locator(".row", has_text="Rex Egg")
        for _ in range(7):
            row.get_by_role("button", name=re.compile("erhöhen")).click()
            page.wait_for_timeout(80)
        check("Nach 7x '+' (3->10) springt der Status auf 'OK'",
              lambda: expect(row.locator(".badge", has_text="OK")).to_have_count(1))

        # -------------------------------------------------------- Voice (neues Modul)
        print("\n[6g] Voice: Kanal anlegen, beitreten, stummschalten, verlassen")
        page.goto(BASE + "/#/voice", wait_until="networkidle")
        page.fill("input[placeholder*='Kanalname'], input[placeholder*='Allgemein']", "Testkanal")
        page.get_by_role("button", name=re.compile("Neuer Kanal")).click()
        page.wait_for_timeout(400)
        check("Neuer Voice-Kanal erscheint",
              lambda: expect(page.locator(".card", has_text="Testkanal")).to_have_count(1))

        kanal = page.locator(".card", has_text="Testkanal")
        kanal.get_by_role("button", name=re.compile("Beitreten")).click()
        check("Nach Beitritt zeigt der Kanal 1 Teilnehmer",
              lambda: expect(kanal).to_contain_text("1 im Kanal", timeout=10000))
        check("Nach Beitritt erscheint der eigene Name im Kanal",
              lambda: expect(kanal).to_contain_text("OaO Breeder", timeout=10000))

        kanal.get_by_role("button", name=re.compile("Stummschalten")).click()
        check("Stummschalten zeigt das Mikrofon-aus-Symbol beim eigenen Namen",
              lambda: expect(kanal).to_contain_text("🔇", timeout=10000))

        kanal.get_by_role("button", name=re.compile("Verlassen")).click()
        check("Nach Verlassen zeigt der Kanal 0 Teilnehmer",
              lambda: expect(kanal).to_contain_text("0 im Kanal", timeout=10000))

        # -------------------------------------------------------- Sprachwechsel
        # ------------------------------------------- Redesign (Entwurfsbilder 1-5)
        print("\n[6h] Redesign: Startseite mit Kacheln, zugewiesene Aufgabe, Profilbereiche")
        sign_in(page, "OaO Admin")

        # Aufgabe anlegen UND sich selbst zuweisen. Genau das war die Luecke:
        # zugewiesene Aufgaben tauchten beim Zustaendigen nirgends auf, man musste
        # die Aufgabenseite oeffnen und selbst suchen.
        page.goto(BASE + "/#/tasks/new", wait_until="networkidle")
        page.wait_for_selector("input[required]", timeout=15000)
        page.locator(".card input[type='text']").first.fill("Metall farmen")
        page.locator(".card select").first.select_option(label="OaO Admin")
        page.get_by_role("button", name=re.compile("Anlegen")).click()
        page.wait_for_url(re.compile(r"#/tasks/\d+$"), timeout=15000)

        page.goto(BASE + "/#/", wait_until="networkidle")
        page.wait_for_selector(".tiles .tile", timeout=15000)
        n_tiles = page.locator(".tiles").first.locator(".tile").count()
        check("Startseite zeigt Kacheln mit den wichtigsten Zahlen",
              lambda: (_ for _ in ()).throw(AssertionError(f"nur {n_tiles} Kacheln")) if n_tiles < 3 else None)
        check("Zugewiesene Aufgabe erscheint beim Zustaendigen auf der Startseite",
              lambda: expect(page.locator(".row", has_text="Metall farmen")).to_have_count(1))
        check("Startseite hat einen Aktivitaeten-Abschnitt",
              lambda: expect(page.locator(".section-title", has_text="Aktivitäten")).to_have_count(1))
        n_quick = page.locator(".quick .quick-btn").count()
        check("Startseite hat einen Schnellzugriff",
              lambda: (_ for _ in ()).throw(AssertionError(f"nur {n_quick} Eintraege")) if n_quick < 3 else None)
        page.screenshot(path=f"{SHOTS}/13-startseite-redesign.png", full_page=True)

        page.goto(BASE + "/#/profile", wait_until="networkidle")
        page.wait_for_selector(".tiles .tile", timeout=15000)
        check("Profil: 'Meine Uebersicht' zeigt vier Kennzahlen",
              lambda: expect(page.locator(".tiles .tile")).to_have_count(4))
        check("Profil: Benachrichtigungen stehen in einem aufklappbaren Bereich",
              lambda: expect(page.locator(".acc-group .acc-head", has_text="Benachrichtigungen")).to_have_count(1))
        check("Profil: Passwortfelder sind zunaechst eingeklappt",
              lambda: expect(page.locator("#pw-cur")).to_be_hidden())
        page.locator(".link-row", has_text="Passwort ändern").click()
        page.wait_for_timeout(200)
        check("Profil: Klick auf 'Passwort ändern' klappt die Felder auf",
              lambda: expect(page.locator("#pw-cur")).to_be_visible())
        check("Profil: E-Mail-Adresse laesst sich im Konto-Bereich aendern",
              lambda: expect(page.locator(".link-row", has_text="E-Mail-Adresse ändern")).to_have_count(1))
        check("Profil: Sicherheitsbereich zeigt den Bestaetigungsstatus der E-Mail",
              lambda: expect(page.locator(".sec-row .sec-state")).to_have_count(1))
        page.screenshot(path=f"{SHOTS}/14-profil-redesign.png", full_page=True)

        print("\n[6b] Benachrichtigungseinstellungen im Profil (Dokument-Test 18)")
        page.goto(BASE + "/#/profile", wait_until="networkidle")
        page.wait_for_selector('input[type="checkbox"]', timeout=15000)
        checkboxes = page.locator('input[type="checkbox"]')
        n_boxes = checkboxes.count()
        check("Benachrichtigungs-Schalter sind im Profil (nicht mehr bei Mitteilungen)",
              lambda: expect(checkboxes.first).to_be_visible())

        page.get_by_role("button", name=re.compile("Alle deaktivieren")).click()
        page.wait_for_timeout(150)
        check("Alle deaktivieren schaltet wirklich alle Kaestchen aus",
              lambda: expect(page.locator('input[type="checkbox"]:checked')).to_have_count(0))

        page.get_by_role("button", name=re.compile("Alle aktivieren")).click()
        page.wait_for_timeout(150)
        check("Alle aktivieren schaltet wirklich alle Kaestchen wieder ein",
              lambda: expect(page.locator('input[type="checkbox"]:checked')).to_have_count(n_boxes))

        page.goto(BASE + "/#/notifications", wait_until="networkidle")
        page.wait_for_timeout(300)
        check("Mitteilungsseite selbst zeigt keine Schalter mehr, nur den Posteingang",
              lambda: expect(page.locator('input[type="checkbox"]')).to_have_count(0))

        print("\n[7] Sprache und Mobilansicht")
        page.goto(BASE + "/#/", wait_until="networkidle")

        # Logo/Brand fuehrt immer zur Startseite (Dokument-Punkt 14)
        page.goto(BASE + "/#/orders", wait_until="networkidle")
        page.wait_for_selector(".sidebar .brand-link", timeout=15000)
        page.locator(".sidebar .brand-link").click()
        page.wait_for_timeout(300)
        check("Klick auf das Logo fuehrt zur Startseite",
              lambda: expect(page).to_have_url(re.compile(r"#/$")))

        page.locator('.sidebar button[title="English"]').click()
        page.wait_for_selector(".content", timeout=15000)
        # "/orders" steht nicht mehr in der Hauptnavigation (Punkt 18) - der
        # Sprachwechsel wird deshalb an einem Punkt geprueft, den es dort gibt.
        check("Oberflaeche wechselt auf Englisch",
              lambda: expect(page.locator('[data-path="/orders/new"]').first).to_contain_text("New Order"))
        page.screenshot(path=f"{SHOTS}/10-englisch.png", full_page=True)
        page.locator('.sidebar button[title="Deutsch"]').click()
        page.wait_for_selector(".content", timeout=15000)

        # ------------------------------------------------------------- Mobil
        mobile_ctx = browser.new_context(
            locale="de-DE", viewport={"width": 390, "height": 844},
            is_mobile=True, has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
                       "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        )
        mobile_ctx.set_default_timeout(15000)
        mobile = mobile_ctx.new_page()
        mobile.goto(BASE, wait_until="networkidle")
        mobile.fill("#f-id", "Blunt OaO")
        mobile.fill("#f-pw", PW)
        mobile.get_by_role("button", name="Anmelden").click()
        mobile.wait_for_selector(".content", timeout=15000)

        check("Mobil: Bottom-Navigation sichtbar",
              lambda: expect(mobile.locator(".bottomnav")).to_be_visible())
        check("Mobil: Sidebar ausgeblendet",
              lambda: expect(mobile.locator("aside.sidebar")).to_be_hidden())
        check("Mobil: Topbar sichtbar",
              lambda: expect(mobile.locator(".topbar")).to_be_visible())
        check("Mobil: kein horizontales Scrollen",
              lambda: (lambda w: (_ for _ in ()).throw(AssertionError(f"Overflow: {w}")) if w > 391 else None)(
                  mobile.evaluate("document.documentElement.scrollWidth")))
        mobile.screenshot(path=f"{SHOTS}/11-mobil-dashboard.png", full_page=True)

        # Echter Rand-Test: KEIN Element darf ueber den rechten Viewport-Rand ragen.
        # scrollWidth allein reicht nicht - "overflow-x: hidden" verbirgt das Scrollen,
        # der Inhalt wird aber trotzdem sichtbar abgeschnitten (genau das hatte der
        # Nutzer auf seinem Geraet gemeldet, waehrend die alten Tests gruen blieben).
        overflow = mobile.evaluate("""() => {
          const vw = document.documentElement.clientWidth; const bad = [];
          document.querySelectorAll('body *').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > vw + 0.5) bad.push((el.tagName + '.' + el.className).slice(0, 40));
          });
          return bad.slice(0, 5);
        }""")
        check("Mobil: kein Element ragt ueber den rechten Rand hinaus",
              lambda: (_ for _ in ()).throw(AssertionError(f"Ueberlauf: {overflow}")) if overflow else None)

        # Drei feste Punkte (Startseite / Neue Bestellung / Profil) plus "Mehr".
        check("Mobil: untere Leiste hat genau 4 Eintraege (3 feste + Mehr)",
              lambda: expect(mobile.locator(".bottomnav a, .bottomnav .more-btn")).to_have_count(4))
        check("Mobil: 'Offene Bestellungen' liegt im Mehr-Menue, nicht in der Leiste",
              lambda: expect(mobile.locator('.bottomnav [data-path="/orders"]')).to_have_count(0))

        mobile.locator(".more-btn").click()
        mobile.wait_for_selector(".sheet", timeout=15000)
        check("Mobil: 'Mehr'-Menue macht die neuen Module erreichbar",
              lambda: expect(mobile.locator(".sheet-item", has_text="Allianzen")).to_have_count(1))
        mobile.locator(".sheet-bg").click(position={"x": 5, "y": 5})
        mobile.wait_for_timeout(300)

        # "Offene Bestellungen" ist bewusst nicht mehr in der unteren Leiste
        # (Punkt 18). Die Funktion muss aber weiterhin erreichbar sein - ueber
        # das Profil. Genau das wird hier geprueft.
        mobile.goto(BASE + "/#/profile", wait_until="networkidle")
        mobile.wait_for_timeout(400)
        check("Mobil: 'Offene Bestellungen' ist nicht mehr in der unteren Leiste",
              lambda: expect(mobile.locator('.bottomnav [data-path="/orders"]')).to_have_count(0))
        mobile.get_by_role("button", name=re.compile("Offene Bestellungen")).first.click()
        mobile.wait_for_timeout(800)
        check("Mobil: Bestellliste ueber das Profil erreichbar",
              lambda: expect(mobile.locator(".page-head h1")).to_contain_text("Bestellungen"))
        mobile.screenshot(path=f"{SHOTS}/12-mobil-bestellungen.png", full_page=True)

        # --------------------------------------------------------------------- PWA
        print("\n[8] PWA (Phase 12)")
        import json as _json
        manifest_resp = mobile.request.get(BASE + "/manifest.webmanifest")
        check("Manifest ist erreichbar (200)", lambda: (_ for _ in ()).throw(
            AssertionError(f"Status {manifest_resp.status}")) if manifest_resp.status != 200 else None)
        manifest = _json.loads(manifest_resp.text())
        check("Manifest: Name ist 'ARK Tribe Hub'",
              lambda: (_ for _ in ()).throw(AssertionError(manifest.get("name"))) if manifest.get("name") != "ARK Tribe Hub" else None)
        check("Manifest: start_url ist '/'",
              lambda: (_ for _ in ()).throw(AssertionError(manifest.get("start_url"))) if manifest.get("start_url") != "/" else None)
        check("Manifest: display ist 'standalone' (installierbar, keine Browserleiste)",
              lambda: (_ for _ in ()).throw(AssertionError(manifest.get("display"))) if manifest.get("display") != "standalone" else None)
        icon_sizes = {i.get("sizes") for i in manifest.get("icons", [])}
        check("Manifest: 192x192- und 512x512-Icon vorhanden",
              lambda: (_ for _ in ()).throw(AssertionError(str(icon_sizes))) if not {"192x192", "512x512"} <= icon_sizes else None)
        for icon in manifest.get("icons", []):
            r = mobile.request.get(BASE + icon["src"])
            check(f"Icon-Datei erreichbar: {icon['src']}",
                  lambda r=r: (_ for _ in ()).throw(AssertionError(f"Status {r.status}")) if r.status != 200 else None)

        sw_resp = mobile.request.get(BASE + "/sw.js")
        check("Service Worker ist erreichbar (200)",
              lambda: (_ for _ in ()).throw(AssertionError(f"Status {sw_resp.status}")) if sw_resp.status != 200 else None)
        sw_registered = mobile.evaluate("() => navigator.serviceWorker.getRegistration().then(r => !!r)")
        check("Service Worker ist im Browser registriert", lambda: (_ for _ in ()).throw(
            AssertionError("keine aktive Registrierung")) if not sw_registered else None)

        # ------------------------------------------------- Konsolenfehler pruefen
        real_errors = errors
        check("Keine JavaScript-Ausnahmen waehrend der gesamten Sitzung",
              lambda: (_ for _ in ()).throw(AssertionError("; ".join(real_errors[:3]))) if real_errors else None)

        browser.close()


# Eigener Server auf freiem Port mit frischer Datenbank in einem Temp-Ordner.
# So laeuft der Test unabhaengig von einer bereits laufenden Instanz und
# hinterlaesst keine Testdaten in der echten Datenbank.
tmp = tempfile.mkdtemp(prefix="ath-ui-")
env = {
    **os.environ,
    "PORT": str(PORT),
    "DB_PATH": os.path.join(tmp, "ui-test.db"),
    "UPLOAD_DIR": os.path.join(tmp, "uploads"),
    "RATE_LIMIT_GLOBAL_MAX": "100000",
    "RATE_LIMIT_AUTH_MAX": "100000",
}
server = subprocess.Popen(
    ["node", "--no-warnings", "src/server.js"],
    cwd=PROJECT, env=env,
    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
)

for _ in range(60):
    try:
        urllib.request.urlopen(BASE + "/api/health", timeout=1)
        break
    except Exception:
        time.sleep(0.25)
else:
    print("Server ist nicht gestartet:", server.stderr.read().decode()[:500])
    sys.exit(1)

try:
    run()
finally:
    server.terminate()
    server.wait(timeout=10)
    shutil.rmtree(tmp, ignore_errors=True)

print("\n" + "=" * 62)
ok = sum(1 for r in results if r[0])
print(f"UI-Tests: {ok}/{len(results)} bestanden")
for good, name, msg in results:
    if not good:
        print(f"  FEHLGESCHLAGEN: {name} -> {msg}")
sys.exit(0 if ok == len(results) else 1)
