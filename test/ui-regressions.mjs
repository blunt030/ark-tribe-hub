import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Passende Katalogbilder erscheinen auf Bestellungen und der neuen Startseite', async () => {
  const [dashboard, inventory, catalog, orders, ui, icons] = await Promise.all([
    read('public/js/views/dashboard.js'),
    read('public/js/views/inventory.js'),
    read('public/js/views/misc.js'),
    read('public/js/views/orders.js'),
    read('public/js/ui.js'),
    read('public/js/icons.js'),
  ]);

  // Startseite zeigt dieselben bebilderten Bestellkarten wie die Bestelluebersicht.
  assert.match(dashboard, /orderCard\(o, \(id\) => go\('\/orders\/' \+ id\), \{ illustrated: true/);
  assert.match(ui, /first \? itemArt\(first\) : null/);
  assert.match(icons, /rex_egg_dashboard\.webp/);
  // Eier und Embryos: das Tier gross, Ei bzw. Embryo als kleines Abzeichen.
  assert.match(icons, /if \(type === 'egg' \|\| type === 'embryo'\) return creatureOf\(item\) \|\| eggImage\(item\);/);
  assert.match(icons, /src === creature \? eggImage\(item\)/);
  assert.match(icons, /type === 'embryo'\) return '\/assets\/items\/cut\/embryo\.webp'/);
  assert.match(icons, /item-art-badge/);
  assert.doesNotMatch(inventory, /itemIcon|itemBild|iconFuerItem/);
  assert.doesNotMatch(catalog, /itemIcon|itemBild|iconFuerItem/);
  assert.match(orders, /showImages: true/);
  assert.doesNotMatch(orders, /itemIcon/);
  assert.match(ui, /showImages \? itemBild\(it, 36\)/);
});

