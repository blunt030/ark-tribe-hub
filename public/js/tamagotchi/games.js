/**
 * Minispiele auf dem Tamagotchi-Bildschirm. Gesteuert wird wie früher über die
 * Tasten A/B/C (oder Tippen/Ziehen bzw. Tastatur). Jedes Spiel meldet am Ende
 * { won, game, score } – die Wirkung auf das Tier regelt die Engine.
 */
import { el } from '../ui.js';
import { t } from '../i18n.js';
import { creatureArt } from './art.js';
import { foodArt, poopArt } from './scene.js';
import { toDataUrl, fitViewBox } from './vdom.js';
import { sfx, buzz } from './sound.js';

function image(node) {
  const img = new Image();
  img.decoding = 'async';
  img.src = toDataUrl(node);
  return img;
}

function fitCanvas(canvas) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth || 320, hgt = canvas.clientHeight || 240;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / 320, 0, 0, canvas.height / 240, 0, 0);
  return ctx;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* Links oder Rechts (Original von 1996)                                        */
/* -------------------------------------------------------------------------- */

function leftRight(host, { pet, sp, onEnd }) {
  const total = 5;
  let round = 0, hits = 0, busy = false, done = false;
  const sprite = el('img.game-lr-pet', { src: toDataUrl(fitViewBox(creatureArt(sp, { stage: pet.stage, variant: pet.variant, colors: pet.colors }))), alt: '' });
  const title = el('div.game-caption', { text: t('tama.game.guess', { name: pet.name }) });
  const score = el('div.game-score', { text: '' });
  const verdict = el('div.game-verdict', { 'aria-live': 'polite' });
  const left = el('button.game-arrow.is-left', { type: 'button', 'aria-label': t('tama.game.left'), onclick: () => guess(-1) }, '◀');
  const right = el('button.game-arrow.is-right', { type: 'button', 'aria-label': t('tama.game.right'), onclick: () => guess(1) }, '▶');
  const hint = el('div.game-hint', { text: t('tama.game.controls_lr') });
  host.replaceChildren(el('div.game-lr', {}, title, score, el('div.game-lr-stage', {}, left, sprite, right), verdict, hint));
  const update = () => { score.textContent = `${t('tama.game.round', { n: Math.min(round + 1, total), total })} · ${t('tama.game.hits', { n: hits, total })}`; };
  update();

  async function guess(dir) {
    if (busy || done) return;
    busy = true;
    sfx('tick');
    buzz(8);
    const look = Math.random() < 0.5 ? -1 : 1;
    sprite.classList.add('is-turning');
    await wait(280);
    sprite.classList.remove('is-turning');
    sprite.style.transform = look < 0 ? 'scaleX(-1)' : '';
    const ok = look === dir;
    if (ok) hits += 1;
    verdict.textContent = ok ? '✓' : '✗';
    verdict.className = 'game-verdict ' + (ok ? 'is-hit' : 'is-miss');
    sfx(ok ? 'select' : 'back');
    round += 1;
    update();
    await wait(650);
    verdict.textContent = '';
    sprite.style.transform = '';
    busy = false;
    if (round >= total || hits >= 3 || round - hits > 2) {
      done = true;
      const won = hits >= 3;
      verdict.textContent = won ? t('tama.game.win') : t('tama.game.lose');
      verdict.className = 'game-verdict is-final';
      sfx(won ? 'win' : 'lose');
      await wait(1000);
      onEnd({ won, game: 'lr', score: hits });
    }
  }

  return {
    button(b) { if (b === 'a') guess(-1); if (b === 'c') guess(1); },
    destroy() { done = true; },
  };
}

/* -------------------------------------------------------------------------- */
/* Beerenregen                                                                   */
/* -------------------------------------------------------------------------- */

