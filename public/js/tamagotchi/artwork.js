/**
 * Echte Bilder für das Tamagotchi: freigestellte, gemalte Kreaturen (dieselben
 * Motive wie bei den Bestellungen) und gemalte ARK-Landschaften als Kulisse.
 *
 * Ohne DOM: Der Server nutzt dieselbe Liste, um zu wissen, welche Arten ein
 * Bild haben (nur diese können neu ausgebrütet werden). Weitere Bilder lädt der
 * Betreiber in der Tamagotchi-Verwaltung hoch; deren Maße kommen dann vom Server.
 *
 * Maße in Pixeln, Blickrichtung des Motivs (1 = nach rechts, -1 = nach links),
 * Scheitel und Maul als Anteil der Bildfläche (0–1, in Blickrichtung des
 * Motivs), Fußlinie (Unterkante des Tiers) und Größenklasse.
 */

export const ART_DIR = '/assets/items/cut/';

const A = (w, h, face, head, mouth, base, size) => ({ w, h, face, head, mouth, base, size });

export const BUNDLED = {
  acrocanthosaurus: A(900, 632, 1, [0.84, 0.05], [0.93, 0.25], 0.957, 'l'),
  allosaurus: A(900, 685, -1, [0.16, 0.04], [0.06, 0.22], 0.959, 'l'),
  ankylosaurus: A(900, 556, 1, [0.92, 0.33], [0.97, 0.55], 0.95, 'l'),
  argentavis: A(900, 900, -1, [0.22, 0.56], [0.18, 0.68], 0.978, 'l'),
  baryonyx: A(900, 664, 1, [0.8, 0.05], [0.87, 0.28], 0.958, 'l'),
  basilosaurus: A(900, 518, 1, [0.8, 0.25], [0.92, 0.47], 0.948, 'xl'),
  brontosaurus: A(900, 786, 1, [0.92, 0.03], [0.97, 0.1], 0.966, 'xl'),
  carcharodontosaurus: A(900, 604, -1, [0.22, 0.04], [0.06, 0.2], 0.954, 'xl'),
  carnotaurus: A(900, 767, 1, [0.82, 0.04], [0.93, 0.27], 0.965, 'l'),
  daeodon: A(900, 753, 1, [0.82, 0.2], [0.93, 0.5], 0.964, 'm'),
  dimorphodon: A(900, 759, -1, [0.5, 0.27], [0.5, 0.42], 0.963, 's'),
  direwolf: A(900, 717, 1, [0.82, 0.06], [0.86, 0.38], 0.964, 'm'),
  doedicurus: A(900, 642, -1, [0.1, 0.55], [0.04, 0.78], 0.958, 'm'),
  giganotosaurus: A(900, 669, -1, [0.14, 0.04], [0.08, 0.36], 0.96, 'xl'),
  kaprosuchus: A(900, 624, 1, [0.83, 0.58], [0.84, 0.78], 0.957, 'm'),
  managarmr: A(900, 637, 1, [0.85, 0.14], [0.93, 0.36], 0.956, 'xl'),
  megalodon: A(900, 567, -1, [0.22, 0.25], [0.1, 0.42], 0.951, 'xl'),
  megatherium: A(900, 815, 1, [0.83, 0.04], [0.9, 0.13], 0.967, 'l'),
  mosasaurus: A(900, 450, -1, [0.1, 0.1], [0.06, 0.3], 0.984, 'xl'),
  pteranodon: A(900, 760, -1, [0.24, 0.27], [0.08, 0.46], 0.963, 'm'),
  quetzal: A(900, 866, 1, [0.8, 0.14], [0.9, 0.3], 0.969, 'xl'),
  rex: A(900, 678, -1, [0.18, 0.05], [0.07, 0.3], 0.96, 'l'),
  spinosaurus: A(900, 647, 1, [0.84, 0.2], [0.93, 0.36], 0.958, 'l'),
  therizinosaurus: A(900, 877, 1, [0.86, 0.04], [0.92, 0.08], 0.969, 'l'),
  triceratops: A(900, 625, 1, [0.8, 0.07], [0.9, 0.55], 0.955, 'l'),
  yutyrannus: A(900, 791, -1, [0.15, 0.05], [0.05, 0.22], 0.966, 'l'),
};

