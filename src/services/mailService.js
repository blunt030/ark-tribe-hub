import { config } from '../config.js';

let transporterPromise = null;

/**
 * Lädt nodemailer NUR, wenn SMTP tatsächlich konfiguriert ist (SMTP_HOST gesetzt).
 * Genau wie bei "pg" (Postgres) bleibt die lokale Entwicklung dadurch komplett
 * abhängigkeitsfrei: Ohne SMTP-Konfiguration wird dieses Modul nie geladen, ein
 * fehlendes "nodemailer"-Paket lokal ist also nie ein Problem.
 *
 * Ein fehlgeschlagener Ladeversuch wird NICHT dauerhaft gecacht (transporterPromise
 * wird bei Fehler wieder auf null gesetzt) - sonst würde ein einziger transienter
 * Fehler beim allerersten Aufruf JEDEN weiteren Versand für die gesamte Laufzeit des
 * Prozesses blockieren, ohne echte Chance auf Selbstheilung.
 */
async function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporterPromise) {
    console.log(`[EMAIL] Transport wird initialisiert (Host: ${config.smtp.host}:${config.smtp.port}, User: ${config.smtp.user || '(keiner)'})`);
    transporterPromise = import('nodemailer')
      .then((nodemailerModule) => {
        const nodemailer = nodemailerModule.default ?? nodemailerModule;
        const t = nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.port === 465, // 465 = implizites TLS, 587 = STARTTLS
          auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
          connectionTimeout: 7000, // eigenes Zeitlimit statt Node-Standard, damit das Ergebnis vorhersehbar bleibt
          greetingTimeout: 7000,
          socketTimeout: 7000,
        });
        console.log('[EMAIL] Transport initialisiert');
        return t;
      })
      .catch((err) => {
        transporterPromise = null; // erneuten Versuch beim nächsten Mal erlauben
        throw err;
      });
  }
  return transporterPromise;
}

/**
 * Verschickt eine E-Mail. Schlägt NIE hart fehl, wenn SMTP nicht konfiguriert ist -
 * loggt stattdessen nur (praktisch für lokale Entwicklung/Tests, wo kein Mailversand
 * gewünscht ist). Ein echter Versandfehler bei KONFIGURIERTEM SMTP wird geloggt,
 * aber ebenfalls nicht nach oben geworfen: eine fehlgeschlagene Benachrichtigungs-Mail
 * darf niemals die eigentliche Aktion (z.B. eine Registrierung) zum Scheitern bringen.
 *
 * WICHTIG: loggt niemals Passwort/App-Passwort/SMTP-Credentials, nur Host/Port/User.
 */
/**
 * Versand über die Brevo-HTTPS-API. Wird bevorzugt, sobald BREVO_API_KEY gesetzt
 * ist - siehe Begründung in config.js (Render sperrt SMTP im Gratis-Tarif).
 * Nutzt fetch(), also keine zusätzliche Abhängigkeit.
 */
