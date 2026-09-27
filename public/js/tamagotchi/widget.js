/**
 * Kleine Tamagotchi-Kachel für die Startseite: zeigt das Tier, seine Herzen und
 * ob es gerade ruft. Die Startseite lädt das Modul erst nach, wenn sie steht.
 */
import { el } from '../ui.js';
import { t } from '../i18n.js';
import { uiIcon } from '../ui-icons.js';
import './texts.js';
import * as E from './engine.js';
import { petState, petNow, loadPet, onPetChange } from './store.js';
import { BY_KEY, creatureThumb, dur, svg } from './device.js';
import { eggArt, icon } from './scene.js';
import { SPECIES } from './species.js';
import { toSvgString } from './vdom.js';

function hearts(value) {
  const full = Math.round(value / 25);
  return el('span.tama-hearts', { 'aria-label': `${Math.round(value)} %` },
    [0, 1, 2, 3].map((i) => el('span.tama-heart' + (i < full ? '.is-full' : ''), {}, svg(icon('heart')))));
}

export async function petWidget({ user, go }) {
  await loadPet(user);
  const box = el('section.dash-panel.dash-tama');
  const open = () => go('/tamagotchi');

  function draw() {
    const p = petState.doc?.pet;
    const sp = p ? BY_KEY.get(p.species) : null;
    const now = petNow();
    const head = el('div.dash-heading', {}, uiIcon('egg-crack', 'dash-heading-icon'), el('h2', { text: t('nav.tamagotchi') }),
      el('button.dash-heading-link', { type: 'button', onclick: open }, el('span', { text: t('dash.show') }), uiIcon('arrow-right')));
    if (!p || !sp) {
      box.replaceChildren(head, el('button.dash-tama-body', { type: 'button', onclick: open },
        el('span.dash-tama-art.is-empty', {}, svg(icon('egg'))),
        el('span.dash-tama-copy', {}, el('strong', { text: t('tama.widget.empty') }), el('small', { text: t('tama.widget.cta', { n: SPECIES.length }) }))));
      return;
    }
    const calls = p.end ? [] : E.calling(p, now);
    const mood = E.mood(p, now);
    const art = p.stage === 'egg'
      ? el('img.tama-thumb', { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvgString(eggArt(sp))), alt: '' })
      : creatureThumb(sp, { stage: p.stage, variant: p.variant, colors: p.colors });
    let status;
    if (calls.length) status = el('span.dash-tama-pill.is-call', { text: t('tama.ev.call', { name: p.name }) });
    else if (p.stage === 'egg') status = el('span.dash-tama-pill', { text: t('tama.hatch_in', { time: dur(p.hatchAt - now) }) });
    else status = el('span.dash-tama-pill' + (p.end ? '.is-gone' : ''), { text: t('tama.mood.' + mood) });
    box.replaceChildren(head, el('button.dash-tama-body', { type: 'button', onclick: open, 'aria-label': `${p.name} – ${t('nav.tamagotchi')}` },
      el('span.dash-tama-art.biome-' + sp.biome + (p.end ? '.is-gone' : ''), {}, art),
      el('span.dash-tama-copy', {},
        el('strong', { text: p.name }),
        el('small', { text: `${sp.name} · ${t('tama.stage.' + p.stage)}` }),
        p.stage !== 'egg' && !p.end ? el('span.dash-tama-hearts', {}, hearts(p.m.hunger), hearts(p.m.happy)) : null,
        status)));
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
