import { blockedTypes } from './types.js';

const STATUS_NAMES = { brn: 'burn', par: 'paralysis', slp: 'sleep', psn: 'poison', tox: 'bad poison', frz: 'freeze' };

export function buildStrategy(boss, partySize, counters, supports) {
  const npcs = 4 - partySize;
  const topAttacker = counters.clean[0] ?? counters.risky[0] ?? counters.danger[0] ?? null;
  const topSupport = supports.find(s => s.worst <= 1) ?? supports[0] ?? null;

  return {
    lineup: lineupFor(partySize, npcs, topAttacker, topSupport),
    tips: bossTips(boss, partySize, npcs),
  };
}

function lineupFor(partySize, npcs, attacker, support) {
  const atk = attacker ? `${attacker.name} (Tera ${attacker.tera})` : 'your best clean counter';
  const sup = support ? support.name : 'a bulky support';

  switch (partySize) {
    case 1:
      return [
        { who: 'You', role: `Solo attacker: ${atk}`, detail: 'Three NPCs fill the party and will faint often. Pick a build that can boost and heal itself, and spend your cheers on healing when the NPCs drop.' },
      ];
    case 2:
      return [
        { who: 'Player 1', role: `Attacker: ${atk}`, detail: 'Boost early, then attack every turn. Terastallize as soon as the orb is charged.' },
        { who: 'Player 2', role: `Support: ${sup}`, detail: 'Two NPCs fill the empty slots, and every faint takes time off the clock. Keep the attacker alive and boosted. If the boss is easy, run a second attacker instead.' },
      ];
    case 3:
      return [
        { who: 'Players 1–2', role: `Attackers: ${atk} or the next counters on the list`, detail: 'Two attackers close the raid before the timer becomes a problem.' },
        { who: 'Player 3', role: `Support: ${sup}`, detail: 'One NPC fills the last slot. Screens or party healing keep it from dying and costing time.' },
      ];
    default:
      return [
        { who: 'Players 1–3', role: `Attackers: ${atk} and the next counters on the list`, detail: 'Spread across different counters so one bad matchup does not stall the whole raid.' },
        { who: 'Player 4', role: `Support: ${sup}`, detail: 'Screens, Helping Hand, or debuffs on the boss. Swap to a fourth attacker on easy raids.' },
      ];
  }
}

function bossTips(boss, partySize, npcs) {
  const tips = [];
  const names = list => list.map(m => m.name).join(', ');
  const verb = (list, one, many) => (list.length === 1 ? one : many);

  if (boss.attacks.length && boss.physicalShare >= 0.7) {
    tips.push('Mostly physical attacks. Reflect, Intimidate, and high-Defense counters cut its damage the most.');
  } else if (boss.attacks.length && boss.specialShare >= 0.7) {
    tips.push('Mostly special attacks. Light Screen and high Sp. Def counters cut its damage the most.');
  } else if (boss.attacks.length) {
    tips.push('Mixed physical and special attacks. Screens help more than raw Defense or Sp. Def alone.');
  }

  const blocking = boss.abilities.map(a => ({ ability: a, types: blockedTypes(a) })).filter(b => b.types.length);
  for (const b of blocking) {
    const types = b.types.join(' and ');
    tips.push(boss.abilityLocked
      ? `${b.ability} blocks ${types} moves, so ${types} attackers only work if they strip the ability first with Gastro Acid or ignore it with Mold Breaker.`
      : `It might have ${b.ability}, which blocks ${types} moves. Bring a backup attacker if you plan to use ${types}.`);
  }

  if (boss.setupMoves.length) {
    tips.push(`It can boost itself with ${names(boss.setupMoves)}. Unaware Pokémon ignore those boosts, and Haze or Clear Smog wipes them.`);
  }

  for (const m of boss.statusMoves) {
    const status = STATUS_NAMES[m.status] ?? m.status;
    if (m.status === 'brn') {
      tips.push(`${m.name} can burn, which halves physical damage. Special attackers, Fire types, or a Lum Berry avoid that problem.`);
    } else {
      tips.push(`${m.name} can inflict ${status}. A Lum Berry or an ability that blocks status keeps your attacker going.`);
    }
  }

  if (boss.spreadMoves.length) {
    tips.push(`${names(boss.spreadMoves)} ${verb(boss.spreadMoves, 'hits', 'hit')} the whole party. Party-wide healing like Life Dew or Grassy Terrain is worth more than usual.`);
  }

  if (boss.priorityMoves.length) {
    tips.push(`${names(boss.priorityMoves)} ${verb(boss.priorityMoves, 'moves', 'move')} first. Psychic Terrain blocks priority moves aimed at grounded Pokémon.`);
  }

  if (boss.tera) {
    const teraAttacks = boss.attacks.filter(a => a.type === boss.tera);
    if (teraAttacks.length) {
      tips.push(`${names(teraAttacks)} ${verb(teraAttacks, 'gets', 'get')} the Tera boost, so ${boss.tera}-type hits are its hardest. Resisting ${boss.tera} matters most.`);
    }
  }

  tips.push('The boss puts up a Tera shield partway through. Terastallized attacks and multi-hit moves break it fastest.');
  tips.push('The boss can wipe your team\'s stat boosts and shake off its own stat drops. Re-apply boosts and debuffs after a reset instead of attacking at +0.');

  if (npcs >= 2) {
    tips.push('With two or more NPCs, faints drain the timer quickly. Spend cheers on healing before going all-out.');
  }

  return tips;
}
