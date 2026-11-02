# Raid Counters

A Tera Raid helper for Pokémon Scarlet and Violet. Pick a raid boss, its star level, and the Tera type on the crystal, and it ranks counters that hit the Tera type super effectively **without** being weak to the moves the boss actually uses.

Works offline and installs to a phone home screen.

## Features

- Every standard raid (1★–6★, Paldea, Kitakami, Blueberry Academy), distribution raids, and 7★ events
- Counters ranked by three things: damage against the boss's Tera type, how they take each of the boss's four moves, and bulk on the side the boss attacks
- Tiers: clean picks first, 2× weak picks only when needed, 4× weak picks hidden away
- **Raid builds** (curated sets) or **All Pokémon** mode, with box legendaries behind a toggle
- Support picks and a game plan for solo, 2-, 3- and 4-player groups, accounting for NPC slots
- Shareable links: the URL holds the raid, Tera type and party size

## Project layout

```
docs/                 the app (served by GitHub Pages)
  data/raids.json     generated from the raid tables
  data/pokemon.json   generated
  data/moves.json     generated
  data/pool.json      curated raid builds (hand edited)
  js/                 type chart, ranking engine, strategy rules, UI
tools/build-data.mjs  regenerates the generated JSON
data/raw/             raid encounter tables
```

## Updating the data

Requires Node 18+.

```powershell
npm install
npm run build-data
```

After any change to files in `docs/`, bump `CACHE` in `docs/sw.js` (`raid-counters-v1` → `v2`) so installed copies pick up the update.

To add new raids after a game update, replace the `.pkl` files in `data/raw/` with the latest versions from PKHeX (`PKHeX.Core/Resources/legality/wild/Gen9/`) and rebuild.

## Running locally

```powershell
cd docs
python -m http.server 8000
```

Then open http://localhost:8000.

## Hosting on GitHub Pages

Repository **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch **main**, folder **/docs**.

## How ranking works

- The boss **defends** as its Tera type but **attacks** with its own moves. Moves matching the boss's types or Tera type get STAB, and a Tera move matching an original type gets the 2× Tera STAB.
- Counters are judged on their original typing, since they spend most of the raid before Terastallizing. Ability immunities (Levitate, Flash Fire, Volt Absorb, and similar) are applied.
- **Clean**: super effective and takes at most neutral damage from every boss move.
- **Risky**: super effective but takes 2× from at least one move. Shown up front only when no clean pick exists.
- **Avoid**: takes 4× from something.

## Credits

Raid encounter data from [PKHeX](https://github.com/kwsch/PKHeX). Pokémon, move and ability data from [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) via `@pkmn/dex`.

Pokémon is © Nintendo, Creatures Inc. and GAME FREAK inc. This is an unofficial fan project.

© ZiMMedia Lab
