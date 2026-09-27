/**
 * Nebenansichten des Dino-Tamagotchis: Brutstation, Dossier, Ahnengalerie,
 * Tribe-Gehege, Einstellungen und Anleitung.
 */
import { el } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import * as E from './engine.js';
import { SPECIES } from './species.js';
import { creatureArt, FORMS } from './art.js';
import { eggArt, foodArt, icon, DIET_FOOD } from './scene.js';
import { toSvgString } from './vdom.js';
import { petState, petNow, petAct } from './store.js';
import { soundOn, setSoundOn, sfx } from './sound.js';
import { BY_KEY, creatureThumb, dur, faceFor, svg } from './device.js';
import { mitgeliefertesBild } from '../icons.js';

const SHELLS = ['tek', 'bronze', 'obsidian', 'amber', 'aberrant', 'ice'];
const NAMES = ['Krümel', 'Nugget', 'Pixel', 'Knuddel', 'Zappel', 'Mampf', 'Tiki', 'Momo', 'Brummi', 'Flocke', 'Schnuffel', 'Zottel', 'Bolt', 'Kiwi', 'Mochi', 'Rumpel', 'Sprout', 'Noodle', 'Blitz', 'Pebble'];

/* -------------------------------------------------------------------------- */
/* Dialog                                                                       */
/* -------------------------------------------------------------------------- */

export function sheet(title, content, { wide = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  const before = document.activeElement;
  const panel = el('div.tama-sheet' + (wide ? '.is-wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('header.tama-sheet-head', {}, el('h2', { text: title }),
      el('button.tama-sheet-close', { type: 'button', 'aria-label': t('tama.close'), onclick: () => close() }, '×')),
    el('div.tama-sheet-body', {}, content));
  const bg = el('div.tama-sheet-bg', { dataset: { shell: petState.doc?.settings?.shell || 'tek' }, onclick: (e) => { if (e.target === bg) close(); } }, panel);
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const items = [...panel.querySelectorAll('button:not([disabled]), input, select, a[href]')].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function close() {
    bg.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
    before?.focus?.();
  }
  root.append(bg);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => panel.querySelector('.tama-sheet-close')?.focus());
  return { close, panel };
}

function confirmSheet(text, { confirm = t('tama.confirm'), danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; s.close(); resolve(v); };
    const s = sheet(t('tama.confirm'), el('div.tama-confirm', {},
      el('p', { text }),
      el('div.tama-row-actions', {},
        el('button.btn.ghost', { type: 'button', text: t('common.cancel'), onclick: () => finish(false) }),
        el('button.btn' + (danger ? '.danger' : '.primary'), { type: 'button', text: confirm, onclick: () => finish(true) }))), { onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

/* -------------------------------------------------------------------------- */
/* Artenraster (Brutstation & Dossier)                                         */
/* -------------------------------------------------------------------------- */

const eggCache = new Map();
function eggSrc(sp) {
  if (!eggCache.has(sp.key)) eggCache.set(sp.key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvgString(eggArt(sp))));
  return eggCache.get(sp.key);
}

function lazyThumb(factory, cls) {
  const holder = el('span.tama-lazy' + (cls ? '.' + cls : ''));
  holder._fill = () => { if (!holder.firstChild) holder.append(factory()); };
  return holder;
}

function observeLazy(container) {
  const nodes = [...container.querySelectorAll('.tama-lazy')];
  if (!('IntersectionObserver' in globalThis)) { nodes.forEach((n) => n._fill?.()); return null; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target._fill?.(); io.unobserve(e.target); }
  }, { rootMargin: '200px' });
  nodes.forEach((n) => io.observe(n));
  return io;
}

