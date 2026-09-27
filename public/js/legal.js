import { LEGAL_DETAILS, providerLine, vatNote, legalMissing } from './legal-details.js';

const fill = (selector, fn) => document.querySelectorAll(selector).forEach(fn);

fill('[data-legal-name]', (node) => { node.textContent = providerLine(); });
fill('[data-legal-address]', (node) => {
  node.replaceChildren(...LEGAL_DETAILS.address.flatMap((line, index) => [
    document.createTextNode(line),
    ...(index < LEGAL_DETAILS.address.length - 1 ? [document.createElement('br')] : []),
  ]));
});
fill('[data-legal-address-inline]', (node) => { node.textContent = LEGAL_DETAILS.address.join(', '); });
fill('[data-legal-email]', (node) => {
  node.textContent = LEGAL_DETAILS.email;
  if (node instanceof HTMLAnchorElement) node.href = `mailto:${LEGAL_DETAILS.email}`;
});
fill('[data-legal-vat]', (node) => { node.textContent = vatNote(); });

if (legalMissing()) fill('[data-legal-warning]', (node) => { node.hidden = false; });
