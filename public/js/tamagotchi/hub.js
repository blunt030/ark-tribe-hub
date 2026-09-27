/**
 * Übersicht neben dem Gerät: „Heute“ (Versorgungskiste mit Serie, Tagesaufgaben
 * und Events), Rang & Bindung und die Karten zum Tier (Vitalwerte, Wachstum,
 * Prägung, Entwicklung, Protokoll). Zeichnet sich bei jeder Änderung selbst neu.
 */
import { el } from '../ui.js';
import { t, timeAgo, getLang } from '../i18n.js';
import * as E from './engine.js';
import * as P from './progress.js';
import { DROPS, QUESTS, QUEST_BONUS, TRICKS } from './catalog.js';
import { foodArt, icon, DIET_FOOD } from './scene.js';
import { crateArt, itemArt } from './props.js';
import { h } from './vdom.js';
import { petState, petNow, petAct, onPetChange, claimGift } from './store.js';
import { sfx } from './sound.js';
import { roster } from './roster.js';
import { BY_KEY, svg, dur, clock, hearts, creatureThumb, requestText, artImg, itemImg, shards, questText, rankName, rewardChips, eventName } from './common.js';

const QUEST_ICON = {
  drop: 'crate', feed: 'feed', kibble: 'feed', play: 'play', win: 'star', cuddle: 'cuddle', clean: 'clean', groom: 'bath',
  train: 'whistle', trick: 'star', walk: 'walk', expedition: 'compass', imprint: 'heart', egg: 'egg', buy: 'bag',
};

const LOCALES = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES' };

function card(cls, title, iconName, ...children) {
  return el('section.tama-card.' + cls, {}, el('h3.tama-card-title', {}, svg(icon(iconName)), el('span', { text: title })), ...children);
}

function meterRow(name, value, extra = null, kind = 'bar') {
  const v = Math.round(value);
  const tone = v <= 15 ? 'is-low' : v <= 40 ? 'is-mid' : 'is-ok';
  return el('div.tama-meter.' + tone, {},
    el('span.tama-meter-label', { text: t('tama.meter.' + name) }),
    kind === 'hearts' ? hearts(value)
      : kind === 'segs' ? el('span.tama-segs', {}, [0, 1, 2, 3].map((i) => el('span' + (i < value / 25 ? '.is-on' : ''))))
        : el('span.tama-bar', {}, el('span', { style: `width:${v}%` })),
    el('span.tama-meter-value', { text: extra ?? v + ' %' }));
}

function ring(pct, label, sub, cls = '') {
  const r = 42, c = 2 * Math.PI * r;
  return el('div.tama-ring' + (cls ? '.' + cls : ''), {},
    svg(h('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' },
      h('circle', { cx: 50, cy: 50, r, class: 'ring-bg' }),
      h('circle', { cx: 50, cy: 50, r, class: 'ring-fg', 'stroke-dasharray': `${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}`, transform: 'rotate(-90 50 50)' }))),
    el('span.tama-ring-copy', {}, el('strong', { text: label }), sub ? el('small', { text: sub }) : null));
}

function unlockName(id) {
  if (id.startsWith('shell_')) return t('tama.shell.' + id.slice(6));
  if (id.startsWith('zone_')) return t('tama.zone.' + id.slice(5));
  return t('tama.decor.' + id);
}

function multText(mult) {
  return Object.entries(mult).map(([k, v]) => `${t('tama.mult.' + k)} ×${String(v).replace('.', getLang() === 'en' ? '.' : ',')}`).join(' · ');
}

/** Nächstes Saison-Event (ohne Wochenende) in den kommenden 60 Tagen. */
function nextEvent(now) {
  for (let d = 1; d <= 60; d++) {
    const at = now + d * E.DAY;
    const ev = P.eventsAt(at).find((e) => e.id !== 'evolution');
    if (ev) return { ev, days: d };
  }
  return null;
}

export function logText(l, sp) {
  if (l.k === 'mistake') return t('tama.log.mistake', { what: t('tama.mistake.' + l.v) });
  if (l.k === 'evolve') return t('tama.log.evolve', { stage: t('tama.stage.' + l.v) });
  if (l.k === 'end') return t('tama.log.end', { cause: t('tama.cause.' + l.v) });
  if (l.k === 'request') return t('tama.log.request', { what: requestText({ type: l.v }, sp) });
  if (l.k === 'imprint') return t('tama.log.imprint', { v: l.v });
  if (l.k === 'sick' && l.v === 'tummy') return t('tama.log.sick_tummy');
  if (l.k === 'slept') return t('tama.log.slept_' + l.v);
  if (['train', 'train_fail', 'trick_learned', 'trick'].includes(l.k)) return t('tama.log.' + l.k, { trick: t('tama.trick.' + l.v) });
  if (['expedition', 'returned'].includes(l.k)) return t('tama.log.' + l.k, { zone: t('tama.zone.' + l.v) });
  return t('tama.log.' + l.k);
}

