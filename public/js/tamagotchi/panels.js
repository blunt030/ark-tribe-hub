/**
 * Nebenansichten des Dino-Tamagotchis: Brutstation, Dossier, Ahnengalerie,
 * Tribe-Gehege mit Rangliste, Einstellungen und Anleitung.
 */
import { el } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { api } from '../api.js';
import * as E from './engine.js';
import * as P from './progress.js';
import { SHELLS } from './catalog.js';
import { creatureArt, FORMS } from './art.js';
import { eggArt, foodArt, icon, DIET_FOOD } from './scene.js';
import { toSvgString } from './vdom.js';
import { petState, petNow, petAct } from './store.js';
import { soundOn, setSoundOn, sfx } from './sound.js';
import { BY_KEY, creatureThumb, eggThumb, dur, faceFor, svg, rankName } from './common.js';
import { sheet, confirmSheet } from './sheet.js';
import { roster, speciesAccess, canHatch, nestSpecies, priceOf, formatPrice, isNew, ownedSource, hasArt } from './roster.js';
import { openBuy } from './buy.js';
const NAMES = ['Krümel', 'Nugget', 'Pixel', 'Knuddel', 'Zappel', 'Mampf', 'Tiki', 'Momo', 'Brummi', 'Flocke', 'Schnuffel', 'Zottel', 'Bolt', 'Kiwi', 'Mochi', 'Rumpel', 'Sprout', 'Noodle', 'Blitz', 'Pebble'];

export { sheet, confirmSheet };

/* -------------------------------------------------------------------------- */
/* Artenraster (Brutstation & Dossier)                                         */
/* -------------------------------------------------------------------------- */

const eggCache = new Map();
function eggSrc(sp) {
  if (!eggCache.has(sp.key)) eggCache.set(sp.key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvgString(eggArt(sp))));
  return eggCache.get(sp.key);
}

