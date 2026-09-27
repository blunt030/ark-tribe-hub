/**
 * Spielinhalte des Dino-Tamagotchis: Futter und Gegenstände, Einrichtung,
 * Gehäuse, Tricks, Expeditionen, Tagesaufgaben, Versorgungskisten, Ränge,
 * Erfolge und Events. Reine Daten – Engine, Oberfläche und die Server-Prüfung
 * lesen dieselben Listen, damit nichts auseinanderläuft.
 */

/** Verbrauchsgüter im Beutel. Preise in Element-Splittern. */
export const ITEMS = {
  kibble_basic: { kind: 'kibble', tier: 1, hunger: 30, happy: 3, price: 12 },
  kibble_simple: { kind: 'kibble', tier: 2, hunger: 35, happy: 5, price: 20 },
  kibble_regular: { kind: 'kibble', tier: 3, hunger: 40, happy: 7, price: 32 },
  kibble_superior: { kind: 'kibble', tier: 4, hunger: 45, happy: 10, price: 55 },
  kibble_exceptional: { kind: 'kibble', tier: 5, hunger: 50, happy: 13, price: 85 },
  kibble_extraordinary: { kind: 'kibble', tier: 6, hunger: 60, happy: 18, price: 130 },
  treat: { kind: 'snack', hunger: 5, happy: 20, weight: 2, price: 8 },
  honey: { kind: 'snack', hunger: 10, happy: 35, weight: 2, price: 28 },
  stimberry: { kind: 'boost', energy: 35, price: 15 },
  brew: { kind: 'medicine', price: 40 },
  freeze: { kind: 'token', price: 150 },
};
export const KIBBLE = Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'kibble');

/** Einrichtung fürs Gehege – je Platz ein Stück, mit kleiner Dauerwirkung. */
export const SLOTS = ['bed', 'toy', 'plant', 'light', 'trophy'];
export const DECOR = {
  bed_straw: { slot: 'bed', rank: 1, price: 0, sleep: 0.05 },
  bed_fur: { slot: 'bed', rank: 2, price: 120, sleep: 0.12 },
  bed_tek: { slot: 'bed', rank: 6, price: 420, sleep: 0.2, energy: 0.9 },
  toy_ball: { slot: 'toy', rank: 1, price: 60, happy: 0.93 },
  toy_bone: { slot: 'toy', rank: 3, price: 160, happy: 0.9 },
  toy_drone: { slot: 'toy', rank: 7, price: 480, happy: 0.85 },
  plant_fern: { slot: 'plant', rank: 1, price: 45, sick: 0.9 },
  plant_mejo: { slot: 'plant', rank: 4, price: 240, sick: 0.85, hunger: 0.95 },
  light_torch: { slot: 'light', rank: 2, price: 90, night: true },
  light_tek: { slot: 'light', rank: 5, price: 320, night: true, energy: 0.95 },
  trophy_alpha: { slot: 'trophy', ach: 'first_alpha' },
  trophy_streak: { slot: 'trophy', ach: 'streak_30' },
  trophy_rank: { slot: 'trophy', ach: 'rank_10' },
  ev_heart: { slot: 'plant', event: 'love', price: 90, happy: 0.95 },
  ev_egg: { slot: 'toy', event: 'eggcellent', price: 90, happy: 0.95 },
  ev_parasol: { slot: 'plant', event: 'summer', price: 90, happy: 0.95 },
  ev_pumpkin: { slot: 'light', event: 'fear', price: 90, night: true },
  ev_turkey: { slot: 'trophy', event: 'turkey', price: 90 },
  ev_tree: { slot: 'plant', event: 'winter', price: 120, happy: 0.95 },
};

/** Gehäuse des Geräts. Freigeschaltet über Rang (und Splitter) oder Events. */
export const SHELLS = {
  tek: { rank: 1, price: 0 },
  bronze: { rank: 2, price: 100 },
  amber: { rank: 3, price: 160 },
  obsidian: { rank: 4, price: 240 },
  ice: { rank: 5, price: 300 },
  aberrant: { rank: 6, price: 400 },
  spooky: { event: 'fear', price: 200 },
  festive: { event: 'winter', price: 200 },
};

/** Pfiff-Tricks wie die ARK-Kommandos. Ab einer Bindungsstufe trainierbar. */
export const TRICKS = {
  sit: { bond: 2, steps: 3 },
  follow: { bond: 3, steps: 4 },
  roar: { bond: 4, steps: 4 },
  spin: { bond: 5, steps: 5 },
  dance: { bond: 7, steps: 6 },
  attack: { bond: 9, steps: 6 },
};
export const TRICK_SESSIONS = 3;

