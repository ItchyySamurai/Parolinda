/*
 * Themes, titles, avatars and the seasonal track.
 *
 * The one rule carried over from progress.js: nothing is ever taken away.
 * Seasons here ROTATE rather than expire — Estate 2027 offers exactly what
 * Estate 2026 offered, so anything she doesn't reach this time comes back
 * around. That keeps the whole shape of a season pass (a track, tiers, things
 * to work towards) without the moment where the game tells her she lost
 * something by living her life.
 *
 * Depends on Store from game.js. Nothing runs at load time.
 */

'use strict';

/* ------------------------------------------------------------------ themes */

var THEMES = [
  { id: 'bosco',    name: 'Bosco',    unlock: { type: 'free' } },
  { id: 'carta',    name: 'Carta',    unlock: { type: 'level', n: 3 } },
  { id: 'notte',    name: 'Notte',    unlock: { type: 'level', n: 7 } },
  { id: 'grano',    name: 'Grano',    unlock: { type: 'level', n: 12 } },
  { id: 'inchiostro', name: 'Inchiostro', unlock: { type: 'level', n: 18 } },
  { id: 'oro',      name: 'Oro',      unlock: { type: 'level', n: 25 } },
  { id: 'lavanda',  name: 'Lavanda',  unlock: { type: 'season', key: 'primavera', tier: 4 } },
  { id: 'mare',     name: 'Mare',     unlock: { type: 'season', key: 'estate', tier: 4 } },
  { id: 'tramonto', name: 'Tramonto', unlock: { type: 'season', key: 'autunno', tier: 4 } },
  { id: 'neve',     name: 'Neve',     unlock: { type: 'season', key: 'inverno', tier: 4 } },
  { id: 'ciliegio', name: 'Ciliegio', unlock: { type: 'season', key: 'primavera', tier: 8 } },
  { id: 'corallo',  name: 'Corallo',  unlock: { type: 'season', key: 'estate', tier: 8 } },
  { id: 'castagna', name: 'Castagna', unlock: { type: 'season', key: 'autunno', tier: 8 } },
  { id: 'ghiaccio', name: 'Ghiaccio', unlock: { type: 'season', key: 'inverno', tier: 8 } }
];

/* ------------------------------------------------------------------ titles */

var TITLES = [
  { id: 't-nessuno',   text: '(nessun titolo)',        unlock: { type: 'free' } },
  { id: 't-amica',     text: 'Amica delle parole',     unlock: { type: 'level', n: 2 } },
  { id: 't-curiosa',   text: 'Spirito curioso',        unlock: { type: 'level', n: 5 } },
  { id: 't-sveglia',   text: 'Mente sveglia',          unlock: { type: 'level', n: 9 } },
  { id: 't-lince',     text: 'Occhio di lince',        unlock: { type: 'level', n: 14 } },
  { id: 't-penna',     text: 'Penna d’oro',            unlock: { type: 'level', n: 20 } },
  { id: 't-leggenda',  text: 'Leggenda vivente',       unlock: { type: 'level', n: 27 } },
  { id: 't-calma',     text: 'Anima calma',            unlock: { type: 'trophy', id: 'calma' } },
  { id: 't-paziente',  text: 'Cuore paziente',         unlock: { type: 'trophy', id: 'mese' } },
  { id: 't-mille',     text: 'Collezionista di parole', unlock: { type: 'trophy', id: 'mille' } },

  { id: 't-fiore',     text: 'Fiore di primavera',     unlock: { type: 'season', key: 'primavera', tier: 1 } },
  { id: 't-rondine',   text: 'Rondine di marzo',       unlock: { type: 'season', key: 'primavera', tier: 3 } },
  { id: 't-giardino',  text: 'Signora del giardino',   unlock: { type: 'season', key: 'primavera', tier: 6 } },
  { id: 't-sole',      text: 'Sole d’estate',          unlock: { type: 'season', key: 'estate', tier: 1 } },
  { id: 't-onda',      text: 'Voce del mare',          unlock: { type: 'season', key: 'estate', tier: 3 } },
  { id: 't-lucciola',  text: 'Lucciola di luglio',     unlock: { type: 'season', key: 'estate', tier: 6 } },
  { id: 't-foglia',    text: 'Foglia d’autunno',       unlock: { type: 'season', key: 'autunno', tier: 1 } },
  { id: 't-nebbia',    text: 'Passo nella nebbia',     unlock: { type: 'season', key: 'autunno', tier: 3 } },
  { id: 't-vendemmia', text: 'Cuore di vendemmia',     unlock: { type: 'season', key: 'autunno', tier: 6 } },
  { id: 't-fiocco',    text: 'Fiocco d’inverno',       unlock: { type: 'season', key: 'inverno', tier: 1 } },
  { id: 't-camino',    text: 'Calore del camino',      unlock: { type: 'season', key: 'inverno', tier: 3 } },
  { id: 't-stella',    text: 'Stella di dicembre',     unlock: { type: 'season', key: 'inverno', tier: 6 } }
];

