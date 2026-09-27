import { el, spinner, toast } from '../ui.js';
import { t } from '../i18n.js';
import '../tamagotchi/texts.js';
import '../tamagotchi/texts-play.js';
import '../tamagotchi/texts-shop.js';
import * as P from '../tamagotchi/progress.js';
import { ACHIEVEMENTS } from '../tamagotchi/catalog.js';
import { icon } from '../tamagotchi/scene.js';
import { petState, petNow, loadPet, onPetChange, petAct, refreshRosterSoon } from '../tamagotchi/store.js';
import { BY_KEY, createCare, svg } from '../tamagotchi/device.js';
import { shards, rankName } from '../tamagotchi/common.js';
import { createHub } from '../tamagotchi/hub.js';
import { openDropSheet } from '../tamagotchi/daily.js';
import { nestPanel, openNest, dossierPanel, hallPanel, tribePanel, openSettings, openHelp } from '../tamagotchi/panels.js';
import { shopPanel, awardsPanel } from '../tamagotchi/shop.js';
import { sfx } from '../tamagotchi/sound.js';
import { nestSpecies, roster } from '../tamagotchi/roster.js';
import { checkoutReturn } from '../tamagotchi/buy.js';

const TABS = [
  { key: 'care', path: '/tamagotchi', icon: 'egg' },
  { key: 'shop', path: '/tamagotchi/shop', icon: 'bag' },
  { key: 'awards', path: '/tamagotchi/awards', icon: 'trophy' },
  { key: 'dossier', path: '/tamagotchi/dossier', icon: 'star' },
  { key: 'hall', path: '/tamagotchi/hall', icon: 'leaf' },
  { key: 'tribe', path: '/tamagotchi/tribe', icon: 'cuddle' },
];

/**
 * Dino-Tamagotchi: ein virtuelles ARK-Haustier nach dem Vorbild von 1996 –
 * mit den gemalten Kreaturen aus dem Katalog, ARK-Prägung, Dossier und Gehege.
 */