/** Breite eines erwachsenen Tiers in Prozent der Bildschirmbreite. */
export const SIZES = { s: 34, m: 44, l: 52, xl: 60 };
export const SIZE_KEYS = Object.keys(SIZES);
/** Wachstum: Babys sind halb so groß wie Erwachsene. */
export const STAGE_SCALE = { egg: 0.5, baby: 0.5, juvenile: 0.64, adolescent: 0.82, adult: 1, elder: 0.97 };
/** Höchstens so hoch (in Prozent der Bildschirmhöhe), damit Anzeige und Tier Platz haben. */
export const MAX_HEIGHT = 62;

/** Wie sich eine Art bewegt: laufen, fliegen oder schwimmen. */
export function motionOf(sp) {
  if (!sp) return 'walk';
  if (sp.hab === 'F') return 'fly';
  if (['swimmer', 'fish'].includes(sp.arch) || (sp.hab === 'W' && !['croc', 'turtle', 'frog', 'mammal'].includes(sp.arch))) return 'swim';
  return 'walk';
}

/** Breite des Tiers auf dem Bildschirm (Prozent) für Motiv, Größe und Lebensphase. */
export function widthOf(art, stage = 'adult') {
  const base = SIZES[art.size] || SIZES.l;
  const aspect = art.w / art.h;
  const capped = Math.min(base, (MAX_HEIGHT * 3 * aspect) / 4);
  return Math.round(capped * (STAGE_SCALE[stage] ?? 1) * 10) / 10;
}

/**
 * Prüft und vereinheitlicht die Angaben zu einem hochgeladenen Bild (Server und
 * Verwaltung). Liefert null, wenn etwas nicht passt.
 */
export function cleanArtMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const frac = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every(frac);
  const w = Number(m.w), h = Number(m.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 16 || h < 16 || w > 8192 || h > 8192) return null;
  if (m.face !== 1 && m.face !== -1) return null;
  if (!point(m.head) || !point(m.mouth) || !frac(m.base) || !SIZES[m.size]) return null;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { w, h, face: m.face, head: m.head.map(r3), mouth: m.mouth.map(r3), base: r3(m.base), size: m.size };
}

/* -------------------------------------------------------------------------- */
/* Landschaft aus den ARK-Karten                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ausschnitte der ARK-Karten (public/assets/maps) als Boden: Die Karte liegt
 * als schräge Fläche im Raum (3D), darüber ein gemalter Himmel. Je Lebensraum
 * zwei Gegenden, die sich täglich abwechseln. `pos`/`size` wählen den
 * Ausschnitt (background-position/-size).
 */
export const MAP_NAMES = {
  'the-island': 'The Island', 'scorched-earth': 'Scorched Earth', aberration: 'Aberration', extinction: 'Extinction',
  'genesis-1': 'Genesis', 'the-center': 'The Center', 'lost-colony': 'Lost Colony', astraeos: 'Astraeos',
};
const R = (map, pos, size) => ({ map, pos, size });
export const REGIONS = {
  jungle: [R('the-island', '45% 62%', 200), R('genesis-1', '22% 55%', 220)],
  forest: [R('the-center', '70% 40%', 200), R('the-island', '30% 42%', 220)],
  swamp: [R('genesis-1', '28% 68%', 220), R('aberration', '15% 22%', 210)],
  snow: [R('the-island', '38% 6%', 230), R('genesis-1', '10% 10%', 230)],
  volcano: [R('the-island', '63% 4%', 250), R('genesis-1', '66% 12%', 240)],
  desert: [R('scorched-earth', '45% 55%', 180), R('scorched-earth', '70% 30%', 200)],
  cave: [R('aberration', '28% 48%', 200), R('aberration', '75% 55%', 200)],
  ruins: [R('extinction', '50% 42%', 200), R('lost-colony', '50% 42%', 200)],
  arena: [R('extinction', '50% 42%', 200), R('extinction', '25% 70%', 210)],
  tek: [R('lost-colony', '50% 42%', 200), R('genesis-1', '62% 48%', 220)],
  space: [R('lost-colony', '50% 42%', 200), R('astraeos', '52% 52%', 170)],
  sky: [R('astraeos', '52% 52%', 170), R('the-island', '45% 62%', 200)],
  ocean: [R('genesis-1', '82% 78%', 220), R('the-center', '50% 50%', 180)],
};

