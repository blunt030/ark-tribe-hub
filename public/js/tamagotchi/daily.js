/**
 * Belohnungsmomente: die tägliche Versorgungskiste (fällt mit Lichtsäule vom
 * Himmel, öffnet sich, zeigt die Beute und die Serie) und die Beute, die das
 * Tier von einer Expedition mitbringt.
 */
import { el } from '../ui.js';
import { t } from '../i18n.js';
import * as P from './progress.js';
import { DROPS } from './catalog.js';
import { icon } from './scene.js';
import { crateArt } from './props.js';
import { petState, petNow, petAct } from './store.js';
import { sfx, buzz } from './sound.js';
import { BY_KEY, svg, artImg, itemImg, creatureThumb } from './common.js';
import { sheet } from './panels.js';

/** Beute als Kacheln, die nacheinander aufploppen. */
export function lootTiles(given = {}) {
  const tiles = [];
  const tile = (art, value, label, cls = '') => el('div.tama-loot-tile' + (cls ? '.' + cls : ''), { style: `animation-delay:${tiles.length * 110 + 150}ms` }, art, el('strong', { text: value }), el('small', { text: label }));
  if (given.shards) tiles.push(tile(itemImg('shard'), '+' + given.shards, t('tama.shards'), 'is-shards'));
  if (given.xp) tiles.push(tile(el('span.tama-loot-xp', { text: 'XP' }), '+' + given.xp, t('tama.xp_long'), 'is-xp'));
  if (given.bond) tiles.push(tile(el('span.tama-loot-bond', {}, svg(icon('heart'))), '+' + given.bond, t('tama.bond'), 'is-bond'));
  for (const [id, n] of given.items || []) tiles.push(tile(itemImg(id), '×' + n, t('tama.item.' + id)));
  return tiles;
}

/** Die sieben Kisten der Woche mit dem heutigen Tag. */
function week(si, claimedNow = false) {
  return el('ol.tama-days.is-big', { 'aria-label': t('tama.drop.week') }, DROPS.map((d, i) => {
    const n = i + 1;
    const done = claimedNow ? n <= si.next : n < si.next;
    return el('li.tama-day' + (done ? '.is-done' : '') + (n === si.next ? '.is-today' : ''), { title: t('tama.drop.color.' + d.color) },
      artImg('crate:' + d.color, () => crateArt(d.color, { beam: false })), el('small', { text: done ? '✓' : String(n) }));
  }));
}

/** Öffnet die heutige Versorgungskiste als kleines Schauspiel. */
export function openDropSheet({ onDone } = {}) {
  const doc = petState.doc;
  const now = petNow();
  if (!doc?.player || !P.dropReady(doc, now)) return null;
  const si = P.streakInfo(doc, now);
  const color = DROPS[si.next - 1].color;
  let opened = false;

  const crate = el('div.tama-drop-crate', {}, svg(crateArt(color)));
  const stage = el('button.tama-drop-stage.drop-' + color, { type: 'button', 'aria-label': t('tama.drop.open'), onclick: () => open() },
    el('span.tama-drop-glow'), crate, el('span.tama-drop-dust'));
  const caption = el('div.tama-drop-caption', {}, el('strong', { text: t('tama.drop.day', { n: si.next }) }), el('span', { text: t('tama.drop.color.' + color) }));
  const weekRow = el('div', {}, week(si));
  const loot = el('div.tama-drop-loot', { 'aria-live': 'polite' });
  const note = el('p.tama-drop-note', { text: si.lost ? t('tama.streak.lost_hint', { n: doc.player.streak }) : si.atRisk && si.freeze ? t('tama.streak.saved_hint') : t('tama.drop.tap') });
  const btn = el('button.btn.primary.tama-cta', { type: 'button', onclick: () => (opened ? s.close() : open()) }, svg(icon('crate')), el('span', { text: t('tama.drop.open') }));
  const s = sheet(t('tama.drop.title'), el('div.tama-drop', {}, stage, caption, weekRow, loot, note, el('div.tama-row-actions', {}, btn)), { onClose: () => onDone?.() });
  const landing = setTimeout(() => { sfx('land'); buzz(20); }, 700);

  function open() {
    if (opened) return;
    const res = petAct((d, n) => P.openDrop(d, n));
    clearTimeout(landing);
    if (!res.ok) { s.close(); return; }
    opened = true;
    sfx('open');
    buzz([20, 30, 60]);
    crate.replaceChildren(svg(crateArt(res.color, { open: true })));
    stage.classList.add('is-open');
    stage.disabled = true;
    weekRow.replaceChildren(week({ ...si, next: ((res.streak - 1) % DROPS.length) + 1 }, true));
    loot.replaceChildren(...lootTiles(res.given));
    const nextColor = t('tama.drop.color.' + DROPS[res.streak % DROPS.length].color);
    note.textContent = res.saved ? t('tama.drop.saved', { n: res.streak })
      : res.lost ? t('tama.drop.lost', { n: res.lost })
        : t('tama.drop.streak', { n: res.streak, next: nextColor });
    btn.replaceChildren(svg(icon('check')), el('span', { text: t('tama.drop.done') }));
    btn.focus();
  }
  return s;
}

/** Das Tier ist von der Expedition zurück – das hat es mitgebracht. */
export function openLootSheet(res, p) {
  const sp = p ? BY_KEY.get(p.species) : null;
  const btn = el('button.btn.primary.tama-cta', { type: 'button', onclick: () => s.close() }, svg(icon('check')), el('span', { text: t('tama.drop.done') }));
  const content = el('div.tama-drop.is-loot', {},
    el('div.tama-loot-hero', {}, sp ? creatureThumb(sp, { stage: p.stage, variant: p.variant, colors: p.colors }) : null, el('span.tama-loot-bag', {}, svg(icon('gift')))),
    el('p.tama-lead', { text: t('tama.loot.back', { name: p?.name || '', zone: t('tama.zone.' + res.zone) }) }),
    el('div.tama-drop-loot', {}, lootTiles(res.given)),
    el('div.tama-row-actions', {}, btn));
  const s = sheet(t('tama.loot.title'), content);
  requestAnimationFrame(() => btn.focus());
  return s;
}
