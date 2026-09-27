import { badRequest, forbidden, notFound } from '../lib/http.js';
import { config } from '../config.js';
import { speciesInDoc, freeKeys } from '../../public/js/tamagotchi/access.js';
import { loadSettings, artSpecies, saleOpen, priceFor, speciesName, grantUnlock, invalidatePetConfig } from './petConfigService.js';
import { createCheckoutSession, retrieveCheckoutSession, StripeError } from './stripeService.js';
import { audit } from './auditService.js';
import { sendMail } from './mailService.js';
import { LEGAL_DETAILS, providerLine, vatNote } from '../../public/js/legal-details.js';

/**
 * Verkauf von Tamagotchi-Tieren über Stripe Checkout.
 *
 * Ablauf: Der Browser fragt eine Checkout-Sitzung an (mit Zustimmung zur
 * sofortigen Freischaltung), Stripe kassiert, danach schaltet der Webhook die
 * Art frei. Kommt der Spieler auf die Seite zurück, bevor der Webhook da war,
 * prüft der Server die Sitzung selbst bei Stripe. Beides ist idempotent.
 */

const nowIso = () => new Date().toISOString();

async function purchasable(db, user, species) {
  const settings = await loadSettings(db);
  if (!saleOpen(settings.sale)) throw forbidden('Der Verkauf ist gerade nicht geöffnet.');
  const arts = await artSpecies(db);
  if (!arts.has(species) || settings.roster.off.includes(species)) throw badRequest('Diese Art gibt es nicht im Tamagotchi', 'NOT_AVAILABLE');
  if (freeKeys(settings.roster, arts).has(species)) throw badRequest('Diese Art ist gratis', 'FREE');
  if (await db.get('SELECT species FROM pet_unlocks WHERE user_id = ? AND species = ?', [user.id, species])) throw badRequest('Schon freigeschaltet', 'OWNED');
  const row = await db.get('SELECT state FROM pets WHERE user_id = ?', [user.id]);
  let kept = new Set();
  try { kept = speciesInDoc(JSON.parse(row?.state || 'null')); } catch { /* unlesbarer Stand: nichts behalten */ }
  if (kept.has(species)) throw badRequest('Diese Art hast du schon', 'OWNED');
  return { settings, amount: priceFor(settings, species) };
}