function speciesGrid({ doc, mode, onPick }) {
  let hab = 'all', query = '', onlyNew = false, io = null;
  const grid = el('div.tama-grid', { role: 'list' });
  const count = el('span.tama-grid-count');
  const chips = ['all', 'L', 'W', 'F', 'M'].map((code) => el('button.tama-filter-chip', {
    type: 'button', 'aria-pressed': code === hab ? 'true' : 'false',
    onclick: () => { hab = code; chips.forEach((c, i) => c.setAttribute('aria-pressed', ['all', 'L', 'W', 'F', 'M'][i] === hab ? 'true' : 'false')); draw(); },
  }, t('tama.hab.' + code)));
  const search = el('input.tama-search', { type: 'search', placeholder: t('tama.nest.search'), 'aria-label': t('tama.nest.search'), oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); } });
  const newOnly = el('label.tama-check', {}, el('input', { type: 'checkbox', onchange: (e) => { onlyNew = e.target.checked; draw(); } }), el('span', { text: t('tama.nest.only_new') }));

  function tile(sp) {
    const e = doc.dex[sp.key];
    const raised = e?.a > 0;
    const art = mode === 'nest'
      ? lazyThumb(() => el('span.tama-egg-stack', {}, el('img.tama-thumb.is-egg', { src: eggSrc(sp), alt: '', decoding: 'async' }), creatureThumb(sp, { stage: 'baby' }, 'is-peek')))
      : lazyThumb(() => creatureThumb(sp, { stage: raised ? 'adult' : 'baby', variant: e?.v?.includes('tek') ? 'tek' : e?.v?.includes('alpha') ? 'alpha' : null }));
    return el('button.tama-tile.rarity-' + sp.rarity + (raised ? '.is-raised' : '') + (mode === 'dex' && !e ? '.is-unknown' : ''), {
      type: 'button', role: 'listitem', title: sp.name, onclick: () => onPick(sp),
    },
    el('span.tama-tile-art', {}, art),
    el('span.tama-tile-name', { text: sp.name }),
    el('span.tama-tile-meta', {},
      el('span.tama-rarity', { text: t('tama.rarity.' + sp.rarity) }),
      raised ? el('span.tama-tile-check', { title: t('tama.dex.times', { n: e.a }) }, svg(icon('star'))) : null));
  }

  function draw() {
    io?.disconnect();
    const list = SPECIES.filter((s) => (hab === 'all' || s.hab === hab) && (!query || s.name.toLowerCase().includes(query)) && (!onlyNew || !(doc.dex[s.key]?.a > 0)));
    grid.replaceChildren(...list.map(tile));
    count.textContent = t('tama.nest.count', { n: list.length });
    io = observeLazy(grid);
  }
  const node = el('div.tama-species', {}, el('div.tama-toolbar', {}, search, el('div.tama-filter', {}, chips), newOnly, count), grid);
  requestAnimationFrame(draw);
  return node;
}

/* -------------------------------------------------------------------------- */
/* Brutstation                                                                   */
/* -------------------------------------------------------------------------- */

