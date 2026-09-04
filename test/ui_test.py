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
SHOTS = "/home/claude/shots"

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
    page.wait_for_selector(".content", timeout=8000)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        errors = []

        # Deutsche Browsersprache: die App uebernimmt sie automatisch beim ersten
        # Start, ohne dass etwas eingestellt werden muss.
        desktop = browser.new_context(locale="de-DE", viewport={"width": 1440, "height": 950})
        page = desktop.new_page()
        page.on("console", lambda m: errors.append("console: " + m.text)
                if m.type == "error" and "Failed to load resource" not in m.text else None)
        page.on("pageerror", lambda e: errors.append("exception: " + str(e)))

        # ---------------------------------------------------------------- Login
        print("\n[1] Anmeldung und Grundgeruest")
        page.goto(BASE, wait_until="networkidle")
        check("Loginseite zeigt Logo und Titel",
              lambda: expect(page.locator(".auth-logo h1")).to_have_text("ARK Tribe Hub"))
        check("Sprache folgt automatisch der Browsereinstellung (Deutsch)",
              lambda: expect(page.locator('button[type="submit"]')).to_have_text("Anmelden"))
        page.screenshot(path=f"{SHOTS}/01-login.png")

        page.fill("#f-id", "Blunt OaO")
        page.fill("#f-pw", PW)
        page.get_by_role("button", name="Anmelden").click()
        page.wait_for_selector(".content", timeout=8000)

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
        page.wait_for_selector(".pick", timeout=5000)
        check("Item-Suche liefert Treffer aus dem echten Katalog",
              lambda: expect(page.locator(".pick").first).to_be_visible())
        page.locator(".pick").first.click()

        page.fill("#item-search", "Rex Saddle")
        page.wait_for_selector(".pick", timeout=5000)
        page.locator(".pick").first.click()

        check("Zwei Positionen uebernommen",
              lambda: expect(page.locator(".list .row")).to_have_count(2))

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
        page.wait_for_url(re.compile(r"#/orders/\d+"), timeout=8000)
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
        page.wait_for_selector(".comment", timeout=5000)
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
        page.wait_for_selector(".auth-wrap", timeout=5000)
        page.fill("#f-id", "Blunt OaO")
        page.fill("#f-pw", PW)
        page.get_by_role("button", name="Anmelden").click()
        page.wait_for_selector(".content", timeout=8000)
        page.goto(f"{BASE}/#/orders/{order_id}", wait_until="networkidle")
        check("Nach Logout+Login: dieselbe Bestellung weiterhin abrufbar",
              lambda: expect(page.locator(".notice.note").first).to_contain_text("Abendraid"))

        # --------------------------------------------------------- Breeder-Sicht
        print("\n[4] Breeder uebernimmt und arbeitet ab")
        sign_in(page, "OaO Breeder")
        check("Breeder-Dashboard zeigt offene Auftraege",
              lambda: expect(page.locator(".section-title").first).to_contain_text("Offene Aufträge"))
        check("Bestellkarte des Members ist sichtbar",
              lambda: expect(page.locator(".order-card").first).to_contain_text("Blunt OaO"))
        page.screenshot(path=f"{SHOTS}/05-dashboard-breeder.png", full_page=True)

        page.goto(f"{BASE}/#/orders/{order_id}", wait_until="networkidle")
        page.get_by_role("button", name="Übernehmen").click()
        page.wait_for_selector(".toast", timeout=5000)
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
        page.wait_for_selector(".row", timeout=5000)
        check("Mitgliederliste laedt",
              lambda: expect(page.locator(".row").first).to_be_visible())
        page.screenshot(path=f"{SHOTS}/08-admin-mitglieder.png", full_page=True)

        page.goto(BASE + "/#/audit", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=5000)
        check("Protokoll zeigt Eintraege",
              lambda: expect(page.locator(".row").first).to_be_visible())

        # --------------------------------------------------------- Developer
        print("\n[6] Developer-Bereich")
        sign_in(page, "Blunt")
        check("Developer sieht Plattform-Navigation",
              lambda: expect(page.locator('.sidebar [data-path="/tribes"]')).to_have_count(1))
        check("Developer sieht Benutzer- und Katalogverwaltung",
              lambda: expect(page.locator('.sidebar [data-path="/users"]')).to_have_count(1))
        page.goto(BASE + "/#/catalog", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=8000)
        check("Katalog meldet die volle Anzahl Eintraege",
              lambda: expect(page.locator(".page-head p")).to_contain_text("386"))
        page.screenshot(path=f"{SHOTS}/09-developer-katalog.png", full_page=True)

        page.goto(BASE + "/#/tribes", wait_until="networkidle")
        page.wait_for_selector(".row", timeout=5000)
        check("Tribe-Liste ist sichtbar (inkl. OaO)",
              lambda: expect(page.locator(".row", has_text="OaO")).to_have_count(1))

        # -------------------------------------------------------- Sprachwechsel
        print("\n[7] Sprache und Mobilansicht")
        page.goto(BASE + "/#/", wait_until="networkidle")
        page.locator('.sidebar button[title="English"]').click()
        page.wait_for_selector(".content", timeout=8000)
        check("Oberflaeche wechselt auf Englisch",
              lambda: expect(page.locator('[data-path="/orders"]').first).to_contain_text("Orders"))
        page.screenshot(path=f"{SHOTS}/10-englisch.png", full_page=True)
        page.locator('.sidebar button[title="Deutsch"]').click()
        page.wait_for_selector(".content", timeout=8000)

        # ------------------------------------------------------------- Mobil
        mobile_ctx = browser.new_context(
            locale="de-DE", viewport={"width": 390, "height": 844},
            is_mobile=True, has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
                       "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        )
        mobile = mobile_ctx.new_page()
        mobile.goto(BASE, wait_until="networkidle")
        mobile.fill("#f-id", "Blunt OaO")
        mobile.fill("#f-pw", PW)
        mobile.get_by_role("button", name="Anmelden").click()
        mobile.wait_for_selector(".content", timeout=8000)

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

        mobile.locator('.bottomnav [data-path="/orders"]').click()
        mobile.wait_for_timeout(800)
        check("Mobil: Bestellliste erreichbar",
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
