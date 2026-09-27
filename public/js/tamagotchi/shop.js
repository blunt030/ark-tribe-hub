/**
 * Händler (Vorräte, Einrichtung, Gehäuse – mit Tagesangebot) und Erfolge.
 * Bezahlt wird mit Element-Splittern aus Kisten, Aufgaben, Expeditionen und
 * Rangaufstiegen.
 */
import { el } from '../ui.js';
import { t } from '../i18n.js';
import * as P from './progress.js';
import { ITEMS, DECOR, SHELLS, SLOTS, ACHIEVEMENTS } from './catalog.js';
import { icon } from './scene.js';
import { decorArt } from './props.js';
import { petState, petNow, petAct, onPetChange } from './store.js';
import { sfx } from './sound.js';
import { svg, artImg, itemImg, shards, rankName, decorEffects, clock, rewardChips } from './common.js';

function itemEffect(id) {
  const d = ITEMS[id];
  if (d.kind === 'kibble') return t('tama.hint.kibble', { hunger: d.hunger, happy: d.happy });
  return t('tama.hint.' + id);
}

function lockText(doc, id, def, now) {
  const lock = P.lockReason(doc, id, now);
  if (lock === 'rank') return t('tama.lock.rank', { n: def.rank });
  if (lock === 'event') return t('tama.lock.event', { event: t('tama.event.' + def.event) });
  if (lock === 'ach') return t('tama.lock.ach');
  return null;
}

/* -------------------------------------------------------------------------- */
/* Händler                                                                        */
/* -------------------------------------------------------------------------- */

export function shopPanel({ toast }) {
  const root = el('div.tama-shop');

  function buy(id) {
    const res = petAct((d, now) => P.buy(d, id, now));
    if (res.ok) {
      sfx('coin');
      toast?.(t('tama.shop.bought', { name: nameOf(id) }));
    } else {
      sfx('refuse');
      toast?.(t('tama.shop.fail.' + res.code), 'err');
    }
    draw();
  }

  function place(id) {
    const r = petAct((d) => P.placeDecor(d, DECOR[id].slot, id));
    if (r.ok) { sfx('select'); toast?.(t('tama.res.placed')); }
    draw();
  }

  function wear(shell) {
    const r = petAct((d) => P.setShell(d, shell));
    if (r.ok) { sfx('select'); document.querySelector('.tama-page')?.setAttribute('data-shell', shell); }
    draw();
  }

  const nameOf = (id) => (ITEMS[id] ? t('tama.item.' + id) : DECOR[id] ? t('tama.decor.' + id) : t('tama.shell.' + id.slice(6)));

  function product({ art, name, desc, price, was = null, note = null, lock = null, action = null, cls = '' }) {
    return el('article.tama-product' + (lock ? '.is-locked' : '') + (cls ? '.' + cls : ''), {},
      el('div.tama-product-art', {}, art),
      el('div.tama-product-copy', {},
        el('strong', { text: name }),
        desc ? el('small', { text: desc }) : null,
        note ? el('span.tama-product-note', { text: note }) : null),
      el('div.tama-product-buy', {},
        price != null && !lock ? el('span.tama-price', {}, was ? el('s', { text: String(was) }) : null, shards(price)) : null,
        lock ? el('span.tama-lock', {}, svg(icon('lock')), el('span', { text: lock })) : null,
        action));
  }

  function draw() {
    const doc = petState.doc;
    if (!doc?.player) { root.replaceChildren(); return; }
    const now = petNow();
    const pl = doc.player;
    const r = P.rankOf(pl.xp);
    const deal = P.dailyDeal(doc, now);
    const afford = (price) => pl.shards >= price;
    const buyBtn = (id, price, label = t('tama.shop.buy')) => el('button.btn.sm' + (afford(price) ? '.primary' : ''), { type: 'button', disabled: afford(price) ? null : true, onclick: () => buy(id) }, label);

    const head = el('div.tama-shop-head', {},
      el('div.tama-wallet', {}, shards(pl.shards, 'is-big'), el('small', { text: t('tama.shop.wallet') })),
      el('div.tama-shop-rank', {}, el('span.tama-rank-badge.is-small', {}, el('b', { text: String(r.level) })), el('span', { text: rankName(r.level) })),
      el('p.tama-hint', { text: t('tama.shop.earn') }));

    const dealCard = el('section.tama-deal', {},
      el('div.tama-deal-tag', {}, svg(icon('sparkle')), el('span', { text: t('tama.shop.deal') }), el('small', {}, el('span', { text: t('tama.shop.deal_ends') + ' ' }), el('b', { dataset: { clock: String(P.ENV.nextDay(now)) } }))),
      product({ art: itemImg(deal.id), name: t('tama.item.' + deal.id), desc: itemEffect(deal.id), price: deal.price, was: deal.was, note: t('tama.shop.in_bag', { n: P.itemCount(doc, deal.id) }), action: buyBtn(deal.id, deal.price), cls: 'is-deal' }));

    const items = Object.keys(ITEMS).map((id) => {
      const price = P.priceOf(doc, id, now);
      return product({ art: itemImg(id), name: t('tama.item.' + id), desc: itemEffect(id), price, was: price !== ITEMS[id].price ? ITEMS[id].price : null, note: t('tama.shop.in_bag', { n: P.itemCount(doc, id) }), action: buyBtn(id, price) });
    });

    const decor = SLOTS.flatMap((slot) => Object.keys(DECOR).filter((id) => DECOR[id].slot === slot).map((id) => {
      const def = DECOR[id];
      const owned = P.owns(doc, id);
      const placed = pl.deco[slot] === id;
      const lock = owned ? null : lockText(doc, id, def, now);
      if (def.event && !owned && lock) return null; // Event-Einrichtung erscheint nur während des Events
      const action = owned
        ? (placed ? el('span.tama-owned', {}, svg(icon('check')), el('span', { text: t('tama.home.placed') })) : el('button.btn.sm', { type: 'button', onclick: () => place(id) }, t('tama.shop.place')))
        : lock ? null : buyBtn(id, def.price);
      return product({ art: artImg('decor:' + id, () => decorArt(id)), name: t('tama.decor.' + id), desc: `${t('tama.slot.' + slot)} · ${decorEffects(def).join(' · ')}`, price: owned ? null : def.price, lock, action, cls: def.event ? 'is-event' : '' });
    })).filter(Boolean);

    const shells = Object.keys(SHELLS).map((shell) => {
      const def = SHELLS[shell];
      const id = 'shell_' + shell;
      const owned = P.owns(doc, id);
      const worn = doc.settings.shell === shell;
      const lock = owned ? null : lockText(doc, id, def, now);
      if (def.event && !owned && lock) return null;
      const action = owned
        ? (worn ? el('span.tama-owned', {}, svg(icon('check')), el('span', { text: t('tama.shop.worn') })) : el('button.btn.sm', { type: 'button', onclick: () => wear(shell) }, t('tama.shop.wear')))
        : lock ? null : buyBtn(id, def.price);
      return product({ art: el('span.tama-swatch.shell-' + shell + '.is-preview'), name: t('tama.shell.' + shell), desc: t('tama.shop.shell_desc'), price: owned ? null : def.price, lock, action });
    }).filter(Boolean);

    const section = (key, iconName, list) => el('section.tama-shop-section', {},
      el('h3.tama-card-title', {}, svg(icon(iconName)), el('span', { text: t('tama.shop.' + key) })),
      el('div.tama-products', {}, list));

    root.replaceChildren(head, dealCard, section('supplies', 'feed', items), section('decor', 'home', decor), section('shells', 'egg', shells));
    tick();
  }

  function tick() {
    const now = petNow();
    for (const node of root.querySelectorAll('[data-clock]')) node.textContent = clock(Number(node.dataset.clock) - now);
  }

  let seen = false;
  const born = Date.now();
  const detached = () => {
    if (root.isConnected) { seen = true; return false; }
    if (seen || Date.now() - born > 10_000) { off(); clearInterval(timer); }
    return true;
  };
  const off = onPetChange((state, ev) => { if (!detached() && ['tick', 'load', 'conflict'].includes(ev?.type) && ev.notes?.some((n) => n.type === 'day')) draw(); });
  const timer = setInterval(() => { if (!detached()) tick(); }, 1000);
  draw();
  return root;
}