test('der Desktop-Katalog nutzt den normalen Seiten-Scroll', async () => {
  const css = await read('public/css/app.css');
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*?\.picker-results\s*\{[\s\S]*?max-height: none;[\s\S]*?overflow-y: visible;/);
  assert.match(css, /\.main\s*\{[\s\S]*?overflow-y: auto;/);
});

test('Bestellmenü und Menge folgen dem vereinfachten Ablauf', async () => {
  const [orders, i18n] = await Promise.all([
    read('public/js/views/orders.js'),
    read('public/js/i18n.js'),
  ]);
  assert.match(orders, /order\.sub\.eggs/);
  assert.match(orders, /order\.sub\.embryos/);
  assert.doesNotMatch(orders, /order\.sub\.animals/);
  assert.match(orders, /types:\s*\['egg'\]/);
  assert.match(orders, /types:\s*\['embryo'\]/);
  assert.doesNotMatch(orders, /types:\s*\['creature'\]/);
  assert.match(orders, /selected\s*\?\s*qtyControl\(selected\.quantity/);
  assert.match(i18n, /"order\.sub\.eggs": "Eier"/);
  assert.match(i18n, /"order\.sub\.embryos": "Embryos"/);
});

test('die mobile Bestellung bleibt innerhalb des Viewports', async () => {
  const css = await read('public/css/app.css');
  assert.match(css, /@media \(max-width: 899px\)[\s\S]*?\.order-builder\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.order-builder\s*>\s*\*\s*\{\s*min-width:\s*0/);
});

test('Startseite und Navigation enthalten weder Schnellzugriff noch Bestand', async () => {
  const [dashboard, app, profile] = await Promise.all([
    read('public/js/views/dashboard.js'),
    read('public/js/app.js'),
    read('public/js/views/misc.js'),
  ]);
  assert.doesNotMatch(dashboard, /dash\.quick|dash\.activity/);
  assert.doesNotMatch(app, /renderInventory|\/inventory/);
  assert.doesNotMatch(profile, /\['\/inventory'/);
  assert.match(app, /nav\.animal_stats/);
});

test('Chat, Voice, Tribe-Login und AFK-Abmeldung sind verdrahtet', async () => {
  const [app, auth, chat, voice, dashboard, css, voiceRoute] = await Promise.all([
    read('public/js/app.js'),
    read('public/js/views/auth.js'),
    read('public/js/views/community.js'),
    read('public/js/views/voice.js'),
    read('public/js/views/dashboard.js'),
    read('public/css/app.css'),
    read('src/routes/voice.routes.js'),
  ]);
  assert.match(auth, /tribeSlug:/);
  assert.match(app, /30 \* 60 \* 1000/);
  assert.match(app, /signOut\(true\)/);
  assert.match(chat, /chat-message.*mine/);
  assert.match(chat, /section\.chat-window/);
  assert.match(dashboard, /card\.dashboard-chat-card/);
  assert.match(dashboard, /dashboard-chat-composer/);
  assert.match(dashboard, /sendChatMessage/);
  assert.match(dashboard, /is-urgent/);
  assert.match(css, /\.chat-window\s*\{[\s\S]*?border:\s*2px/);
  assert.match(css, /\.tile\.tile-urgent/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(voice, /getUserMedia/);
  assert.match(voice, /RTCPeerConnection/);
  assert.match(voice, /sendVoiceSignal/);
  assert.match(voice, /refreshRtcCredentials/);
  assert.match(voice, /unlockRemoteAudio/);
  assert.match(voice, /voice\.turn_ready/);
  assert.match(voiceRoute, /resolveVoiceIceConfig/);
});

test('Karten werden nie verzerrt und Marker bleiben an ihrer Position', async () => {
  const [css, servers] = await Promise.all([read('public/css/command-center.css'), read('public/js/views/servers.js')]);
  // Der Rahmen uebernimmt exakt das Seitenverhaeltnis der Bilddatei; Marker liegen prozentual darin.
  assert.match(servers, /--map-ar', `\$\{img\.naturalWidth\} \/ \$\{img\.naturalHeight\}`/);
  assert.match(css, /\.map-frame \{[^}]*aspect-ratio: var\(--map-ar, 1 \/ 1\);[^}]*width: min\(100%, calc\(var\(--stage-h, 420px\) \* var\(--map-r, 1\)\)\);[^}]*height: auto;/);
  assert.match(css, /\.map-image \{[^}]*width: 100%; height: 100%;/);
  assert.match(servers, /left:\$\{clampPct\(m\.coord_x\)\}%;top:\$\{clampPct\(m\.coord_y\)\}%/);
});

test('Profil bearbeitet das Profil an genau einer Stelle', async () => {
  const profile = await read('public/js/views/misc.js');
  assert.equal((profile.match(/profileSection\(t\('profile\.settings'\), 'user', editPanel/g) || []).length, 1);
});

test('vorhandene Katalogbilder sind transparente PNGs und werden nicht beschnitten', async () => {
  const [icons, css] = await Promise.all([
    read('public/js/icons.js'),
    read('public/css/app.css'),
  ]);
  // Zugeschnittene WebP-Fassungen, Original-PNG als Rueckfallebene.
  assert.match(icons, /return `\/assets\/items\/cut\/\$\{key\}\.webp`/);
  assert.match(icons, /replace\('\/assets\/items\/cut\/', '\/assets\/'\)\.replace\('\.webp', '\.png'\)/);
  assert.match(icons, /item\.key \|\| item\.item_key/);
  assert.doesNotMatch(icons, /createElementNS|<svg|innerHTML/);
  assert.doesNotMatch(icons, /object-fit:cover/);
  assert.match(css, /\.catalog-image[\s\S]*?object-fit: contain;[\s\S]*?object-position: center;/);
  assert.match(css, /\.icon-box\s*\{[\s\S]*?background: transparent;/);
});

test('Bestellbereiche und Mitteilungen sind visuell klar begrenzt', async () => {
  const [orders, notifications, css, theme] = await Promise.all([
    read('public/js/views/orders.js'),
    read('public/js/views/misc.js'),
    read('public/css/app.css'),
    read('public/css/command-center.css'),
  ]);
  // Kategorie-Kacheln mit Bild statt langer Textliste; Hinweise je Gruppe bleiben.
  assert.match(orders, /const CATEGORY_TILES = \[/);
  assert.match(orders, /categoryTile\(tile/);
  assert.match(orders, /order\.group\.structures_hint/);
  assert.match(orders, /order\.group\.saddles_hint/);
  assert.match(orders, /div\.picker-grid/);
  assert.match(theme, /\.cat-tile\.on \{/);
  assert.match(notifications, /mount\.classList\.add\('notifications-page'\)/);
  // Benachrichtigungsarten als Schalter; Mitteilungen so breit wie alle anderen Seiten.
  assert.match(notifications, /const prefPanel = el\('div\.pref-list'/);
  assert.match(notifications, /el\('span\.switch', \{\}, box/);
  assert.match(theme, /\.ark-theme \.notifications-page \{ max-width: none; \}/);
  assert.doesNotMatch(css, /\.notifications-page \{ max-width: 920px;/);
});

test('rechtliche Seiten sind vor und nach der Anmeldung erreichbar', async () => {
  const [auth, app, index, imprint, privacy, terms, server] = await Promise.all([
    read('public/js/views/auth.js'),
    read('public/js/app.js'),
    read('public/index.html'),
    read('public/impressum.html'),
    read('public/datenschutz.html'),
    read('public/nutzungsbedingungen.html'),
    read('src/server.js'),
  ]);
  for (const source of [auth, app]) {
    assert.match(source, /\/impressum\.html/);
    assert.match(source, /\/datenschutz\.html/);
    assert.match(source, /\/nutzungsbedingungen\.html/);
  }
  assert.match(imprint, /§ 5 DDG/);
  assert.match(privacy, /Art\. 13 DSGVO/);
  assert.match(privacy, /atb_session/);
  assert.match(privacy, /Render Services/);
  assert.match(privacy, /Brevo/);
  assert.match(terms, /Zulässige Inhalte/);
  assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(server, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test('gemeldete Fehler 27.09.: Navigation, Zaehler, Fortschritt und Datumsformat', async () => {
  const [app, ui, dashboard, i18n, community, tasks] = await Promise.all([
    read('public/js/app.js'),
    read('public/js/ui.js'),
    read('public/js/views/dashboard.js'),
    read('public/js/i18n.js'),
    read('public/js/views/community.js'),
    read('public/js/views/tasks.js'),
  ]);
  // 1. Kein zweites Emblem mehr, das untere Menuepunkte ueberdeckt.
  assert.doesNotMatch(app, /sidebar-tribe-mark/);
  // 2. Genau ein aktiver Menuepunkt: laengster passender Pfad gewinnt.
  assert.match(app, /sort\(\(a, b\) => b\.length - a\.length\)\[0\]/);
  // 3. "Meine Aufgaben" zaehlt ueberall dieselbe Menge.
  assert.match(dashboard, /const myTasks = openTasks\.filter\(\(task\) => Number\(task\.assignee_id\) === Number\(user\.id\)\)/);
  assert.match(dashboard, /metric\('duo-check-square', myTasks\.length, t\('dash\.my_tasks'\)/);
  // 4. Fortschritt in Stueck statt Positionen.
  assert.match(ui, /const total = items\.reduce\(\(sum, it\) => sum \+ \(Number\(it\.quantity\) \|\| 0\), 0\)/);
  // 5. Lokalisierte Datumswerte ohne Sekunden.
  assert.match(i18n, /export function fmtDate\(value\)/);
  assert.match(i18n, /toLocaleTimeString\(LOCALES\[current\], \{ hour: '2-digit', minute: '2-digit' \}\)/);
  assert.match(community, /fmtStamp\(m\.created_at\)/);
  assert.match(tasks, /fmtDate\(task\.due_date\)/);
  assert.doesNotMatch(tasks, /t\('task\.due'\) \+ ' ' \+ tk\.due_date/);
});

test('Dino-Tamagotchi ist in Menü, Router, Startseite und App-Hülle eingebunden', async () => {
  const [app, index, sw, dashboard, css, view] = await Promise.all([
    read('public/js/app.js'),
    read('public/index.html'),
    read('public/sw.js'),
    read('public/js/views/dashboard.js'),
    read('public/css/tamagotchi.css'),
    read('public/js/views/tamagotchi.js'),
  ]);
  assert.match(app, /path: '\/tamagotchi', icon: 'egg-crack', label: t\('nav\.tamagotchi'\), badge: \(\) => petCalls\(\)/);
  assert.match(app, /re: \/\^\\\/tamagotchi\(\?:\\\/\(shop\|awards\|dossier\|hall\|tribe\)\)\?\$\//);
  assert.match(app, /import\('\.\/views\/tamagotchi\.js'\)/);
  assert.match(app, /resetPet\(\)/);
  assert.match(index, /\/css\/tamagotchi\.css/);
  assert.match(sw, /'\/css\/tamagotchi\.css'/);
  assert.match(sw, /'\/js\/tamagotchi\/store\.js'/);
  assert.match(sw, /'\/js\/tamagotchi\/engine\.js'/);
  // store.js lädt die Fortschrittslogik mit – sie gehört in die App-Hülle
  assert.match(sw, /'\/js\/tamagotchi\/progress\.js'/);
  assert.match(sw, /'\/js\/tamagotchi\/catalog\.js'/);
  assert.match(dashboard, /import\('\.\.\/tamagotchi\/widget\.js'\)/);
  assert.match(view, /x\.key !== 'tribe' \|\| user\.tribeId/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.tama-screen\.is-retro \.tama-lcd \{ filter: url\(#tama-lcd-filter\); \}/);
  // store.js holt die Einstellungen des Betreibers (roster.js) – samt Abhängigkeiten in der App-Hülle
  for (const mod of ['roster', 'artwork', 'access', 'species']) assert.match(sw, new RegExp(`'/js/tamagotchi/${mod}\\.js'`));
});

test('Tamagotchi-Verwaltung: nur Developer, eigener Menüpunkt und Route', async () => {
  const [app, admin, i18n] = await Promise.all([read('public/js/app.js'), read('public/js/views/tamagotchi-admin.js'), read('public/js/i18n.js')]);
  assert.match(app, /if \(isDev\) \{[\s\S]*path: '\/tamagotchi-admin', icon: 'sliders-horizontal', label: t\('nav\.tamagotchi_admin'\)/);
  assert.match(app, /re: \/\^\\\/tamagotchi-admin/);
  assert.match(app, /context\.user\.roles\.includes\('developer'\)/);
  assert.match(app, /import\('\.\/views\/tamagotchi-admin\.js'\)/);
  for (const tab of ['overview', 'species', 'sale', 'game', 'gifts', 'players']) assert.match(admin, new RegExp(`'${tab}'`));
  for (const lang of ['de', 'en', 'fr', 'es']) assert.match(i18n, new RegExp(`STRINGS\\.${lang}, \\{ 'nav\\.tamagotchi': [^}]*'nav\\.tamagotchi_admin'`));
  // Vorschau eines Uploads als data:-Adresse (blob: ist per CSP gesperrt)
  assert.doesNotMatch(admin, /createObjectURL/);
});

test('AGB, Widerrufsbelehrung und Kaufbestätigung für kostenpflichtige Freischaltungen', async () => {
  const [agb, widerruf, imprint, privacy, terms, details, legalJs, buy, shop, texts] = await Promise.all([
    read('public/agb.html'), read('public/widerruf.html'), read('public/impressum.html'), read('public/datenschutz.html'),
    read('public/nutzungsbedingungen.html'), read('public/js/legal-details.js'), read('public/js/legal.js'),
    read('public/js/tamagotchi/buy.js'), read('src/services/petShopService.js'), read('public/js/tamagotchi/texts-shop.js'),
  ]);
  assert.match(agb, /Kein Umtausch und keine Rückgabe/);
  assert.match(agb, /§§ 327 ff\. BGB/, 'gesetzliche Mängelrechte bleiben');
  assert.match(agb, /data-legal-vat/);
  assert.match(widerruf, /Muster-Widerrufsformular/);
  assert.match(widerruf, /§ 356 Abs\. 5 BGB/);
  for (const page of [agb, widerruf, imprint, privacy, terms]) {
    assert.match(page, /\/js\/legal\.js/);
    assert.match(page, /data-legal-warning/);
  }
  for (const page of [imprint, privacy, terms]) {
    assert.match(page, /href="\/agb\.html"/);
    assert.match(page, /href="\/widerruf\.html"/);
  }
  assert.match(privacy, /PayPal \(Europe\)/);
  assert.match(privacy, /Kaufbestätigung/);
  assert.match(legalJs, /from '\.\/legal-details\.js'/);
  assert.match(details, /smallBusiness: (true|false)/);
  assert.match(buy, /tama\.buy\.vat_small/);
  for (const key of ['tama.buy.vat_small', 'tama.buy.vat_incl']) assert.equal(texts.split(`'${key}'`).length - 1, 4, key);
  assert.match(shop, /sendPurchaseConfirmation\(db, session\)/);
});