/** Gemalter Himmel über der Karte je Tageszeit (Ausschnitt ohne Gebäude und Tiere). */
export const SKIES = {
  day: [
    { src: '/assets/banners/servers.webp', pos: '8% 22%', size: 185 },
    { src: '/assets/command-hero-v3.webp', pos: '0% 20%', size: 260 },
  ],
  dawn: [{ src: '/assets/banners/members.webp', pos: '75% 35%', size: 160 }],
  dusk: [
    { src: '/assets/banners/rel-friend.webp', pos: '18% 30%', size: 170 },
    { src: '/assets/dashboard-command-hero.webp', pos: '35% 25%', size: 220 },
  ],
  night: [{ src: '/assets/dashboard-sidebar.webp', pos: '50% 8%', size: 120 }],
};

/** Gegenden der Expeditionen (für die Karte „Unterwegs“). */
export const ZONE_REGIONS = {
  shore: R('the-island', '48% 92%', 230),
  forest: R('the-center', '70% 40%', 200),
  peak: R('the-island', '38% 6%', 230),
  ruins: R('extinction', '50% 42%', 200),
};

/** Kartenlandschaft für Art, Tageszeit und Tag. */
export function landFor(sp, phase, day = 0) {
  const biome = motionOf(sp) === 'swim' ? 'ocean' : REGIONS[sp?.biome] ? sp.biome : 'jungle';
  const regions = REGIONS[biome];
  const skies = SKIES[phase] || SKIES.day;
  const h = hash(sp?.key) + day;
  return { biome, region: regions[h % regions.length], sky: skies[h % skies.length] };
}

/* -------------------------------------------------------------------------- */
/* Gemalte Kulissen                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Gemalte ARK-Landschaften (Bildstil „Gemälde“, Ei und Brutkapsel). `pos` ist
 * der Bildausschnitt (object-position), `water` die Höhe der Wasserlinie
 * (Prozent von unten) für Meerestiere.
 */
export const SCENES = {
  jungle: { src: '/assets/banners/servers.webp', pos: '35% 55%', water: 0 },
  river: { src: '/assets/items/stage-jungle.webp', pos: '28% 62%', water: 0 },
  deck: { src: '/assets/tribe-workshop.webp', pos: '58% 62%', water: 0 },
  lagoon: { src: '/assets/command-hero-v3.webp', pos: '0% 70%', water: 20 },
  sunset: { src: '/assets/banners/rel-friend.webp', pos: '40% 55%', water: 0 },
  valley: { src: '/assets/dashboard-command-hero.webp', pos: '40% 80%', water: 20 },
  forest: { src: '/assets/banners/chat.webp', pos: '40% 62%', water: 0 },
  dawn: { src: '/assets/banners/members.webp', pos: '60% 62%', water: 0 },
  camp: { src: '/assets/banners/tasks.webp', pos: '50% 60%', water: 20 },
  torch: { src: '/assets/banners/rel-alliance.webp', pos: '50% 62%', water: 0 },
  hut: { src: '/assets/dashboard-sidebar.webp', pos: '50% 78%', water: 0 },
  workshop: { src: '/assets/items/stage-workshop.webp', pos: '62% 62%', water: 0 },
  nest: { src: '/assets/rex_egg_dashboard.webp', pos: '0% 50%', water: 0 },
};

/** Lage des gemalten Eis in der Nest-Kulisse (Anteile des Bildschirms). */
export const NEST_EGG = { cx: 0.377, cy: 0.453, rx: 0.1765, ry: 0.293, bottom: 0.746 };

const ROTATION = {
  walk: { day: ['jungle', 'river', 'deck'], dusk: ['sunset', 'forest', 'valley'], dawn: ['dawn', 'sunset'], night: ['camp', 'torch', 'hut'] },
  fly: { day: ['jungle', 'river'], dusk: ['sunset', 'valley'], dawn: ['dawn', 'sunset'], night: ['hut', 'camp'] },
  swim: { day: ['lagoon'], dusk: ['valley'], dawn: ['valley'], night: ['camp'] },
};

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Kulisse für Art, Tageszeit und Tag: Jeden Tag steht das Tier an einem
 * anderen Ort, die Tageszeit bestimmt das Licht.
 */
export function sceneFor(sp, phase, day = 0) {
  const list = ROTATION[motionOf(sp)][phase] || ROTATION.walk.day;
  return list[(hash(sp?.key) + day) % list.length];
}