export function nestPanel({ onStart, current, species = null }) {
  const doc = petState.doc;
  const body = el('div.tama-nest');

  function chooseStep() {
    const surprise = el('button.tama-surprise', { type: 'button', onclick: () => confirmStep(SPECIES[Math.floor(Math.random() * SPECIES.length)], true) },
      el('span.tama-surprise-egg', { 'aria-hidden': 'true' }, '?'),
      el('span', {}, el('strong', { text: t('tama.nest.random') }), el('small', { text: t('tama.nest.random_desc') })));
    body.replaceChildren(
      el('p.tama-lead', { text: t('tama.nest.sub', { n: SPECIES.length }) }),
      surprise,
      speciesGrid({ doc, mode: 'nest', onPick: (sp) => confirmStep(sp, false) }));
  }

  function confirmStep(sp, surprise) {
    sfx('select');
    let mode = current?.mode || 'relaxed';
    const nameInput = el('input.tama-input', { type: 'text', maxlength: E.NAME_MAX, value: NAMES[Math.floor(Math.random() * NAMES.length)], 'aria-label': t('tama.nest.name'), placeholder: t('tama.nest.name_ph', { example: 'Rexi' }) });
    const dice = el('button.tama-dice', { type: 'button', 'aria-label': '🎲', onclick: () => { nameInput.value = NAMES[Math.floor(Math.random() * NAMES.length)]; } }, '🎲');
    const modes = E.MODES.map((m) => el('label.tama-mode' + (m === mode ? '.is-on' : ''), {},
      el('input', { type: 'radio', name: 'tama-mode', value: m, checked: m === mode ? true : null, onchange: () => { mode = m; modes.forEach((node, i) => node.classList.toggle('is-on', E.MODES[i] === m)); } }),
      el('span', {}, el('strong', { text: t('tama.mode.' + m) }), el('small', { text: t('tama.mode_desc.' + m) }))));
    const alive = current && !current.end;
    body.replaceChildren(el('div.tama-confirm-egg', {},
      el('div.tama-confirm-art' + (surprise ? '.is-surprise' : ''), {}, surprise ? el('span.tama-surprise-egg.is-big', { text: '?' }) : svg(eggArt(sp))),
      el('div.tama-confirm-copy', {},
        el('h3', { text: surprise ? t('tama.nest.surprise') : sp.name }),
        surprise ? null : el('p.tama-muted', { text: `${t('tama.birth.' + sp.birth)} · ${t('tama.hab.' + sp.hab)} · ${t('tama.rarity.' + sp.rarity)}` }),
        el('label.tama-field', {}, el('span', { text: t('tama.nest.name') }), el('span.tama-name-row', {}, nameInput, dice)),
        el('fieldset.tama-modes', {}, el('legend', { text: t('tama.nest.mode') }), modes),
        alive ? el('p.tama-warn', { text: t('tama.nest.replace_warn', { name: current.name }) }) : null,
        el('div.tama-row-actions', {},
          el('button.btn.ghost', { type: 'button', text: t('tama.nest.back'), onclick: chooseStep }),
          el('button.btn.primary.tama-cta', { type: 'button', onclick: () => {
            const name = E.cleanName(nameInput.value) || sp.name;
            onStart({ species: sp.key, name, mode });
          } }, svg(icon('egg')), el('span', { text: t('tama.nest.start') }))))));
    nameInput.focus();
    nameInput.select();
  }

  if (species) confirmStep(species, false);
  else chooseStep();
  return body;
}

export function openNest({ onStarted } = {}) {
  let s = null;
  const current = petState.doc?.pet;
  const panel = nestPanel({
    current,
    onStart: ({ species, name, mode }) => {
      petAct((doc, now) => E.startEgg(doc, { species, name, mode, now }));
      sfx('hatch');
      s?.close();
      onStarted?.();
    },
  });
  s = sheet(t('tama.nest.title'), panel, { wide: true });
  return s;
}

/* -------------------------------------------------------------------------- */
/* Dossier                                                                        */
/* -------------------------------------------------------------------------- */

function stat(label, value, total) {
  return el('div.tama-stat', {}, el('strong', { text: total ? `${value}/${total}` : String(value) }), el('span', { text: label }),
    total ? el('span.tama-bar', {}, el('span', { style: `width:${Math.round(value / total * 100)}%` })) : null);
}

export function dossierPanel({ go }) {
  const doc = petState.doc;
  const entries = Object.values(doc.dex);
  const raised = entries.filter((e) => e.a > 0).length;
  const hatched = entries.filter((e) => e.h > 0).length;
  const variants = entries.reduce((n, e) => n + e.v.length, 0);
  return el('div.tama-dossier', {},
    el('div.tama-stats', {},
      stat(t('tama.dex.raised'), raised, SPECIES.length),
      stat(t('tama.dex.hatched'), hatched, SPECIES.length),
      stat(t('tama.dex.variants'), variants, SPECIES.length * 4)),
    el('p.tama-lead', { text: t('tama.dex.sub') }),
    speciesGrid({ doc, mode: 'dex', onPick: (sp) => dexDetail(sp, { go }) }));
}

