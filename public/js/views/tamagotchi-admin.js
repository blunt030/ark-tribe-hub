/**
 * Tamagotchi-Verwaltung (nur Developer): alles, was der Betreiber einstellen
 * kann – Übersicht, Tiere (gratis, freischaltbar, aus; Preise; Bilder),
 * Verkauf über Stripe, Spiel & Events, Geschenke und Spieler.
 */
import { el, toast, confirmDialog, fileToBase64, spinner } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { api } from '../api.js';
import '../tamagotchi/texts.js';
import '../tamagotchi/texts-play.js';
import '../tamagotchi/texts-shop.js';
import '../tamagotchi/texts-admin.js';
import { SPECIES } from '../tamagotchi/species.js';
import { BUNDLED, SIZE_KEYS, widthOf, motionOf } from '../tamagotchi/artwork.js';
import { ITEMS, EVENTS, WEEKEND_EVENT } from '../tamagotchi/catalog.js';
import { setArtOverrides, artFor, formatPrice } from '../tamagotchi/roster.js';
import { creatureThumb, itemImg, svg } from '../tamagotchi/common.js';
import { icon } from '../tamagotchi/scene.js';
import { landscape } from '../tamagotchi/real.js';
import { sheet } from '../tamagotchi/sheet.js';

const TABS = ['overview', 'species', 'sale', 'game', 'gifts', 'players'];
const TAB_ICON = { overview: 'status', species: 'star', sale: 'bag', game: 'sparkle', gifts: 'gift', players: 'cuddle' };
const LOCALES = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES' };
const MULTS = [1, 1.5, 2, 3];
const BY_KEY = new Map(SPECIES.map((s) => [s.key, s]));

const euro = (cents) => formatPrice(cents, getLang());
const locale = () => LOCALES[getLang()] || 'de-DE';
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '–');
const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString(locale()) : '–');
const toCents = (v) => Math.round(Number(String(v).replace(',', '.')) * 100);
const fromCents = (c) => (c / 100).toFixed(2).replace('.', getLang() === 'en' ? '.' : ',');
const multText = (m) => Object.entries(m).filter(([, v]) => v > 1).map(([k, v]) => `${t('tama.mult.' + k)} ×${String(v).replace('.', ',')}`).join(' · ');

/** Kleine Kennzahl-Kachel im Stil der App. */
const stat = (n, label, accent = '') => el('div.stat' + (accent ? '.accent-' + accent : ''), {}, el('span.n', { text: String(n) }), el('span.l', { text: label }));

/** Ja/Nein-Zeile mit Häkchen oder Kreuz. */
function checkRow(ok, label, detail = '') {
  return el('li.tadm-check' + (ok ? '.is-ok' : '.is-missing'), {}, el('span.tadm-check-ico', { text: ok ? '✓' : '✗' }), el('span', {}, el('strong', { text: label }), detail ? el('small', { text: detail }) : null));
}

function section(title, ...children) {
  return el('section.card.tadm-card', {}, el('h2.tadm-title', { text: title }), ...children);
}

/* -------------------------------------------------------------------------- */
/* Bild vermessen (Upload)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Vermisst ein Tierbild im Browser: Maße, Umriss (Alphakanal), Fußlinie und ein
 * Vorschlag für Blickrichtung, Kopf und Maul (höchster Punkt bzw. vorderste
 * Stelle auf der Kopfseite). Alles lässt sich im Editor korrigieren.
 */
async function analyzeImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = img.naturalWidth, h = img.naturalHeight;
  const k = Math.min(1, 360 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, cw, ch);
  const data = g.getImageData(0, 0, cw, ch).data;
  const top = new Array(cw).fill(-1), bot = new Array(cw).fill(-1);
  let x0 = cw, y0 = ch, x1 = -1, y1 = -1, clear = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (top[x] < 0) top[x] = y;
        bot[x] = y;
      } else clear += 1;
    }
  }
  const transparent = clear > cw * ch * 0.03;
  if (x1 < 0) return { w, h, face: 1, head: [0.8, 0.1], mouth: [0.9, 0.3], base: 0.96, size: 'l', transparent };
  const bw = x1 - x0;
  const highest = (from, to) => { let best = [-1, ch]; for (let x = from; x <= to; x++) if (top[x] >= 0 && top[x] < best[1]) best = [x, top[x]]; return best; };
  const left = highest(x0, x0 + Math.round(bw * 0.25));
  const right = highest(x1 - Math.round(bw * 0.25), x1);
  const face = right[1] <= left[1] ? 1 : -1;
  const head = face === 1 ? right : left;
  let mouth = null;
  for (let i = 0; i <= bw * 0.12 && !mouth; i++) {
    const x = face === 1 ? x1 - i : x0 + i;
    if (top[x] >= 0) mouth = [x, Math.round((top[x] + bot[x]) / 2)];
  }
  mouth ||= head;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    w, h, face,
    head: [r3(head[0] / cw), r3(head[1] / ch)],
    mouth: [r3(mouth[0] / cw), r3(mouth[1] / ch)],
    base: r3(Math.min(1, (y1 + 1) / ch)),
    size: 'l',
    transparent,
  };
}

/* -------------------------------------------------------------------------- */
/* Seite                                                                          */
/* -------------------------------------------------------------------------- */