/**
 * Baut die Übersicht. `openDrop` öffnet die Versorgungskiste, `openStation`
 * springt zu einer Station des Geräts (fehlt ohne Gerät), `go` wechselt die Seite.
 */
export function createHub({ openDrop, go, toast }) {
  const root = el('div.tama-bento');
  const locale = () => LOCALES[getLang()] || 'de-DE';

  function swap(i) {
    const res = petAct((d, now) => P.swapQuest(d, i, now));
    if (res.ok) { sfx('select'); toast?.(t('tama.quest.swapped')); } else toast?.(t('tama.res.' + res.code), 'err');
  }

  function todayCard(doc, now) {
    const pl = doc.player;
    const si = P.streakInfo(doc, now);
    const ready = P.dropReady(doc, now);
    const date = new Date(now).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });

    const days = el('ol.tama-days', { 'aria-label': t('tama.drop.week') }, DROPS.map((d, i) => {
      const n = i + 1;
      const done = si.claimed ? n <= si.next : n < si.next;
      const today = n === si.next;
      return el('li.tama-day' + (done ? '.is-done' : '') + (today ? '.is-today' : '') + (today && ready ? '.is-ready' : ''), { title: `${t('tama.drop.day', { n })} · ${t('tama.drop.color.' + d.color)}` },
        artImg('crate:' + d.color, () => crateArt(d.color, { beam: false })),
        el('small', { text: done ? '✓' : String(n) }));
    }));
    const action = ready
      ? el('button.btn.primary.tama-cta.is-drop', { type: 'button', onclick: () => openDrop?.() }, svg(icon('crate')), el('span', { text: t('tama.drop.open') }))
      : el('div.tama-next-drop', {}, svg(icon('clock')), el('span', { text: t('tama.drop.next') + ' ' }), el('b', { dataset: { clock: String(P.ENV.nextDay(now)) } }));
    let hint = null;
    if (!si.claimed && si.atRisk && si.freeze > 0) hint = el('p.tama-hint.is-ok', { text: t('tama.streak.saved_hint') });
    else if (si.lost) hint = el('p.tama-hint.is-warn', { text: t('tama.streak.lost_hint', { n: pl.streak }) });
    else if (!si.claimed && si.streak > 0) hint = el('p.tama-hint', { text: t('tama.streak.keep_hint', { n: si.streak + 1 }) });

    const doneCount = pl.quests.filter((q) => q.done).length;
    const quests = el('ul.tama-quests', {},
      pl.quests.map((q, i) => el('li.tama-quest' + (q.done ? '.is-done' : ''), {},
        el('span.tama-quest-ico', {}, svg(icon(q.done ? 'check' : QUEST_ICON[q.id] || 'star'))),
        el('span.tama-quest-copy', {},
          el('strong', { text: questText(q) }),
          el('span.tama-bar.is-thin', {}, el('span', { style: `width:${Math.round(q.n / q.goal * 100)}%` })),
          el('span.tama-quest-meta', {}, el('small', { text: `${q.n}/${q.goal}` }), ...rewardChips({ shards: QUESTS[q.id].shards, xp: QUESTS[q.id].xp }))),
        !q.done && !pl.swapped ? el('button.tama-swap', { type: 'button', title: t('tama.quest.swap'), 'aria-label': t('tama.quest.swap'), onclick: () => swap(i) }, svg(icon('swap'))) : null)),
      el('li.tama-quest.is-bonus' + (pl.bonus ? '.is-done' : ''), {},
        el('span.tama-quest-ico', {}, svg(icon(pl.bonus ? 'check' : 'gift'))),
        el('span.tama-quest-copy', {}, el('strong', { text: t('tama.quest.bonus') }), el('span.tama-quest-meta', {}, ...rewardChips(QUEST_BONUS)))));

    const evs = P.eventsAt(now);
    const upcoming = evs.some((e) => e.id !== 'evolution') ? null : nextEvent(now);
    const events = el('div.tama-events-row', {},
      evs.map((e) => el('span.tama-event.ev-' + e.id + (e.custom ? '.is-custom' : ''), {}, svg(icon('sparkle')), el('strong', { text: eventName(e) }), el('small', { text: multText(e.mult) }))),
      upcoming ? el('span.tama-event.is-soon', {}, svg(icon('clock')), el('strong', { text: eventName(upcoming.ev) }), el('small', { text: t('tama.event.in', { n: upcoming.days }) })) : null);

    return card('is-today', t('tama.card.today'), 'sparkle',
      el('p.tama-today-date', { text: date }),
      events,
      el('div.tama-drop-row', {},
        el('div.tama-streak', {}, svg(icon('flame')), el('strong', { text: t('tama.streak.days', { n: si.streak }) }), el('small', { text: t('tama.streak.best', { n: si.best }) }),
          si.freeze ? el('span.tama-freeze', { title: t('tama.item.freeze') }, itemImg('freeze'), el('b', { text: '×' + si.freeze })) : null),
        days,
        action),
      hint,
      el('h4.tama-sub', {}, el('span', { text: t('tama.quest.title') }), el('small', { text: `${doneCount}/${pl.quests.length}` })),
      quests);
  }

  function rankCard(doc) {
    const pl = doc.player;
    const r = P.rankOf(pl.xp);
    const p = doc.pet;
    const next = P.unlocksAt(r.level + 1);
    const kids = [
      el('div.tama-rank', {},
        el('span.tama-rank-badge', {}, el('b', { text: String(r.level) })),
        el('div.tama-rank-copy', {},
          el('strong', { text: rankName(r.level) }),
          el('span.tama-bar.is-xp', {}, el('span', { style: `width:${Math.round(r.pct)}%` })),
          el('small', { text: t('tama.rank.xp', { xp: pl.xp - r.lo, need: r.hi - r.lo }) }))),
      el('div.tama-wallet', {}, shards(pl.shards, 'is-big'),
        go ? el('button.btn.sm.tama-shop-btn', { type: 'button', onclick: () => go('/tamagotchi/shop') }, svg(icon('bag')), el('span', { text: t('tama.tab.shop') })) : null),
    ];
    if (next.length) kids.push(el('p.tama-hint', { text: t('tama.rank.next', { n: r.level + 1, list: next.map(unlockName).join(', ') }) }));
    if (p && !p.end && p.stage !== 'egg') {
      const bp = E.bondProgress(p);
      const nextTrick = Object.entries(TRICKS).find(([, d]) => d.bond > bp.level);
      kids.push(el('div.tama-bond', {},
        el('span.tama-bond-ico', {}, svg(icon('heart'))),
        el('div.tama-bond-copy', {},
          el('strong', { text: t('tama.bond_with', { name: p.name, n: bp.level }) }),
          el('span.tama-bar.is-bond', {}, el('span', { style: `width:${Math.round(bp.pct)}%` })),
          nextTrick ? el('small', { text: t('tama.bond.next', { n: nextTrick[1].bond, trick: t('tama.trick.' + nextTrick[0]) }) }) : el('small', { text: t('tama.bond.max') }))));
    }
    return card('is-rank', t('tama.card.rank'), 'trophy', ...kids);
  }

  function petCards(doc, now) {
    const p = doc.pet;
    const sp = p ? BY_KEY.get(p.species) : null;
    if (!p || !sp) return [];
    const info = E.stageInfo(p, now);
    const cards = [];

    if (p.end) {
      cards.push(card('is-memorial', p.end.cause === 'retired' || p.end.cause === 'bred' ? t('tama.retired_title', { name: p.name }) : t('tama.gone_title', { name: p.name }), 'star',
        creatureThumb(sp, { stage: p.stage === 'egg' ? 'baby' : p.stage, variant: p.variant, colors: p.colors }, 'is-memorial-art'),
        el('p', { text: t('tama.gone_sub', { cause: t('tama.cause.' + p.end.cause), age: dur(E.ageMs(p, now)), gen: p.gen }) })));
    }

    if (p.stage !== 'egg' && !p.end) {
      cards.push(card('is-vitals', t('tama.card.vitals'), 'status',
        meterRow('hunger', p.m.hunger, null, 'hearts'),
        meterRow('happy', p.m.happy, null, 'hearts'),
        meterRow('energy', p.m.energy),
        meterRow('health', p.m.health),
        meterRow('hygiene', E.hygiene(p, now)),
        meterRow('discipline', p.m.discipline, `${Math.round(p.m.discipline)} %`, 'segs'),
        el('div.tama-chips', {},
          el('span.tama-chip', { text: `${t('tama.meter.weight')} ${Math.round(p.m.weight)} · ${t('tama.weight.' + E.weightStatus(p))}` }),
          el('span.tama-chip', { text: `${t('tama.meter.age')} ${dur(E.ageMs(p, now))}` }),
          ...E.activeBuffs(p, now).map((b) => el('span.tama-chip.is-buff.buff-' + b.kind, { text: `${t('tama.buff.' + b.kind)} · ${dur(b.left)}` })))));
    }

    if (!p.end) {
      const stages = E.STAGES;
      const idx = stages.indexOf(p.stage);
      cards.push(card('is-growth', t('tama.card.growth'), 'leaf',
        el('div.tama-growth', {},
          ring(info.pct, t('tama.stage.' + p.stage), Math.round(info.pct) + ' %', 'is-growth-ring'),
          el('div.tama-growth-copy', {},
            p.stage === 'egg'
              ? el('p', {}, el('span', { text: t('tama.hatch_in', { time: '' }) }), el('b', { dataset: { until: String(p.hatchAt) } }))
              : info.next
                ? el('p', {}, el('span', { text: t('tama.next_stage', { stage: t('tama.stage.' + info.next) }) + ' ' }), el('b', { text: p.cryo ? '—' : t('tama.in', { time: dur(info.left) }) }))
                : el('p', { text: t('tama.final_stage') }),
            el('ol.tama-track', {}, stages.map((s, i) => el('li' + (i < idx ? '.is-done' : i === idx ? '.is-now' : ''), { title: t('tama.stage.' + s) }, el('span', { text: t('tama.stage.' + s) }))))))));
    }

    if (p.stage !== 'egg' && !p.end) {
      const every = E.REQUEST_EVERY[p.stage];
      const req = [];
      if (p.request) {
        const art = p.request.type === 'meal' ? foodArt(DIET_FOOD[sp.diet] || 'meat') : ['kibble', 'snack'].includes(p.request.type) ? itemArt('kibble_regular') : icon(p.request.type === 'cuddle' ? 'cuddle' : 'walk');
        req.push(el('div.tama-request', {},
          el('span.tama-request-art', {}, svg(art)),
          el('span', {}, el('small', { text: t('tama.imprint_wants') }), el('strong', { text: requestText(p.request, sp) }),
            el('small', {}, el('span', { text: t('tama.imprint_expires', { time: '' }) }), el('b', { dataset: { until: String(p.request.until) } })))));
      } else if (every) {
        const next = E.nextRequestIn(p, now);
        req.push(el('div.tama-request.is-waiting', {}, el('small', { text: t('tama.imprint_next') }), el('b.tama-clock', { dataset: { clock: String(now + (next ?? 0)) } })));
      } else req.push(el('p.tama-muted', { text: t('tama.imprint_done') }));
      cards.push(card('is-imprint', t('tama.card.imprint'), 'cuddle',
        el('div.tama-growth', {}, ring(p.m.imprint, Math.round(p.m.imprint) + ' %', t('tama.card.imprint'), 'is-imprint-ring'), el('div.tama-growth-copy', {}, ...req)),
        el('p.tama-hint', { text: t('tama.imprint_hint') })));

      const fc = E.forecast(p);
      const adultish = p.stage === 'adult' || p.stage === 'elder';
      const shown = ['alpha', 'loyal', 'feral'].concat(p.variant === 'tek' ? ['tek'] : []);
      cards.push(card('is-forecast', t('tama.card.forecast'), 'star',
        el('div.tama-variants', {}, shown.map((v) => el('figure.tama-variant' + (v === fc ? '.is-on' : ''), {},
          creatureThumb(sp, { stage: 'adult', variant: v, colors: p.colors }),
          el('figcaption', { text: t('tama.variant.' + v) })))),
        el('p', {}, el('span', { text: (adultish ? t('tama.became') : t('tama.forecast')) + ': ' }), el('b', { text: t('tama.variant.' + fc) }), el('span', { text: ' – ' + t('tama.variant_desc.' + fc) })),
        el('div.tama-chips', {},
          el('span.tama-chip' + (p.cm > 2 ? '.is-warn' : ''), { text: `${t('tama.care_mistakes')}: ${p.cm}` }),
          el('span.tama-chip' + (p.dm > 1 ? '.is-warn' : ''), { text: `${t('tama.discipline_mistakes')}: ${p.dm}` })),
        el('p.tama-hint', { text: adultish ? (p.variant === 'alpha' ? t('tama.secret_hint') : t('tama.variant_desc.' + p.variant)) : t('tama.forecast_hint.' + fc) })));
    }

    const logItems = [...(p.log || [])].reverse().slice(0, 12);
    cards.push(card('is-log', t('tama.card.log'), 'info',
      logItems.length ? el('ul.tama-log', {}, logItems.map((l) => el('li', {}, el('span', { text: logText(l, sp) }), el('time', { text: timeAgo(new Date(l.t).toISOString()), datetime: new Date(l.t).toISOString() }))))
        : el('p.tama-muted', { text: t('tama.log_empty') })));
    return cards;
  }

  /** Geschenke des Betreibers: annehmen schreibt sie direkt in den Spielstand. */
  function giftCards() {
    return (roster().gifts || []).map((g) => {
      const btn = el('button.btn.primary.tama-cta', { type: 'button', onclick: async () => {
        btn.disabled = true;
        try {
          await claimGift(g.id);
          sfx('coin');
          toast?.(t('tama.gift.claimed'));
        } catch (err) {
          btn.disabled = false;
          toast?.(err?.message || t('tama.gift.error'), 'err');
        }
      } }, svg(icon('gift')), el('span', { text: t('tama.gift.claim') }));
      const until = g.until ? new Date(g.until).toLocaleDateString(locale()) : null;
      return card('is-gift', t('tama.gift.title'), 'gift',
        g.message ? el('p.tama-gift-msg', { text: g.message }) : null,
        el('div.tama-gift-row', {},
          el('span.tama-gift-loot', {}, ...rewardChips({ shards: g.shards, items: Object.entries(g.items || {}) })),
          btn),
        el('small.tama-gift-from', { text: t('tama.gift.from') + (until ? ' · ' + t('tama.gift.until', { date: until }) : '') }));
    });
  }

  /** Ankündigung des Betreibers, bis der Spieler sie ausblendet. */
  function newsCard() {
    const news = roster().news;
    if (!news?.text) return null;
    let seen = '';
    try { seen = localStorage.getItem('tama_news_seen') || ''; } catch { /* privat */ }
    if (seen === news.at) return null;
    const hide = el('button.btn.ghost.sm', { type: 'button', onclick: () => {
      try { localStorage.setItem('tama_news_seen', news.at); } catch { /* privat */ }
      render();
    } }, t('tama.news.hide'));
    return card('is-news', t('tama.news.title'), 'info',
      el('p.tama-news-text', { text: news.text }),
      el('div.tama-row-actions', {},
        news.link ? el('a.btn.sm', { href: news.link, target: news.link.startsWith('/') ? null : '_blank', rel: 'noopener', text: t('tama.news.more') }) : null,
        hide));
  }

  function render() {
    const doc = petState.doc;
    if (!doc?.player) { root.replaceChildren(); return; }
    const now = petNow();
    root.replaceChildren(...[...giftCards(), newsCard(), todayCard(doc, now), rankCard(doc), ...petCards(doc, now)].filter(Boolean));
    tick(now);
  }

  function tick(now = petNow()) {
    for (const node of root.querySelectorAll('[data-clock]')) node.textContent = clock(Number(node.dataset.clock) - now);
    for (const node of root.querySelectorAll('[data-until]')) {
      const left = Number(node.dataset.until) - now;
      node.textContent = ' ' + (left > 0 ? dur(left) : t('tama.time.now'));
    }
  }

  // Selbst aktuell bleiben – auch ohne Gerät (z. B. neben der Brutstation).
  // Aufräumen, sobald die Übersicht eingehängt war und wieder verschwunden ist
  // (oder nie eingehängt wurde).
  let seen = false;
  const born = Date.now();
  const detached = () => {
    if (root.isConnected) { seen = true; return false; }
    if (seen || Date.now() - born > 10_000) cleanup();
    return true;
  };
  const off = onPetChange((state, ev) => {
    if (detached()) return;
    if (!['saved', 'save-error'].includes(ev?.type)) render();
  });
  const timer = setInterval(() => { if (!detached()) tick(); }, 1000);
  function cleanup() { off(); clearInterval(timer); }

  render();
  return { root, render, tick };
}