function dexDetail(sp, { go }) {
  const doc = petState.doc;
  const e = doc.dex[sp.key] || { h: 0, a: 0, v: [] };
  const artwork = mitgeliefertesBild({ key: sp.key });
  const food = DIET_FOOD[sp.diet] || 'meat';
  let s = null;
  const hero = el('div.tama-dex-hero.biome-' + sp.biome, {}, svg(creatureArt(sp, { stage: 'adult', variant: e.v.includes('tek') ? 'tek' : e.v.includes('alpha') ? 'alpha' : null })));
  const content = el('div.tama-dex-detail', {},
    hero,
    el('div.tama-dex-forms', { 'aria-label': t('tama.dex.forms') }, ['baby', 'juvenile', 'adolescent', 'adult'].map((stage) => {
      // Gleicher Maßstab wie auf dem Bildschirm, damit man das Wachstum sieht
      const img = creatureThumb(sp, { stage });
      img.style.width = `${Math.round(FORMS[stage].size * 100)}%`;
      return el('figure', {}, el('span.tama-dex-form', {}, img), el('figcaption', { text: t('tama.stage.' + stage) }));
    })),
    el('dl.tama-facts', {},
      el('dt', { text: t('tama.dex.diet') }), el('dd', {}, el('span.tama-food-mini', {}, svg(foodArt(food))), el('span', { text: `${t('tama.food.' + food)} (${t('tama.diet.' + sp.diet)})` })),
      el('dt', { text: t('tama.dex.habitat') }), el('dd', { text: t('tama.hab.' + sp.hab) }),
      el('dt', { text: t('tama.dex.birth') }), el('dd', { text: t('tama.birth.' + sp.birth) }),
      el('dt', { text: t('tama.dex.rarity') }), el('dd', { text: t('tama.rarity.' + sp.rarity) }),
      el('dt', { text: t('tama.dex.biome') }), el('dd', { text: t('tama.biome.' + sp.biome) })),
    el('div.tama-dex-variants', {}, ['alpha', 'loyal', 'feral', 'tek'].map((v) => el('span.tama-badge' + (e.v.includes(v) ? '.is-on' : ''), { text: e.v.includes(v) || v !== 'tek' ? t('tama.variant.' + v) : '???' }))),
    el('p.tama-muted', { text: e.a ? t('tama.dex.times', { n: e.a }) : t('tama.dex.not_yet') }),
    artwork ? el('figure.tama-artwork', {}, el('img', { src: artwork, alt: sp.name, loading: 'lazy' }), el('figcaption', { text: t('tama.dex.artwork') })) : null,
    el('div.tama-row-actions', {}, el('button.btn.primary.tama-cta', { type: 'button', onclick: () => {
      s.close();
      let nest = null;
      const panel = nestPanel({
        current: petState.doc.pet,
        species: sp,
        onStart: ({ species, name, mode }) => { petAct((d, now) => E.startEgg(d, { species, name, mode, now })); sfx('hatch'); nest?.close(); go('/tamagotchi'); },
      });
      nest = sheet(t('tama.nest.title'), panel, { wide: true });
    } }, svg(icon('egg')), el('span', { text: t('tama.dex.hatch_this') }))));
  s = sheet(sp.name, content, { wide: true });
}

/* -------------------------------------------------------------------------- */
/* Ahnengalerie                                                                 */
/* -------------------------------------------------------------------------- */

export function hallPanel() {
  const hall = petState.doc.hall;
  if (!hall.length) return el('div.tama-empty', {}, svg(icon('star')), el('p', { text: t('tama.hall.empty') }));
  return el('div.tama-hall', {},
    el('p.tama-lead', { text: t('tama.hall.sub') }),
    el('div.tama-cards', {}, hall.map((a) => {
      const sp = BY_KEY.get(a.species);
      if (!sp) return null;
      return el('article.tama-mini' + (a.variant ? '.var-' + a.variant : ''), {},
        el('div.tama-mini-art.biome-' + sp.biome, {}, a.stage === 'egg' ? el('img.tama-thumb', { src: eggSrc(sp), alt: '' }) : creatureThumb(sp, { stage: a.stage, variant: a.variant, colors: a.colors })),
        el('div.tama-mini-copy', {},
          el('strong', { text: a.name }),
          el('span', { text: `${sp.name} · ${t('tama.hall.gen', { n: a.gen })}${a.variant ? ' · ' + t('tama.variant.' + a.variant) : ''}` }),
          el('small', { text: `${t('tama.cause.' + a.cause)} · ${dur(a.age)} · ${new Date(a.at).toLocaleDateString()}` })));
    })));
}