/** Expeditionen: je länger, desto besser die Beute. */
export const ZONES = {
  shore: { mins: 30, rank: 1, xp: 12, shards: [8, 16], loot: ['treat', 'kibble_basic', 'kibble_simple'] },
  forest: { mins: 60, rank: 2, xp: 20, shards: [15, 28], loot: ['kibble_simple', 'treat', 'stimberry'] },
  peak: { mins: 120, rank: 4, xp: 32, shards: [30, 50], loot: ['kibble_regular', 'honey', 'stimberry'] },
  ruins: { mins: 240, rank: 6, xp: 50, shards: [60, 95], loot: ['kibble_superior', 'brew', 'honey'] },
};

/**
 * Tagesaufgaben. `when` sagt, wann eine Aufgabe gezogen werden darf, damit
 * sie am jeweiligen Tag auch lösbar ist.
 */
export const QUESTS = {
  drop: { goal: 1, shards: 10, xp: 10, when: 'always' },
  feed: { goal: 3, shards: 15, xp: 20, when: 'pet' },
  kibble: { goal: 2, shards: 20, xp: 25, when: 'pet' },
  play: { goal: 2, shards: 20, xp: 25, when: 'pet' },
  win: { goal: 1, shards: 20, xp: 25, when: 'pet' },
  cuddle: { goal: 3, shards: 15, xp: 20, when: 'pet' },
  clean: { goal: 1, shards: 15, xp: 15, when: 'pet' },
  groom: { goal: 1, shards: 20, xp: 20, when: 'pet' },
  train: { goal: 2, shards: 25, xp: 30, when: 'trainable' },
  trick: { goal: 1, shards: 20, xp: 25, when: 'trick' },
  walk: { goal: 1, shards: 15, xp: 20, when: 'grown' },
  expedition: { goal: 1, shards: 30, xp: 35, when: 'grown' },
  imprint: { goal: 2, shards: 25, xp: 30, when: 'young' },
  egg: { goal: 1, shards: 20, xp: 20, when: 'nopet' },
  buy: { goal: 1, shards: 10, xp: 10, when: 'always' },
};
export const QUEST_COUNT = 3;
export const QUEST_BONUS = { shards: 40, xp: 50, items: [['kibble_regular', 1]] };

/** Versorgungskisten der 7-Tage-Serie – Farben wie die Supply Drops in ARK. */
export const DROPS = [
  { color: 'white', shards: 20, xp: 10, items: [['kibble_basic', 2], ['treat', 1]] },
  { color: 'green', shards: 30, xp: 15, items: [['kibble_simple', 2], ['treat', 2]] },
  { color: 'blue', shards: 45, xp: 20, items: [['kibble_regular', 2], ['stimberry', 1]] },
  { color: 'purple', shards: 60, xp: 25, items: [['kibble_superior', 1], ['honey', 1]] },
  { color: 'yellow', shards: 80, xp: 30, items: [['kibble_superior', 2], ['brew', 1]] },
  { color: 'red', shards: 110, xp: 40, items: [['kibble_exceptional', 1], ['honey', 2]] },
  { color: 'tek', shards: 160, xp: 60, items: [['kibble_extraordinary', 1], ['freeze', 1]] },
];
export const DROP_BONUS = ['treat', 'honey', 'stimberry', 'kibble_regular', 'kibble_superior', 'brew'];

/** Erfahrung und Bindung je Aktion (Grundwerte vor Event-Boni). */
export const REWARDS = {
  meal: { xp: 2, bond: 2 },
  kibble: { xp: 3, bond: 3 },
  snack: { xp: 1, bond: 1 },
  boost: { xp: 1, bond: 0 },
  play: { xp: 4, bond: 3 },
  win: { xp: 4, bond: 2 },
  cuddle: { xp: 3, bond: 4 },
  clean: { xp: 3, bond: 1 },
  groom: { xp: 5, bond: 4 },
  cured: { xp: 6, bond: 3 },
  dose: { xp: 2, bond: 1 },
  trained: { xp: 6, bond: 5 },
  trick_learned: { xp: 20, bond: 10 },
  performed: { xp: 8, bond: 6 },
  walk: { xp: 5, bond: 4 },
  tucked: { xp: 6, bond: 5 },
  disciplined: { xp: 4, bond: 1 },
  imprint: { xp: 10, bond: 8 },
  hatch: { xp: 10, bond: 5 },
  egg: { xp: 5, bond: 0 },
};

