export const TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
  'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];

// Only the non-neutral matchups; anything missing is 1x.
const CHART = {
  Normal:   { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fighting: { Normal: 2, Flying: 0.5, Poison: 0.5, Rock: 2, Bug: 0.5, Ghost: 0, Steel: 2, Psychic: 0.5, Ice: 2, Dark: 2, Fairy: 0.5 },
  Flying:   { Fighting: 2, Rock: 0.5, Bug: 2, Steel: 0.5, Grass: 2, Electric: 0.5 },
  Poison:   { Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Grass: 2, Fairy: 2 },
  Ground:   { Flying: 0, Poison: 2, Rock: 2, Bug: 0.5, Steel: 2, Fire: 2, Grass: 0.5, Electric: 2 },
  Rock:     { Fighting: 0.5, Flying: 2, Ground: 0.5, Bug: 2, Steel: 0.5, Fire: 2, Ice: 2 },
  Bug:      { Fighting: 0.5, Flying: 0.5, Poison: 0.5, Ghost: 0.5, Steel: 0.5, Fire: 0.5, Grass: 2, Psychic: 2, Dark: 2, Fairy: 0.5 },
  Ghost:    { Normal: 0, Ghost: 2, Psychic: 2, Dark: 0.5 },
  Steel:    { Rock: 2, Steel: 0.5, Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Fairy: 2 },
  Fire:     { Rock: 0.5, Bug: 2, Steel: 2, Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Dragon: 0.5 },
  Water:    { Ground: 2, Rock: 2, Fire: 2, Water: 0.5, Grass: 0.5, Dragon: 0.5 },
  Grass:    { Flying: 0.5, Poison: 0.5, Ground: 2, Rock: 2, Bug: 0.5, Steel: 0.5, Fire: 0.5, Water: 2, Grass: 0.5, Dragon: 0.5 },
  Electric: { Flying: 2, Ground: 0, Water: 2, Grass: 0.5, Electric: 0.5, Dragon: 0.5 },
  Psychic:  { Fighting: 2, Poison: 2, Steel: 0.5, Psychic: 0.5, Dark: 0 },
  Ice:      { Flying: 2, Ground: 2, Steel: 0.5, Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Dragon: 2 },
  Dragon:   { Steel: 0.5, Dragon: 2, Fairy: 0 },
  Dark:     { Fighting: 0.5, Ghost: 2, Psychic: 2, Dark: 0.5, Fairy: 0.5 },
  Fairy:    { Fighting: 2, Poison: 0.5, Steel: 0.5, Fire: 0.5, Dragon: 2, Dark: 2 },
};

// Defensive abilities that change how much damage an attacking type does to the holder.
const ABILITY_MODIFIERS = {
  Levitate: { Ground: 0 }, 'Earth Eater': { Ground: 0 },
  'Flash Fire': { Fire: 0 }, 'Well-Baked Body': { Fire: 0 },
  'Water Absorb': { Water: 0 }, 'Storm Drain': { Water: 0 }, 'Dry Skin': { Water: 0, Fire: 1.25 },
  'Volt Absorb': { Electric: 0 }, 'Lightning Rod': { Electric: 0 }, 'Motor Drive': { Electric: 0 },
  'Sap Sipper': { Grass: 0 },
  'Thick Fat': { Fire: 0.5, Ice: 0.5 },
  Heatproof: { Fire: 0.5 }, 'Water Bubble': { Fire: 0.5 },
  'Purifying Salt': { Ghost: 0.5 },
  Fluffy: { Fire: 2 },
};

export function abilityModifier(ability, attackType) {
  return ABILITY_MODIFIERS[ability]?.[attackType] ?? 1;
}

export function effectiveness(attackType, defendTypes, ability = null) {
  const typeMult = defendTypes.reduce((mult, def) => mult * (CHART[attackType][def] ?? 1), 1);
  return ability ? typeMult * abilityModifier(ability, attackType) : typeMult;
}

export function blockedTypes(ability) {
  return Object.entries(ABILITY_MODIFIERS[ability] ?? {}).filter(([, mult]) => mult === 0).map(([type]) => type);
}
