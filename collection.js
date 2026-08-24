/*
 * Themes, titles, avatars and the pass track.
 *
 * Twelve passes in a fixed sequence. The first is open from the start; each
 * one unlocks the next when it is finished. Only one is active at a time and
 * she chooses which — points from a round go to whichever pass she has picked.
 *
 * There is no calendar anywhere in here. A pass cannot run out, cannot be
 * missed, and waits exactly where she left it. That is the whole design: the
 * shape of a pass — a track, tiers, rewards to climb towards — with none of
 * the parts that exist to make someone feel late.
 *
 * Depends on Store, loadStats, levelFor and loadTrophies from elsewhere.
 * Nothing here runs at load time.
 */

'use strict';

/* ------------------------------------------------------------------ passes */

/*
 * Five tiers each. The base cost is scaled up as the sequence goes on, so the
 * twelfth pass is a real undertaking and the first is a week or so of play.
 */
var PASS_BASE_TIERS = [400, 1200, 2400, 4200, 6500];

var PASSES = [
  { id: 'p01', name: 'Il giardino',        glyph: '✿', theme: 'lavanda' },
  { id: 'p02', name: 'Il mare',            glyph: '❁', theme: 'mare' },
  { id: 'p03', name: 'Il tramonto',        glyph: '☀', theme: 'tramonto' },
  { id: 'p04', name: 'Il bosco d’autunno', glyph: '❧', theme: 'castagna' },
  { id: 'p05', name: 'La neve',            glyph: '❄', theme: 'neve' },
  { id: 'p06', name: 'Il ciliegio',        glyph: '✾', theme: 'ciliegio' },
  { id: 'p07', name: 'Il grano',           glyph: '❋', theme: 'grano' },
  { id: 'p08', name: 'Il corallo',         glyph: '❀', theme: 'corallo' },
  { id: 'p09', name: 'La notte',           glyph: '☾', theme: 'notte' },
  { id: 'p10', name: 'L’inchiostro',  glyph: '✒', theme: 'inchiostro' },
  { id: 'p11', name: 'Il ghiaccio',        glyph: '❉', theme: 'ghiaccio' },
  { id: 'p12', name: 'L’oro',         glyph: '★', theme: 'oro' }
];

function passIndex(id) {
  for (var i = 0; i < PASSES.length; i++) if (PASSES[i].id === id) return i;
  return 0;
}

function passTiers(index) {
  var scale = 1 + 0.25 * index;
  return PASS_BASE_TIERS.map(function (v) {
    return Math.round(v * scale / 50) * 50;
  });
}

function passPoints(id) { return Store.get('pass.' + id + '.points', 0); }

function addPassPoints(id, n) {
  var p = passPoints(id) + n;
  Store.set('pass.' + id + '.points', p);
  return p;
}

function tierOf(points, tiers) {
  var t = 0;
  for (var i = 0; i < tiers.length; i++) if (points >= tiers[i]) t = i + 1;
  return t;
}

function passComplete(id) {
  var i = passIndex(id);
  var tiers = passTiers(i);
  return passPoints(id) >= tiers[tiers.length - 1];
}

/* The first pass is always open; every later one waits for the previous. */
function passUnlocked(id) {
  var i = passIndex(id);
  if (i === 0) return true;
  return passComplete(PASSES[i - 1].id);
}

function passProgress(id) {
  var i = passIndex(id);
  var tiers = passTiers(i);
  var pts = passPoints(id);
  var tier = tierOf(pts, tiers);
  var nextAt = tier < tiers.length ? tiers[tier] : null;
  var prevAt = tier > 0 ? tiers[tier - 1] : 0;
  return {
    pass: PASSES[i],
    index: i,
    tiers: tiers,
    points: pts,
    tier: tier,
    total: tiers.length,
    nextAt: nextAt,
    toNext: nextAt === null ? 0 : nextAt - pts,
    complete: nextAt === null,
    pct: nextAt === null ? 100
      : Math.max(0, Math.min(100, Math.round((pts - prevAt) * 100 / (nextAt - prevAt))))
  };
}