function catchGame(host, { pet, sp, food, onEnd }) {
  const canvas = el('canvas.game-canvas', { 'aria-label': t('tama.game.catch') });
  const hud = el('div.game-hud', {});
  host.replaceChildren(canvas, hud, el('div.game-hint', { text: t('tama.game.controls_catch') }));
  const ctx = fitCanvas(canvas);
  const petImg = image(fitViewBox(creatureArt(sp, { stage: pet.stage === 'egg' ? 'baby' : pet.stage, variant: pet.variant, colors: pet.colors })));
  const goodImg = image(foodArt(food));
  const bonusImg = image(foodArt('kibble'));
  const badImg = image(poopArt());
  const DURATION = 20_000;
  let x = 160, vx = 0, drag = null;
  let items = [], score = 0, last = performance.now(), start = last, spawn = 0, raf = 0, over = false, hurt = 0, facing = 1;

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    drag = ((e.clientX - r.left) / r.width) * 320;
  };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture?.(e.pointerId); onMove(e); });
  canvas.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') onMove(e); });
  canvas.addEventListener('pointerup', () => { drag = null; });

  function frame(now) {
    if (over) return;
    const dt = Math.min(50, now - last);
    last = now;
    const elapsed = now - start;
    if (drag !== null) { const d = drag - x; x += Math.sign(d) * Math.min(Math.abs(d), dt * 0.45); if (Math.abs(d) > 2) facing = Math.sign(d); }
    else if (vx) { x += vx * dt * 0.32; facing = Math.sign(vx); }
    x = Math.max(24, Math.min(296, x));
    spawn -= dt;
    if (spawn <= 0) {
      const r = Math.random();
      items.push({ x: 20 + Math.random() * 280, y: -16, kind: r < 0.2 ? 'bad' : r < 0.32 ? 'bonus' : 'good', v: 0.07 + Math.random() * 0.05 + elapsed / DURATION * 0.08 });
      spawn = Math.max(260, 720 - elapsed * 0.022);
    }
    for (const it of items) it.y += it.v * dt;
    items = items.filter((it) => {
      if (it.y > 180 && it.y < 214 && Math.abs(it.x - x) < 30) {
        if (it.kind === 'bad') { score = Math.max(0, score - 2); hurt = 400; sfx('refuse'); buzz([20, 30, 20]); }
        else { score += it.kind === 'bonus' ? 3 : 1; sfx('tick'); }
        return false;
      }
      return it.y < 250;
    });
    hurt = Math.max(0, hurt - dt);
    ctx.clearRect(0, 0, 320, 240);
    for (const it of items) ctx.drawImage(it.kind === 'bad' ? badImg : it.kind === 'bonus' ? bonusImg : goodImg, it.x - 13, it.y - 13, 26, 26);
    ctx.save();
    ctx.globalAlpha = hurt ? 0.55 : 1;
    ctx.translate(x, 206);
    ctx.scale(facing, 1);
    ctx.drawImage(petImg, -38, -64, 76, 76);
    ctx.restore();
    const left = Math.max(0, Math.ceil((DURATION - elapsed) / 1000));
    hud.textContent = `${t('tama.game.score', { n: score })} · ${left}s`;
    if (elapsed >= DURATION) return finish();
    raf = requestAnimationFrame(frame);
  }

  async function finish() {
    over = true;
    const won = score >= 10;
    hud.textContent = `${won ? t('tama.game.win') : t('tama.game.lose')} · ${t('tama.game.score', { n: score })}`;
    hud.classList.add('is-final');
    sfx(won ? 'win' : 'lose');
    await wait(1100);
    onEnd({ won, game: 'catch', score });
  }

  raf = requestAnimationFrame(frame);
  return {
    button(b, down = true) {
      if (b === 'a') vx = down ? -1 : (vx < 0 ? 0 : vx);
      if (b === 'c') vx = down ? 1 : (vx > 0 ? 0 : vx);
    },
    destroy() { over = true; cancelAnimationFrame(raf); },
  };
}

/* -------------------------------------------------------------------------- */
/* Tek-Takt                                                                      */
/* -------------------------------------------------------------------------- */

function timingGame(host, { onEnd }) {
  const canvas = el('canvas.game-canvas', { 'aria-label': t('tama.game.timing') });
  const hud = el('div.game-hud', {});
  host.replaceChildren(canvas, hud, el('div.game-hint', { text: t('tama.game.controls_timing') }));
  const ctx = fitCanvas(canvas);
  const total = 6;
  let round = 0, hits = 0, angle = 0, speed = 2.2, target = Math.random() * Math.PI * 2, width = 0.75, raf = 0, last = performance.now(), frozen = 0, flash = null, over = false;

  function draw() {
    ctx.clearRect(0, 0, 320, 240);
    const cx = 160, cy = 116, r = 70;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(120,200,255,0.25)';
    ctx.lineWidth = 16;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = flash === false ? '#ff5a6a' : '#5ff2ff';
    ctx.shadowColor = '#5ff2ff';
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(cx, cy, r, target - width / 2, target + width / 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = flash === true ? '#8aff8a' : '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * (r + 12), cy + Math.sin(angle) * (r + 12)); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    hud.textContent = `${t('tama.game.round', { n: Math.min(round + 1, total), total })} · ${t('tama.game.hits', { n: hits, total })}`;
  }

  function frame(now) {
    if (over) return;
    const dt = Math.min(50, now - last);
    last = now;
    if (frozen > 0) frozen -= dt;
    else { angle = (angle + speed * dt / 1000) % (Math.PI * 2); flash = null; }
    draw();
    raf = requestAnimationFrame(frame);
  }

  async function stop() {
    if (frozen > 0 || over) return;
    const diff = Math.atan2(Math.sin(angle - target), Math.cos(angle - target));
    const hit = Math.abs(diff) <= width / 2;
    if (hit) hits += 1;
    flash = hit;
    frozen = 650;
    sfx(hit ? 'select' : 'back');
    buzz(hit ? 10 : [20, 30, 20]);
    round += 1;
    speed += 0.55;
    width = Math.max(0.42, width - 0.06);
    target = Math.random() * Math.PI * 2;
    if (round >= total) {
      over = true;
      draw();
      const won = hits >= 4;
      hud.textContent = `${won ? t('tama.game.win') : t('tama.game.lose')} · ${t('tama.game.hits', { n: hits, total })}`;
      hud.classList.add('is-final');
      sfx(won ? 'win' : 'lose');
      await wait(1100);
      onEnd({ won, game: 'timing', score: hits });
    }
  }

  canvas.addEventListener('pointerdown', stop);
  raf = requestAnimationFrame(frame);
  return {
    button(b, down = true) { if (down && (b === 'b' || b === 'a' || b === 'c')) stop(); },
    destroy() { over = true; cancelAnimationFrame(raf); },
  };
}

export const GAMES = [
  { key: 'lr', title: 'tama.game.lr', desc: 'tama.game.lr_desc', start: leftRight },
  { key: 'catch', title: 'tama.game.catch', desc: 'tama.game.catch_desc', start: catchGame },
  { key: 'timing', title: 'tama.game.timing', desc: 'tama.game.timing_desc', start: timingGame },
];