/** Ei bzw. Brutkapsel als kleines Abzeichen (wie bei den Bestellungen). */
function birthBadge(sp) {
  if (!hasArt(sp.key)) return null;
  const src = sp.birth === 'embryo' ? '/assets/items/cut/embryo.webp' : '/assets/items/cut/egg.webp';
  return el('span.tama-birth-badge', { title: t('tama.birth.' + sp.birth) }, el('img', { src, alt: '', loading: 'lazy', decoding: 'async' }));
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

/** Kennzeichnung einer Art in der Brutstation: gratis, freigeschaltet, Preis oder bald. */
function accessBadge(sp, doc) {
  const a = speciesAccess(sp.key, doc);
  const fresh = isNew(sp.key) ? el('span.tama-access.is-new', { text: t('tama.access.new') }) : null;
  if (a === 'free') return [el('span.tama-access.is-free', { text: t('tama.access.free') }), fresh];
  if (a === 'owned') return [el('span.tama-access.is-owned', {}, svg(icon('check')), el('span', { text: t(ownedSource(sp.key) === 'gift' ? 'tama.access.gift' : 'tama.access.owned') })), fresh];
  if (a === 'kept') return [fresh];
  if (a === 'buy') return [el('span.tama-access.is-buy', {}, svg(icon('lock')), el('span', { text: formatPrice(priceOf(sp.key), getLang()) })), fresh];
  if (a === 'locked') return [el('span.tama-access.is-soon', {}, svg(icon('lock')), el('span', { text: t('tama.access.soon') }))];
  return [];
}

const ORDER = { free: 0, owned: 0, kept: 0, buy: 1, locked: 2, off: 3 };

function speciesGrid({ doc, mode, onPick }) {
  let hab = 'all', query = '', onlyNew = false, access = 'all', io = null;
  const grid = el('div.tama-grid', { role: 'list' });
  const count = el('span.tama-grid-count');
  const chips = ['all', 'L', 'W', 'F', 'M'].map((code) => el('button.tama-filter-chip', {
    type: 'button', 'aria-pressed': code === hab ? 'true' : 'false',
    onclick: () => { hab = code; chips.forEach((c, i) => c.setAttribute('aria-pressed', ['all', 'L', 'W', 'F', 'M'][i] === hab ? 'true' : 'false')); draw(); },
  }, t('tama.hab.' + code)));
  const accessKeys = ['all', 'open', 'buy'];
  const accessChips = mode === 'nest' ? accessKeys.map((k) => el('button.tama-filter-chip.is-access', {
    type: 'button', 'aria-pressed': k === access ? 'true' : 'false',
    onclick: () => { access = k; accessChips.forEach((c, i) => c.setAttribute('aria-pressed', accessKeys[i] === access ? 'true' : 'false')); draw(); },
  }, t('tama.nest.filter_' + k))) : [];
  const search = el('input.tama-search', { type: 'search', placeholder: t('tama.nest.search'), 'aria-label': t('tama.nest.search'), oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); } });
  const newOnly = el('label.tama-check', {}, el('input', { type: 'checkbox', onchange: (e) => { onlyNew = e.target.checked; draw(); } }), el('span', { text: t('tama.nest.only_new') }));

  function tile(sp) {
    const e = doc.dex[sp.key];
    const raised = e?.a > 0;
    const a = speciesAccess(sp.key, doc);
    const locked = mode === 'nest' && !canHatch(sp.key, doc);
    const art = mode === 'nest'
      ? lazyThumb(() => el('span.tama-egg-stack' + (hasArt(sp.key) ? '.is-real' : ''), {},
        hasArt(sp.key) ? creatureThumb(sp, { stage: 'adult' }) : el('img.tama-thumb.is-egg', { src: eggSrc(sp), alt: '', decoding: 'async' }),
        hasArt(sp.key) ? birthBadge(sp) : creatureThumb(sp, { stage: 'baby' }, 'is-peek')))
      : lazyThumb(() => el('span.tama-egg-stack.is-real', {}, creatureThumb(sp, { stage: raised || hasArt(sp.key) ? 'adult' : 'baby', variant: e?.v?.includes('tek') ? 'tek' : e?.v?.includes('alpha') ? 'alpha' : null })));
    return el('button.tama-tile.rarity-' + sp.rarity + (raised ? '.is-raised' : '') + (mode === 'dex' && !e ? '.is-unknown' : '') + (locked ? '.is-locked' : '') + '.access-' + a, {
      type: 'button', role: 'listitem', title: sp.name, onclick: () => onPick(sp),
    },
    el('span.tama-tile-art', {}, art),
    el('span.tama-tile-name', { text: sp.name }),
    el('span.tama-tile-meta', {},
      mode === 'nest' ? accessBadge(sp, doc) : el('span.tama-rarity', { text: t('tama.rarity.' + sp.rarity) }),
      raised ? el('span.tama-tile-check', { title: t('tama.dex.times', { n: e.a }) }, svg(icon('star'))) : null));
  }

  function draw() {
    io?.disconnect();
    const list = nestSpecies(doc).filter((s) => {
      if (hab !== 'all' && s.hab !== hab) return false;
      if (query && !s.name.toLowerCase().includes(query)) return false;
      if (onlyNew && doc.dex[s.key]?.a > 0) return false;
      if (access !== 'all') {
        const open = canHatch(s.key, doc);
        if (access === 'open' ? !open : open) return false;
      }
      return true;
    });
    if (mode === 'nest') list.sort((x, y) => (ORDER[speciesAccess(x.key, doc)] - ORDER[speciesAccess(y.key, doc)]) || x.name.localeCompare(y.name));
    grid.replaceChildren(...list.map(tile));
    count.textContent = t('tama.nest.count', { n: list.length });
    io = observeLazy(grid);
  }
  const node = el('div.tama-species', {},
    el('div.tama-toolbar', {}, search, el('div.tama-filter', {}, chips), accessChips.length ? el('div.tama-filter.is-access', {}, accessChips) : null, newOnly, count),
    grid);
  requestAnimationFrame(draw);
  return node;
}