/* -------------------------------------------------------------------------- */
/* Tribe-Gehege                                                                  */
/* -------------------------------------------------------------------------- */

export async function tribePanel({ user }) {
  if (!user.tribeId) return el('div.tama-empty', {}, svg(icon('info')), el('p', { text: t('tama.tribe.no_tribe') }));
  const res = await api.tribePets();
  const offset = Number(res.serverTime) - Date.now() || 0;
  const now = Date.now() + offset;
  if (!res.pets.length) return el('div.tama-empty', {}, svg(icon('egg')), el('p', { text: t('tama.tribe.empty') }));
  return el('div.tama-tribe', {},
    el('p.tama-lead', { text: t('tama.tribe.sub') }),
    el('div.tama-cards', {}, res.pets.map((entry) => {
      const sp = BY_KEY.get(entry.pet?.species);
      if (!sp) return null;
      const p = { ...structuredClone(entry.pet), log: [] };
      try { E.advance(p, now); } catch { /* fremder Stand – dann eben der gespeicherte */ }
      const mood = E.mood(p, now);
      const art = p.stage === 'egg' ? el('img.tama-thumb', { src: eggSrc(sp), alt: '' })
        : creatureThumb(sp, { stage: p.stage, variant: p.variant, colors: p.colors });
      return el('article.tama-mini.mood-' + mood + (entry.userId === user.id ? '.is-me' : ''), {},
        el('div.tama-mini-art.biome-' + sp.biome, { dataset: { face: faceFor(mood) } }, art, el('span.tama-mood-chip', { text: t('tama.mood.' + mood) })),
        el('div.tama-mini-copy', {},
          el('strong', { text: p.name }),
          el('span', { text: `${sp.name} · ${t('tama.stage.' + p.stage)}${p.variant ? ' · ' + t('tama.variant.' + p.variant) : ''}` }),
          el('small', { text: `${entry.userId === user.id ? t('tama.tribe.you') : entry.username} · ${dur(E.ageMs(p, now))} · ${t('tama.tribe.raised', { n: entry.raised })}` })));
    })));
}

/* -------------------------------------------------------------------------- */
/* Einstellungen                                                                  */
/* -------------------------------------------------------------------------- */

