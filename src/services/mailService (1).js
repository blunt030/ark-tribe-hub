import { config } from '../config.js';

let transporterPromise = null;

/**
 * Lädt nodemailer NUR, wenn SMTP tatsächlich konfiguriert ist (SMTP_HOST gesetzt).
 * Genau wie bei "pg" (Postgres) bleibt die lokale Entwicklung dadurch komplett
 * abhängigkeitsfrei: Ohne SMTP-Konfiguration wird dieses Modul nie geladen, ein
 * fehlendes "nodemailer"-Paket lokal ist also nie ein Problem.
 */
async function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporterPromise) {
    transporterPromise = import('nodemailer').then((nodemailerModule) => {
      const nodemailer = nodemailerModule.default ?? nodemailerModule;
      return nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465, // 465 = implizites TLS, 587 = STARTTLS
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      });
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
 */
export async function sendMail({ to, subject, text }) {
  let transporter;
  try {
    transporter = await getTransporter();
  } catch (err) {
    console.error('E-Mail-Transport konnte nicht geladen werden:', err.message);
    return { sent: false, reason: 'transport_error: ' + err.message };
  }
  if (!transporter) {
    console.log(`[Mail übersprungen - SMTP nicht konfiguriert] An: ${to} | Betreff: ${subject}`);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text });
    console.log(`[Mail gesendet] An: ${to} | Betreff: ${subject}`);
    return { sent: true };
  } catch (err) {
    console.error('E-Mail-Versand fehlgeschlagen:', err.message);
    return { sent: false, reason: err.message };
  }
}

export async function notifyAdminOfRegistration({ username, tribeName, email }) {
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