/* -------------------------------------------------------------------------- */
/* Brutstation                                                                   */
/* -------------------------------------------------------------------------- */

export function nestPanel({ onStart, current, species = null }) {
  const doc = petState.doc;
  const body = el('div.tama-nest-panel');

  function pick(sp) {
    if (canHatch(sp.key, doc)) confirmStep(sp, false);
    else openBuy(sp);
  }

  function chooseStep() {
    const open = nestSpecies(doc).filter((s) => canHatch(s.key, doc) && hasArt(s.key));
    const pool = open.length ? open : nestSpecies(doc).filter((s) => canHatch(s.key, doc));
    const surprise = el('button.tama-surprise', { type: 'button', disabled: pool.length ? null : true, onclick: () => pool.length && confirmStep(pool[Math.floor(Math.random() * pool.length)], true) },
      el('span.tama-surprise-egg', { 'aria-hidden': 'true' }, '?'),
      el('span', {}, el('strong', { text: t('tama.nest.random') }), el('small', { text: t('tama.nest.random_desc') })));
    const cfg = roster();
    const total = nestSpecies(doc).length;
    body.replaceChildren(...[
      el('p.tama-lead', { text: t('tama.nest.sub', { n: total }) + (cfg.free.length ? ' ' + t('tama.nest.sub_free', { n: cfg.free.length }) : '') }),
      cfg.dev ? el('p.tama-hint', { text: t('tama.nest.dev_hint') }) : null,
      surprise,
      speciesGrid({ doc, mode: 'nest', onPick: pick })].filter(Boolean));
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
    const art = surprise ? el('span.tama-surprise-egg.is-big', { text: '?' })
      : hasArt(sp.key) ? el('span.tama-egg-stack.is-real.is-big', {}, creatureThumb(sp, { stage: 'adult', alt: sp.name }), birthBadge(sp))
        : svg(eggArt(sp));
    body.replaceChildren(el('div.tama-confirm-egg', {},
      el('div.tama-confirm-art' + (surprise ? '.is-surprise' : ''), {}, art),
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

  if (species) pick(species);
  if (!species || !canHatch(species.key, doc)) chooseStep();
  return body;
}

export function openNest({ onStarted, species = null } = {}) {
  let s = null;
  const current = petState.doc?.pet;
  const panel = nestPanel({
    current,
    species,
    onStart: ({ species: key, name, mode }) => {
      petAct((doc, now) => P.startEgg(doc, { species: key, name, mode, now }));
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
  const total = nestSpecies(doc).length;
  return el('div.tama-dossier', {},
    el('div.tama-stats', {},
      stat(t('tama.dex.raised'), raised, total),
      stat(t('tama.dex.hatched'), hatched, total),
      stat(t('tama.dex.variants'), variants, total * 4)),
    el('p.tama-lead', { text: t('tama.dex.sub') }),
    speciesGrid({ doc, mode: 'dex', onPick: (sp) => dexDetail(sp, { go }) }));
}

function dexDetail(sp, { go }) {
  const doc = petState.doc;
  const e = doc.dex[sp.key] || { h: 0, a: 0, v: [] };
  const food = DIET_FOOD[sp.diet] || 'meat';
  const real = hasArt(sp.key);
  const variant = e.v.includes('tek') ? 'tek' : e.v.includes('alpha') ? 'alpha' : null;
  let s = null;
  const hero = el('div.tama-dex-hero.biome-' + sp.biome + (real ? '.is-real' : ''), {},
    real ? creatureThumb(sp, { stage: 'adult', variant, alt: sp.name }) : svg(creatureArt(sp, { stage: 'adult', variant })),
    real ? birthBadge(sp) : null);
  const access = speciesAccess(sp.key, doc);
  const hatchable = canHatch(sp.key, doc);
  const cta = hatchable
    ? el('button.btn.primary.tama-cta', { type: 'button', onclick: () => {
      s.close();
      let nest = null;
      const panel = nestPanel({
        current: petState.doc.pet,
        species: sp,
        onStart: ({ species, name, mode }) => { petAct((d, now) => P.startEgg(d, { species, name, mode, now })); sfx('hatch'); nest?.close(); go('/tamagotchi'); },
      });
      nest = sheet(t('tama.nest.title'), panel, { wide: true });
    } }, svg(icon('egg')), el('span', { text: t('tama.dex.hatch_this') }))
    : access === 'buy'
      ? el('button.btn.primary.tama-cta', { type: 'button', onclick: () => { s.close(); openBuy(sp); } }, svg(icon('lock')), el('span', { text: t('tama.buy.unlock_cta', { price: formatPrice(priceOf(sp.key), getLang()) }) }))
      : el('p.tama-muted', { text: t('tama.buy.soon') });
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
    el('div.tama-row-actions', {}, cta));
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
        el('div.tama-mini-art.biome-' + sp.biome, {}, a.stage === 'egg' ? eggThumb(sp) : creatureThumb(sp, { stage: a.stage, variant: a.variant, colors: a.colors })),
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

  // Rangliste: Pfleger-Rang, dann Serie
  const board = [...res.pets].sort((a, b) => (b.xp - a.xp) || (b.streak - a.streak));
  const leaderboard = el('section.tama-card.is-board', {},
    el('h3.tama-card-title', {}, svg(icon('trophy')), el('span', { text: t('tama.tribe.board') })),
    el('ol.tama-board', {}, board.map((entry, i) => {
      const r = P.rankOf(entry.xp);
      return el('li.tama-board-row' + (entry.userId === user.id ? '.is-me' : '') + (i < 3 ? '.is-top' : ''), {},
        el('span.tama-board-pos', { text: String(i + 1) }),
        el('span.tama-board-name', {}, el('strong', { text: entry.userId === user.id ? t('tama.tribe.you') : entry.username }),
          el('small', { text: `${t('tama.rank_short', { n: r.level })} · ${rankName(r.level)}` })),
        el('span.tama-board-stat', { title: t('tama.streak.title') }, svg(icon('flame')), el('b', { text: String(entry.streak) }), el('small', { text: t('tama.streak.best_short', { n: entry.best }) })),
        el('span.tama-board-stat', { title: t('tama.dex.raised') }, svg(icon('star')), el('b', { text: String(entry.raised) })));
    })));

  const pets = res.pets.filter((entry) => BY_KEY.has(entry.pet?.species));
  return el('div.tama-tribe', {},
    leaderboard,
    pets.length ? el('p.tama-lead', { text: t('tama.tribe.sub') }) : null,
    el('div.tama-cards', {}, pets.map((entry) => {
      const sp = BY_KEY.get(entry.pet.species);
      const p = { ...structuredClone(entry.pet), log: [] };
      try { E.advance(p, now); } catch { /* fremder Stand – dann eben der gespeicherte */ }
      const mood = E.mood(p, now);
      const art = p.stage === 'egg' ? eggThumb(sp) : creatureThumb(sp, { stage: p.stage, variant: p.variant, colors: p.colors });
      return el('article.tama-mini.mood-' + mood + (entry.userId === user.id ? '.is-me' : ''), {},
        el('div.tama-mini-art.biome-' + sp.biome, { dataset: { face: faceFor(mood) } }, art, el('span.tama-mood-chip', { text: t('tama.mood.' + mood) })),
        el('div.tama-mini-copy', {},
          el('strong', { text: p.name }),
          el('span', { text: `${sp.name} · ${t('tama.stage.' + p.stage)}${p.variant ? ' · ' + t('tama.variant.' + p.variant) : ''}` }),
          el('small', { text: `${entry.userId === user.id ? t('tama.tribe.you') : entry.username} · ${dur(E.ageMs(p, now))} · ${t('tama.bond_level', { n: E.bondLevel(p) })}` })));
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

  // Gehäuse: freigeschaltete sind wählbar, die übrigen zeigen, wie man sie bekommt.
  const shells = el('div.tama-swatches', { role: 'radiogroup', 'aria-label': t('tama.set.shell') }, Object.keys(SHELLS).map((shell) => {
    const owned = P.owns(doc, 'shell_' + shell);
    const lock = owned ? null : P.lockReason(doc, 'shell_' + shell, now);
    const def = SHELLS[shell];
    const how = owned ? '' : lock === 'rank' ? t('tama.lock.rank', { n: def.rank }) : lock === 'event' ? t('tama.lock.event', { event: t('tama.event.' + def.event) }) : t('tama.lock.shop', { n: def.price });
    return el('button.tama-swatch.shell-' + shell + (owned ? '' : '.is-locked'), {
      type: 'button', role: 'radio', 'aria-checked': doc.settings.shell === shell ? 'true' : 'false', 'aria-disabled': owned ? null : 'true', title: owned ? t('tama.shell.' + shell) : `${t('tama.shell.' + shell)} – ${how}`,
      onclick: (e) => {
        if (!owned) { toast?.(how); return; }
        const r = petAct((d) => P.setShell(d, shell));
        if (!r.ok) return;
        onChange?.();
        shells.querySelectorAll('.tama-swatch').forEach((n) => n.setAttribute('aria-checked', 'false'));
        e.currentTarget.setAttribute('aria-checked', 'true');
      },
    }, owned ? null : svg(icon('lock')), el('span', { text: t('tama.shell.' + shell) }));
  }));
  const toggle = (label, desc, checked, onToggle) => el('label.tama-toggle', {},
    el('input', { type: 'checkbox', checked: checked ? true : null, onchange: (e) => onToggle(e.target.checked) }),
    el('span.tama-toggle-ui', { 'aria-hidden': 'true' }),
    el('span', {}, el('strong', { text: label }), desc ? el('small', { text: desc }) : null));

  const sceneNow = doc.settings.scene === 'painted' ? 'painted' : 'map';
  const scenes = el('div.tama-modes.is-scenes', { role: 'radiogroup', 'aria-label': t('tama.set.scene') }, ['map', 'painted'].map((k) => el('button.tama-mode' + (k === sceneNow ? '.is-on' : ''), {
    type: 'button', role: 'radio', 'aria-checked': k === sceneNow ? 'true' : 'false',
    onclick: (e) => {
      setting((st) => { st.scene = k; });
      scenes.querySelectorAll('.tama-mode').forEach((n) => { n.classList.remove('is-on'); n.setAttribute('aria-checked', 'false'); });
      e.currentTarget.classList.add('is-on');
      e.currentTarget.setAttribute('aria-checked', 'true');
    },
  }, el('strong', { text: t('tama.set.scene_' + k) }), el('small', { text: t('tama.set.scene_' + k + '_desc') }))));

  const parts = [
    el('h3', { text: t('tama.set.shell') }), shells,
    el('h3', { text: t('tama.set.scene') }), scenes,
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
          const r = petAct((d, n) => P.breed(d, n));
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
  const sections = ['basics', 'keys', 'stations', 'daily', 'mistakes', 'ark', 'history'];
  const stations = [['feed', 'feed'], ['moon', 'sleep'], ['play', 'play'], ['medicine', 'vet'], ['bath', 'care'], ['whistle', 'train'], ['compass', 'trip'], ['home', 'home']];
  const iconGrid = el('div.tama-help-icons', {}, stations.map(([ic, key]) => el('span', {}, svg(icon(ic)), el('small', { text: t('tama.st.' + key) }))));
  const keyGrid = el('div.tama-help-icons.is-keys', {}, [['radar', 'scan'], ['sparkle', 'context'], ['menu', 'menu']].map(([ic, key]) => el('span', {}, svg(icon(ic)), el('small', { text: t('tama.help.key_' + key) }))));
  return sheet(t('tama.help.title'), el('div.tama-help', {}, sections.map((k) => el('section', {},
    el('h3', { text: t(`tama.help.${k}_t`) }),
    el('p', { text: t('tama.help.' + k) }),
    k === 'stations' ? iconGrid : k === 'keys' ? keyGrid : null))), { wide: true });
}