export async function renderTamagotchiAdmin(mount, ctx, tabKey) {
  const tab = TABS.includes(tabKey) ? tabKey : 'overview';
  mount.classList.add('tadm-page');
  mount.replaceChildren(spinner());
  let state = await api.petAdmin();
  setArtOverrides(state.art);

  const body = el('div.tadm-body');
  const nav = el('nav.tadm-tabs', { 'aria-label': t('tadm.title') }, TABS.map((k) => el('a.tadm-tab' + (k === tab ? '.is-on' : ''), {
    href: '#/tamagotchi-admin' + (k === 'overview' ? '' : '/' + k), 'aria-current': k === tab ? 'page' : null,
  }, svg(icon(TAB_ICON[k])), el('span', { text: t('tadm.tab.' + k) }))));
  mount.replaceChildren(
    el('div.page-head', {}, el('div', {},
      el('h1', { text: t('tadm.title') }),
      el('p', { text: t('tadm.sub') })),
      el('a.btn', { href: '#/tamagotchi' }, t('tadm.open_game'))),
    nav,
    body);

  async function saveSettings(patch, okText = t('tadm.saved')) {
    try {
      state = await api.petAdminSettings(patch);
      setArtOverrides(state.art);
      toast(okText);
      return true;
    } catch (err) {
      toast(err.message, 'err');
      return false;
    }
  }

  const views = { overview, species, sale, game, gifts, players };
  await views[tab]();

  /* ------------------------------ Übersicht ------------------------------- */

  async function overview() {
    body.replaceChildren(spinner());
    const { overview: o, stripe } = await api.petAdminOverview();
    const s = state.settings;
    const open = s.sale.enabled && state.saleMissing.length === 0;
    const top = el('ol.tadm-top', {}, o.top.length ? o.top.map((x) => {
      const sp = BY_KEY.get(x.species);
      return el('li', {}, sp ? creatureThumb(sp, { stage: 'adult' }) : null, el('strong', { text: x.name }), el('span', { text: String(x.count) }));
    }) : el('li.tadm-muted', { text: t('tadm.none') }));
    body.replaceChildren(
      el('div.grid.stats.tadm-stats', {},
        stat(o.players, t('tadm.kpi.players')),
        stat(o.active1, t('tadm.kpi.active1'), 'green'),
        stat(o.active7, t('tadm.kpi.active7')),
        stat(o.alive, t('tadm.kpi.alive')),
        stat(o.eggs, t('tadm.kpi.eggs')),
        stat(o.raised, t('tadm.kpi.raised')),
        stat(o.sales.count, t('tadm.kpi.sales'), 'gold'),
        stat(euro(o.sales.cents), t('tadm.kpi.revenue'), 'gold'),
        stat(euro(o.sales.monthCents), t('tadm.kpi.month')),
        stat(o.unlocks, t('tadm.kpi.unlocks')),
        stat(o.giftsClaimed, t('tadm.kpi.gifts')),
        stat(o.sales.refunds, t('tadm.kpi.refunds'), o.sales.refunds ? 'red' : '')),
      el('div.tadm-cols', {},
        section(t('tadm.top'), top),
        section(t('tadm.status'),
          el('ul.tadm-checks', {},
            checkRow(true, t('tadm.check.free', { n: s.roster.free.length })),
            checkRow(stripe.configured, t('tadm.check.key'), stripe.configured ? t('tadm.mode.' + stripe.mode) : t('tadm.check.key_hint')),
            checkRow(stripe.webhook, t('tadm.check.webhook'), stripe.last ? t('tadm.check.last', { at: dateTime(stripe.last.at), type: stripe.last.type }) : t('tadm.check.webhook_hint')),
            checkRow(Boolean(s.sale.terms && s.sale.withdrawal), t('tadm.check.legal')),
            checkRow(open, open ? t('tadm.check.sale_on') : t('tadm.check.sale_off'))),
          el('div.tadm-actions', {}, el('a.btn.sm', { href: '#/tamagotchi-admin/sale' }, t('tadm.to_sale'))))),
      section(t('tadm.start.title'), el('ol.tadm-steps', {}, ['1', '2', '3', '4', '5'].map((n) => el('li', { text: t('tadm.start.' + n) })))));
  }

  /* -------------------------------- Tiere --------------------------------- */

  async function species() {
    const s = state.settings;
    let filter = 'all', query = '';
    const withArt = () => new Set([...Object.keys(BUNDLED), ...Object.keys(state.art).filter((k) => state.art[k].img)]);
    const statusOf = (key) => {
      if (!withArt().has(key)) return 'noart';
      if (s.roster.off.includes(key)) return 'off';
      return s.roster.free.includes(key) ? 'free' : 'buy';
    };

    async function setStatus(key, status) {
      const free = new Set(s.roster.free), off = new Set(s.roster.off);
      free.delete(key); off.delete(key);
      if (status === 'free') free.add(key);
      if (status === 'off') off.add(key);
      if (await saveSettings({ roster: { free: [...free], off: [...off] } })) { s.roster = state.settings.roster; draw(); }
    }

    async function setPrice(key, value) {
      const prices = { ...s.roster.prices };
      if (value === '' || value === null) delete prices[key];
      else {
        const cents = toCents(value);
        if (!Number.isInteger(cents) || cents < 50 || cents > 100000) { toast(t('tadm.price_range'), 'err'); draw(); return; }
        prices[key] = cents;
      }
      if (await saveSettings({ roster: { prices } })) { s.roster = state.settings.roster; draw(); }
    }

    async function preset(kind) {
      const arts = [...withArt()];
      const free = kind === 'default' ? state.defaults.free : kind === 'all' ? arts : [];
      if (!(await confirmDialog({ title: t('tadm.preset.' + kind), body: t('tadm.preset_confirm', { n: free.length }), confirmLabel: t('tadm.apply') }))) return;
      if (await saveSettings({ roster: { free } })) { s.roster = state.settings.roster; draw(); }
    }

    const counts = el('div.tadm-counts');
    const grid = el('div.tadm-species');
    const search = el('input', { type: 'search', placeholder: t('tadm.search_species'), oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); } });
    const filters = ['all', 'free', 'buy', 'off', 'noart'];
    const chips = el('div.seg.tadm-seg', {}, filters.map((f) => el('button' + (f === filter ? '.on' : ''), { type: 'button', onclick: (e) => { filter = f; chips.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); draw(); } }, t('tadm.filter.' + f))));

    function card(sp) {
      const st = statusOf(sp.key);
      const custom = state.art[sp.key];
      const seg = st === 'noart' ? null : el('div.seg.tadm-status', {}, ['free', 'buy', 'off'].map((k) => el('button' + (st === k ? '.on' : ''), { type: 'button', onclick: () => st !== k && setStatus(sp.key, k) }, t('tadm.status.' + k))));
      const price = st === 'buy' ? el('label.tadm-price', {},
        el('span', { text: '€' }),
        el('input', { type: 'text', inputmode: 'decimal', value: s.roster.prices[sp.key] ? fromCents(s.roster.prices[sp.key]) : '', placeholder: fromCents(s.sale.price), 'aria-label': t('tadm.price_for', { name: sp.name }), onchange: (e) => setPrice(sp.key, e.target.value.trim()) })) : null;
      return el('article.tadm-sp.is-' + st, {},
        el('button.tadm-sp-art', { type: 'button', title: t('tadm.art.edit'), onclick: () => artEditor(sp, () => draw()) },
          creatureThumb(sp, { stage: 'adult', alt: sp.name, drawn: st === 'noart' }),
          custom?.img ? el('span.tadm-tag', { text: t('tadm.art.custom') }) : null),
        el('div.tadm-sp-copy', {},
          el('strong', { text: sp.name }),
          el('small', { text: `${t('tama.hab.' + sp.hab)} · ${t('tama.birth.' + sp.birth)}` })),
        st === 'noart'
          ? el('button.btn.sm', { type: 'button', onclick: () => artEditor(sp, () => draw()) }, t('tadm.art.upload'))
          : seg,
        price);
    }

    function draw() {
      const arts = withArt();
      const n = { free: 0, buy: 0, off: 0 };
      for (const k of arts) n[statusOf(k)] += 1;
      counts.replaceChildren(...[
        el('span', { text: t('tadm.counts', { art: arts.size, free: n.free, buy: n.buy, off: n.off }) }),
        n.free !== 20 ? el('span.tadm-warn', { text: t('tadm.counts_hint', { n: n.free }) }) : null].filter(Boolean));
      const list = SPECIES.filter((sp) => (filter === 'all' ? statusOf(sp.key) !== 'noart' || query : statusOf(sp.key) === filter) && (!query || sp.name.toLowerCase().includes(query)));
      list.sort((a, b) => (statusOf(a.key) === 'noart') - (statusOf(b.key) === 'noart') || a.name.localeCompare(b.name));
      grid.replaceChildren(...(list.length ? list.map(card) : [el('p.tadm-muted', { text: t('tadm.none') })]));
    }

    body.replaceChildren(
      section(t('tadm.species.title'),
        el('p.tadm-lead', { text: t('tadm.species.lead') }),
        counts,
        el('div.tadm-toolbar', {}, search, chips),
        el('div.tadm-actions', {},
          el('button.btn.sm', { type: 'button', onclick: () => preset('default') }, t('tadm.preset.default')),
          el('button.btn.sm', { type: 'button', onclick: () => preset('all') }, t('tadm.preset.all')),
          el('button.btn.sm', { type: 'button', onclick: () => preset('none') }, t('tadm.preset.none'))),
        el('p.hint', { text: t('tadm.species.hint', { price: euro(s.sale.price) }) })),
      grid);
    draw();
  }

  /** Bild-Editor: hochladen, Blickrichtung, Größe, Kopf und Maul festlegen, Vorschau. */
  function artEditor(sp, onDone) {
    const current = artFor(sp.key);
    let meta = current ? { w: current.w, h: current.h, face: current.face, head: [...current.head], mouth: [...current.mouth], base: current.base ?? 0.96, size: current.size || 'l' } : null;
    let src = current?.src || null;
    let file = null, mode = 'head', dlg = null;
    const custom = state.art[sp.key];

    const stage = el('div.tadm-art-stage');
    const preview = el('div.tadm-lcd');
    const fileInput = el('input', { type: 'file', accept: 'image/png,image/webp,image/jpeg', hidden: true, onchange: async () => {
      const f = fileInput.files[0];
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) { toast(t('tadm.art.too_big'), 'err'); return; }
      file = f;
      // Vorschau als data:-Adresse (blob: ist durch die Content-Security-Policy gesperrt)
      src = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(f); });
      const m = await analyzeImage(src).catch(() => null);
      if (!m) { toast(t('tadm.art.bad_image'), 'err'); return; }
      meta = { w: m.w, h: m.h, face: m.face, head: m.head, mouth: m.mouth, base: m.base, size: meta?.size || m.size };
      warn.textContent = m.transparent ? '' : t('tadm.art.no_alpha');
      draw();
    } });
    const warn = el('p.tadm-warn');

    const faceSeg = el('div.seg', {}, [[-1, 'left'], [1, 'right']].map(([v, k]) => el('button', { type: 'button', dataset: { v: String(v) }, onclick: () => { if (!meta) return; meta.face = v; draw(); } }, t('tadm.art.face_' + k))));
    const sizeSeg = el('div.seg', {}, SIZE_KEYS.map((k) => el('button', { type: 'button', dataset: { v: k }, onclick: () => { if (!meta) return; meta.size = k; draw(); } }, t('tadm.art.size_' + k))));
    const modeSeg = el('div.seg', {}, ['head', 'mouth', 'base'].map((k) => el('button', { type: 'button', dataset: { v: k }, onclick: () => { mode = k; draw(); } }, t('tadm.art.set_' + k))));

    function pick(e) {
      if (!meta) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const r3 = (v) => Math.round(v * 1000) / 1000;
      if (mode === 'base') meta.base = r3(y);
      else meta[mode] = [r3(x), r3(y)];
      draw();
    }

    function marker(cls, [x, y], label) {
      return el('span.tadm-mark.is-' + cls, { style: `left:${x * 100}%;top:${y * 100}%`, title: label });
    }

    function drawPreview() {
      if (!meta || !src) { preview.replaceChildren(el('p.tadm-muted', { text: t('tadm.art.none') })); return; }
      const land = landscape(sp, 'day', { style: 'map' });
      const width = widthOf(meta, 'adult');
      const hgt = width * 4 / 3 / (meta.w / meta.h);
      const motion = motionOf(sp);
      const bottom = motion === 'fly' ? 24 : motion === 'swim' ? 18 - hgt * 0.3 : 4 - (1 - meta.base) * hgt;
      const flip = meta.face === -1 ? 'transform:scaleX(-1)' : '';
      const head = meta.face === -1 ? [1 - meta.head[0], meta.head[1]] : meta.head;
      preview.replaceChildren(el('div.tadm-lcd-screen', {},
        land.node,
        el('div.tadm-lcd-pet', { style: `left:${(50 - width / 2).toFixed(1)}%;bottom:${bottom.toFixed(1)}%;width:${width}%` },
          el('img', { src, alt: '', style: flip }),
          el('span.tadm-lcd-call', { style: `left:${head[0] * 100}%;top:calc(${head[1] * 100}% - 9cqw)`, text: '!' }))));
    }

    function draw() {
      for (const b of faceSeg.children) b.classList.toggle('on', meta && Number(b.dataset.v) === meta.face);
      for (const b of sizeSeg.children) b.classList.toggle('on', meta && b.dataset.v === meta.size);
      for (const b of modeSeg.children) b.classList.toggle('on', b.dataset.v === mode);
      if (!src || !meta) {
        stage.replaceChildren(el('div.tadm-art-empty', {}, svg(icon('egg')), el('p', { text: t('tadm.art.none') })));
      } else {
        const box = el('div.tadm-art-box', { style: `aspect-ratio:${meta.w}/${meta.h}`, onclick: pick },
          el('img', { src, alt: sp.name, draggable: 'false' }),
          el('span.tadm-baseline', { style: `top:${meta.base * 100}%` }),
          marker('head', meta.head, t('tadm.art.set_head')),
          marker('mouth', meta.mouth, t('tadm.art.set_mouth')));
        stage.replaceChildren(box);
      }
      save.disabled = !meta || !src || (!file && !current);
      drawPreview();
    }

    async function doSave() {
      if (!meta) return;
      save.disabled = true;
      try {
        const clean = { face: meta.face, head: meta.head, mouth: meta.mouth, base: meta.base, size: meta.size };
        if (file) {
          const base64 = await fileToBase64(file);
          state = await api.petAdminUploadArt(sp.key, { imageBase64: base64, mimeType: file.type, meta: clean });
        } else {
          state = await api.petAdminArtMeta(sp.key, { ...clean, w: meta.w, h: meta.h });
        }
        setArtOverrides(state.art);
        toast(t('tadm.art.saved'));
        dlg.close();
        onDone?.();
      } catch (err) {
        toast(err.message, 'err');
        save.disabled = false;
      }
    }

    async function doReset() {
      if (!(await confirmDialog({ title: t('tadm.art.reset'), body: BUNDLED[sp.key] ? t('tadm.art.reset_bundled') : t('tadm.art.reset_custom'), confirmLabel: t('tadm.art.reset'), danger: true }))) return;
      try {
        state = await api.petAdminDeleteArt(sp.key);
        setArtOverrides(state.art);
        toast(t('tadm.saved'));
        dlg.close();
        onDone?.();
      } catch (err) { toast(err.message, 'err'); }
    }

    const save = el('button.btn.primary', { type: 'button', onclick: doSave }, t('tadm.save'));
    const content = el('div.tadm-art', {},
      el('p.tadm-lead', { text: t('tadm.art.lead') }),
      el('div.tadm-art-grid', {},
        el('div', {},
          stage,
          el('div.tadm-field', {}, el('span', { text: t('tadm.art.click') }), modeSeg),
          el('p.hint', { text: t('tadm.art.click_hint') })),
        el('div', {},
          el('div.tadm-field', {}, el('span', { text: t('tadm.art.face') }), faceSeg),
          el('div.tadm-field', {}, el('span', { text: t('tadm.art.size') }), sizeSeg),
          el('div.tadm-field', {}, el('span', { text: t('tadm.art.preview') }), preview),
          warn)),
      el('div.tadm-actions', {},
        el('button.btn', { type: 'button', onclick: () => fileInput.click() }, (current ? t('tadm.art.replace') : t('tadm.art.upload'))),
        custom ? el('button.btn.danger', { type: 'button', onclick: doReset }, t('tadm.art.reset')) : null,
        save),
      el('p.hint', { text: t('tadm.art.tips') }),
      fileInput);
    dlg = sheet(t('tadm.art.title', { name: sp.name }), content, { wide: true });
    draw();
  }

  /* ------------------------------- Verkauf -------------------------------- */

  async function sale() {
    const s = state.settings;
    const st = state.stripe;
    const enabled = el('input', { type: 'checkbox', checked: s.sale.enabled ? true : null });
    const price = el('input', { type: 'text', inputmode: 'decimal', value: fromCents(s.sale.price) });
    const terms = el('input', { type: 'url', value: s.sale.terms, placeholder: 'https://…' });
    const withdrawal = el('input', { type: 'url', value: s.sale.withdrawal, placeholder: 'https://…' });
    const copy = el('button.btn.sm', { type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(state.webhookUrl); toast(t('tadm.copied')); } catch { toast(state.webhookUrl); }
    } }, t('tadm.copy'));

    async function store() {
      const cents = toCents(price.value);
      if (!Number.isInteger(cents) || cents < 50 || cents > 100000) { toast(t('tadm.price_range'), 'err'); return; }
      if (await saveSettings({ sale: { enabled: enabled.checked, price: cents, terms: terms.value.trim(), withdrawal: withdrawal.value.trim() } })) sale();
    }

    body.replaceChildren(spinner());
    const { purchases, unlocks } = await api.petAdminPurchases();
    const { players: people } = await api.petAdminPlayers();

    const grantUser = el('select', {}, people.map((p) => el('option', { value: String(p.id), text: p.username + (p.tribe ? ` (${p.tribe})` : '') })));
    const arts = SPECIES.filter((sp) => artFor(sp.key));
    const grantSpecies = el('select', {}, arts.map((sp) => el('option', { value: sp.key, text: sp.name })));

    async function grant() {
      try {
        const res = await api.petAdminGrant(Number(grantUser.value), grantSpecies.value);
        toast(res.added ? t('tadm.granted') : t('tadm.already'));
        sale();
      } catch (err) { toast(err.message, 'err'); }
    }

    async function revoke(userId, key, name) {
      if (!(await confirmDialog({ title: t('tadm.revoke'), body: t('tadm.revoke_confirm', { name, species: BY_KEY.get(key)?.name || key }), confirmLabel: t('tadm.revoke'), danger: true }))) return;
      try { await api.petAdminRevoke(userId, key); toast(t('tadm.revoked')); sale(); } catch (err) { toast(err.message, 'err'); }
    }

    const purchaseRows = purchases.length ? purchases.map((p) => el('tr', {},
      el('td', { text: dateTime(p.paid_at || p.created_at) }),
      el('td', { text: p.username || t('tadm.deleted_user') }),
      el('td', { text: BY_KEY.get(p.species)?.name || p.species }),
      el('td.tadm-num', { text: euro(p.amount_cents) }),
      el('td', {}, el('span.badge.tadm-badge.is-' + p.status, { text: t('tadm.pstatus.' + p.status) }), p.livemode ? null : el('span.badge.tadm-badge', { text: t('tadm.test') })))) : [el('tr', {}, el('td', { colspan: 5, class: 'tadm-muted', text: t('tadm.none') }))];

    const unlockRows = unlocks.length ? unlocks.map((u) => el('tr', {},
      el('td', { text: dateTime(u.created_at) }),
      el('td', { text: u.username }),
      el('td', { text: BY_KEY.get(u.species)?.name || u.species }),
      el('td', { text: u.source === 'purchase' ? t('tadm.source.purchase') : t('tadm.source.gift') + (u.created_by ? ` · ${u.created_by}` : '') }),
      el('td', {}, el('button.btn.sm.ghost', { type: 'button', onclick: () => revoke(u.user_id, u.species, u.username) }, t('tadm.revoke'))))) : [el('tr', {}, el('td', { colspan: 5, class: 'tadm-muted', text: t('tadm.none') }))];

    body.replaceChildren(
      el('div.tadm-cols', {},
        section(t('tadm.sale.title'),
          el('ul.tadm-checks', {},
            checkRow(st.configured, t('tadm.check.key'), st.configured ? t('tadm.mode.' + st.mode) : 'STRIPE_SECRET_KEY'),
            checkRow(st.webhook, t('tadm.check.webhook'), st.last ? t('tadm.check.last', { at: dateTime(st.last.at), type: st.last.type }) : 'STRIPE_WEBHOOK_SECRET'),
            checkRow(Boolean(s.sale.terms), t('tadm.sale.terms')),
            checkRow(Boolean(s.sale.withdrawal), t('tadm.sale.withdrawal'))),
          el('label.tadm-switch', {}, enabled, el('span', {}, el('strong', { text: t('tadm.sale.enabled') }), el('small', { text: state.saleMissing.length ? t('tadm.sale.missing', { list: state.saleMissing.join(', ') }) : t('tadm.sale.ready') }))),
          el('div.field', {}, el('label', { text: t('tadm.sale.price') }), price),
          el('div.field', {}, el('label', { text: t('tadm.sale.terms') }), terms),
          el('div.field', {}, el('label', { text: t('tadm.sale.withdrawal') }), withdrawal),
          el('p.hint', { text: t('tadm.sale.legal_hint') }),
          el('div.tadm-actions', {}, el('button.btn.primary', { type: 'button', onclick: store }, t('tadm.save')))),
        section(t('tadm.setup.title'),
          el('ol.tadm-steps', {},
            el('li', { text: t('tadm.setup.1') }),
            el('li', { text: t('tadm.setup.2') }),
            el('li', {}, el('span', { text: t('tadm.setup.3') }), el('code.tadm-code', { text: state.webhookUrl }), copy,
              el('small.tadm-events', { text: 'checkout.session.completed · checkout.session.async_payment_succeeded · checkout.session.async_payment_failed · checkout.session.expired · charge.refunded' })),
            el('li', { text: t('tadm.setup.4') }),
            el('li', { text: t('tadm.setup.5') }),
            el('li', { text: t('tadm.setup.6') })),
          el('p.hint', { text: t('tadm.setup.test') }))),
      section(t('tadm.grant.title'),
        el('p.tadm-lead', { text: t('tadm.grant.lead') }),
        el('div.tadm-inline', {}, grantUser, grantSpecies, el('button.btn.primary', { type: 'button', onclick: grant }, t('tadm.grant.do')))),
      section(t('tadm.purchases'), el('div.tadm-table-wrap', {}, el('table.tadm-table', {},
        el('thead', {}, el('tr', {}, ['date', 'player', 'species', 'amount', 'status'].map((k) => el('th', { text: t('tadm.col.' + k) })))),
        el('tbody', {}, purchaseRows)))),
      section(t('tadm.unlocks'), el('div.tadm-table-wrap', {}, el('table.tadm-table', {},
        el('thead', {}, el('tr', {}, ['date', 'player', 'species', 'source', 'action'].map((k) => el('th', { text: t('tadm.col.' + k) })))),
        el('tbody', {}, unlockRows)))));
  }

  /* ---------------------------- Spiel & Events ----------------------------- */

  function game() {
    const g = structuredClone(state.settings.game);
    const newsText = el('textarea', { maxlength: 300, rows: 3, placeholder: t('tadm.news.ph') });
    newsText.value = g.news?.text || '';
    const newsLink = el('input', { type: 'text', value: g.news?.link || '', placeholder: 'https://… ' + t('tadm.optional') });
    const startShards = el('input', { type: 'number', min: 0, max: 1000, value: String(g.startShards ?? 30) });
    const weekend = el('input', { type: 'checkbox', checked: g.events.weekend !== false ? true : null });
    const evChecks = EVENTS.map((e) => {
      const box = el('input', { type: 'checkbox', checked: g.events.off.includes(e.id) ? null : true, dataset: { id: e.id } });
      return el('label.tadm-event', {}, box, el('span', {}, el('strong', { text: t('tama.event.' + e.id) }), el('small', { text: `${e.from.split('-').reverse().join('.')} – ${e.to.split('-').reverse().join('.')} · ${multText(e.mult)}` })));
    });
    const customList = el('div.list.tadm-custom');
    const multSelect = (label) => el('label.tadm-mult', {}, el('span', { text: label }), el('select', {}, MULTS.map((m) => el('option', { value: String(m), text: m === 1 ? '–' : '×' + String(m).replace('.', ',') }))));
    const cName = el('input', { type: 'text', maxlength: 40, placeholder: t('tadm.custom.name_ph') });
    const cFrom = el('input', { type: 'date' });
    const cTo = el('input', { type: 'date' });
    const cXp = multSelect(t('tama.mult.xp')), cShards = multSelect(t('tama.mult.shards')), cBond = multSelect(t('tama.mult.bond'));

    function drawCustom() {
      const today = new Date().toISOString().slice(0, 10);
      customList.replaceChildren(...(g.custom.length ? g.custom.map((c, i) => el('div.row', {},
        el('div.grow', {}, el('div.rt', { text: c.name }), el('div.rs', { text: `${dateOnly(c.from)} – ${dateOnly(c.to)} · ${multText(c.mult)}${c.to < today ? ' · ' + t('tadm.custom.over') : c.from <= today ? ' · ' + t('tadm.custom.now') : ''}` })),
        el('button.btn.sm.ghost', { type: 'button', onclick: () => { g.custom.splice(i, 1); drawCustom(); } }, t('tadm.remove')))) : [el('p.tadm-muted', { text: t('tadm.custom.none') })]));
    }

    function addCustom() {
      const mult = { xp: Number(cXp.querySelector('select').value), shards: Number(cShards.querySelector('select').value), bond: Number(cBond.querySelector('select').value) };
      if (!cName.value.trim() || !cFrom.value || !cTo.value || cFrom.value > cTo.value || Object.values(mult).every((v) => v === 1)) { toast(t('tadm.custom.invalid'), 'err'); return; }
      g.custom.push({ name: cName.value.trim(), from: cFrom.value, to: cTo.value, mult });
      cName.value = '';
      drawCustom();
    }

    async function store() {
      const off = evChecks.map((l) => l.querySelector('input')).filter((b) => !b.checked).map((b) => b.dataset.id);
      const text = newsText.value.trim();
      const ok = await saveSettings({
        game: {
          news: text ? { text, link: newsLink.value.trim() } : null,
          events: { off, weekend: weekend.checked },
          custom: g.custom,
          startShards: Math.max(0, Math.min(1000, Math.round(Number(startShards.value) || 0))),
        },
      });
      if (ok) game();
    }

    body.replaceChildren(
      el('div.tadm-cols', {},
        section(t('tadm.news.title'),
          el('p.tadm-lead', { text: t('tadm.news.lead') }),
          el('div.field', {}, el('label', { text: t('tadm.news.text') }), newsText),
          el('div.field', {}, el('label', { text: t('tadm.news.link') }), newsLink),
          g.news?.at ? el('p.hint', { text: t('tadm.news.since', { at: dateTime(g.news.at) }) }) : null),
        section(t('tadm.start_shards.title'),
          el('p.tadm-lead', { text: t('tadm.start_shards.lead') }),
          el('div.field', {}, el('label', { text: t('tadm.start_shards.label') }), startShards))),
      section(t('tadm.events.title'),
        el('p.tadm-lead', { text: t('tadm.events.lead') }),
        el('div.tadm-events-grid', {}, evChecks,
          el('label.tadm-event', {}, weekend, el('span', {}, el('strong', { text: t('tama.event.evolution') }), el('small', { text: `${t('tadm.events.weekend')} · ${multText(WEEKEND_EVENT.mult)}` }))))),
      section(t('tadm.custom.title'),
        el('p.tadm-lead', { text: t('tadm.custom.lead') }),
        customList,
        el('div.tadm-custom-form', {},
          el('div.field', {}, el('label', { text: t('tadm.custom.name') }), cName),
          el('div.field', {}, el('label', { text: t('tadm.custom.from') }), cFrom),
          el('div.field', {}, el('label', { text: t('tadm.custom.to') }), cTo),
          cXp, cShards, cBond,
          el('button.btn', { type: 'button', onclick: addCustom }, t('tadm.custom.add')))),
      el('div.tadm-actions.is-sticky', {}, el('button.btn.primary', { type: 'button', onclick: store }, t('tadm.save_all'))));
    drawCustom();
  }

  /* ------------------------------ Geschenke ------------------------------- */

  async function gifts() {
    body.replaceChildren(spinner());
    const [{ gifts: list }, { players: people }] = await Promise.all([api.petAdminGifts(), api.petAdminPlayers()]);
    const preset = new URLSearchParams(location.hash.split('?')[1] || '').get('user');
    const to = el('select', {},
      el('option', { value: '', text: t('tadm.gift.all') }),
      people.map((p) => el('option', { value: String(p.id), text: p.username + (p.tribe ? ` (${p.tribe})` : ''), selected: preset === String(p.id) ? true : null })));
    const shardsIn = el('input', { type: 'number', min: 0, max: 100000, value: '100' });
    const message = el('input', { type: 'text', maxlength: 200, placeholder: t('tadm.gift.msg_ph') });
    const until = el('input', { type: 'date' });
    const itemInputs = Object.keys(ITEMS).map((id) => {
      const input = el('input', { type: 'number', min: 0, max: 999, value: '0', dataset: { id }, 'aria-label': t('tama.item.' + id) });
      return el('label.tadm-item', { title: t('tama.item.' + id) }, itemImg(id), el('span', { text: t('tama.item.' + id) }), input);
    });

    async function send() {
      const items = {};
      for (const l of itemInputs) { const i = l.querySelector('input'); const n = Math.round(Number(i.value) || 0); if (n > 0) items[i.dataset.id] = n; }
      const body_ = { userId: to.value ? Number(to.value) : null, shards: Math.max(0, Math.round(Number(shardsIn.value) || 0)), items, message: message.value.trim() || undefined, expiresAt: until.value || undefined };
      const who = to.value ? to.selectedOptions[0].textContent : t('tadm.gift.all');
      if (!(await confirmDialog({ title: t('tadm.gift.send'), body: t('tadm.gift.confirm', { who }), confirmLabel: t('tadm.gift.send') }))) return;
      try {
        await api.petAdminGift(body_);
        toast(t('tadm.gift.sent'));
        gifts();
      } catch (err) { toast(err.message, 'err'); }
    }

    async function remove(g) {
      if (!(await confirmDialog({ title: t('tadm.remove'), body: t('tadm.gift.remove_confirm'), confirmLabel: t('tadm.remove'), danger: true }))) return;
      try { await api.petAdminDeleteGift(g.id); toast(t('tadm.saved')); gifts(); } catch (err) { toast(err.message, 'err'); }
    }

    const content = (g) => [g.shards ? `${g.shards} ${t('tama.shards')}` : null, ...Object.entries(g.items || {}).map(([k, n]) => `${n}× ${t('tama.item.' + k)}`)].filter(Boolean).join(', ');
    body.replaceChildren(
      section(t('tadm.gift.title'),
        el('p.tadm-lead', { text: t('tadm.gift.lead') }),
        el('div.tadm-gift-form', {},
          el('div.field', {}, el('label', { text: t('tadm.gift.to') }), to),
          el('div.field', {}, el('label', { text: t('tama.shards') }), shardsIn),
          el('div.field', {}, el('label', { text: t('tadm.gift.msg') }), message),
          el('div.field', {}, el('label', { text: t('tadm.gift.until') }), until)),
        el('h3.tadm-sub', { text: t('tadm.gift.items') }),
        el('div.tadm-items', {}, itemInputs),
        el('div.tadm-actions', {}, el('button.btn.primary', { type: 'button', onclick: send }, t('tadm.gift.send')))),
      section(t('tadm.gift.list'), el('div.tadm-table-wrap', {}, el('table.tadm-table', {},
        el('thead', {}, el('tr', {}, ['date', 'to', 'content', 'claims', 'action'].map((k) => el('th', { text: t('tadm.col.' + k) })))),
        el('tbody', {}, list.length ? list.map((g) => el('tr', {},
          el('td', { text: dateTime(g.created_at) + (g.expires_at ? ` → ${dateOnly(g.expires_at)}` : '') }),
          el('td', { text: g.user_id ? g.username : t('tadm.gift.all') }),
          el('td', {}, el('span', { text: content(g) }), g.message ? el('small.tadm-block', { text: '„' + g.message + '“' }) : null),
          el('td.tadm-num', { text: String(g.claims) }),
          el('td', {}, el('button.btn.sm.ghost', { type: 'button', onclick: () => remove(g) }, t('tadm.remove'))))) : [el('tr', {}, el('td', { colspan: 5, class: 'tadm-muted', text: t('tadm.none') }))])))));
  }

  /* ------------------------------- Spieler -------------------------------- */

  async function players() {
    let search = '';
    const list = el('div.tadm-table-wrap');
    const input = el('input', { type: 'search', placeholder: t('tadm.players.search'), oninput: (e) => { search = e.target.value.trim(); clearTimeout(input.timer); input.timer = setTimeout(load, 250); } });

    async function reset(p) {
      if (!(await confirmDialog({ title: t('tadm.players.reset'), body: t('tadm.players.reset_confirm', { name: p.username }), confirmLabel: t('tadm.players.reset'), danger: true }))) return;
      try { await api.petAdminReset(p.id); toast(t('tadm.players.reset_done')); load(); } catch (err) { toast(err.message, 'err'); }
    }

    function grantDialog(p) {
      const arts = SPECIES.filter((sp) => artFor(sp.key) && !p.unlocks.some((u) => u.species === sp.key));
      const select = el('select', {}, arts.map((sp) => el('option', { value: sp.key, text: sp.name })));
      const dlg = sheet(t('tadm.grant.for', { name: p.username }), el('div.tadm-grant', {},
        el('p.tadm-lead', { text: t('tadm.grant.lead') }),
        el('div.tadm-inline', {}, select, el('button.btn.primary', { type: 'button', onclick: async () => {
          try { await api.petAdminGrant(p.id, select.value); toast(t('tadm.granted')); dlg.close(); load(); } catch (err) { toast(err.message, 'err'); }
        } }, t('tadm.grant.do')))));
    }

    async function load() {
      const { players: rows } = await api.petAdminPlayers(search);
      list.replaceChildren(el('table.tadm-table.is-players', {},
        el('thead', {}, el('tr', {}, ['player', 'pet', 'rank', 'streak', 'shards', 'raised', 'last', 'unlocks', 'action'].map((k) => el('th', { text: t('tadm.col.' + k) })))),
        el('tbody', {}, rows.length ? rows.map((p) => {
          const sp = p.pet ? BY_KEY.get(p.pet.species) : null;
          return el('tr', {},
            el('td', {}, el('strong', { text: p.username }), p.tribe ? el('small.tadm-block', { text: p.tribe }) : null),
            el('td', {}, sp ? el('span.tadm-pet', {}, creatureThumb(sp, { stage: 'adult' }), el('span', {}, el('b', { text: p.pet.name }), el('small.tadm-block', { text: `${sp.name} · ${t('tama.stage.' + p.pet.stage)}${p.pet.end ? ' †' : ''}` }))) : el('span.tadm-muted', { text: p.playing ? t('tadm.players.no_pet') : t('tadm.players.never') })),
            el('td.tadm-num', { text: p.playing ? String(p.rank) : '–' }),
            el('td.tadm-num', { text: p.playing ? String(p.streak) : '–' }),
            el('td.tadm-num', { text: p.playing ? String(p.shards) : '–' }),
            el('td.tadm-num', { text: p.playing ? String(p.raised) : '–' }),
            el('td', { text: p.lastActive ? dateTime(p.lastActive) : '–' }),
            el('td', {}, p.unlocks.length ? el('span.tadm-chips', {}, p.unlocks.map((u) => el('span.badge.tadm-badge.is-' + u.source, { text: BY_KEY.get(u.species)?.name || u.species }))) : el('span.tadm-muted', { text: '–' })),
            el('td.tadm-row-actions', {},
              el('button.btn.sm', { type: 'button', onclick: () => grantDialog(p) }, t('tadm.players.grant')),
              el('a.btn.sm', { href: `#/tamagotchi-admin/gifts?user=${p.id}` }, t('tadm.players.gift')),
              p.playing ? el('button.btn.sm.ghost', { type: 'button', onclick: () => reset(p) }, t('tadm.players.reset')) : null));
        }) : [el('tr', {}, el('td', { colspan: 9, class: 'tadm-muted', text: t('tadm.none') }))])));
    }

    body.replaceChildren(section(t('tadm.players.title'), el('p.tadm-lead', { text: t('tadm.players.lead') }), input, list));
    await load();
  }
}