/* ----------------------------------------------------------------- avatars */

var AVATARS = [
  { id: 'a-fiore',   glyph: '❀', unlock: { type: 'free' } },
  { id: 'a-foglia',  glyph: '❦', unlock: { type: 'level', n: 4 } },
  { id: 'a-stella',  glyph: '★', unlock: { type: 'level', n: 8 } },
  { id: 'a-luna',    glyph: '☾', unlock: { type: 'level', n: 11 } },
  { id: 'a-sole',    glyph: '☀', unlock: { type: 'level', n: 16 } },
  { id: 'a-quadri',  glyph: '❖', unlock: { type: 'level', n: 22 } },
  { id: 'a-corona',  glyph: '♛', unlock: { type: 'level', n: 30 } },
  { id: 'a-nota',    glyph: '♪', unlock: { type: 'trophy', id: 'venti' } },
  { id: 'a-cuore',   glyph: '❤', unlock: { type: 'trophy', id: 'settimana' } },
  { id: 'a-tulipano', glyph: '✿', unlock: { type: 'season', key: 'primavera', tier: 2 } },
  { id: 'a-conchiglia', glyph: '❁', unlock: { type: 'season', key: 'estate', tier: 2 } },
  { id: 'a-ghianda', glyph: '❧', unlock: { type: 'season', key: 'autunno', tier: 2 } },
  { id: 'a-neve',    glyph: '❄', unlock: { type: 'season', key: 'inverno', tier: 2 } },
  { id: 'a-scintilla', glyph: '✦', unlock: { type: 'season', key: 'primavera', tier: 7 } },
  { id: 'a-raggio',  glyph: '✷', unlock: { type: 'season', key: 'estate', tier: 7 } },
  { id: 'a-spiga',   glyph: '❈', unlock: { type: 'season', key: 'autunno', tier: 7 } },
  { id: 'a-cristallo', glyph: '❉', unlock: { type: 'season', key: 'inverno', tier: 7 } }
];

/* ----------------------------------------------------------------- seasons */

/*
 * Meteorological seasons, which is how Italians talk about them: primavera is
 * March to May, and so on. Inverno straddles the new year, so December belongs
 * to the winter named for that year.
 */
var SEASON_KEYS = ['inverno', 'primavera', 'estate', 'autunno'];

var SEASON_INFO = {
  primavera: { name: 'Primavera', months: [2, 3, 4],  glyph: '✿' },
  estate:    { name: 'Estate',    months: [5, 6, 7],  glyph: '☀' },
  autunno:   { name: 'Autunno',   months: [8, 9, 10], glyph: '❧' },
  inverno:   { name: 'Inverno',   months: [11, 0, 1], glyph: '❄' }
};

/* Eight tiers. Generous on purpose: reaching the end takes roughly three or
   four weeks of ordinary play out of a season that lasts three months. */
var SEASON_TIERS = [500, 1500, 3000, 5500, 9000, 13500, 18500, 24000];

function seasonKeyFor(month) {
  if (month >= 2 && month <= 4) return 'primavera';
  if (month >= 5 && month <= 7) return 'estate';
  if (month >= 8 && month <= 10) return 'autunno';
  return 'inverno';
}

function currentSeason(now) {
  var d = now || new Date();
  var m = d.getMonth(), y = d.getFullYear();
  var key = seasonKeyFor(m);
  // January and February belong to the winter that began the previous December.
  var year = (key === 'inverno' && m < 2) ? y - 1 : y;
  return {
    key: key,
    year: year,
    id: year + '-' + key,
    name: SEASON_INFO[key].name,
    glyph: SEASON_INFO[key].glyph,
    label: SEASON_INFO[key].name + ' ' + (key === 'inverno' ? year + '/' + (year + 1) : year)
  };
}

function seasonPoints(id) { return Store.get('season.' + id + '.points', 0); }

function addSeasonPoints(id, n) {
  var p = seasonPoints(id) + n;
  Store.set('season.' + id + '.points', p);
  return p;
}

/* Highest tier reached, 0 to 8. */
function tierFor(points) {
  var t = 0;
  for (var i = 0; i < SEASON_TIERS.length; i++) {
    if (points >= SEASON_TIERS[i]) t = i + 1;
  }
  return t;
}

/*
 * The best tier she has ever reached in this season of the year, across every
 * year she has played it. This is what makes a rotating season additive: a
 * later run can only ever push it higher.
 */