/** Pfleger-Rang: benötigte Gesamterfahrung je Stufe (Index = Stufe − 1). */
export const RANKS = [0, 60, 150, 280, 450, 670, 940, 1260, 1640, 2080, 2600, 3200, 3900, 4700, 5600];
export const RANK_NAMES = ['fresh', 'gatherer', 'tamer', 'breeder', 'survivor', 'alpha', 'tek', 'keeper', 'ascended', 'legend'];
export const RANK_BONUS = 25;

/** Bindung zwischen Pfleger und Tier (je Tier). */
export const BOND = [0, 25, 70, 140, 240, 370, 530, 720, 950, 1220];

/** Erfolge. `metric` verweist auf Zähler oder abgeleitete Werte (siehe progress.js). */
export const ACHIEVEMENTS = [
  { id: 'hatch_1', metric: 'hatch', goal: 1, shards: 20 },
  { id: 'streak_3', metric: 'best', goal: 3, shards: 40 },
  { id: 'streak_7', metric: 'best', goal: 7, shards: 100, item: ['freeze', 1] },
  { id: 'streak_30', metric: 'best', goal: 30, shards: 400, decor: 'trophy_streak' },
  { id: 'drops_7', metric: 'drop', goal: 7, shards: 70 },
  { id: 'quests_30', metric: 'quest', goal: 30, shards: 150 },
  { id: 'meals_50', metric: 'feed', goal: 50, shards: 60 },
  { id: 'kibble_25', metric: 'kibble', goal: 25, shards: 60 },
  { id: 'wins_10', metric: 'win', goal: 10, shards: 50 },
  { id: 'wins_50', metric: 'win', goal: 50, shards: 150 },
  { id: 'cuddles_100', metric: 'cuddle', goal: 100, shards: 80 },
  { id: 'clean_30', metric: 'clean', goal: 30, shards: 50 },
  { id: 'groom_20', metric: 'groom', goal: 20, shards: 60 },
  { id: 'tricks_1', metric: 'learned', goal: 1, shards: 40 },
  { id: 'tricks_6', metric: 'learned', goal: 6, shards: 200 },
  { id: 'exp_1', metric: 'expedition', goal: 1, shards: 30 },
  { id: 'exp_25', metric: 'expedition', goal: 25, shards: 200 },
  { id: 'raised_1', metric: 'raised', goal: 1, shards: 60 },
  { id: 'raised_5', metric: 'raised', goal: 5, shards: 150 },
  { id: 'raised_20', metric: 'raised', goal: 20, shards: 500 },
  { id: 'first_alpha', metric: 'alpha', goal: 1, shards: 100, decor: 'trophy_alpha' },
  { id: 'secret_tek', metric: 'tek', goal: 1, shards: 250 },
  { id: 'imprint_100', metric: 'imprint100', goal: 1, shards: 150 },
  { id: 'gen_3', metric: 'gen', goal: 3, shards: 120 },
  { id: 'rank_5', metric: 'rank', goal: 5, shards: 150 },
  { id: 'rank_10', metric: 'rank', goal: 10, shards: 500, decor: 'trophy_rank' },
];

/**
 * Events nach Kalender (Monat-Tag, Ortszeit) – angelehnt an die ARK-Events.
 * Am Wochenende läuft zusätzlich das Evolution-Event mit doppelter Erfahrung.
 */
export const EVENTS = [
  { id: 'love', from: '02-07', to: '02-21', mult: { bond: 2 } },
  { id: 'eggcellent', from: '04-01', to: '04-14', mult: { xp: 1.5 } },
  { id: 'summer', from: '07-01', to: '07-21', mult: { shards: 1.5 } },
  { id: 'fear', from: '10-18', to: '11-02', mult: { shards: 1.5 } },
  { id: 'turkey', from: '11-20', to: '11-30', mult: { xp: 1.5 } },
  { id: 'winter', from: '12-12', to: '01-02', mult: { shards: 1.5, bond: 1.5 } },
];
export const WEEKEND_EVENT = { id: 'evolution', days: [5, 6, 0], mult: { xp: 2 } };

/** Zulässige Stärkungen („Buffs“) am Tier. */
export const BUFFS = ['rested', 'dreamy', 'restless', 'shiny'];
