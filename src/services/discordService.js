// Discord-Benachrichtigungen fuer neue Bestellungen. Jeder Tribe kann zwei
// Webhooks hinterlegen: einen Kanal fuer Breeder (Eier/Embryos) und einen fuer
// Crafter (Saettel, Strukturen, Ressourcen). Die URLs liegen verschluesselt vor
// und werden nie an den Browser zurueckgegeben.
import { sealSecret, openSecret } from '../lib/secretBox.js';
import { badRequest } from '../lib/http.js';
import { config } from '../config.js';

// Nur echte Discord-Webhooks - verhindert, dass der Server beliebige
// Adressen aufruft (SSRF).
const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
const BREEDER_TYPES = new Set(['egg', 'embryo', 'creature']);

export function validateWebhook(value) {
  const url = String(value ?? '').trim();
  if (!url) return null;
  if (!WEBHOOK_RE.test(url)) throw badRequest('Das ist keine gültige Discord-Webhook-Adresse (https://discord.com/api/webhooks/…)');
  return url;
}

/** Tribe fuer den Browser - ohne gespeicherte Geheimnisse (Webhooks). */
export function publicTribe(tribe) {
  if (!tribe) return tribe;
  const { discord_breeder_webhook, discord_crafter_webhook, ...rest } = tribe;
  return rest;
}

export function sealWebhook(url) { return url ? sealSecret(url) : null; }

/** Fuer die Anzeige: nur ob gesetzt und die letzten Zeichen. */
export function webhookInfo(sealed) {
  const url = openSecret(sealed);
  return url ? { configured: true, hint: '…' + url.slice(-6) } : { configured: false };
}

async function post(url, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
      signal: ctrl.signal,
    });
    if (!res.ok) console.error('[DISCORD] Webhook antwortete mit', res.status);
    return res.ok;
  } catch (err) {
    console.error('[DISCORD] Senden fehlgeschlagen:', err.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const PRIO = { urgent: { label: 'DRINGEND', color: 0xef4444 }, high: { label: 'Hoch', color: 0xf59e0b }, normal: { label: 'Normal', color: 0xd39a52 } };
const clip = (s, n) => String(s ?? '').replace(/[`*_~|>]/g, '').slice(0, n);

function embedFor(order, items, target) {
  const prio = PRIO[order.priority] || PRIO.normal;
  const link = `${config.publicUrl.replace(/\/$/, '')}/#/orders/${order.id}`;
  return {
    username: 'ARK Tribe Hub',
    embeds: [{
      title: `Neue Bestellung${target === 'breeder' ? ' · Breeder' : ' · Crafter'}`,
      url: link,
      color: prio.color,
      description: items.map((it) => `• **${clip(it.item_name, 80)}** × ${it.quantity}`).join('\n').slice(0, 3500),
      fields: [
        { name: 'Gewünscht von', value: clip(order.member_username, 60) || '—', inline: true },
        { name: 'Priorität', value: prio.label, inline: true },
        ...(order.note ? [{ name: 'Notiz', value: clip(order.note, 300) }] : []),
      ],
      footer: { text: clip(order.tribe_name, 60) },
      timestamp: new Date().toISOString(),
    }],
  };
}

/** Schickt die Bestellung an die passenden Kanaele. Blockiert nie die Bestellung. */
export async function notifyOrderCreated(db, order) {
  const tribe = await db.get('SELECT discord_breeder_webhook, discord_crafter_webhook FROM tribes WHERE id = ?', [order.tribe_id]);
  if (!tribe) return [];
  const breederItems = order.items.filter((it) => BREEDER_TYPES.has(it.product_type));
  const crafterItems = order.items.filter((it) => !BREEDER_TYPES.has(it.product_type));
  const jobs = [];
  const breederUrl = openSecret(tribe.discord_breeder_webhook);
  const crafterUrl = openSecret(tribe.discord_crafter_webhook);
  if (breederUrl && breederItems.length) jobs.push(post(breederUrl, embedFor(order, breederItems, 'breeder')));
  if (crafterUrl && crafterItems.length) jobs.push(post(crafterUrl, embedFor(order, crafterItems, 'crafter')));
  return Promise.all(jobs);
}

export async function sendTest(db, tribeId, target) {
  const tribe = await db.get('SELECT name, discord_breeder_webhook, discord_crafter_webhook FROM tribes WHERE id = ?', [tribeId]);
  const url = openSecret(target === 'breeder' ? tribe?.discord_breeder_webhook : tribe?.discord_crafter_webhook);
  if (!url) throw badRequest('Für diesen Kanal ist kein Webhook hinterlegt');
  return post(url, { username: 'ARK Tribe Hub', content: `✅ Testnachricht von ARK Tribe Hub (${clip(tribe.name, 60)}): Dieser Kanal erhält neue ${target === 'breeder' ? 'Breeder-' : 'Crafter-'}Bestellungen.` });
}
