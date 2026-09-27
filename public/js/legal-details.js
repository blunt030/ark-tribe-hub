/**
 * Betreiberangaben – einzige Quelle für Impressum, AGB, Widerrufsbelehrung,
 * Datenschutz und die Kaufbestätigung per E-Mail (wird auch vom Server geladen).
 * Felder mit [eckigen Klammern] fehlen noch; die Rechtsseiten zeigen dann einen Hinweis.
 */
export const LEGAL_DETAILS = {
  providerName: 'Sven Kalinowski',
  businessName: 'SK Digital Works',
  address: ['Nackenheimer Weg 28a', '12099 Berlin', 'Deutschland'],
  email: 'support.arkhub@gmail.com',
  // true = Kleinunternehmer nach § 19 UStG (keine Umsatzsteuer), false = Preise inkl. Umsatzsteuer
  smallBusiness: true,
};

/** Name wie im Impressum: „Name – Geschäftsbezeichnung“. */
export const providerLine = (d = LEGAL_DETAILS) => [d.providerName, d.businessName].filter(Boolean).join(' – ');

/** Hinweis zur Umsatzsteuer für Preise und Kaufbestätigung. */
export const vatNote = (d = LEGAL_DETAILS) => (d.smallBusiness
  ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
  : 'Alle Preise enthalten die gesetzliche Umsatzsteuer.');

/** true, solange Pflichtangaben noch Platzhalter sind. */
export const legalMissing = (d = LEGAL_DETAILS) => [d.providerName, ...d.address, d.email]
  .some((value) => !value || String(value).includes('['));