/* -------------------------------------------------------------------------- */
/* Erfolge                                                                        */
/* -------------------------------------------------------------------------- */

export function awardsPanel() {
  const doc = petState.doc;
  const list = P.achievementList(doc);
  const done = list.filter((a) => a.at).length;
  const earned = list.filter((a) => a.at).reduce((n, a) => n + a.shards, 0);
  const sorted = [...list].sort((a, b) => Boolean(b.at) - Boolean(a.at) || (b.value / b.goal) - (a.value / a.goal));
  return el('div.tama-awards', {},
    el('div.tama-awards-head', {},
      el('div', {}, el('strong', { text: t('tama.ach.count', { n: done, total: ACHIEVEMENTS.length }) }), el('small', { text: t('tama.ach.earned', { n: earned }) })),
      el('span.tama-bar', {}, el('span', { style: `width:${Math.round(done / ACHIEVEMENTS.length * 100)}%` }))),
    el('div.tama-award-grid', {}, sorted.map((a) => el('article.tama-award' + (a.at ? '.is-done' : ''), {},
      el('span.tama-award-ico', {}, svg(icon(a.at ? 'trophy' : 'lock'))),
      el('div.tama-award-copy', {},
        el('strong', { text: t('tama.ach.' + a.id) }),
        el('small', { text: t('tama.ach_desc.' + a.metric, { n: a.goal }) }),
        a.at ? el('span.tama-award-date', { text: t('tama.ach.at', { date: new Date(a.at).toLocaleDateString() }) })
          : el('span.tama-bar.is-thin', {}, el('span', { style: `width:${Math.round(a.value / a.goal * 100)}%` })),
        el('span.tama-award-reward', {}, ...rewardChips({ shards: a.shards, items: a.item ? [a.item] : [] }),
          a.decor ? el('span.tama-gain.is-item', { title: t('tama.decor.' + a.decor) }, artImg('decor:' + a.decor, () => decorArt(a.decor)), el('b', { text: t('tama.decor.' + a.decor) })) : null),
        a.at ? null : el('small.tama-award-progress', { text: `${a.value}/${a.goal}` }))))));
}
