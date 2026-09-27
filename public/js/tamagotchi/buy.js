/**
 * Tiere mit echtem Geld freischalten (Stripe Checkout). Vor der Weiterleitung
 * stimmt der Spieler ausdrücklich zu, dass die Freischaltung sofort beginnt –
 * bei digitalen Inhalten erlischt damit das Widerrufsrecht. Nach der Rückkehr
 * prüft der Server die Zahlung und schaltet die Art frei.
 */
import { el } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { api } from '../api.js';
import { roster, priceOf, formatPrice, speciesAccess } from './roster.js';
import { petState, refreshRoster } from './store.js';
import { icon } from './scene.js';
import { BY_KEY, svg, creatureThumb } from './common.js';
import { sheet } from './sheet.js';
import { sfx } from './sound.js';

const price = (key) => formatPrice(priceOf(key), getLang());

function hero(sp) {
  return el('div.tama-buy-hero.biome-' + sp.biome, {},
    creatureThumb(sp, { stage: 'adult', alt: sp.name }),
    el('span.tama-buy-egg', { title: t('tama.birth.' + sp.birth) }, el('img', { src: sp.birth === 'embryo' ? '/assets/items/cut/embryo.webp' : '/assets/items/cut/egg.webp', alt: '' })));
}

function legalLinks() {
  const legal = roster().legal || {};
  const link = (href, label) => (href ? el('a', { href, target: '_blank', rel: 'noopener', text: label }) : null);
  const items = [link(legal.terms, t('tama.buy.terms')), link(legal.withdrawal, t('tama.buy.withdrawal')), link('/datenschutz.html', t('tama.buy.privacy'))].filter(Boolean);
  return el('p.tama-buy-legal', {}, items.flatMap((a, i) => (i ? [' · ', a] : [a])));
}

/** Dialog zum Freischalten einer Art. */
export function openBuy(sp) {
  const access = speciesAccess(sp.key, petState.doc);
  if (access !== 'buy') {
    const text = ['free', 'owned', 'kept'].includes(access) ? t('tama.buy.owned') : t('tama.buy.soon');
    return sheet(t('tama.buy.soon_title'), el('div.tama-buy', {}, hero(sp), el('h3', { text: sp.name }), el('p.tama-muted', { text })));
  }
  const note = el('p.tama-buy-note', { 'aria-live': 'polite', text: t('tama.buy.via') });
  const pay = el('button.btn.primary.tama-cta', { type: 'button', disabled: true, onclick: () => go() }, svg(icon('lock')), el('span', { text: t('tama.buy.pay', { price: price(sp.key) }) }));
  const consent = el('input', { type: 'checkbox', onchange: () => { pay.disabled = !consent.checked; } });
  let busy = false;

  async function go() {
    if (busy || !consent.checked) return;
    busy = true;
    pay.disabled = true;
    pay.classList.add('is-busy');
    note.textContent = t('tama.buy.redirect');
    sfx('select');
    try {
      const res = await api.petCheckout(sp.key, getLang());
      // Nur zur Bezahlseite (https) weiterleiten – lokal auch zu localhost (Entwicklung)
      if (!/^(https:\/\/|http:\/\/localhost[:/])/.test(res?.url || '')) throw new Error(t('tama.buy.error'));
      location.assign(res.url);
    } catch (err) {
      busy = false;
      pay.classList.remove('is-busy');
      pay.disabled = !consent.checked;
      note.textContent = err?.message || t('tama.buy.error');
      note.classList.add('is-error');
    }
  }

  const content = el('div.tama-buy', {},
    hero(sp),
    el('div.tama-buy-copy', {},
      el('h3', { text: sp.name }),
      el('p.tama-muted', { text: `${t('tama.hab.' + sp.hab)} · ${t('tama.diet.' + sp.diet)} · ${t('tama.rarity.' + sp.rarity)}` }),
      el('p', { text: t('tama.buy.lead') }),
      el('div.tama-buy-price', {}, el('strong', { text: price(sp.key) }), el('small', { text: t('tama.buy.once') }))),
    el('label.tama-buy-consent', {}, consent, el('span', { text: t('tama.buy.consent') })),
    legalLinks(),
    el('div.tama-row-actions', {}, pay),
    note);
  return sheet(t('tama.buy.title', { name: sp.name }), content, { wide: false });
}

/**
 * Rückkehr von Stripe (…/?pet_checkout=cs_…#/tamagotchi): Zahlung prüfen,
 * Freischaltungen neu laden und Bescheid geben. Kommt der Webhook etwas
 * später, wird noch zweimal nachgefragt.
 */
export async function checkoutReturn({ toast } = {}) {
  const params = new URLSearchParams(location.search);
  const id = params.get('pet_checkout');
  if (!id) return;
  params.delete('pet_checkout');
  const rest = params.toString();
  history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  if (id === 'cancel') { toast?.(t('tama.buy.cancel')); return; }
  for (const delay of [0, 3000, 8000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await api.petCheckoutConfirm(id);
      await refreshRoster(res.config);
      const name = BY_KEY.get(res.species)?.name || '';
      if (res.result === 'paid') { sfx('win'); toast?.(t('tama.buy.done', { name })); return; }
      if (res.result === 'expired') { toast?.(t('tama.buy.expired'), 'err'); return; }
      if (delay === 8000) toast?.(t('tama.buy.pending'));
    } catch (err) {
      toast?.(err?.message || t('tama.buy.error'), 'err');
      return;
    }
  }
}