/** Legt eine Checkout-Sitzung an und merkt sich den offenen Kauf. */
export async function startCheckout(db, user, species, { locale = 'auto' } = {}) {
  const { amount } = await purchasable(db, user, species);
  const base = config.publicUrl.replace(/\/+$/, '');
  let session;
  try {
    session = await createCheckoutSession({
      userId: user.id,
      species,
      name: speciesName(species),
      amountCents: amount,
      currency: 'eur',
      successUrl: `${base}/?pet_checkout={CHECKOUT_SESSION_ID}#/tamagotchi`,
      cancelUrl: `${base}/?pet_checkout=cancel#/tamagotchi`,
      locale,
    });
  } catch (err) {
    if (err instanceof StripeError) {
      console.error('[STRIPE] Checkout fehlgeschlagen:', err.message);
      throw badRequest('Die Bezahlung konnte gerade nicht gestartet werden. Bitte später erneut versuchen.', 'CHECKOUT_FAILED');
    }
    throw err;
  }
  const now = nowIso();
  await db.run(
    `INSERT INTO pet_purchases (session_id, user_id, species, amount_cents, currency, status, livemode, consent_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [session.id, user.id, species, amount, 'eur', 'open', session.livemode ? 1 : 0, now, now, now]
  );
  return { id: session.id, url: session.url };
}

/**
 * Bezahlte Sitzung einlösen: Kauf als bezahlt markieren und die Art
 * freischalten. Mehrfache Aufrufe (Webhook + Rückkehr) ändern nichts mehr.
 */
export async function fulfillSession(db, session, { source = 'webhook' } = {}) {
  if (!session || session.metadata?.app !== 'ark-tribe-hub-tamagotchi') return { handled: false };
  if (session.payment_status !== 'paid') return { handled: false, status: session.payment_status };
  const userId = Number(session.client_reference_id || session.metadata?.user_id);
  const species = String(session.metadata?.species || '');
  if (!Number.isInteger(userId) || !species) return { handled: false };
  const result = await db.transaction(async (tx) => {
    const now = nowIso();
    // Nur Käufe einlösen, die diese Installation selbst angelegt hat – ein
    // Stripe-Konto kann mehrere Umgebungen bedienen (z. B. Test und Live).
    const purchase = await tx.get('SELECT * FROM pet_purchases WHERE session_id = ?', [session.id]);
    if (!purchase || purchase.user_id !== userId || purchase.species !== species) {
      console.warn('[STRIPE] Unbekannte Checkout-Sitzung ignoriert:', session.id);
      return { handled: false };
    }
    if (purchase.status === 'paid' || purchase.status === 'refunded' || purchase.status === 'revoked') {
      return { handled: true, species, already: true, status: purchase.status };
    }
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
    await tx.run(
      "UPDATE pet_purchases SET status = 'paid', paid_at = ?, payment_intent = ?, livemode = ?, amount_cents = ?, updated_at = ? WHERE session_id = ?",
      [now, intent, session.livemode ? 1 : 0, Number(session.amount_total) || purchase.amount_cents, now, session.id]
    );
    if (purchase.user_id) {
      await grantUnlock(tx, { userId: purchase.user_id, species: purchase.species, source: 'purchase', ref: session.id });
      await audit(tx, { actorId: purchase.user_id, action: 'pet_species_purchased', targetType: 'pet_species', meta: { species: purchase.species, session: session.id, via: source } });
    }
    invalidatePetConfig();
    return { handled: true, species: purchase.species, status: 'paid' };
  });
  // Vertragsbestätigung (§ 312f BGB) – nur beim ersten Einlösen, nie doppelt.
  if (result.status === 'paid' && !result.already) await sendPurchaseConfirmation(db, session);
  return result;
}

const euro = (cents) => `${(Number(cents) / 100).toFixed(2).replace('.', ',')} €`;
const berlinTime = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });

/**
 * Kaufbestätigung per E-Mail mit der Zustimmung zur sofortigen Freischaltung.
 * Ohne diese Bestätigung erlischt das Widerrufsrecht nicht (§ 356 Abs. 5 BGB).
 * Ein Versandfehler bricht die Freischaltung nie ab.
 */
export async function sendPurchaseConfirmation(db, session) {
  try {
    const purchase = await db.get('SELECT * FROM pet_purchases WHERE session_id = ?', [session.id]);
    if (!purchase) return { sent: false, reason: 'unknown_purchase' };
    const user = purchase.user_id ? await db.get('SELECT username, email FROM users WHERE id = ?', [purchase.user_id]) : null;
    const to = user?.email || session.customer_details?.email;
    if (!to) return { sent: false, reason: 'no_email' };
    const base = config.publicUrl.replace(/\/+$/, '');
    const name = speciesName(purchase.species);
    const text = [
      `Hallo ${user?.username || ''},`.replace(' ,', ','),
      '',
      'vielen Dank für deinen Kauf bei ARK Tribe Hub. Hiermit bestätigen wir deinen Vertrag:',
      '',
      `Artikel: Dauerhafte Freischaltung „${name}“ im Dino-Tamagotchi (digitaler Inhalt)`,
      `Preis: ${euro(purchase.amount_cents)} (einmalig). ${vatNote()}`,
      `Bestellnummer: ${purchase.session_id}`,
      `Bezahlt am: ${berlinTime(purchase.paid_at || purchase.updated_at)}`,
      '',
      `Du hast am ${berlinTime(purchase.consent_at)} ausdrücklich zugestimmt, dass die Freischaltung sofort nach der Bezahlung beginnt, und bestätigt, dass du weißt, dass du dadurch dein Widerrufsrecht verlierst. Die Freischaltung ist erfolgt; dein Widerrufsrecht ist damit erloschen.`,
      '',
      `AGB: ${base}/agb.html`,
      `Widerrufsbelehrung: ${base}/widerruf.html`,
      '',
      `Anbieter: ${providerLine()}, ${LEGAL_DETAILS.address.join(', ')}`,
      `Kontakt: ${LEGAL_DETAILS.email}`,
    ].join('\n');
    return await sendMail({ to, subject: `Kaufbestätigung: ${name} freigeschaltet`, text });
  } catch (err) {
    console.error('[STRIPE] Kaufbestätigung fehlgeschlagen:', err.message);
    return { sent: false, reason: 'error' };
  }
}

/** Rückkehr von Stripe: Sitzung abfragen und – falls bezahlt – einlösen. */
export async function confirmCheckout(db, user, sessionId) {
  const own = await db.get('SELECT user_id, species, status FROM pet_purchases WHERE session_id = ?', [sessionId]);
  if (!own) throw notFound('Kauf nicht gefunden');
  if (own.user_id !== user.id) throw forbidden();
  if (own.status === 'paid') return { status: 'paid', species: own.species };
  let session;
  try {
    session = await retrieveCheckoutSession(sessionId);
  } catch (err) {
    if (err instanceof StripeError) throw badRequest('Der Kauf konnte gerade nicht geprüft werden.', 'CHECKOUT_UNKNOWN');
    throw err;
  }
  if (String(session.client_reference_id) !== String(user.id)) throw forbidden();
  if (session.payment_status === 'paid') {
    const res = await fulfillSession(db, session, { source: 'return' });
    if (res.handled) return { status: res.status === 'paid' ? 'paid' : res.status, species: own.species };
  }
  if (session.status === 'expired') await markSession(db, sessionId, 'expired');
  return { status: session.status === 'expired' ? 'expired' : 'pending', species: own.species };
}

export async function markSession(db, sessionId, status) {
  await db.run("UPDATE pet_purchases SET status = ?, updated_at = ? WHERE session_id = ? AND status IN ('open', 'pending')", [status, nowIso(), sessionId]);
}

/** Vollständige Erstattung: Freischaltung zurücknehmen. */
export async function refundIntent(db, intentId) {
  if (!intentId) return false;
  const purchase = await db.get("SELECT * FROM pet_purchases WHERE payment_intent = ? AND status = 'paid'", [intentId]);
  if (!purchase) return false;
  await db.transaction(async (tx) => {
    await tx.run("UPDATE pet_purchases SET status = 'refunded', updated_at = ? WHERE session_id = ?", [nowIso(), purchase.session_id]);
    if (purchase.user_id) {
      await tx.run("DELETE FROM pet_unlocks WHERE user_id = ? AND species = ? AND source = 'purchase'", [purchase.user_id, purchase.species]);
      await audit(tx, { action: 'pet_species_refunded', targetType: 'pet_species', meta: { species: purchase.species, userId: purchase.user_id, session: purchase.session_id } });
    }
  });
  invalidatePetConfig();
  return true;
}

/** Stripe-Ereignis verarbeiten (nach geprüfter Signatur). */
export async function handleStripeEvent(db, event) {
  const obj = event?.data?.object;
  switch (event?.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (obj?.payment_status === 'paid') return fulfillSession(db, obj);
      if (obj?.id) await markSession(db, obj.id, 'pending');
      return { handled: true };
    case 'checkout.session.async_payment_failed':
      if (obj?.id) await markSession(db, obj.id, 'failed');
      return { handled: true };
    case 'checkout.session.expired':
      if (obj?.id) await markSession(db, obj.id, 'expired');
      return { handled: true };
    case 'charge.refunded':
      if (obj?.refunded) return { handled: await refundIntent(db, typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id) };
      return { handled: false };
    default:
      return { handled: false };
  }
}

/** Käufe für die Verwaltung (neueste zuerst). */
export async function listPurchases(db, { limit = 200 } = {}) {
  return db.all(
    `SELECT p.session_id, p.user_id, u.username, p.species, p.amount_cents, p.currency, p.status, p.livemode, p.created_at, p.paid_at
       FROM pet_purchases p LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC LIMIT ?`,
    [limit]
  );
}
