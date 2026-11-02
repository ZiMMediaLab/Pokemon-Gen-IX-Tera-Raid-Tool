import { effectiveness, abilityModifier } from './types.js';

const FIXED_DAMAGE_POWER = 60;
const MIN_BST_ALL_MODE = 420;

// Ways a counter can get past a boss ability that would block its attack.
const ABILITY_BYPASS_MOVES = ['Gastro Acid'];
const ABILITY_BYPASS_ABILITIES = ['Mold Breaker', 'Teravolt', 'Turboblaze'];

export function analyzeBoss(raid, tera, data) {
  const mon = data.pokemon[raid.species];
  const originalTypes = mon.types;
  const defendTypes = tera ? [tera] : originalTypes;

  const moves = raid.moves.map(id => ({ id, ...data.moves[id] }));
  const attacks = moves
    .filter(m => m.cat !== 'Status')
    .map(m => ({ ...m, weight: (m.bp || FIXED_DAMAGE_POWER) * bossStab(m.type, originalTypes, tera) }));

  const totalWeight = attacks.reduce((sum, a) => sum + a.weight, 0) || 1;
  const physicalShare = attacks.filter(a => a.cat === 'Physical').reduce((s, a) => s + a.weight, 0) / totalWeight;

  return {
    raid,
    name: mon.name,
    stats: mon.stats,
    originalTypes,
    defendTypes,
    tera,
    abilities: raid.abilities,
    abilityLocked: raid.abilities.length === 1,
    moves,
    attacks,
    physicalShare,
    specialShare: attacks.length ? 1 - physicalShare : 0,
    setupMoves: moves.filter(m => m.boosts && Object.values(m.boosts).some(v => v > 0)),
    statusMoves: moves.filter(m => m.status),
    spreadMoves: attacks.filter(m => m.spread),
    priorityMoves: attacks.filter(m => m.priority > 0),
  };
}

// Raid bosses get the same STAB rules as players, including the Tera boost.
function bossStab(moveType, originalTypes, tera) {
  const original = originalTypes.includes(moveType);
  if (tera && moveType === tera) return original ? 2 : 1.5;
  return original ? 1.5 : 1;
}

function attackerStab(moveType, types, tera) {
  const original = types.includes(moveType);
  if (tera === moveType) return original ? 2 : 1.5;
  return original ? 1.5 : 1;
}

export function evaluate(candidate, boss, data) {
  const mon = data.pokemon[candidate.species];
  const { type, cat } = candidate.attack;

  const typeMult = effectiveness(type, boss.defendTypes);
  const { offenseMult, abilityRisk, abilityBypass } = applyBossAbility(candidate, boss, type, typeMult);
  let stat = cat === 'Physical' ? mon.stats.atk : mon.stats.spa;
  if (candidate.ability === 'Huge Power' || candidate.ability === 'Pure Power') stat *= 2;
  const offense = offenseMult * attackerStab(type, mon.types, candidate.tera) * stat;

  // Counters spend most of the raid un-Terastallized, so they defend with their original types.
  const hits = boss.attacks.map(a => ({
    type: a.type,
    name: a.name,
    weight: a.weight,
    cat: a.cat,
    mult: effectiveness(a.type, mon.types, candidate.ability),
  }));
  const worst = hits.length ? Math.max(...hits.map(h => h.mult)) : 0;
  const totalWeight = hits.reduce((s, h) => s + h.weight, 0) || 1;
  const avgTaken = hits.reduce((s, h) => s + h.weight * h.mult, 0) / totalWeight;

  const relevantDefense = boss.physicalShare * mon.stats.def + boss.specialShare * mon.stats.spd;
  const bulk = Math.sqrt(mon.stats.hp * (relevantDefense || mon.stats.def));
  const score = offense * Math.sqrt(bulk / 100) / Math.sqrt(Math.max(avgTaken, 0.25));

  const weaknesses = dedupeByType(hits.filter(h => h.mult >= 2));
  const immunities = dedupeByType(hits.filter(h => h.mult === 0));

  return {
    ...candidate,
    name: mon.name,
    types: mon.types,
    offenseMult,
    worst,
    avgTaken,
    score,
    weaknesses,
    immunities,
    resistsAll: hits.length > 0 && worst < 1,
    abilityRisk,
    abilityBypass,
    tier: tierFor(offenseMult, worst, abilityRisk),
  };
}