function activePassId() {
  var id = Store.get('activePass', PASSES[0].id);
  // Never leave her pointed at something she cannot progress.
  if (!passUnlocked(id)) return PASSES[0].id;
  return id;
}

function setActivePass(id) {
  if (passUnlocked(id)) Store.set('activePass', id);
}

/* After finishing one, move her on to the next rather than banking points
   into something already full. Returns the pass she was moved to, or null. */
function advanceActivePass() {
  var id = activePassId();
  if (!passComplete(id)) return null;
  for (var i = passIndex(id) + 1; i < PASSES.length; i++) {
    if (passUnlocked(PASSES[i].id) && !passComplete(PASSES[i].id)) {
      Store.set('activePass', PASSES[i].id);
      return PASSES[i];
    }
  }
  return null;
}

/* ------------------------------------------------------------------ themes */

var THEMES = [
  { id: 'bosco', name: 'Bosco', unlock: { type: 'free' } },
  { id: 'carta', name: 'Carta', unlock: { type: 'level', n: 3 } }
];

/* Each pass hands over its own theme at the last tier. */
PASSES.forEach(function (p, i) {
  var names = {
    lavanda: 'Lavanda', mare: 'Mare', tramonto: 'Tramonto', castagna: 'Castagna',
    neve: 'Neve', ciliegio: 'Ciliegio', grano: 'Grano', corallo: 'Corallo',
    notte: 'Notte', inchiostro: 'Inchiostro', ghiaccio: 'Ghiaccio', oro: 'Oro'
  };
  THEMES.push({
    id: p.theme,
    name: names[p.theme],
    unlock: { type: 'pass', pass: p.id, tier: 5 }
  });
});

/* ------------------------------------------------------------------ titles */

var TITLES = [
  { id: 't-nessuno',  text: '(nessun titolo)',         unlock: { type: 'free' } },
  { id: 't-amica',    text: 'Amica delle parole',      unlock: { type: 'level', n: 2 } },
  { id: 't-curiosa',  text: 'Spirito curioso',         unlock: { type: 'level', n: 5 } },
  { id: 't-sveglia',  text: 'Mente sveglia',           unlock: { type: 'level', n: 9 } },
  { id: 't-lince',    text: 'Occhio di lince',         unlock: { type: 'level', n: 14 } },
  { id: 't-penna',    text: 'Penna d’oro',        unlock: { type: 'level', n: 20 } },
  { id: 't-leggenda', text: 'Leggenda vivente',        unlock: { type: 'level', n: 27 } },
  { id: 't-calma',    text: 'Anima calma',             unlock: { type: 'trophy', id: 'calma' } },
  { id: 't-paziente', text: 'Cuore paziente',          unlock: { type: 'trophy', id: 'mese' } },
  { id: 't-mille',    text: 'Collezionista di parole', unlock: { type: 'trophy', id: 'mille' } }
];

/* Two per pass, at tiers 1 and 3. */
var PASS_TITLES = [
  ['Fiore di primavera', 'Signora del giardino'],
  ['Voce del mare', 'Anima salata'],
  ['Luce della sera', 'Cuore d’arancio'],
  ['Foglia d’autunno', 'Passo nella nebbia'],
  ['Fiocco d’inverno', 'Calore del camino'],
  ['Petalo leggero', 'Sguardo gentile'],
  ['Spiga dorata', 'Mani di farina'],
  ['Respiro profondo', 'Perla nascosta'],
  ['Occhi di stella', 'Silenzio quieto'],
  ['Penna sicura', 'Pagina bianca'],
  ['Passo sicuro', 'Aria limpida'],
  ['Tesoro paziente', 'Corona di parole']
];

PASSES.forEach(function (p, i) {
  TITLES.push({ id: 'tp' + i + 'a', text: PASS_TITLES[i][0],
                unlock: { type: 'pass', pass: p.id, tier: 1 } });
  TITLES.push({ id: 'tp' + i + 'b', text: PASS_TITLES[i][1],
                unlock: { type: 'pass', pass: p.id, tier: 3 } });
});

