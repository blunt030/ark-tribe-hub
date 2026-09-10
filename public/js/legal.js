const LEGAL_DETAILS = {
  providerName: '[Vollständiger Name des Betreibers]',
  address: ['[Straße und Hausnummer]', '[PLZ und Ort]', 'Deutschland'],
  email: 'support.arkhub@gmail.com',
};

const missing = Object.values(LEGAL_DETAILS)
  .flat()
  .some((value) => String(value).includes('['));

document.querySelectorAll('[data-legal-name]').forEach((node) => {
  node.textContent = LEGAL_DETAILS.providerName;
});
document.querySelectorAll('[data-legal-address]').forEach((node) => {
  node.replaceChildren(...LEGAL_DETAILS.address.flatMap((line, index) => [
    document.createTextNode(line),
    ...(index < LEGAL_DETAILS.address.length - 1 ? [document.createElement('br')] : []),
  ]));
});
document.querySelectorAll('[data-legal-email]').forEach((node) => {
  node.textContent = LEGAL_DETAILS.email;
  if (node instanceof HTMLAnchorElement) node.href = `mailto:${LEGAL_DETAILS.email}`;
});

if (missing) {
  document.querySelectorAll('[data-legal-warning]').forEach((node) => {
    node.hidden = false;
  });
}
