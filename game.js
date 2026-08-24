/* Parolinda — offline Italian word game. No network, no accounts, no ads. */

'use strict';

/* Made for one player in particular. Change these two lines to make it
   someone else's — nothing else in the file hardcodes a name. */
var PLAYER = 'Linda';
var DEDICA = 'Fatto con affetto per la mamma.';

/*
 * A different greeting every time she opens the menu — the time of day first,
 * then a general pool. Adjectives agree with a feminine subject (pronta,
 * bentornata, sveglia); change them along with PLAYER if this becomes
 * someone else's game.
 */
function greetingPool() {
  var h = new Date().getHours(), timely;
  if (h >= 5 && h < 12) {
    timely = ['Buongiorno ' + PLAYER, 'Come stiamo oggi?', 'Pronta per una partita?'];
  } else if (h < 18) {
    timely = ['Buon pomeriggio ' + PLAYER, 'Come va oggi?', 'Una partita veloce?'];
  } else if (h < 23) {
    timely = ['Buonasera ' + PLAYER, 'Com’è andata oggi?', 'Un’ultima partita?'];
  } else {
    timely = ['Ancora sveglia, ' + PLAYER + '?', 'Buonanotte ' + PLAYER];
  }
  return timely.concat([
    'Ciao ' + PLAYER,
    'Bentornata ' + PLAYER,
    'Facciamo due parole?',
    'Che bello rivederti',
    'Ti va una partita?',
    'Quante ne troviamo oggi?'
  ]);
}

var lastGreeting = -1;

function pickGreeting() {
  var pool = greetingPool();
  var i = (Math.random() * pool.length) | 0;
  if (pool.length > 1 && i === lastGreeting) i = (i + 1) % pool.length;
  lastGreeting = i;
  return pool[i];
}

var MIN_WORD_LEN = 3;

/* The daily board is fixed at 3 minutes so scores on it are comparable —
   between one day and the next, and between two people playing it apart. */
var DAILY_SECONDS = 180;

/* Italian Scrabble values: a well-tested mapping of letter to difficulty. */
var VALUES = {
  a: 1, e: 1, i: 1, o: 1,
  c: 2, r: 2, s: 2, t: 2,
  l: 3, m: 3, n: 3, u: 3,
  b: 5, d: 5, f: 5, p: 5, v: 5,
  g: 8, h: 8, z: 8,
  q: 10
};

/*
 * Measured from the dictionary itself: how often each letter appears in a word
 * of 3-8 letters, counted once per word. Deriving it from the whole list
 * instead would shape the board around 16-letter inflections nobody finds.
 */
var TILE_FREQ = {
  a: 0.122705, b: 0.018965, c: 0.045217, d: 0.028802, e: 0.087017,
  f: 0.016505, g: 0.025801, h: 0.004335, i: 0.115628, l: 0.057401,
  m: 0.034304, n: 0.056283, o: 0.080060, p: 0.028653, q: 0.000857,
  r: 0.082304, s: 0.059661, t: 0.069808, u: 0.030828, v: 0.027488,
  z: 0.007378
};

var VOWELS = 'aeiou';

/* A board must be worth playing before we hand it over. */
var BOARD_MIN_WORDS = 80;
var BOARD_MIN_LONG = 4;        // words of 6+ letters
var BOARD_MIN_VOWELS = 5;
var BOARD_MAX_VOWELS = 9;
var BOARD_MAX_REPEAT = 3;
var BOARD_TRIES = 400;

var LENGTH_BONUS = { 5: 5, 6: 10, 7: 15 };   // 8 or more: 20

var CUMULATIVE = (function () {
  var out = [], total = 0, k;
  for (k in TILE_FREQ) total += TILE_FREQ[k];
  var acc = 0;
  for (k in TILE_FREQ) {
    acc += TILE_FREQ[k] / total;
    out.push([acc, k]);
  }
  return out;
})();

/* -------------------------------------------------------------------- rng */

/*
 * mulberry32: small, fast, and — the part that matters here — reproducible.
 * Seeding it from the date is the whole trick behind the daily board.
 */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* Local date, deliberately: her "today" is the one on her wall. */