// A locked ability is applied outright. A random one only warns, since the boss may not have it.
function applyBossAbility(candidate, boss, attackType, typeMult) {
  const hindering = boss.abilities.filter(a => abilityModifier(a, attackType) < 1);
  if (!hindering.length) {
    const boost = boss.abilityLocked ? abilityModifier(boss.abilities[0], attackType) : 1;
    return { offenseMult: typeMult * boost, abilityRisk: null, abilityBypass: null };
  }

  const bypass = candidate.moves?.find(m => ABILITY_BYPASS_MOVES.includes(m))
    ?? (ABILITY_BYPASS_ABILITIES.includes(candidate.ability) ? candidate.ability : null);
  if (bypass) {
    return { offenseMult: typeMult, abilityRisk: null, abilityBypass: { by: bypass, ability: hindering[0] } };
  }

  if (boss.abilityLocked) {
    return { offenseMult: typeMult * abilityModifier(boss.abilities[0], attackType), abilityRisk: null, abilityBypass: null };
  }
  return { offenseMult: typeMult, abilityRisk: hindering, abilityBypass: null };
}

function dedupeByType(hits) {
  const byType = new Map();
  for (const h of hits) {
    const existing = byType.get(h.type);
    if (existing) existing.moves.push(h.name);
    else byType.set(h.type, { type: h.type, mult: h.mult, moves: [h.name] });
  }
  return [...byType.values()].sort((a, b) => b.mult - a.mult);
}

function tierFor(offenseMult, worst, abilityRisk) {
  if (offenseMult >= 2 && worst <= 1 && !abilityRisk) return 'clean';
  if (offenseMult >= 2 && worst < 4) return 'risky';
  if (offenseMult >= 2) return 'danger';
  if (offenseMult >= 1 && worst <= 1 && !abilityRisk) return 'neutral';
  return null;
}

function candidatesFromAll(data, includeLegendaries) {
  const out = [];
  for (const [species, mon] of Object.entries(data.pokemon)) {
    if (!mon.fullyEvolved) continue;
    if (mon.legendary && !includeLegendaries) continue;
    const s = mon.stats;
    if (s.hp + s.atk + s.def + s.spa + s.spd + s.spe < MIN_BST_ALL_MODE) continue;
    const cat = s.atk >= s.spa ? 'Physical' : 'Special';
    // A single-ability species always has it, so its immunities are guaranteed.
    const ability = mon.abilities.length === 1 ? mon.abilities[0] : null;
    for (const type of mon.types) {
      out.push({ species, role: 'attacker', attack: { type, cat }, tera: type, ability, moves: null, note: null });
    }
  }
  return out;
}

export function rankCounters(boss, mode, data, includeLegendaries = false) {
  const candidates = mode === 'all' ? candidatesFromAll(data, includeLegendaries) : data.pool.filter(p => p.role === 'attacker');
  const evaluated = candidates.map(c => evaluate(c, boss, data)).filter(c => c.tier);

  // In "all" mode a dual type gets two candidates; keep the better one per species.
  const bestBySpecies = new Map();
  for (const c of evaluated) {
    const key = mode === 'all' ? c.species : `${c.species}|${c.tera}`;
    const prev = bestBySpecies.get(key);
    if (!prev || tierRank(c.tier) < tierRank(prev.tier) || (c.tier === prev.tier && c.score > prev.score)) {
      bestBySpecies.set(key, c);
    }
  }

  const groups = { clean: [], risky: [], danger: [], neutral: [] };
  for (const c of bestBySpecies.values()) groups[c.tier].push(c);
  for (const list of Object.values(groups)) list.sort((a, b) => b.score - a.score);
  return groups;
}

function tierRank(tier) {
  return ['clean', 'risky', 'danger', 'neutral'].indexOf(tier);
}

const UNAWARE_OR_RESET = new Set(['Unaware']);
const RESET_MOVES = new Set(['Haze', 'Clear Smog']);

export function rankSupports(boss, data) {
  const bossSetsUp = boss.setupMoves.length > 0;
  return data.pool
    .filter(p => p.role === 'support')
    .map(p => {
      const e = evaluate(p, boss, data);
      const counterBoosts = UNAWARE_OR_RESET.has(p.ability) || p.moves.some(m => RESET_MOVES.has(m));
      const relevance = (bossSetsUp && counterBoosts ? 1 : 0) - (e.worst >= 2 ? 2 : 0) - e.avgTaken;
      return { ...e, counterBoosts, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance);
}