export async function renderTamagotchi(mount, ctx, tabKey) {
  const { user, go } = ctx;
  // Das Gehege zeigt die Tiere des eigenen Tribes – ohne Tribe gibt es nichts zu sehen.
  const tabs = TABS.filter((x) => x.key !== 'tribe' || user.tribeId);
  const tab = tabs.find((x) => x.key === tabKey) || tabs[0];
  mount.classList.add('tama-page');
  mount.replaceChildren(el('div.tama-loading', {}, spinner(), el('p', { text: t('tama.loading') })));
  try {
    await loadPet(user);
  } catch {
    mount.replaceChildren(el('div.tama-empty', {}, svg(icon('egg')), el('p', { text: t('tama.load_error') }),
      el('button.btn.primary', { type: 'button', text: t('tama.retry'), onclick: () => renderTamagotchi(mount, ctx, tabKey) })));
    return;
  }

  const head = el('header.tama-hero');
  const body = el('div.tama-body');
  const nav = el('nav.tama-tabs', { 'aria-label': t('nav.tamagotchi') }, tabs.map((x) => el('a.tama-tab' + (x.key === tab.key ? '.is-on' : ''), {
    href: '#' + x.path, 'aria-current': x.key === tab.key ? 'page' : null,
  }, svg(icon(x.icon)), el('span', { text: t('tama.tab.' + x.key) }),
  x.key === 'dossier' ? el('small', { text: `${Object.values(petState.doc.dex).filter((e) => e.a > 0).length}/${nestSpecies(petState.doc).length}` }) : null,
  x.key === 'awards' ? el('small', { text: `${Object.keys(petState.doc.player?.ach || {}).length}/${ACHIEVEMENTS.length}` }) : null)));
  mount.replaceChildren(head, nav, body);

  function applyShell() {
    mount.dataset.shell = petState.doc?.settings?.shell || 'tek';
  }

  function renderHead() {
    const p = petState.doc.pet;
    const sp = p ? BY_KEY.get(p.species) : null;
    const chips = [];
    if (p && sp) {
      chips.push(el('span.tama-chip.is-species', { text: sp.name }));
      chips.push(el('span.tama-chip', { text: t('tama.stage.' + p.stage) }));
      if (p.stage !== 'egg') chips.push(el('span.tama-chip', { text: t('tama.pers.' + p.personality), title: t('tama.pers_desc.' + p.personality) }));
      if (p.variant) chips.push(el('span.tama-chip.is-variant.var-' + p.variant, { text: t('tama.variant.' + p.variant) }));
      chips.push(el('span.tama-chip.is-mode', { text: t('tama.mode.' + p.mode) }));
      if (p.gen > 1) chips.push(el('span.tama-chip', { text: t('tama.gen_short', { n: p.gen }) + (p.mutations ? ` · ${t('tama.mutations', { n: p.mutations })}` : '') }));
    }
    const pl = petState.doc.player;
    const r = P.rankOf(pl?.xp || 0);
    const si = P.streakInfo(petState.doc, petNow());
    head.replaceChildren(
      el('div.tama-hero-copy', {},
        el('div.tama-eyebrow', {}, el('b', { text: 'TEK' }), el('span', { text: 'GOTCHI' }), el('span.tama-eyebrow-sub', { text: '· ' + t('tama.eyebrow') })),
        el('h1', { text: p ? p.name : t('tama.title_empty') }),
        chips.length ? el('div.tama-chips', {}, chips) : null),
      el('div.tama-hero-side', {},
      el('div.tama-hero-stats', {},
        el('span.tama-stat-pill', { title: rankName(r.level) }, el('span.tama-rank-badge.is-small', {}, el('b', { text: String(r.level) })), el('span', { text: rankName(r.level) })),
        el('span.tama-stat-pill', { title: t('tama.streak.title') }, svg(icon('flame')), el('b', { text: String(si.streak) })),
        el('a.tama-stat-pill', { href: '#/tamagotchi/shop', title: t('tama.tab.shop') }, shards(pl?.shards || 0))),
      el('div.tama-hero-actions', {},
        p && !p.end ? el('button.tama-round', { type: 'button', title: t('tama.nest.new'), 'aria-label': t('tama.nest.new'), onclick: () => openNest({ onStarted: () => go('/tamagotchi') }) }, svg(icon('egg'))) : null,
        el('button.tama-round', { type: 'button', title: t('tama.help'), 'aria-label': t('tama.help'), onclick: () => openHelp() }, svg(icon('info'))),
        el('button.tama-round', { type: 'button', title: t('tama.settings'), 'aria-label': t('tama.settings'), onclick: () => openSettings({ toast, onChange: () => { applyShell(); renderHead(); } }) }, svg(icon('gear'))))));
    applyShell();
  }

  let care = null;
  function renderBody() {
    care?.destroy();
    care = null;
    if (tab.key === 'care') {
      if (!petState.doc.pet) {
        // Ohne Tier: Brutstation, daneben Kiste, Aufgaben und Rang – auch ohne Tier gibt es jeden Tag etwas.
        const hub = createHub({ openDrop: () => openDropSheet(), go, toast });
        body.replaceChildren(el('div.tama-care.is-empty', {},
          el('section.tama-card.is-nest', {},
            el('h2.tama-card-title', {}, svg(icon('egg')), el('span', { text: t('tama.nest.title') })),
            nestPanel({ current: null, onStart: ({ species, name, mode }) => { startEgg(species, name, mode); } })),
          hub.root));
        return;
      }
      care = createCare({ openNest: () => openNest({ onStarted: () => renderBody() }), toast, go });
      body.replaceChildren(care.root);
      return;
    }
    if (tab.key === 'shop') { body.replaceChildren(shopPanel({ toast })); return; }
    if (tab.key === 'awards') { body.replaceChildren(awardsPanel()); return; }
    if (tab.key === 'dossier') { body.replaceChildren(dossierPanel({ go })); return; }
    if (tab.key === 'hall') { body.replaceChildren(hallPanel()); return; }
    body.replaceChildren(el('div.tama-loading', {}, spinner()));
    tribePanel({ user }).then((node) => { if (body.isConnected) body.replaceChildren(node); })
      .catch((err) => { if (body.isConnected) body.replaceChildren(el('div.tama-empty', {}, el('p', { text: err.message || t('common.error') }))); });
  }

  // Die Pflegeansicht baut sich über onPetChange neu auf, sobald das Ei da ist.
  function startEgg(species, name, mode) {
    petAct((doc, now) => P.startEgg(doc, { species, name, mode, now }));
    sfx('hatch');
  }

  let petId = petState.doc.pet?.id || null;
  // Was die Brutstation zeigt (Gratis, Freischaltungen, Bilder, Verkauf) – nur bei Änderung neu zeichnen
  const rosterSig = () => { const c = roster(); return JSON.stringify([c.free, c.off, c.owned.map((o) => o.species), c.sale, Object.keys(c.art || {}), c.prices, c.price]); };
  let lastRoster = rosterSig();
  const off = onPetChange((state, ev) => {
    if (!mount.isConnected) { off(); care?.destroy(); return; }
    const id = state.doc?.pet?.id || null;
    if (ev?.type === 'locked') toast(t('tama.ev.locked'), 'err');
    renderHead();
    // Neue Freischaltungen (Kauf, Geschenk): Brutstation ohne Tier neu zeichnen
    if (ev?.type === 'roster') {
      const sig = rosterSig();
      if (sig === lastRoster) return;
      lastRoster = sig;
      if (tab.key === 'care' && !id) { renderBody(); return; }
    }
    // Neues Tier oder Tier entfernt: Pflegeansicht neu aufbauen und nach oben
    // holen (vorher war evtl. die lange Artenliste gescrollt)
    if (tab.key === 'care' && (id !== petId || ['conflict', 'locked'].includes(ev?.type))) {
      const fresh = id !== petId;
      petId = id;
      renderBody();
      if (fresh) (document.querySelector('.main') || window).scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  renderHead();
  renderBody();
  // Neue Geschenke, Ankündigungen und Aktionen des Betreibers holen
  refreshRosterSoon(15_000);
  // Zurück von der Bezahlung (Stripe): Kauf prüfen und Bescheid geben
  checkoutReturn({ toast });
}
