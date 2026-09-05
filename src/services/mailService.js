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
export async function sendMail({ to, subject, text }) {
  console.log(`[EMAIL] sendMail gestartet - An: ${to} | Betreff: ${subject}`);
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

export async function notifyAdminOfRegistration({ username, tribeName, email }) {
  console.log(`[EMAIL] Benachrichtigung angefordert (Registrierung ${username}). Ziel-Adresse konfiguriert: ${config.adminNotificationEmail ? 'ja' : 'NEIN'}`);
  if (!config.adminNotificationEmail) return { sent: false, reason: 'no_admin_email_configured' };
  return sendMail({
    to: config.adminNotificationEmail,
    subject: `ARK Tribe Hub – Neue Registrierung: ${username} (${tribeName})`,
    text:
      `Ein neues Mitglied wartet auf Freischaltung.\n\n` +
      `Benutzername: ${username}\n` +
      `Tribe: ${tribeName}\n` +
      `E-Mail: ${email}\n\n` +
      `Freischalten im Adminbereich von ARK Tribe Hub.`,
  });
}
