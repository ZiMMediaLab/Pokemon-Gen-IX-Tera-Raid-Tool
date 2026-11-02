import { TYPES } from './types.js';
import { analyzeBoss, rankCounters, rankSupports } from './engine.js';
import { buildStrategy } from './strategy.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'raid-counters-prefs';
const SHOW_FIRST = { curated: 8, all: 12 };

const state = {
  star: null,
  species: null,
  raidKey: null,
  tera: null,
  party: 2,
  mode: 'curated',
  legends: false,
};

let data;
let raidsByKey;
let speciesIndex;

init();

async function init() {
  restorePrefs();
  data = await loadData();
  indexRaids();
  wireEvents();
  readHash();
  render();
  registerServiceWorker();
}

async function loadData() {
  const files = ['raids', 'pokemon', 'moves', 'pool'];
  const loaded = await Promise.all(files.map(f => fetch(`data/${f}.json`).then(r => r.json())));
  return Object.fromEntries(files.map((f, i) => [f, loaded[i]]));
}

// Keys are built from species and star level so shared links survive data rebuilds.
function indexRaids() {
  raidsByKey = new Map();
  const groups = new Map();
  for (const raid of data.raids) {
    const group = `${raid.species}-${raid.stars}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(raid);
  }
  for (const [group, raids] of groups) {
    raids.forEach((raid, i) => {
      raid.key = `${group}-${i}`;
      raidsByKey.set(raid.key, raid);
    });
  }

  const bySpecies = new Map();
  for (const raid of data.raids) {
    if (!bySpecies.has(raid.species)) {
      bySpecies.set(raid.species, { species: raid.species, name: data.pokemon[raid.species].name, stars: new Set() });
    }
    bySpecies.get(raid.species).stars.add(raid.stars);
  }
  speciesIndex = [...bySpecies.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function wireEvents() {
  const search = $('search');
  search.addEventListener('input', () => renderSuggestions());
  search.addEventListener('focus', () => renderSuggestions());
  search.addEventListener('keydown', onSearchKey);
  document.addEventListener('click', e => {
    if (!e.target.closest('.search')) $('suggestions').hidden = true;
  });

  $('partySize').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.party = Number(btn.dataset.size);
    savePrefs();
    update();
  });

  $('poolMode').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.mode = btn.dataset.mode;
    savePrefs();
    update();
  });

  $('includeLegendaries').addEventListener('change', e => {
    state.legends = e.target.checked;
    savePrefs();
    update();
  });

  $('shareBtn').addEventListener('click', shareLink);
  window.addEventListener('hashchange', () => { readHash(); render(); });
}

function update() {
  writeHash();
  render();
}

// ---------- Selection ----------

function selectSpecies(species) {
  state.species = species;
  state.raidKey = null;
  state.tera = null;
  $('search').value = data.pokemon[species].name;
  $('suggestions').hidden = true;

  const options = raidOptions();
  if (options.length === 1) selectRaid(options[0].key);
  else update();
}

function selectRaid(key) {
  const raid = raidsByKey.get(key);
  state.raidKey = key;
  state.species = raid.species;
  state.star = raid.stars;
  state.tera = raid.tera ?? (state.tera && TYPES.includes(state.tera) ? state.tera : null);
  update();
}

function raidOptions() {
  if (!state.species) return [];
  return data.raids.filter(r => r.species === state.species && (!state.star || r.stars === state.star));
}

// ---------- Rendering ----------

function render() {
  renderStarFilter();
  renderVariants();
  renderTeraPicker();
  renderPartySize();
  renderResults();
}

function renderStarFilter() {
  const available = state.species
    ? speciesIndex.find(s => s.species === state.species)?.stars ?? new Set()
    : null;

  const el = $('starFilter');
  el.replaceChildren(
    chip('All', state.star === null, () => { state.star = null; state.raidKey = null; update(); }),
    ...[1, 2, 3, 4, 5, 6, 7].map(n => {
      const btn = chip(`${n}★`, state.star === n, () => {
        state.star = n;
        state.raidKey = null;
        const options = raidOptions();
        if (options.length === 1) selectRaid(options[0].key);
        else update();
      });
      if (available && !available.has(n)) btn.disabled = true;
      return btn;
    }),
  );
}

function chip(label, pressed, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-pressed', String(pressed));
  btn.addEventListener('click', onClick);
  return btn;
}

let activeSuggestion = -1;

function renderSuggestions() {
  const query = $('search').value.trim().toLowerCase();
  const list = $('suggestions');
  const matches = speciesIndex
    .filter(s => !state.star || s.stars.has(state.star))
    .filter(s => !query || s.name.toLowerCase().includes(query))
    .slice(0, 40);

  activeSuggestion = -1;
  list.replaceChildren(...matches.map(s => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.dataset.species = s.species;
    const stars = [...s.stars].sort((a, b) => a - b).map(n => `${n}★`).join(' ');
    li.innerHTML = `<span>${escapeHtml(s.name)}</span><span class="meta">${stars}</span>`;
    li.addEventListener('click', () => selectSpecies(s.species));
    return li;
  }));
  list.hidden = matches.length === 0;
}

function onSearchKey(e) {
  const items = [...$('suggestions').children];
  if (!items.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    activeSuggestion = (activeSuggestion + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.setAttribute('aria-selected', String(i === activeSuggestion)));
    items[activeSuggestion].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    const pick = items[Math.max(activeSuggestion, 0)];
    if (pick) selectSpecies(pick.dataset.species);
  } else if (e.key === 'Escape') {
    $('suggestions').hidden = true;
  }
}

function renderVariants() {
  const el = $('variants');
  const options = raidOptions();
  if (!state.species || options.length <= 1) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }

  el.hidden = false;
  el.replaceChildren(...options.map(raid => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'variant';
    btn.setAttribute('aria-pressed', String(raid.key === state.raidKey));
    const tera = raid.tera ? typeChip(raid.tera) : '<span class="badge">Random Tera</span>';
    const moves = raid.moves.map(id => data.moves[id].name).join(' · ');
    btn.innerHTML = `
      <div><strong>${raid.stars}★</strong> ${tera} <span class="badge">${raid.sources.join(' / ')}</span> ${versionBadge(raid)}</div>
      <div class="moves">${escapeHtml(moves)}</div>`;
    btn.addEventListener('click', () => selectRaid(raid.key));
    return btn;
  }));
}

function renderTeraPicker() {
  const raid = raidsByKey.get(state.raidKey);
  const panel = $('teraPanel');
  panel.hidden = !raid || Boolean(raid.tera);
  if (panel.hidden) return;

  $('teraGrid').replaceChildren(...TYPES.map(type => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = type;
    btn.style.background = `var(--t-${type.toLowerCase()})`;
    btn.setAttribute('aria-pressed', String(state.tera === type));
    btn.addEventListener('click', () => { state.tera = type; update(); });
    return btn;
  }));
}

function renderPartySize() {
  $('partyPanel').hidden = !state.raidKey;
  for (const btn of $('partySize').children) {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.size) === state.party));
  }
}

function renderResults() {
  const raid = raidsByKey.get(state.raidKey);
  const results = $('results');
  if (!raid || !state.tera) {
    results.hidden = true;
    return;
  }
  results.hidden = false;

  for (const btn of $('poolMode').children) {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.mode));
  }
  $('legendaryToggle').hidden = state.mode !== 'all';
  $('includeLegendaries').checked = state.legends;

  const boss = analyzeBoss(raid, state.tera, data);
  const counters = rankCounters(boss, state.mode, data, state.legends);
  const supports = rankSupports(boss, data);
  const plan = buildStrategy(boss, state.party, counters, supports);

  renderBoss(boss, raid);
  renderCounters(counters);
  renderSupports(supports, boss);
  renderPlan(plan);
}

function renderBoss(boss, raid) {
  const moves = boss.moves.map(m => `
    <li>
      <span>${escapeHtml(m.name)}</span>
      <span>${typeChip(m.type)} <span class="cat">${m.cat === 'Status' ? 'Status' : m.cat.slice(0, 4) + '.'}</span></span>
    </li>`).join('');

  $('bossCard').innerHTML = `
    <div class="boss-title">
      <h2>${escapeHtml(boss.name)}</h2>
      <span>${raid.stars}★ · ${escapeHtml(raid.sources.join(' / '))} ${versionBadge(raid)}</span>
    </div>
    <div class="row"><span class="label">Types</span>${boss.originalTypes.map(typeChip).join(' ')}</div>
    <div class="row"><span class="label">Tera</span>${typeChip(boss.tera)} <span class="tier-note">${raid.tera ? 'fixed for this raid' : 'from the crystal'}</span></div>
    <div class="row"><span class="label">Defends as</span>${boss.defendTypes.map(typeChip).join(' ')}</div>
    <ul class="move-list">${moves}</ul>`;
}

function renderCounters(groups) {
  const el = $('counters');
  const limit = SHOW_FIRST[state.mode];
  const parts = [];

  if (groups.clean.length) {
    parts.push('<p class="tier-note">Super effective against the Tera type and not weak to any of its attacks.</p>');
    parts.push(counterList(groups.clean, limit));
  } else {
    parts.push('<div class="banner warn">Nothing in this pool hits it super effectively without also being weak to one of its attacks. These are the best of the rest.</div>');
  }

  if (groups.risky.length) {
    const block = `<h3>Hits hard, but takes 2× from something</h3>${counterList(groups.risky, groups.clean.length ? 4 : limit)}`;
    parts.push(groups.clean.length ? collapsible(`Riskier picks (${groups.risky.length})`, block) : block);
  }

  if (groups.danger.length) {
    parts.push(collapsible(`4× weak, avoid unless nothing else works (${groups.danger.length})`, counterList(groups.danger, limit)));
  }

  if (!groups.clean.length && groups.neutral.length) {
    parts.push(collapsible(`Neutral hitters that take little damage (${groups.neutral.length})`, counterList(groups.neutral, limit)));
  }

  if (!parts.length) parts.push('<p class="empty">No counters found.</p>');
  el.innerHTML = parts.join('');
}

function collapsible(summary, inner) {
  return `<details class="more"><summary>${summary}</summary>${inner}</details>`;
}

function counterList(list, limit) {
  const shown = list.slice(0, limit).map(counterCard).join('');
  const rest = list.slice(limit);
  const more = rest.length
    ? collapsible(`Show ${rest.length} more`, `<ul class="counter-list">${rest.map(counterCard).join('')}</ul>`)
    : '';
  return `<ul class="counter-list">${shown}</ul>${more}`;
}

function counterCard(c) {
  const badges = [];
  badges.push(`<span class="badge good">${c.offenseMult}× damage</span>`);
  badges.push(...defensiveBadges(c));

  const build = c.moves
    ? `<div class="build">${escapeHtml(c.ability)} · ${escapeHtml(c.moves.join(', '))}${c.note ? `<br>${escapeHtml(c.note)}` : ''}</div>`
    : `<div class="build">Attack with a ${c.attack.cat.toLowerCase()} ${c.attack.type} move.</div>`;

  return `
    <li class="counter ${c.tier}">
      <div class="counter-top">
        <span class="counter-name">${escapeHtml(c.name)}</span>
        <span>${c.types.map(typeChip).join(' ')} → Tera ${typeChip(c.tera)}</span>
      </div>
      <div class="badges">${badges.join('')}</div>
      ${build}
    </li>`;
}

function defensiveBadges(c) {
  const badges = [];
  if (c.resistsAll) badges.push('<span class="badge good">Resists all its attacks</span>');
  else if (c.worst <= 1) badges.push('<span class="badge good">No weaknesses</span>');

  for (const w of c.weaknesses) {
    const cls = w.mult >= 4 ? 'bad' : 'warn';
    badges.push(`<span class="badge ${cls}">${w.mult}× from ${escapeHtml(w.moves.join(', '))}</span>`);
  }
  for (const i of c.immunities) {
    badges.push(`<span class="badge good">Immune to ${escapeHtml(i.moves.join(', '))}</span>`);
  }
  return badges;
}

function renderSupports(supports, boss) {
  const picks = supports.filter(s => s.worst <= 1).slice(0, 3);
  const list = picks.length ? picks : supports.slice(0, 3);

  $('supports').innerHTML = `<ul class="counter-list">${list.map(s => `
    <li class="counter ${s.worst >= 2 ? 'risky' : 'clean'}">
      <div class="counter-top">
        <span class="counter-name">${escapeHtml(s.name)}</span>
        <span>${s.types.map(typeChip).join(' ')}</span>
      </div>
      <div class="badges">
        ${defensiveBadges(s).join('')}
        ${s.counterBoosts && boss.setupMoves.length ? '<span class="badge good">Handles its boosts</span>' : ''}
      </div>
      <div class="build">${escapeHtml(s.ability)} · ${escapeHtml(s.moves.join(', '))}<br>${escapeHtml(s.note)}</div>
    </li>`).join('')}</ul>`;
}

function renderPlan(plan) {
  const lineup = plan.lineup.map(l => `
    <li>
      <div class="who">${escapeHtml(l.who)}</div>
      <div>${escapeHtml(l.role)}</div>
      <div class="detail">${escapeHtml(l.detail)}</div>
    </li>`).join('');
  const tips = plan.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('');
  $('plan').innerHTML = `<ul class="lineup">${lineup}</ul><h3>Against this boss</h3><ul class="tips">${tips}</ul>`;
}

function typeChip(type) {
  return `<span class="type" style="background:var(--t-${type.toLowerCase()})">${type}</span>`;
}

function versionBadge(raid) {
  if (raid.scarlet && raid.violet) return '';
  return `<span class="badge">${raid.scarlet ? 'Scarlet only' : 'Violet only'}</span>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- URL and saved preferences ----------

function writeHash() {
  const params = new URLSearchParams();
  if (state.raidKey) params.set('raid', state.raidKey);
  else if (state.species) params.set('species', state.species);
  if (state.star) params.set('stars', state.star);
  if (state.tera) params.set('tera', state.tera);
  params.set('party', state.party);
  if (state.mode !== 'curated') params.set('mode', state.mode);
  if (state.legends) params.set('legends', '1');
  history.replaceState(null, '', `#${params}`);
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const raid = raidsByKey.get(params.get('raid'));
  const species = params.get('species');
  const stars = Number(params.get('stars'));
  const tera = params.get('tera');
  const party = Number(params.get('party'));

  if (stars >= 1 && stars <= 7) state.star = stars;
  if (party >= 1 && party <= 4) state.party = party;
  if (params.get('mode') === 'all') state.mode = 'all';
  if (params.get('legends') === '1') state.legends = true;

  if (raid) {
    state.raidKey = raid.key;
    state.species = raid.species;
    state.star = raid.stars;
    state.tera = raid.tera ?? (TYPES.includes(tera) ? tera : null);
  } else if (species && data.pokemon[species]) {
    state.species = species;
  }

  if (state.species) $('search').value = data.pokemon[state.species].name;
}

async function shareLink() {
  const btn = $('shareBtn');
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Raid Counters', url: location.href });
      return;
    }
    await navigator.clipboard.writeText(location.href);
    btn.textContent = 'Link copied';
  } catch (err) {
    if (err?.name === 'AbortError') return;
    btn.textContent = 'Copy the address bar to share';
  }
  setTimeout(() => { btn.textContent = 'Copy link to this raid'; }, 2000);
}

function restorePrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (saved.party >= 1 && saved.party <= 4) state.party = saved.party;
    if (saved.mode === 'all' || saved.mode === 'curated') state.mode = saved.mode;
    state.legends = Boolean(saved.legends);
  } catch {
    // Storage can be blocked in private browsing; defaults are fine.
  }
}

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ party: state.party, mode: state.mode, legends: state.legends }));
  } catch {
    // Ignore: preferences just won't persist.
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