async function sendViaHttpApi({ to, subject, text }) {
  const empfaenger = String(to).split(',').map((e) => ({ email: e.trim() })).filter((e) => e.email);
  const absender = (config.smtp.from || config.adminNotificationEmail || '').match(/<(.+)>/)?.[1]
    || config.smtp.from || config.adminNotificationEmail;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.brevoApiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: absender, name: 'ARK Tribe Hub' },
        to: empfaenger,
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      // Antworttext mitloggen, aber NIEMALS den API-Schlüssel.
      const details = await res.text().catch(() => '');
      console.error(`[EMAIL] sendMail failed (HTTPS-API): HTTP ${res.status} ${details.slice(0, 300)}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    console.log(`[EMAIL] sendMail success (HTTPS-API) - messageId: ${data.messageId || '(keine)'}`);
    return { sent: true, via: 'https_api' };
  } catch (err) {
    console.error(`[EMAIL] sendMail failed (HTTPS-API): ${err.name} ${err.message}`);
    return { sent: false, reason: `api_error: ${err.message}` };
  }
}

/**
 * Maskiert Empfängeradressen für Logs. Produktionslogs sollen nachvollziehbar
 * bleiben ("ging die Mail raus?"), aber keine vollständigen personenbezogenen
 * Adressen enthalten. Aus "max.mustermann@freenet.de" wird "ma***@freenet.de".
 */
function maskiere(adressen) {
  return String(adressen)
    .split(',')
    .map((a) => {
      const [lokal, domain] = a.trim().split('@');
      if (!domain) return '***';
      return `${lokal.slice(0, 2)}***@${domain}`;
    })
    .join(', ');
}

export async function sendMail({ to, subject, text }) {
  console.log(`[EMAIL] sendMail gestartet - An: ${maskiere(to)} | Betreff: ${subject}`);

  // Bevorzugt HTTPS-API, weil SMTP in gehosteten Gratis-Umgebungen blockiert sein kann.
  if (config.brevoApiKey) {
    console.log('[EMAIL] Versandweg: HTTPS-API (SMTP wird umgangen)');
    return sendViaHttpApi({ to, subject, text });
  }
  let transporter;
  try {
    transporter = await getTransporter();
  } catch (err) {
    console.error(`[EMAIL] sendMail failed: Transport konnte nicht geladen werden - ${err.message}`);
    return { sent: false, reason: 'transport_error: ' + err.message };
  }
  if (!transporter) {
    console.log('[EMAIL] sendMail übersprungen - SMTP_HOST ist nicht gesetzt');
    return { sent: false, reason: 'smtp_not_configured' };
  }
  try {
    const info = await transporter.sendMail({ from: config.smtp.from, to, subject, text });
    console.log(`[EMAIL] sendMail success - messageId: ${info?.messageId || '(keine)'} response: ${info?.response || '(keine)'}`);
    return { sent: true };
  } catch (err) {
    console.error(`[EMAIL] sendMail failed: ${err.code || ''} ${err.message}`);
    return { sent: false, reason: `${err.code || 'error'}: ${err.message}` };
  }
}

export async function notifyAdminOfRegistration({ username, tribeName, email, extraRecipients = [] }) {
  // Empfänger: die feste Support-/Betreiberadresse UND alle Admins des Tribes.
  // Doppelte Adressen werden entfernt, damit niemand zwei identische Mails bekommt.
  const recipients = [...new Set([config.adminNotificationEmail, ...extraRecipients].filter(Boolean))];
  console.log(`[EMAIL] Benachrichtigung angefordert (Registrierung ${username}). Empfänger: ${recipients.length}`);
  if (!recipients.length) return { sent: false, reason: 'no_admin_email_configured' };
  return sendMail({
    to: recipients.join(', '),
    subject: `ARK Tribe Hub – Neue Registrierung: ${username} (${tribeName})`,
    text:
      `Ein neues Mitglied wartet auf Freischaltung.\n\n` +
      `Benutzername: ${username}\n` +
      `Tribe: ${tribeName}\n` +
      `E-Mail: ${email}\n\n` +
      `Freischalten im Adminbereich von ARK Tribe Hub.`,
  });
}

/**
 * Bestätigungsmail AN den neu registrierten Nutzer selbst (nicht an den Admin) -
 * getrennter Zweck: bestätigt, dass die angegebene E-Mail-Adresse wirklich ihm/ihr
 * gehört. Blockiert die Admin-Freischaltung bewusst NICHT - beides läuft parallel,
 * kein zusätzlicher Blocker für den bestehenden Freischalt-Ablauf.
 */
export async function sendVerificationEmail({ to, username, verifyUrl }) {
  console.log(`[EMAIL] Bestätigungsmail angefordert für neu registrierten Nutzer "${username}"`);
  return sendMail({
    to,
    subject: 'ARK Tribe Hub – Bitte bestätige deine E-Mail-Adresse',
    text:
      `Hallo ${username},\n\n` +
      `bitte bestätige deine E-Mail-Adresse für ARK Tribe Hub, indem du diesen Link öffnest:\n\n` +
      `${verifyUrl}\n\n` +
      `Falls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.`,
  });
}