export function openSettings({ onChange, toast }) {
  const doc = petState.doc;
  const p = doc.pet;
  const now = petNow();
  const setting = (fn) => { petAct((d) => { fn(d.settings); return { ok: true, code: 'mode' }; }); onChange?.(); };

  const shells = el('div.tama-swatches', { role: 'radiogroup', 'aria-label': t('tama.set.shell') }, SHELLS.map((shell) => el('button.tama-swatch.shell-' + shell, {
    type: 'button', role: 'radio', 'aria-checked': doc.settings.shell === shell ? 'true' : 'false', title: t('tama.shell.' + shell),
    onclick: (e) => { setting((st) => { st.shell = shell; }); shells.querySelectorAll('.tama-swatch').forEach((n) => n.setAttribute('aria-checked', 'false')); e.currentTarget.setAttribute('aria-checked', 'true'); },
  }, el('span', { text: t('tama.shell.' + shell) }))));
  const toggle = (label, desc, checked, onToggle) => el('label.tama-toggle', {},
    el('input', { type: 'checkbox', checked: checked ? true : null, onchange: (e) => onToggle(e.target.checked) }),
    el('span.tama-toggle-ui', { 'aria-hidden': 'true' }),
    el('span', {}, el('strong', { text: label }), desc ? el('small', { text: desc }) : null));

  const parts = [
    el('h3', { text: t('tama.set.shell') }), shells,
    toggle(t('tama.set.retro'), t('tama.set.retro_desc'), doc.settings.retro, (v) => setting((st) => { st.retro = v; })),
    toggle(t('tama.set.sound'), t('tama.set.sound_desc'), soundOn(), (v) => { setSoundOn(v); if (v) sfx('select'); }),
  ];

  if (p && !p.end) {
    const nameInput = el('input.tama-input', { type: 'text', value: p.name, maxlength: E.NAME_MAX, 'aria-label': t('tama.set.rename') });
    parts.push(
      el('h3', { text: t('tama.set.rename') }),
      el('form.tama-name-row', { onsubmit: (e) => { e.preventDefault(); const r = petAct((d) => E.rename(d.pet, nameInput.value)); toast?.(t('tama.res.' + r.code), r.ok ? 'ok' : 'err'); onChange?.(); } },
        nameInput, el('button.btn.sm.primary', { type: 'submit', text: t('tama.save') })),
      el('h3', { text: t('tama.set.mode') }),
      el('div.tama-modes', {}, E.MODES.map((m) => el('button.tama-mode' + (p.mode === m ? '.is-on' : ''), {
        type: 'button', 'aria-pressed': p.mode === m ? 'true' : 'false',
        onclick: async () => {
          if (m === p.mode) return;
          if (m === 'classic' && !(await confirmSheet(t('tama.set.classic_warn'), { danger: true }))) return;
          petAct((d) => E.setMode(d.pet, m));
          toast?.(t('tama.res.mode'));
          s.close();
          onChange?.();
        },
      }, el('strong', { text: t('tama.mode.' + m) }), el('small', { text: t('tama.mode_desc.' + m) })))));
    const canBreed = E.canBreed(p, now);
    parts.push(
      el('h3', { text: t('tama.set.breed') }),
      el('p.tama-muted', { text: t('tama.set.breed_desc') }),
      el('button.btn' + (canBreed ? '.primary' : ''), {
        type: 'button', disabled: canBreed ? null : true, title: canBreed ? '' : t('tama.res.cannot_breed'),
        onclick: async () => {
          if (!(await confirmSheet(t('tama.set.breed_confirm', { name: p.name })))) return;
          const r = petAct((d, n) => E.breed(d, n));
          if (r.ok) { sfx('hatch'); toast?.(t('tama.res.bred', { gen: petState.doc.pet.gen }) + (r.mutated ? ' ' + t('tama.res.mutated') : '')); }
          else toast?.(t('tama.res.' + r.code), 'err');
          s.close();
          onChange?.();
        },
      }, t('tama.set.breed')),
      el('h3', { text: t('tama.set.release') }),
      el('button.btn.danger', {
        type: 'button', text: t('tama.set.release'),
        onclick: async () => {
          if (!(await confirmSheet(t('tama.set.release_confirm', { name: p.name }), { danger: true }))) return;
          petAct((d, n) => E.release(d, n));
          s.close();
          onChange?.();
        },
      }));
  }
  const s = sheet(t('tama.settings'), el('div.tama-settings', {}, parts));
  return s;
}

/* -------------------------------------------------------------------------- */
/* Anleitung                                                                      */
/* -------------------------------------------------------------------------- */

export function openHelp() {
  const sections = ['basics', 'icons', 'mistakes', 'ark', 'history', 'keys'];
  const iconGrid = el('div.tama-help-icons', {}, ['feed', 'lights', 'play', 'medicine', 'clean', 'status', 'discipline', 'attention', 'cuddle', 'walk', 'cryo'].map((n) => el('span', {}, svg(icon(n)), el('small', { text: t('tama.act.' + n) }))));
  return sheet(t('tama.help.title'), el('div.tama-help', {}, sections.map((k) => el('section', {},
    el('h3', { text: t(`tama.help.${k}_t`) }),
    el('p', { text: t('tama.help.' + k) }),
    k === 'icons' ? iconGrid : null))), { wide: true });
}