function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function seedFor(key) {
  var h = 2166136261;
  for (var i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function todayLabel() {
  try {
    return new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  } catch (e) {
    return todayKey();
  }
}

/* ------------------------------------------------------------------ board */

function drawLetter(rng) {
  var r = rng();
  for (var i = 0; i < CUMULATIVE.length; i++) {
    if (r <= CUMULATIVE[i][0]) return CUMULATIVE[i][1];
  }
  return CUMULATIVE[CUMULATIVE.length - 1][1];
}

function lengthBonus(n) {
  if (n >= 8) return 20;
  return LENGTH_BONUS[n] || 0;
}

function scorePath(board, path) {
  var sum = 0, wordMult = 1;
  for (var i = 0; i < path.length; i++) {
    var cell = path[i];
    sum += VALUES[board.letters[cell]] * board.letterMult[cell];
    wordMult *= board.wordMult[cell];
  }
  return sum * wordMult + lengthBonus(path.length);
}

function makeBoard(dawg, rng) {
  var best = null;

  for (var attempt = 0; attempt < BOARD_TRIES; attempt++) {
    var letters = [], counts = {}, vowels = 0, ok = true;
    for (var i = 0; i < 16; i++) {
      var c = drawLetter(rng);
      letters.push(c);
      counts[c] = (counts[c] || 0) + 1;
      if (VOWELS.indexOf(c) !== -1) vowels++;
    }
    if (vowels < BOARD_MIN_VOWELS || vowels > BOARD_MAX_VOWELS) continue;
    for (var k in counts) {
      if (counts[k] > BOARD_MAX_REPEAT) { ok = false; break; }
    }
    if (!ok) continue;

    var board = {
      letters: letters,
      letterMult: new Array(16).fill(1),
      wordMult: new Array(16).fill(1),
      bonus: new Array(16).fill(null)
    };

    // Two bonus tiles, never the same cell: one boosts a letter, one the word.
    var a = (rng() * 16) | 0;
    var b = (rng() * 16) | 0;
    while (b === a) b = (rng() * 16) | 0;
    var lm = rng() < 0.65 ? 2 : 3;
    var wm = rng() < 0.70 ? 2 : 3;
    board.letterMult[a] = lm;
    board.bonus[a] = 'L×' + lm;
    board.wordMult[b] = wm;
    board.bonus[b] = 'P×' + wm;

    var solution = dawg.solveBoard(board, MIN_WORD_LEN, scorePath);
    var long = 0;
    solution.forEach(function (v, w) { if (w.length >= 6) long++; });

    board.solution = solution;
    if (best === null || solution.size > best.solution.size) best = board;
    if (solution.size >= BOARD_MIN_WORDS && long >= BOARD_MIN_LONG) return board;
  }

  // Never leave the player without a board; the richest attempt will do.
  return best;
}

/* ------------------------------------------------------------------ audio */

var Sound = {
  ctx: null,
  on: true,
  ensure: function () {
    if (!this.ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) this.ctx = new C();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  beep: function (freq, dur, type, gain) {
    if (!this.on) return;
    var ctx = this.ensure();
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  },
  good: function (len) {
    var base = 520 + Math.min(len, 8) * 45;
    this.beep(base, 0.12, 'triangle');
    var self = this;
    setTimeout(function () { self.beep(base * 1.5, 0.14, 'triangle', 0.14); }, 70);
  },
  bad: function () { this.beep(150, 0.16, 'sawtooth', 0.10); },
  dupe: function () { this.beep(330, 0.10, 'sine', 0.10); },
  tick: function () { this.beep(880, 0.05, 'square', 0.05); },
  over: function () {
    var self = this, notes = [660, 520, 400, 300];
    notes.forEach(function (n, i) {
      setTimeout(function () { self.beep(n, 0.22, 'triangle', 0.16); }, i * 150);
    });
  },
  fanfare: function () {
    var self = this, notes = [523, 659, 784, 1047];
    notes.forEach(function (n, i) {
      setTimeout(function () { self.beep(n, 0.26, 'triangle', 0.17); }, i * 130);
    });
  }
};

/* ------------------------------------------------------------------ store */

var Store = {
  get: function (k, dflt) {
    try {
      var v = localStorage.getItem('parolinda.' + k);
      return v === null ? dflt : JSON.parse(v);
    } catch (e) { return dflt; }
  },
  set: function (k, v) {
    try { localStorage.setItem('parolinda.' + k, JSON.stringify(v)); } catch (e) {}
  }
};

function loadStats() {
  var s = Store.get('stats', { games: 0, words: 0, points: 0, bestWord: null });
  if (s.points === undefined) {
    // Levels arrived after she had already been playing for weeks. Estimate
    // the points behind her from the words she has found (they average about
    // 30 each) so her level reflects that history instead of resetting it.
    s.points = Math.round((s.words || 0) * 30);
    Store.set('stats', s);
  }
  return s;
}

/*
 * Without this, Android may evict the origin's storage when the device runs
 * low and her records simply vanish one day with no warning. Chrome grants it
 * silently for an installed PWA.
 */
function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return;
  try {
    navigator.storage.persisted().then(function (already) {
      if (!already) navigator.storage.persist().catch(function () {});
    }).catch(function () {});
  } catch (e) {}
}

/* ----------------------------------------------------------------- backup */

var BACKUP_PREFIX = 'PAROLINDA1:';

function b64encodeUtf8(str) {
  var bytes = new TextEncoder().encode(str), bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decodeUtf8(b64) {
  var bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function collectBackup() {
  var out = {
    v: 1,
    records: {},
    daily: {},
    stats: loadStats(),
    trophies: loadTrophies(),
    playedDates: loadPlayedDates()
  };
  [120, 180, 300].forEach(function (s) {
    var r = Store.get('record.' + s, 0);
    if (r) out.records[s] = r;
  });
  var pre = 'parolinda.daily.';
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf(pre) === 0) {
      try { out.daily[k.slice(pre.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
    }
  }
  return out;
}

function encodeBackup(o) { return BACKUP_PREFIX + b64encodeUtf8(JSON.stringify(o)); }

function decodeBackup(text) {
  var s = String(text || '').trim().replace(/\s+/g, '');
  if (s.indexOf(BACKUP_PREFIX) !== 0) throw new Error('Codice non valido');
  var o = JSON.parse(b64decodeUtf8(s.slice(BACKUP_PREFIX.length)));
  if (!o || o.v !== 1) throw new Error('Codice non valido');
  return o;
}

/*
 * Merge, never overwrite: the higher score always wins. That makes restoring
 * safe on a device that already has progress, and makes doing it twice a
 * no-op — which matters when the person tapping is not sure it worked.
 */
function applyBackup(o) {
  var n = { records: 0, daily: 0, trophies: 0 };

  Object.keys(o.records || {}).forEach(function (s) {
    if (o.records[s] > Store.get('record.' + s, 0)) {
      Store.set('record.' + s, o.records[s]);
      n.records++;
    }
  });
  Object.keys(o.daily || {}).forEach(function (d) {
    if (o.daily[d] > Store.get('daily.' + d, 0)) {
      Store.set('daily.' + d, o.daily[d]);
      n.daily++;
    }
  });

  // Trophies are a union, and the earlier award date wins: she earned it then.
  var have = loadTrophies(), incoming = o.trophies || {};
  Object.keys(incoming).forEach(function (id) {
    if (!have[id]) { have[id] = incoming[id]; n.trophies++; }
    else if (incoming[id] < have[id]) { have[id] = incoming[id]; }
  });
  Store.set('trophies', have);

  var days = loadPlayedDates(), theirDays = o.playedDates || {};
  Object.keys(theirDays).forEach(function (d) {
    days[d] = Math.max(days[d] || 0, theirDays[d] || 0);
  });
  Store.set('playedDates', days);

  var mine = loadStats(), theirs = o.stats || {};
  var merged = {
    games: Math.max(mine.games || 0, theirs.games || 0),
    words: Math.max(mine.words || 0, theirs.words || 0),
    points: Math.max(mine.points || 0, theirs.points || 0),
    bestWord: mine.bestWord || null
  };
  if (theirs.bestWord && (!merged.bestWord || theirs.bestWord.score > merged.bestWord.score)) {
    merged.bestWord = theirs.bestWord;
  }
  Store.set('stats', merged);
  return n;
}

/* ------------------------------------------------------------------- game */

var el = {};
var dawg = null;
var game = null;
var wakeLock = null;
var lastRound = { seconds: 180, mode: 'free' };

function $(id) { return document.getElementById(id); }

function show(screen) {
  ['intro', 'home', 'play', 'over', 'diary', 'season', 'collection'].forEach(function (s) {
    $('screen-' + s).classList.toggle('active', s === screen);
  });
}

/* Counting up, so floor: a round should read 0:00 the instant it starts. */
function fmtElapsed(ms) {
  var t = Math.max(0, Math.floor(ms / 1000));
  var m = (t / 60) | 0, s = t % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function fmtTime(ms) {
  var t = Math.max(0, Math.ceil(ms / 1000));
  var m = (t / 60) | 0, s = t % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function buildBoardDom(board) {
  el.board.innerHTML = '';
  el.tiles = [];
  for (var i = 0; i < 16; i++) {
    var d = document.createElement('div');
    d.className = 'tile';
    d.dataset.cell = String(i);
    var span = document.createElement('span');
    span.className = 'letter';
    span.textContent = board.letters[i].toUpperCase();
    d.appendChild(span);
    var v = document.createElement('span');
    v.className = 'value';
    v.textContent = String(VALUES[board.letters[i]]);
    d.appendChild(v);
    if (board.bonus[i]) {
      var b = document.createElement('span');
      b.className = 'bonus' + (board.bonus[i][0] === 'P' ? ' word' : '');
      b.textContent = board.bonus[i];
      d.appendChild(b);
    }
    el.board.appendChild(d);
    el.tiles.push(d);
  }
}

function startGame(seconds, mode) {
  lastRound = { seconds: seconds, mode: mode };
  var rng = (mode === 'daily') ? mulberry32(seedFor(todayKey())) : Math.random;
  var board = makeBoard(dawg, rng);

  game = {
    board: board,
    mode: mode,
    duration: seconds,
    endsAt: performance.now() + seconds * 1000,
    remaining: seconds * 1000,
    startedAt: performance.now(),
    elapsed: 0,
    paused: false,
    score: 0,
    found: [],
    foundSet: new Set(),
    path: [],
    dragging: false,
    tapMode: false,
    lastWarn: 999
  };

  buildBoardDom(board);
  el.score.textContent = '0';
  el.foundCount.textContent = '0';
  el.current.textContent = '';
  el.current.className = 'current';
  el.confirmBar.hidden = true;
  el.pauseOverlay.hidden = true;
  el.btnPause.textContent = 'Pausa';
  el.modeTag.textContent = mode === 'daily' ? 'Sfida del giorno'
                         : mode === 'zen' ? 'Senza fretta' : '';
  el.modeTag.hidden = (mode === 'free');
  el.btnDone.hidden = (mode !== 'zen');
  el.timer.classList.remove('warn');
  renderTrail();
  show('play');
  requestWakeLock();
  tick();
}

function tick() {
  if (!game) return;
  if (!game.paused) {
    if (game.mode === 'zen') {
      // No clock to run out: count up, and let her stop when she likes.
      game.elapsed = performance.now() - game.startedAt;
      el.timer.textContent = fmtElapsed(game.elapsed);
    } else {
      game.remaining = game.endsAt - performance.now();
      el.timer.textContent = fmtTime(game.remaining);
      var secs = Math.ceil(game.remaining / 1000);
      el.timer.classList.toggle('warn', secs <= 15);
      if (secs <= 5 && secs > 0 && secs < game.lastWarn) {
        game.lastWarn = secs;
        Sound.tick();
      }
      if (game.remaining <= 0) { endGame(); return; }
    }
  }
  requestAnimationFrame(tick);
}

function togglePause() {
  if (!game) return;
  game.paused = !game.paused;
  el.pauseOverlay.hidden = !game.paused;
  el.btnPause.textContent = game.paused ? 'Riprendi' : 'Pausa';
  if (!game.paused) {
    if (game.mode === 'zen') game.startedAt = performance.now() - game.elapsed;
    else game.endsAt = performance.now() + game.remaining;
    requestWakeLock();
  } else {
    clearPath();
    releaseWakeLock();
  }
}

/*
 * Praise that means something. It reacts to what she actually did, so a good
 * round reads differently from an ordinary one instead of every round getting
 * the same exclamation mark.
 */
function praiseFor(g, prevBest, beatIt) {
  var longest = '';
  g.found.forEach(function (f) { if (f.word.length > longest.length) longest = f.word; });

  if (beatIt && prevBest > 0) return 'Brava ' + PLAYER + '! Nuovo record!';
  if (beatIt) return 'Bravissima ' + PLAYER + '!';
  if (longest.length >= 8) return 'Che parola: ' + longest.toUpperCase() + '!';
  if (prevBest > 0 && g.score >= prevBest * 0.9) return 'Ci sei quasi, ' + PLAYER + '!';
  if (g.found.length === 0) return 'Riprova, ' + PLAYER + '.';
  if (longest.length >= 6) return 'Bella partita, ' + PLAYER + '.';
  return 'Brava, ' + PLAYER + '.';
}

function endGame() {
  var g = game;
  game = null;
  releaseWakeLock();

  // Snapshot before anything moves, so we can tell her exactly what changed.
  var unlocksBefore = unlockSnapshot();
  var season = currentSeason();
  var tierBefore = seasonProgress(season).tier;

  // Senza fretta has no clock, so it cannot set a record. Everything else it
  // does still counts towards levels, totals and the diary.
  var timed = (g.mode !== 'zen');
  var key = g.mode === 'daily' ? 'daily.' + todayKey() : 'record.' + g.duration;
  var prevBest = timed ? Store.get(key, 0) : 0;
  var beatIt = timed && g.score > prevBest;
  if (beatIt) Store.set(key, g.score);

  var stats = loadStats();
  var pointsBefore = stats.points || 0;
  var longest = 0;
  stats.games += 1;
  stats.words += g.found.length;
  stats.points = pointsBefore + g.score;
  g.found.forEach(function (f) {
    if (f.word.length > longest) longest = f.word.length;
    if (!stats.bestWord || f.score > stats.bestWord.score) {
      stats.bestWord = { word: f.word, score: f.score };
    }
  });
  Store.set('stats', stats);

  addSeasonPoints(season.id, g.score);
  var tierAfter = seasonProgress(season).tier;
  var tieredUp = tierAfter > tierBefore;

  var after = levelFor(stats.points);
  var leveledUp = after.level.n > levelFor(pointsBefore).level.n;

  var days = recordDay(todayKey());
  var fresh = awardTrophies({
    mode: g.mode, score: g.score, words: g.found.length, longest: longest,
    beatIt: beatIt, prevBest: prevBest, totalWords: stats.words,
    daysPlayed: Object.keys(days).length, date: todayKey()
  });

  var freshUnlocks = newlyUnlocked(unlocksBefore);

  if (leveledUp || tieredUp || (beatIt && prevBest > 0)) Sound.fanfare();
  else Sound.over();

  el.finalScore.textContent = String(g.score);
  el.finalWords.textContent = g.found.length + (g.found.length === 1 ? ' parola' : ' parole');
  el.praise.textContent = praiseFor(g, prevBest, beatIt);
  el.praise.classList.toggle('is-record', beatIt || leveledUp || tieredUp);

  if (!timed) {
    el.recordNote.textContent = 'Senza fretta - ' + fmtElapsed(g.elapsed) + ' di gioco';
  } else if (g.mode === 'daily') {
    el.recordNote.textContent = 'Sfida del giorno - il tuo miglior risultato di oggi: '
      + Math.max(prevBest, g.score);
  } else {
    el.recordNote.textContent = 'Record su ' + Math.round(g.duration / 60) + ' minuti: '
      + Math.max(prevBest, g.score);
  }
  el.btnAgain.textContent = g.mode === 'daily' ? 'Riprova la sfida' : 'Gioca ancora';

  el.levelUp.hidden = !leveledUp;
  if (leveledUp) {
    el.levelUp.textContent = 'Livello ' + after.level.n + ' - ' + after.level.name + '!';
  }

  el.tierUp.hidden = !tieredUp;
  if (tieredUp) {
    el.tierUp.textContent = season.glyph + '  Traguardo ' + tierAfter + ' di '
      + SEASON_TIERS.length + ' - ' + season.name + '!';
  }

  el.newUnlocks.innerHTML = '';
  el.newUnlocks.hidden = !freshUnlocks.length;
  freshUnlocks.forEach(function (u) {
    var li = document.createElement('li');
    li.className = 'trophy got';
    li.innerHTML = '<span class="ticon">' + u.glyph + '</span>'
      + '<span class="tbody"><b>' + u.label + '</b><i>' + u.kind + ' sbloccato</i></span>';
    el.newUnlocks.appendChild(li);
  });

  el.newTrophies.innerHTML = '';
  el.newTrophies.hidden = !fresh.length;
  fresh.forEach(function (t) {
    var li = document.createElement('li');
    li.className = 'trophy got';
    li.innerHTML = '<span class="ticon">' + t.icon + '</span>'
      + '<span class="tbody"><b>' + t.name + '</b><i>' + t.desc + '</i></span>';
    el.newTrophies.appendChild(li);
  });

  var found = g.found.slice().sort(function (a, b) { return b.score - a.score; });
  el.foundList.innerHTML = '';
  if (!found.length) {
    el.foundList.innerHTML = '<li class="empty">Nessuna parola trovata</li>';
  }
  found.forEach(function (f) {
    var li = document.createElement('li');
    li.innerHTML = '<span>' + f.word.toUpperCase() + '</span><b>' + f.score + '</b>';
    el.foundList.appendChild(li);
  });

  var missed = [];
  g.board.solution.forEach(function (v, w) {
    if (!g.foundSet.has(w)) missed.push({ word: w, score: v.score });
  });
  missed.sort(function (a, b) { return b.score - a.score; });
  el.missedList.innerHTML = '';
  missed.slice(0, 12).forEach(function (m) {
    var li = document.createElement('li');
    li.innerHTML = '<span>' + m.word.toUpperCase() + '</span><b>' + m.score + '</b>';
    el.missedList.appendChild(li);
  });
  el.missedNote.textContent = 'Sul tabellone c’erano ' + g.board.solution.size + ' parole.';

  show('over');
}

/* ------------------------------------------------------------------ input */

function tileAt(x, y) {
  var node = document.elementFromPoint(x, y);
  if (!node) return -1;
  var tile = node.closest ? node.closest('.tile') : null;
  return tile ? Number(tile.dataset.cell) : -1;
}

function adjacent(a, b) {
  var ra = (a / 4) | 0, ca = a % 4, rb = (b / 4) | 0, cb = b % 4;
  var dr = Math.abs(ra - rb), dc = Math.abs(ca - cb);
  return (dr <= 1 && dc <= 1) && !(dr === 0 && dc === 0);
}

function renderTrail() {
  if (!game) return;
  var p = game.path;
  for (var i = 0; i < 16; i++) {
    if (el.tiles && el.tiles[i]) el.tiles[i].classList.remove('sel', 'head');
  }
  p.forEach(function (c, i) {
    el.tiles[c].classList.add('sel');
    if (i === p.length - 1) el.tiles[c].classList.add('head');
  });

  var pts = p.map(function (c) {
    return ((c % 4) + 0.5).toFixed(3) + ',' + (((c / 4) | 0) + 0.5).toFixed(3);
  }).join(' ');
  el.trailLine.setAttribute('points', pts);

  var word = p.map(function (c) { return game.board.letters[c]; }).join('');
  el.current.textContent = word.toUpperCase();
  el.current.className = 'current' + (word.length >= MIN_WORD_LEN ? ' ready' : '');
  el.confirmBar.hidden = !(game.tapMode && p.length > 0);
}

function pushCell(cell) {
  var p = game.path;
  if (p.length === 0) { p.push(cell); return true; }
  if (cell === p[p.length - 1]) return false;
  if (p.length >= 2 && cell === p[p.length - 2]) { p.pop(); return true; }
  if (p.indexOf(cell) !== -1) return false;
  if (!adjacent(cell, p[p.length - 1])) return false;
  p.push(cell);
  return true;
}

function clearPath() {
  if (!game) return;
  game.path = [];
  game.tapMode = false;
  renderTrail();
}

function submitPath() {
  if (!game) return;
  var p = game.path;
  var word = p.map(function (c) { return game.board.letters[c]; }).join('');

  if (word.length < MIN_WORD_LEN) {
    if (word.length > 0) toast('Almeno ' + MIN_WORD_LEN + ' lettere', 'bad');
    clearPath();
    return;
  }
  if (game.foundSet.has(word)) {
    toast(word.toUpperCase() + ' — già trovata', 'dupe');
    Sound.dupe();
    clearPath();
    return;
  }
  if (!dawg.has(word)) {
    toast(word.toUpperCase() + ' non vale', 'bad');
    Sound.bad();
    buzz(60);
    flash('bad');
    clearPath();
    return;
  }

  var pts = scorePath(game.board, p);
  game.score += pts;
  game.found.push({ word: word, score: pts });
  game.foundSet.add(word);
  el.score.textContent = String(game.score);
  el.foundCount.textContent = String(game.found.length);
  toast('+' + pts + '  ' + word.toUpperCase(), 'good');
  Sound.good(word.length);
  buzz(25);
  flash('good');
  clearPath();
}

function flash(kind) {
  el.board.classList.remove('flash-good', 'flash-bad');
  void el.board.offsetWidth;
  el.board.classList.add('flash-' + kind);
}

function buzz(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

var toastTimer = null;
function toast(text, kind) {
  el.toast.textContent = text;
  el.toast.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, 1100);
}

function wireBoard() {
  var moved = false, startX = 0, startY = 0;

  el.board.addEventListener('pointerdown', function (e) {
    if (!game || game.paused) return;
    e.preventDefault();
    Sound.ensure();
    var cell = tileAt(e.clientX, e.clientY);
    if (cell < 0) return;
    // Throws NotFoundError if the pointer is already gone; never fatal here.
    try { el.board.setPointerCapture(e.pointerId); } catch (err) {}
    moved = false;
    startX = e.clientX;
    startY = e.clientY;

    // Tap-to-select mode: some players find dragging across a screen hard.
    if (game.tapMode && game.path.length) {
      var p = game.path;
      if (cell === p[p.length - 1]) { submitPath(); return; }
      if (pushCell(cell)) { renderTrail(); return; }
      // Tapped somewhere unreachable: start over, and let this touch become a
      // drag if she keeps moving. pointerup restores tap mode if she doesn't.
      game.path = [cell];
      game.dragging = true;
      game.tapMode = false;
      renderTrail();
      return;
    }

    game.path = [cell];
    game.dragging = true;
    game.tapMode = false;
    renderTrail();
  });

  el.board.addEventListener('pointermove', function (e) {
    if (!game || game.paused || !game.dragging) return;
    e.preventDefault();
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) moved = true;
    var cell = tileAt(e.clientX, e.clientY);
    if (cell < 0) return;
    if (pushCell(cell)) renderTrail();
  });

  function finish(e) {
    if (!game || !game.dragging) return;
    game.dragging = false;
    try { el.board.releasePointerCapture(e.pointerId); } catch (err) {}
    if (game.path.length >= 2) {
      submitPath();
    } else if (game.path.length === 1 && !moved) {
      game.tapMode = true;          // wait for further taps
      renderTrail();
    } else {
      clearPath();
    }
  }

  el.board.addEventListener('pointerup', finish);
  el.board.addEventListener('pointercancel', function () {
    if (game) { game.dragging = false; clearPath(); }
  });
  el.board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}

/* --------------------------------------------------------------- wakelock */

function requestWakeLock() {
  if (!navigator.wakeLock) return;
  navigator.wakeLock.request('screen').then(function (l) {
    wakeLock = l;
  }).catch(function () {});
}

function releaseWakeLock() {
  if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    if (game && !game.paused) togglePause();
  } else if (game && !game.paused) {
    requestWakeLock();
  }
});

/* ------------------------------------------------------------------- boot */

function refreshHome() {
  $('greeting').textContent = pickGreeting();

  var eq = equipped();
  applyTheme(eq.theme);
  $('home-avatar').textContent = avatarGlyph(eq.avatar);
  var tt = titleText(eq.title);
  $('home-title').textContent = tt;
  $('home-title').hidden = !tt;

  var season = currentSeason();
  var sp = seasonProgress(season);
  $('season-glyph').textContent = season.glyph;
  $('season-name').textContent = season.label;
  $('season-bar').style.width = sp.pct + '%';
  $('season-next').textContent = sp.nextAt === null
    ? 'Stagione completata'
    : 'Traguardo ' + sp.tier + ' di ' + sp.total + ' \u00b7 mancano ' + sp.toNext + ' punti';

  var d = Store.get('duration', 180);
  Array.prototype.forEach.call(el.durationBtns, function (b) {
    b.classList.toggle('on', Number(b.dataset.seconds) === d);
  });
  el.homeRecord.textContent = String(Store.get('record.' + d, 0));

  el.dailyDate.textContent = todayLabel();
  var todayScore = Store.get('daily.' + todayKey(), 0);
  el.dailyScore.textContent = todayScore > 0
    ? 'Oggi: ' + todayScore + ' punti'
    : 'Non ancora giocata';

  var s = loadStats();
  var lv = levelFor(s.points || 0);
  el.levelName.textContent = 'Livello ' + lv.level.n + ' - ' + lv.level.name;
  el.levelBar.style.width = lv.pct + '%';
  $('level-next').textContent = lv.next
    ? 'Mancano ' + lv.toNext + ' punti per diventare ' + lv.next.name
    : 'Ultimo livello raggiunto';

  el.statGames.textContent = String(s.games);
  el.statWords.textContent = String(s.words);
  el.statBest.textContent = s.bestWord
    ? s.bestWord.word.toUpperCase() + ' · ' + s.bestWord.score
    : '—';
}

var APP_VERSION = 2;

/* Shown once, the first time she ever opens it. */
var INTRO_SLIDES = [
  { glyph: '\u2740', title: 'Benvenuta',
    body: '<p>Questo &egrave; <b>Parolinda</b>: si cercano parole in un quadrato '
        + 'di lettere.</p><p>Pi&ugrave; parole trovi, pi&ugrave; punti fai.</p>' },
  { glyph: '\u261E', title: 'Come si gioca',
    body: '<p>Collega le lettere <b>vicine</b>, anche in diagonale.</p>'
        + '<p><b>Trascina il dito</b> sulle lettere, oppure <b>tocca</b> una '
        + 'lettera alla volta e poi premi <b>\u2713</b>. Vanno bene entrambi.</p>' },
  { glyph: '\u2605', title: 'I punti',
    body: '<p>Le parole <b>lunghe</b> valgono di pi&ugrave;.</p>'
        + '<p>Le caselle colorate aiutano: <b>L&times;2</b> raddoppia quella '
        + 'lettera, <b>P&times;3</b> triplica tutta la parola.</p>'
        + '<p>Gli accenti non servono: <i>citt&agrave;</i> si scrive <b>CITTA</b>.</p>' },
  { glyph: '\u25D0', title: 'Tre modi di giocare',
    body: '<p><b>Sfida del giorno</b>: un tabellone nuovo ogni giorno, uguale '
        + 'per tutti.</p><p><b>Partita libera</b>: quando vuoi, col tempo che '
        + 'scegli tu.</p><p><b>Senza fretta</b>: nessun orologio, finisci quando '
        + 'ti va.</p>' },
  { glyph: '\u265B', title: 'I tuoi progressi',
    body: '<p>Ogni partita ti fa salire di <b>livello</b> e riempie il tuo '
        + '<b>diario</b>: trofei, calendario, temi e titoli da collezionare.</p>'
        + '<p>Non si perde mai niente: tutto va solo avanti.</p>' }
];

/* Shown once to someone who already had the older version. */
var NEWS_SLIDES = [
  { glyph: '\u2728', title: 'C&rsquo;&egrave; qualcosa di nuovo',
    body: '<p>Parolinda si &egrave; fatta pi&ugrave; grande. Ecco cosa trovi '
        + 'da oggi.</p>' },
  { glyph: '\u2740', title: 'Senza fretta',
    body: '<p>Un modo di giocare <b>senza orologio</b>.</p><p>Nessun conto alla '
        + 'rovescia: giochi con calma e premi <b>Ho finito</b> quando vuoi tu.</p>' },
  { glyph: '\u2605', title: 'Livelli e titoli',
    body: '<p>Ogni partita ti d&agrave; punti, e i punti ti fanno salire di '
        + '<b>livello</b>: da <i>Curiosa</i> fino a <i>Regina delle parole</i>.</p>'
        + '<p>I punti che hai gi&agrave; fatto sono stati contati.</p>' },
  { glyph: '\u25C6', title: 'Trofei e diario',
    body: '<p>Ci sono <b>13 trofei</b> da conquistare.</p><p>Nel <b>diario</b> '
        + 'trovi i tuoi numeri e un <b>calendario</b> con tutte le sfide del '
        + 'giorno che hai giocato.</p>' },
  { glyph: '\u2600', title: 'La stagione',
    body: '<p>Ogni stagione ha <b>8 traguardi</b> con premi: temi, titoli e '
        + 'simboli da mettere accanto al tuo nome.</p>'
        + '<p>Le stagioni <b>tornano ogni anno</b>: quello che non prendi ora, '
        + 'lo prendi la prossima volta. Non c&rsquo;&egrave; fretta e non '
        + 'si perde niente.</p>' },
  { glyph: '\u0041', title: 'Si legge meglio',
    body: '<p>Nel menu puoi scegliere la <b>dimensione del testo</b>: normale, '
        + 'grande o molto grande.</p><p>E puoi cambiare i <b>colori</b> dalla '
        + 'tua collezione.</p>' }
];

var introQueue = [], introIndex = 0, introDone = null;

function renderIntro() {
  var s = introQueue[introIndex];
  $('intro-glyph').textContent = s.glyph;
  $('intro-title').innerHTML = s.title;
  $('intro-body').innerHTML = s.body;

  var dots = $('intro-dots');
  dots.innerHTML = '';
  introQueue.forEach(function (_, i) {
    var d = document.createElement('span');
    d.className = 'dot' + (i === introIndex ? ' on' : '');
    dots.appendChild(d);
  });

  var last = (introIndex === introQueue.length - 1);
  $('btn-intro-next').textContent = last ? 'Cominciamo' : 'Avanti';
  $('btn-intro-skip').hidden = last;
}

function startIntro(slides, onDone) {
  introQueue = slides;
  introIndex = 0;
  introDone = onDone || null;
  renderIntro();
  show('intro');
}

function finishIntro() {
  Store.set('seenVersion', APP_VERSION);
  if (introDone) introDone();
  refreshHome();
  show('home');
}

function maybeIntro() {
  var seen = Store.get('seenVersion', 0);
  if (seen >= APP_VERSION) return;
  var s = loadStats();
  startIntro((s.games || 0) === 0 ? INTRO_SLIDES : NEWS_SLIDES);
}

/* ----------------------------------------------------------------- season */

function renderSeason() {
  var s = currentSeason();
  var p = seasonProgress(s);
  var bestEver = bestTierForKey(s.key);

  $('season-heading').textContent = s.label;
  $('season-big-glyph').textContent = s.glyph;
  $('season-tier-big').textContent = 'Traguardo ' + p.tier + ' di ' + p.total;
  $('season-bar2').style.width = p.pct + '%';
  $('season-note').textContent = p.nextAt === null
    ? 'Hai completato la stagione. Brava!'
    : 'Mancano ' + p.toNext + ' punti al traguardo ' + (p.tier + 1)
      + ' \u00b7 ' + p.points + ' punti in questa stagione';

  var track = $('season-track');
  track.innerHTML = '';
  for (var i = 1; i <= SEASON_TIERS.length; i++) {
    var reached = p.tier >= i;
    var owned = bestEver >= i;
    var rewards = rewardsForTier(s.key, i);
    var li = document.createElement('li');
    li.className = 'tier' + (reached ? ' reached' : (owned ? ' owned' : ''));
    li.innerHTML = '<span class="tier-num">' + i + '</span>'
      + '<span class="tier-body"><b>' + SEASON_TIERS[i - 1] + ' punti</b><i>'
      + (rewards.length
          ? rewards.map(function (r) { return r.kind + ': ' + r.name; }).join('  \u00b7  ')
          : 'Nessun premio')
      + '</i></span>'
      + '<span class="tier-mark">' + (owned ? '\u2713' : '') + '</span>';
    track.appendChild(li);
  }
}

/* ------------------------------------------------------------- collection */

function equipItem(kind, id) {
  if (kind === 'theme') { Store.set('theme', id); applyTheme(id); }
  else if (kind === 'title') Store.set('title', id);
  else if (kind === 'avatar') Store.set('avatar', id);
}

function renderCollection() {
  var ctx = unlockContext();
  var eq = equipped();
  var got = 0, total = 0;

  function build(el, items, kind, render) {
    el.innerHTML = '';
    items.forEach(function (it) {
      total++;
      var ok = isUnlocked(it, ctx);
      if (ok) got++;
      var current = (kind === 'theme' ? eq.theme : kind === 'title' ? eq.title : eq.avatar);
      var li = document.createElement('li');
      li.className = 'coll-item' + (ok ? '' : ' locked') + (current === it.id ? ' on' : '');
      li.innerHTML = render(it, ok);
      if (ok) {
        li.addEventListener('click', function () {
          equipItem(kind, it.id);
          renderCollection();
        });
      }
      el.appendChild(li);
    });
  }

  build($('coll-themes'), THEMES, 'theme', function (t, ok) {
    return '<span class="swatch" data-swatch="' + t.id + '"></span>'
      + '<span class="tbody"><b>' + t.name + '</b><i>'
      + (ok ? 'Tocca per usarlo' : howToGet(t)) + '</i></span>';
  });

  build($('coll-titles'), TITLES, 'title', function (t, ok) {
    return '<span class="tbody"><b>' + t.text + '</b><i>'
      + (ok ? 'Tocca per usarlo' : howToGet(t)) + '</i></span>';
  });

  build($('coll-avatars'), AVATARS, 'avatar', function (a, ok) {
    return '<span class="glyph-big">' + a.glyph + '</span>'
      + '<span class="tbody"><i>' + (ok ? 'Tocca' : howToGet(a)) + '</i></span>';
  });

  $('coll-count').textContent = got + ' di ' + total + ' sbloccati';
}

function applyTextSize(n) {
  document.body.classList.remove('ts-1', 'ts-2', 'ts-3');
  document.body.classList.add('ts-' + n);
  Array.prototype.forEach.call(document.querySelectorAll('.ts-btn'), function (b) {
    b.classList.toggle('on', Number(b.dataset.size) === n);
  });
}

var diaryMonth = null;

function renderDiary() {
  var s = loadStats();
  var lv = levelFor(s.points || 0);
  $('diary-level').textContent = 'Livello ' + lv.level.n + ' - ' + lv.level.name;
  $('diary-bar').style.width = lv.pct + '%';
  $('diary-next').textContent = lv.next
    ? 'Mancano ' + lv.toNext + ' punti per diventare ' + lv.next.name
    : 'Hai raggiunto l’ultimo livello';

  $('d-games').textContent = String(s.games || 0);
  $('d-words').textContent = String(s.words || 0);
  $('d-points').textContent = String(s.points || 0);
  $('d-days').textContent = String(daysPlayedCount());
  $('d-best').textContent = s.bestWord
    ? s.bestWord.word.toUpperCase() + ' - ' + s.bestWord.score
    : '-';

  var eq = equipped();
  $('diary-avatar').textContent = avatarGlyph(eq.avatar);
  var dt = titleText(eq.title);
  $('diary-title').textContent = dt;
  $('diary-title').hidden = !dt;

  var have = loadTrophies();
  var list = $('trophy-list');
  list.innerHTML = '';
  TROPHIES.forEach(function (t) {
    var li = document.createElement('li');
    li.className = 'trophy' + (have[t.id] ? ' got' : '');
    li.innerHTML = '<span class="ticon">' + t.icon + '</span>'
      + '<span class="tbody"><b>' + t.name + '</b><i>' + t.desc + '</i></span>';
    list.appendChild(li);
  });
  $('trophy-count').textContent = Object.keys(have).length + ' / ' + TROPHIES.length;

  renderCalendar();
}

function renderCalendar() {
  var m = calendarMonth(diaryMonth.y, diaryMonth.m);
  $('cal-label').textContent = m.label;
  var grid = $('cal-grid');
  grid.innerHTML = '';
  m.cells.forEach(function (c) {
    var d = document.createElement('div');
    if (c.blank) { d.className = 'cal-cell blank'; grid.appendChild(d); return; }
    d.className = 'cal-cell'
      + (c.played ? ' played' : '')
      + (c.daily ? ' has-daily' : '')
      + (c.today ? ' today' : '');
    d.innerHTML = '<span class="cal-day">' + c.day + '</span>'
      + (c.daily ? '<span class="cal-score">' + c.daily + '</span>' : '');
    grid.appendChild(d);
  });

  // Nothing to see in the future.
  var now = new Date();
  $('cal-next').disabled = (diaryMonth.y > now.getFullYear())
    || (diaryMonth.y === now.getFullYear() && diaryMonth.m >= now.getMonth());
}

function shiftMonth(delta) {
  var d = new Date(diaryMonth.y, diaryMonth.m + delta, 1);
  diaryMonth = { y: d.getFullYear(), m: d.getMonth() };
  renderCalendar();
}

function openDiary() {
  var now = new Date();
  diaryMonth = { y: now.getFullYear(), m: now.getMonth() };
  renderDiary();
  show('diary');
}

function wireBackup() {
  var codeBox = $('backup-code');
  var actions = $('export-actions');
  var msg = $('backup-msg');

  $('backup-toggle').addEventListener('click', function () {
    var box = $('backup-body');
    box.hidden = !box.hidden;
  });

  $('btn-export').addEventListener('click', function () {
    var code = encodeBackup(collectBackup());
    codeBox.value = code;
    codeBox.hidden = false;
    actions.hidden = false;
    $('btn-share').hidden = !navigator.share;
    msg.textContent = 'Backup pronto. Copialo o invialo a te stessa.';
  });

  $('btn-copy').addEventListener('click', function () {
    codeBox.select();
    var done = function () { msg.textContent = 'Copiato.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codeBox.value).then(done, function () {
        msg.textContent = 'Copia a mano il testo qui sopra.';
      });
    } else {
      // Older WebViews: the manual selection above is the fallback.
      msg.textContent = 'Copia a mano il testo qui sopra.';
    }
  });

  $('btn-share').addEventListener('click', function () {
    if (!navigator.share) return;
    navigator.share({ title: 'Backup Parolinda', text: codeBox.value })
      .catch(function () {});
  });

  $('btn-import').addEventListener('click', function () {
    var raw = $('import-code').value;
    if (!raw.trim()) { msg.textContent = 'Incolla prima il codice.'; return; }
    var data;
    try {
      data = decodeBackup(raw);
    } catch (e) {
      msg.textContent = 'Codice non valido. Controlla di averlo copiato tutto.';
      return;
    }
    var n = applyBackup(data);
    refreshHome();
    msg.textContent = (n.records + n.daily) === 0
      ? 'Fatto: qui i punteggi erano già uguali o migliori.'
      : 'Ripristinato: ' + n.records + ' record e ' + n.daily + ' sfide.';
    $('import-code').value = '';
  });
}

function wireUi() {
  el.board = $('board');
  el.trailLine = $('trail-line');
  el.timer = $('timer');
  el.score = $('score');
  el.foundCount = $('found-count');
  el.current = $('current');
  el.toast = $('toast');
  el.confirmBar = $('confirm-bar');
  el.pauseOverlay = $('pause-overlay');
  el.btnPause = $('btn-pause');
  el.modeTag = $('mode-tag');
  el.finalScore = $('final-score');
  el.finalWords = $('final-words');
  el.praise = $('praise');
  el.recordNote = $('record-note');
  el.btnAgain = $('btn-again');
  el.foundList = $('found-list');
  el.missedList = $('missed-list');
  el.missedNote = $('missed-note');
  el.homeRecord = $('home-record');
  el.dailyDate = $('daily-date');
  el.dailyScore = $('daily-score');
  el.statGames = $('stat-games');
  el.statWords = $('stat-words');
  el.statBest = $('stat-best');
  el.levelName = $('level-name');
  el.levelBar = $('level-bar');
  el.btnDone = $('btn-done');
  el.levelUp = $('level-up');
  el.tierUp = $('tier-up');
  el.newUnlocks = $('new-unlocks');
  el.newTrophies = $('new-trophies');
  el.durationBtns = document.querySelectorAll('.dur');

  $('record-label').textContent = 'Il record di ' + PLAYER;
  $('dedica').textContent = DEDICA;

  Array.prototype.forEach.call(el.durationBtns, function (b) {
    b.addEventListener('click', function () {
      Store.set('duration', Number(b.dataset.seconds));
      refreshHome();
    });
  });

  // Asked again on a real gesture: some browsers only grant it from one.
  $('btn-daily').addEventListener('click', function () {
    Sound.ensure();
    requestPersistence();
    startGame(DAILY_SECONDS, 'daily');
  });
  $('btn-play').addEventListener('click', function () {
    Sound.ensure();
    requestPersistence();
    startGame(Store.get('duration', 180), 'free');
  });
  $('btn-zen').addEventListener('click', function () {
    Sound.ensure();
    requestPersistence();
    startGame(0, 'zen');
  });
  el.btnDone.addEventListener('click', function () {
    if (game) endGame();
  });
  el.btnAgain.addEventListener('click', function () {
    startGame(lastRound.seconds, lastRound.mode);
  });

  $('btn-diary').addEventListener('click', openDiary);
  $('btn-diary-over').addEventListener('click', openDiary);
  $('btn-diary-back').addEventListener('click', function () {
    refreshHome();
    show('home');
  });
  $('cal-prev').addEventListener('click', function () { shiftMonth(-1); });
  $('cal-next').addEventListener('click', function () { shiftMonth(1); });

  Array.prototype.forEach.call(document.querySelectorAll('.ts-btn'), function (b) {
    b.addEventListener('click', function () {
      var n = Number(b.dataset.size);
      Store.set('textSize', n);
      applyTextSize(n);
    });
  });
  applyTextSize(Store.get('textSize', 1));
  $('btn-home').addEventListener('click', function () {
    refreshHome();
    show('home');
  });
  $('btn-quit').addEventListener('click', function () {
    if (game) { releaseWakeLock(); game = null; }
    refreshHome();
    show('home');
  });
  el.btnPause.addEventListener('click', togglePause);
  $('btn-confirm').addEventListener('click', submitPath);
  $('btn-clear').addEventListener('click', clearPath);

  var sound = $('btn-sound');
  Sound.on = Store.get('sound', true);
  sound.textContent = Sound.on ? '♪ Suoni: sì' : '♪ Suoni: no';
  sound.addEventListener('click', function () {
    Sound.on = !Sound.on;
    Store.set('sound', Sound.on);
    sound.textContent = Sound.on ? '♪ Suoni: sì' : '♪ Suoni: no';
  });

  $('btn-season').addEventListener('click', function () {
    renderSeason();
    show('season');
  });
  $('btn-season-back').addEventListener('click', function () {
    refreshHome();
    show('home');
  });
  $('btn-collection').addEventListener('click', function () {
    renderCollection();
    show('collection');
  });
  $('btn-collection-back').addEventListener('click', function () {
    refreshHome();
    show('home');
  });
  $('btn-intro-again').addEventListener('click', function () {
    startIntro(INTRO_SLIDES);
  });
  $('btn-intro-next').addEventListener('click', function () {
    introIndex++;
    if (introIndex >= introQueue.length) finishIntro();
    else renderIntro();
  });
  $('btn-intro-skip').addEventListener('click', finishIntro);

  wireBackup();
  wireBoard();
  refreshHome();
}

function boot() {
  wireUi();
  requestPersistence();
  maybeIntro();
  fetch('dict.bin')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    })
    .then(function (buf) {
      dawg = new Dawg(buf);
      $('loading').hidden = true;
      $('btn-play').disabled = false;
      $('btn-daily').disabled = false;
      $('btn-zen').disabled = false;
    })
    .catch(function (err) {
      $('loading').textContent = 'Dizionario non caricato (' + err.message + ')';
    });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
}

document.addEventListener('DOMContentLoaded', boot);
