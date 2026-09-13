export const STANDARD_MAPS = [
  { name: 'The Island', file: 'the-island', aliases: ['the island', 'island'] },
  { name: 'The Center', file: 'the-center', aliases: ['the center', 'center'] },
  { name: 'Aberration', file: 'aberration', aliases: ['aberration', 'abberation'] },
  { name: 'Genesis 1', file: 'genesis-1', aliases: ['genesis 1', 'genesis part 1', 'genesis part one', 'gen1'] },
  { name: 'Extinction', file: 'extinction', aliases: ['extinction', 'extension'] },
  { name: 'Astraeos', file: 'astraeos', aliases: ['astraeos'] },
  { name: 'Lost Colony', file: 'lost-colony', aliases: ['lost colony'] },
  { name: 'Scorched Earth', file: 'scorched-earth', aliases: ['scorched earth', 'scorch earth'] },
];

function normalisiereMapName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Liefert nur bei einer eindeutig bekannten Map ein wirklich passendes Motiv. */
export function mitgeliefertesKartenbild(mapName) {
  const key = normalisiereMapName(mapName);
  const map = STANDARD_MAPS.find((entry) => entry.aliases.includes(key));
  return map ? `/assets/maps/${map.file}.jpg` : null;
}
