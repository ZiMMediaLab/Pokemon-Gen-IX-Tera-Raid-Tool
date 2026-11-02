// Converts the raw Gen 9 raid encounter tables into the JSON files the app loads.
// Run with: npm run build-data
import { readFileSync, writeFileSync } from 'node:fs';
import { Dex } from '@pkmn/dex';

const RAW = new URL('../data/raw/', import.meta.url);
const OUT = new URL('../docs/data/', import.meta.url);

const TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
  'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];

// Form values at or above this are placeholders meaning "any form" (Vivillon patterns, random forms).
const FORM_DYNAMIC = 30;

const dex = Dex.forGen(9);
const speciesByNum = new Map();
for (const s of dex.species.all()) {
  if (s.forme === '' || s.baseSpecies === s.name) speciesByNum.set(s.num, s);
}
const movesByNum = new Map(dex.moves.all().map(m => [m.num, m]));

// Paradox Pokémon and sub-legendaries are everyday raid picks; only box legendaries and mythicals get hidden.
function isBoxLegendary(s) {
  return s.tags.includes('Restricted Legendary') || s.tags.includes('Mythical');
}

function resolveSpecies(num, form) {
  const base = speciesByNum.get(num);
  if (!base) throw new Error(`Unknown species #${num}`);
  if (form >= FORM_DYNAMIC || form === 0) return base;
  const formeName = base.formeOrder?.[form];
  const forme = formeName ? dex.species.get(formeName) : null;
  return forme?.exists ? forme : base;
}

function teraFromGem(gem) {
  if (gem === 0 || gem === 1) return null;
  return TYPES[gem - 2] ?? null;
}

function readMoves(buf, offset) {
  const moves = [];
  for (let i = 0; i < 4; i++) {
    const num = buf.readUInt16LE(offset + 8 + i * 2);
    if (num === 0) continue;
    const m = movesByNum.get(num);
    if (!m) throw new Error(`Unknown move #${num}`);
    moves.push(m.id);
  }
  return moves;
}

function readTable(file, recordSize, source) {
  const buf = readFileSync(new URL(file, RAW));
  const rows = [];
  for (let off = 0; off + recordSize <= buf.length; off += recordSize) {
    const species = resolveSpecies(buf.readUInt16LE(off), buf[off + 2]);
    const row = {
      species: species.id,
      level: buf[off + 7],
      moves: readMoves(buf, off),
      tera: teraFromGem(buf[off + 0x10]),
      stars: buf[off + 0x12],
      source,
    };
    if (recordSize === 0x18) {
      row.scarlet = buf.readInt16LE(off + 0x14) !== -1;
      row.violet = buf.readInt16LE(off + 0x16) !== -1;
    } else {
      row.scarlet = true;
      row.violet = true;
    }
    rows.push(row);
  }
  return rows;
}

const tables = [
  readTable('encounter_gem_paldea.pkl', 0x18, 'Paldea'),
  readTable('encounter_gem_kitakami.pkl', 0x18, 'Kitakami'),
  readTable('encounter_gem_blueberry.pkl', 0x18, 'Blueberry'),
  readTable('encounter_dist_paldea.pkl', 0x3E, 'Event'),
  readTable('encounter_might_paldea.pkl', 0x3E, 'Event'),
].flat();

// The same boss appears once per region and once per game version; merge those copies.
const merged = new Map();
for (const row of tables) {
  const key = [row.species, row.stars, row.tera ?? '-', row.moves.join(',')].join('|');
  const existing = merged.get(key);
  if (existing) {
    existing.scarlet ||= row.scarlet;
    existing.violet ||= row.violet;
    if (!existing.sources.includes(row.source)) existing.sources.push(row.source);
    continue;
  }
  merged.set(key, { ...row, sources: [row.source] });
}

const raids = [...merged.values()]
  .map(({ source, ...rest }) => rest)
  .sort((a, b) => a.species.localeCompare(b.species) || a.stars - b.stars);
raids.forEach((r, i) => { r.id = i; });

// Only species and moves the raids or the counter list reference need to ship.
const pokemon = {};
for (const s of dex.species.all()) {
  if (s.isNonstandard || s.num <= 0 || s.battleOnly || s.isCosmeticForme) continue;
  pokemon[s.id] = {
    name: s.name,
    num: s.num,
    types: s.types,
    stats: s.baseStats,
    abilities: Object.values(s.abilities),
    fullyEvolved: !s.nfe,
    legendary: isBoxLegendary(s),
  };
}
for (const r of raids) {
  if (!pokemon[r.species]) {
    const s = dex.species.get(r.species);
    pokemon[s.id] = { name: s.name, num: s.num, types: s.types, stats: s.baseStats,
      abilities: Object.values(s.abilities), fullyEvolved: !s.nfe, legendary: isBoxLegendary(s) };
  }
}

const moveIds = new Set(raids.flatMap(r => r.moves));
const moves = {};
for (const id of moveIds) {
  const m = dex.moves.get(id);
  moves[id] = {
    name: m.name,
    type: m.type,
    cat: m.category,
    bp: m.basePower,
    boosts: m.boosts && m.target === 'self' ? m.boosts : m.self?.boosts ?? null,
    status: m.status ?? null,
    spread: m.target === 'allAdjacentFoes' || m.target === 'allAdjacent',
    priority: m.priority,
  };
}

writeFileSync(new URL('raids.json', OUT), JSON.stringify(raids));
writeFileSync(new URL('pokemon.json', OUT), JSON.stringify(pokemon));
writeFileSync(new URL('moves.json', OUT), JSON.stringify(moves));

const counts = raids.reduce((acc, r) => ((acc[r.stars] = (acc[r.stars] ?? 0) + 1), acc), {});
console.log(`raids: ${raids.length}`, counts);
console.log(`pokemon: ${Object.keys(pokemon).length}, moves: ${Object.keys(moves).length}`);