/* ----------------------------------------------------------------- avatars */

var AVATARS = [
  { id: 'a-fiore',  glyph: '❀', unlock: { type: 'free' } },
  { id: 'a-foglia', glyph: '❦', unlock: { type: 'level', n: 4 } },
  { id: 'a-stella', glyph: '★', unlock: { type: 'level', n: 8 } },
  { id: 'a-luna',   glyph: '☾', unlock: { type: 'level', n: 11 } },
  { id: 'a-sole',   glyph: '☀', unlock: { type: 'level', n: 16 } },
  { id: 'a-quadri', glyph: '❖', unlock: { type: 'level', n: 22 } },
  { id: 'a-corona', glyph: '♛', unlock: { type: 'level', n: 30 } },
  { id: 'a-nota',   glyph: '♪', unlock: { type: 'trophy', id: 'venti' } },
  { id: 'a-cuore',  glyph: '❤', unlock: { type: 'trophy', id: 'settimana' } }
];

/* Two per pass, at tiers 2 and 4. */
var PASS_AVATARS = [
  ['✿', '❁'], ['♓', '❊'], ['☉', '✵'],
  ['❧', '☙'], ['❄', '❆'], ['✾', '❂'],
  ['❋', '❈'], ['✽', '◇'], ['✴', '✦'],
  ['✒', '✍'], ['❉', '❅'], ['✹', '✷']
];

PASSES.forEach(function (p, i) {
  AVATARS.push({ id: 'ap' + i + 'a', glyph: PASS_AVATARS[i][0],
                 unlock: { type: 'pass', pass: p.id, tier: 2 } });
  AVATARS.push({ id: 'ap' + i + 'b', glyph: PASS_AVATARS[i][1],
                 unlock: { type: 'pass', pass: p.id, tier: 4 } });
});

/* Everything a given tier of a given pass hands over. */
function rewardsForTier(passId, tier) {
  var out = [];
  function scan(list, kind, label) {
    list.forEach(function (it) {
      var u = it.unlock;
      if (u.type === 'pass' && u.pass === passId && u.tier === tier) {
        out.push({ kind: kind, name: label(it), id: it.id });
      }
    });
  }
  scan(THEMES, 'Tema', function (t) { return t.name; });
  scan(TITLES, 'Titolo', function (t) { return t.text; });
  scan(AVATARS, 'Simbolo', function (a) { return a.glyph; });
  return out;
}

/* ---------------------------------------------------------------- unlocking */

function isUnlocked(item, ctx) {
  var u = item.unlock;
  if (u.type === 'free') return true;
  if (u.type === 'level') return ctx.level >= u.n;
  if (u.type === 'trophy') return !!ctx.trophies[u.id];
  if (u.type === 'pass') {
    var pr = passProgress(u.pass);
    return pr.tier >= u.tier;
  }
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
  if (u.type === 'pass') {
    return PASSES[passIndex(u.pass)].name + ' · traguardo ' + u.tier;
  }
  if (u.type === 'trophy') {
    for (var i = 0; i < TROPHIES.length; i++) {
      if (TROPHIES[i].id === u.id) return 'Trofeo: ' + TROPHIES[i].name;
    }
  }
  return '';
}

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

/* ------------------------------------------------------------ what she wears */

function equipped() {
  return {
    theme: Store.get('theme', 'bosco'),
    title: Store.get('title', 't-nessuno'),
    avatar: Store.get('avatar', 'a-fiore')
  };
}

function titleText(id) {
  for (var i = 0; i < TITLES.length; i++) {
    if (TITLES[i].id === id) return id === 't-nessuno' ? '' : TITLES[i].text;
  }
  return '';
}

function avatarGlyph(id) {
  for (var i = 0; i < AVATARS.length; i++) if (AVATARS[i].id === id) return AVATARS[i].glyph;
  return AVATARS[0].glyph;
}

function applyTheme(id) {
  var ok = false;
  for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) ok = true;
  document.documentElement.setAttribute('data-theme', ok ? id : 'bosco');
}
