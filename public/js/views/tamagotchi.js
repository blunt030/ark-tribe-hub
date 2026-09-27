import { el, spinner, toast } from '../ui.js';
import { t } from '../i18n.js';
import '../tamagotchi/texts.js';
import * as E from '../tamagotchi/engine.js';
import { SPECIES } from '../tamagotchi/species.js';
import { icon } from '../tamagotchi/scene.js';
import { petState, loadPet, onPetChange, petAct } from '../tamagotchi/store.js';
import { BY_KEY, createCare, svg } from '../tamagotchi/device.js';
import { nestPanel, openNest, dossierPanel, hallPanel, tribePanel, openSettings, openHelp } from '../tamagotchi/panels.js';
import { sfx } from '../tamagotchi/sound.js';

const TABS = [
  { key: 'care', path: '/tamagotchi', icon: 'egg' },
  { key: 'dossier', path: '/tamagotchi/dossier', icon: 'star' },
  { key: 'hall', path: '/tamagotchi/hall', icon: 'leaf' },
  { key: 'tribe', path: '/tamagotchi/tribe', icon: 'cuddle' },
];

/**
 * Dino-Tamagotchi: ein virtuelles ARK-Haustier nach dem Vorbild von 1996 –
 * mit allen 217 Kreaturen aus dem Katalog, ARK-Prägung, Dossier und Gehege.
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
  x.key === 'dossier' ? el('small', { text: `${Object.values(petState.doc.dex).filter((e) => e.a > 0).length}/${SPECIES.length}` }) : null)));
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
    head.replaceChildren(
      el('div.tama-hero-copy', {},
        el('div.tama-eyebrow', {}, el('b', { text: 'TEK' }), el('span', { text: 'GOTCHI' }), el('span.tama-eyebrow-sub', { text: '· ' + t('tama.eyebrow') })),
        el('h1', { text: p ? p.name : t('tama.title_empty') }),
        chips.length ? el('div.tama-chips', {}, chips) : null),
      el('div.tama-hero-actions', {},
        p && !p.end ? el('button.tama-round', { type: 'button', title: t('tama.nest.new'), 'aria-label': t('tama.nest.new'), onclick: () => openNest({ onStarted: () => go('/tamagotchi') }) }, svg(icon('egg'))) : null,
        el('button.tama-round', { type: 'button', title: t('tama.help'), 'aria-label': t('tama.help'), onclick: () => openHelp() }, svg(icon('info'))),
        el('button.tama-round', { type: 'button', title: t('tama.settings'), 'aria-label': t('tama.settings'), onclick: () => openSettings({ toast, onChange: () => { applyShell(); renderHead(); } }) }, svg(icon('gear')))));
    applyShell();
  }

  let care = null;
  function renderBody() {
    care?.destroy();
    care = null;
    if (tab.key === 'care') {
      if (!petState.doc.pet) {
        body.replaceChildren(el('section.tama-card.is-nest', {},
          el('h2.tama-card-title', {}, svg(icon('egg')), el('span', { text: t('tama.nest.title') })),
          nestPanel({ current: null, onStart: ({ species, name, mode }) => { startEgg(species, name, mode); } })));
        return;
      }
      care = createCare({ openNest: () => openNest({ onStarted: () => renderBody() }), toast });
      body.replaceChildren(care.root);
      return;
    }
    if (tab.key === 'dossier') { body.replaceChildren(dossierPanel({ go })); return; }
    if (tab.key === 'hall') { body.replaceChildren(hallPanel()); return; }
    body.replaceChildren(el('div.tama-loading', {}, spinner()));
    tribePanel({ user }).then((node) => { if (body.isConnected) body.replaceChildren(node); })
      .catch((err) => { if (body.isConnected) body.replaceChildren(el('div.tama-empty', {}, el('p', { text: err.message || t('common.error') }))); });
  }

  // Die Pflegeansicht baut sich über onPetChange neu auf, sobald das Ei da ist.
  function startEgg(species, name, mode) {
    petAct((doc, now) => E.startEgg(doc, { species, name, mode, now }));
    sfx('hatch');
  }

  let petId = petState.doc.pet?.id || null;
  const off = onPetChange((state, ev) => {
    if (!mount.isConnected) { off(); care?.destroy(); return; }
    const id = state.doc?.pet?.id || null;
    renderHead();
    // Neues Tier oder Tier entfernt: Pflegeansicht neu aufbauen und nach oben
    // holen (vorher war evtl. die lange Artenliste gescrollt)
    if (tab.key === 'care' && (id !== petId || ev?.type === 'conflict')) {
      const fresh = id !== petId;
      petId = id;
      renderBody();
      if (fresh) (document.querySelector('.main') || window).scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  renderHead();
  renderBody();
}
