import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Stripe Checkout ohne SDK: zwei REST-Aufrufe (Sitzung anlegen und abfragen)
 * und die Prüfung der Webhook-Signatur. Karten, PayPal, Klarna usw. schaltet
 * der Betreiber im Stripe-Dashboard frei – Checkout zeigt dann automatisch die
 * passenden Zahlarten an.
 */

// Feste API-Version, damit sich Antworten nicht unbemerkt ändern.
const API_VERSION = '2024-06-20';
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

export class StripeError extends Error {
  constructor(message, { status = 0, code = 'stripe_error' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Was eingerichtet ist (für die Verwaltung; ohne die Schlüssel selbst). */
export function stripeStatus() {
  const key = config.stripe.secretKey || '';
  return {
    configured: Boolean(key),
    mode: !key ? null : /^(sk|rk)_live_/.test(key) ? 'live' : 'test',
    webhook: Boolean(config.stripe.webhookSecret),
  };
}

export const isSessionId = (id) => typeof id === 'string' && SESSION_ID.test(id);

/** Verschachtelte Parameter im Stripe-Format: a[b][0][c]=… */
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}

async function request(method, path, params) {
  const { secretKey, apiBase } = config.stripe;
  if (!secretKey) throw new StripeError('Stripe ist nicht eingerichtet', { code: 'not_configured' });
  let res;
  try {
    res = await fetch(apiBase + path, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': API_VERSION,
      },
      body: params ? formEncode(params).toString() : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new StripeError(`Stripe nicht erreichbar: ${err.message}`, { code: 'unreachable' });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new StripeError(data?.error?.message || `Stripe antwortet mit ${res.status}`, { status: res.status, code: data?.error?.code || 'stripe_error' });
  }
  return data;
}

/**
 * Legt eine Checkout-Sitzung für ein Tier an. Der Betrag steht fest (kein
 * Preis-Objekt im Dashboard nötig); Konto und Art stehen in den Metadaten, damit
 * der Webhook die Freischaltung zuordnen kann.
 */
export function createCheckoutSession({ userId, species, name, amountCents, currency = 'eur', successUrl, cancelUrl, locale = 'auto' }) {
  const meta = { app: 'ark-tribe-hub-tamagotchi', user_id: String(userId), species };
  return request('POST', '/v1/checkout/sessions', {
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(userId),
    locale,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    metadata: meta,
    payment_intent_data: {
      metadata: meta,
      description: `Tamagotchi-Tier ${name} – sofortige Freischaltung (digitaler Inhalt)`,
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency,
        unit_amount: amountCents,
        product_data: {
          name: `Tamagotchi-Tier: ${name}`,
          description: 'Dauerhafte Freischaltung im ARK Tribe Hub. Digitaler Inhalt, sofort verfügbar.',
        },
      },
    }],
    custom_text: {
      submit: {
        message: 'Du hast zugestimmt, dass die Freischaltung sofort beginnt, und weißt, dass dein Widerrufsrecht damit erlischt.',
      },
    },
  });
}

export function retrieveCheckoutSession(id) {
  if (!isSessionId(id)) throw new StripeError('Ungültige Sitzung', { status: 400, code: 'invalid_session' });
  return request('GET', `/v1/checkout/sessions/${id}`);
}

/**
 * Prüft die Signatur eines Webhook-Aufrufs (Header Stripe-Signature: t=…,v1=…)
 * gegen den rohen Body und liefert das Ereignis. Wirft bei falscher oder zu
 * alter Signatur (Schutz vor Wiederholung).
 */
export function verifyWebhook(rawBody, header, secret = config.stripe.webhookSecret, { tolerance = 300, now = Date.now() } = {}) {
  if (!secret) throw new StripeError('Webhook-Secret fehlt', { status: 400, code: 'no_secret' });
  const parts = String(header || '').split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/.test(v || '')).map(([, v]) => Buffer.from(v, 'hex'));
  if (!Number.isFinite(t) || !sigs.length) throw new StripeError('Signatur fehlt', { status: 400, code: 'bad_signature' });
  if (Math.abs(now / 1000 - t) > tolerance) throw new StripeError('Signatur abgelaufen', { status: 400, code: 'bad_signature' });
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = createHmac('sha256', secret).update(`${t}.`).update(body).digest();
  if (!sigs.some((s) => s.length === expected.length && timingSafeEqual(s, expected))) {
    throw new StripeError('Signatur passt nicht', { status: 400, code: 'bad_signature' });
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new StripeError('Ungültiges Ereignis', { status: 400, code: 'bad_payload' });
  }
}

/** Signatur erzeugen – nur für Tests und die lokale Entwicklung. */
export function signWebhook(payload, secret, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${sig}`;
}
