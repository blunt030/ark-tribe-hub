import { el } from './ui.js';

// Self-hosted Phosphor regular icons. No font glyphs or external CDN requests.
const glyphs = {
  '◈': 'house', '＋': 'plus-circle', '▤': 'clipboard-text', '☑': 'check-square',
  '◇': 'map', '☷': 'chat-circle-dots', '☏': 'chat-circle-dots', '♩': 'microphone',
  '♙': 'users', '♟': 'users', '◐': 'user', '◔': 'bell', '♧': 'bell',
  '⚠': 'warning', '◷': 'clock', '✦': 'clipboard-text', '⋯': 'dots-three',
  '🤝': 'handshake', '▥': 'chart-bar', '🗺️': 'map', '✓': 'check-square',
  '⚌': 'users', '🎙️': 'microphone', '📰': 'newspaper', '⎙': 'scroll',
  '⬢': 'users', '⚏': 'users', '⌗': 'squares-four', '➤': 'paper-plane-tilt',
};
export function uiIcon(name, className = '') {
  const key = glyphs[name] || name;
  const safe = /^[a-z-]+$/.test(key) ? key : 'diamond';
  return el('span.ui-icon' + (className ? '.' + className : ''), {
    'aria-hidden': 'true', style: `--icon-url:url('/assets/ui/${safe}.svg')`,
  });
}
