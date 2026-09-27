/**
 * Kleine Tamagotchi-Kachel für die Startseite: zeigt das Tier, seine Herzen und
 * ob es gerade ruft. Die Startseite lädt das Modul erst nach, wenn sie steht.
 */
import { el, panel } from '../ui.js';
import { t } from '../i18n.js';
import './texts.js';
import './texts-play.js';
import './texts-shop.js';
import * as E from './engine.js';
import * as P from './progress.js';
import { petState, petNow, loadPet, onPetChange } from './store.js';
import { BY_KEY, creatureThumb, eggThumb, dur, svg, hearts } from './common.js';
import { icon } from './scene.js';
import { nestSpecies } from './roster.js';

/** Kiste und Tagesaufgaben – der Grund, täglich vorbeizuschauen. */
function daily(doc, p, now) {
  const pl = doc?.player;
  if (!pl) return null;
  const out = [];
  if (P.dropReady(doc, now) && (p || pl.lastDay)) out.push(el('span.dash-tama-pill.is-drop', {}, svg(icon('crate')), el('span', { text: t('tama.widget.drop') })));
  if (pl.quests.length && pl.day === P.ENV.dayKey(now)) {
    const done = pl.quests.filter((q) => q.done).length;
    out.push(el('span.dash-tama-pill.is-quests', {}, svg(icon('list')), el('span', { text: t('tama.widget.quests', { n: done, total: pl.quests.length }) })));
  }
  if (pl.streak > 1 && P.streakInfo(doc, now).streak > 1) out.push(el('span.dash-tama-pill.is-streak', {}, svg(icon('flame')), el('span', { text: String(pl.streak) })));
  return out.length ? el('span.dash-tama-daily', {}, out) : null;
}

export async function petWidget({ user, go }) {
  await loadPet(user);
  const open = () => go('/tamagotchi');
  const body = el('div.dash-tama-wrap');
  const box = panel({ title: t('nav.tamagotchi'), icon: 'egg-crack', link: t('dash.details'), onLink: open, className: 'dash-tama' }, body);

  function draw() {
    const p = petState.doc?.pet;
    const sp = p ? BY_KEY.get(p.species) : null;
    const now = petNow();
    if (!p || !sp) {
      body.replaceChildren(el('button.dash-tama-body', { type: 'button', onclick: open },
        el('span.dash-tama-art.is-empty', {}, svg(icon('egg'))),
        el('span.dash-tama-copy', {}, el('strong', { text: t('tama.widget.empty') }), el('small', { text: t('tama.widget.cta', { n: nestSpecies(petState.doc).length }) }), daily(petState.doc, null, now))));
      return;
    }
    const calls = p.end ? [] : E.calling(p, now);
    const mood = E.mood(p, now);
    const art = p.stage === 'egg'
      ? eggThumb(sp)
      : creatureThumb(sp, { stage: p.stage, variant: p.variant, colors: p.colors });
    let status;
    if (calls.length) status = el('span.dash-tama-pill.is-call', { text: t('tama.ev.call', { name: p.name }) });
    else if (p.stage === 'egg') status = el('span.dash-tama-pill', { text: t('tama.hatch_in', { time: dur(p.hatchAt - now) }) });
    else status = el('span.dash-tama-pill' + (p.end ? '.is-gone' : ''), { text: t('tama.mood.' + mood) });
    body.replaceChildren(el('button.dash-tama-body', { type: 'button', onclick: open, 'aria-label': `${p.name} – ${t('nav.tamagotchi')}` },
      el('span.dash-tama-art.biome-' + sp.biome + (p.end ? '.is-gone' : ''), {}, art),
      el('span.dash-tama-copy', {},
        el('strong', { text: p.name }),
        el('small', { text: `${sp.name} · ${t('tama.stage.' + p.stage)}` }),
        p.stage !== 'egg' && !p.end ? el('span.dash-tama-hearts', {}, hearts(p.m.hunger), hearts(p.m.happy)) : null,
        status,
        daily(petState.doc, p, now))));
  }

  draw();
  // Abmelden erst, wenn die Kachel eingehängt war und wieder verschwunden ist
  let seen = false;
  const off = onPetChange((state, ev) => {
    if (box.isConnected) seen = true;
    else { if (seen) off(); return; }
    if (ev?.type !== 'saved') draw();
  });
  return box;
}