function bestTierForKey(key) {
  var best = 0;
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (!k || k.indexOf('parolinda.season.') !== 0) continue;
    if (k.indexOf('-' + key + '.points') === -1) continue;
    var pts = 0;
    try { pts = JSON.parse(localStorage.getItem(k)) || 0; } catch (e) { pts = 0; }
    var t = tierFor(pts);
    if (t > best) best = t;
  }
  return best;
}

function seasonProgress(season) {
  var pts = seasonPoints(season.id);
  var tier = tierFor(pts);
  var nextAt = tier < SEASON_TIERS.length ? SEASON_TIERS[tier] : null;
  var prevAt = tier > 0 ? SEASON_TIERS[tier - 1] : 0;
  return {
    points: pts,
    tier: tier,
    total: SEASON_TIERS.length,
    nextAt: nextAt,
    toNext: nextAt === null ? 0 : nextAt - pts,
    pct: nextAt === null ? 100
      : Math.max(0, Math.min(100, Math.round((pts - prevAt) * 100 / (nextAt - prevAt))))
  };
}

/* Everything a given tier of a given season hands over. */
function rewardsForTier(key, tier) {
  var out = [];
  THEMES.forEach(function (t) {
    if (t.unlock.type === 'season' && t.unlock.key === key && t.unlock.tier === tier) {
      out.push({ kind: 'Tema', name: t.name, id: t.id });
    }
  });
  TITLES.forEach(function (t) {
    if (t.unlock.type === 'season' && t.unlock.key === key && t.unlock.tier === tier) {
      out.push({ kind: 'Titolo', name: t.text, id: t.id });
    }
  });
  AVATARS.forEach(function (a) {
    if (a.unlock.type === 'season' && a.unlock.key === key && a.unlock.tier === tier) {
      out.push({ kind: 'Simbolo', name: a.glyph, id: a.id });
    }
  });
  return out;
}

/* ---------------------------------------------------------------- unlocking */

function isUnlocked(item, ctx) {
  var u = item.unlock;
  if (u.type === 'free') return true;
  if (u.type === 'level') return ctx.level >= u.n;
  if (u.type === 'trophy') return !!ctx.trophies[u.id];
  if (u.type === 'season') return bestTierForKey(u.key) >= u.tier;
  return false;
}

function unlockContext() {
  var s = loadStats();
  return { level: levelFor(s.points || 0).level.n, trophies: loadTrophies() };
}

function howToGet(item) {
  var u = item.unlock;
  if (u.type === 'free') return 'Sempre disponibile';
  if (u.type === 'level') return 'Livello ' + u.n;
  if (u.type === 'season') return SEASON_INFO[u.key].name + ' · traguardo ' + u.tier;
  if (u.type === 'trophy') {
    for (var i = 0; i < TROPHIES.length; i++) {
      if (TROPHIES[i].id === u.id) return 'Trofeo: ' + TROPHIES[i].name;
    }
  }
  return '';
}

/* Everything newly unlocked between two snapshots, so a round can announce it. */
function unlockSnapshot() {
  var ctx = unlockContext();
  var got = {};
  THEMES.concat(TITLES, AVATARS).forEach(function (it) {
    if (isUnlocked(it, ctx)) got[it.id] = true;
  });
  return got;
}

function newlyUnlocked(before) {
  var after = unlockSnapshot();
  var fresh = [];
  THEMES.forEach(function (t) {
    if (after[t.id] && !before[t.id]) fresh.push({ kind: 'Tema', label: t.name, glyph: '◐' });
  });
  TITLES.forEach(function (t) {
    if (after[t.id] && !before[t.id]) fresh.push({ kind: 'Titolo', label: t.text, glyph: '✧' });
  });
  AVATARS.forEach(function (a) {
    if (after[a.id] && !before[a.id]) fresh.push({ kind: 'Simbolo', label: a.glyph, glyph: a.glyph });
  });
  return fresh;
}

/* ------------------------------------------------------------- what she wears */

function equipped() {
  return {
    theme: Store.get('theme', 'bosco'),
    title: Store.get('title', 't-nessuno'),
    avatar: Store.get('avatar', 'a-fiore')
  };
}

function titleText(id) {
  for (var i = 0; i < TITLES.length; i++) {
    if (TITLES[i].id === id) return TITLES[i].id === 't-nessuno' ? '' : TITLES[i].text;
  }
  return '';
}

function avatarGlyph(id) {
  for (var i = 0; i < AVATARS.length; i++) {
    if (AVATARS[i].id === id) return AVATARS[i].glyph;
  }
  return AVATARS[0].glyph;
}

function applyTheme(id) {
  var ok = false;
  for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) ok = true;
  document.documentElement.setAttribute('data-theme', ok ? id : 'bosco');
}
