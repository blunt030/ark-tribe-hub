import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Katalogbilder bleiben auf den Bestellablauf begrenzt', async () => {
  const [dashboard, inventory, catalog, orders, ui] = await Promise.all([
    read('public/js/views/dashboard.js'),
    read('public/js/views/inventory.js'),
    read('public/js/views/misc.js'),
    read('public/js/views/orders.js'),
    read('public/js/ui.js'),
  ]);

  assert.doesNotMatch(dashboard, /itemIcon|itemBild|iconFuerItem/);
  assert.doesNotMatch(inventory, /itemIcon|itemBild|iconFuerItem/);
  assert.doesNotMatch(catalog, /itemIcon|itemBild|iconFuerItem/);
  assert.match(orders, /showImages: true/);
  assert.match(ui, /showImages \? itemBild\(it, 36\)/);
});

test('der Desktop-Katalog nutzt den normalen Seiten-Scroll', async () => {
  const css = await read('public/css/app.css');
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*?\.picker-results\s*\{[\s\S]*?max-height: none;[\s\S]*?overflow-y: visible;/);
});

test('Profil bearbeitet das Profil an genau einer Stelle', async () => {
  const profile = await read('public/js/views/misc.js');
  assert.equal((profile.match(/linkRow\(t\('profile\.edit'\), editPanel/g) || []).length, 1);
});

test('vorhandene Katalogbilder sind transparente PNGs und werden nicht beschnitten', async () => {
  const [icons, css] = await Promise.all([
    read('public/js/icons.js'),
    read('public/css/app.css'),
  ]);
  assert.match(icons, /return `\/assets\/\$\{key\}\.png`/);
  assert.doesNotMatch(icons, /object-fit:cover/);
  assert.match(css, /\.catalog-image[\s\S]*?object-fit: contain;[\s\S]*?object-position: center;/);
  assert.match(css, /\.icon-box\s*\{[\s\S]*?background: transparent;/);
});

test('Bestellbereiche und Mitteilungen sind visuell klar begrenzt', async () => {
  const [orders, notifications, css] = await Promise.all([
    read('public/js/views/orders.js'),
    read('public/js/views/misc.js'),
    read('public/css/app.css'),
  ]);
  assert.match(orders, /acc\.order-groups/);
  assert.match(orders, /order\.group\.structures_hint/);
  assert.match(orders, /order\.group\.saddles_hint/);
  assert.match(css, /\.order-groups \.acc-group\[data-group="creatures"\]/);
  assert.match(css, /\.order-groups \.acc-group\[data-group="structures"\]/);
  assert.match(notifications, /mount\.classList\.add\('notifications-page'\)/);
  assert.match(css, /\.notifications-page \{ max-width: 920px;/);
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
