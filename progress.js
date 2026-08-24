/*
 * Levels, trophies and the day diary.
 *
 * One rule governs this whole file: everything only ever goes up. Nothing
 * expires, nothing is lost by not playing for a week, and there is no streak
 * to break. The point is to give her something that accumulates, not a reason
 * to feel behind.
 *
 * Depends on Store from game.js. Nothing here runs at load time, so script
 * order does not matter.
 */

'use strict';

/* Points are cumulative across every game ever played, and the ladder is
   deliberately long: at a few hundred points a round, level 2 lands after a
   couple of games, level 10 after a few weeks, and level 30 after well over a
   year of steady play. She plays a lot, so the ceiling should stay out of
   reach for a long time. */
var LEVELS = [
  { n: 1,  at: 0,       name: 'Curiosa' },
  { n: 2,  at: 400,     name: 'Attenta' },
  { n: 3,  at: 1000,    name: 'Volenterosa' },
  { n: 4,  at: 1900,    name: 'Appassionata' },
  { n: 5,  at: 3200,    name: 'Costante' },
  { n: 6,  at: 5000,    name: 'Abile' },
  { n: 7,  at: 7400,    name: 'Svelta' },
  { n: 8,  at: 10500,   name: 'Acuta' },
  { n: 9,  at: 14500,   name: 'Esperta' },
  { n: 10, at: 19500,   name: 'Sagace' },
  { n: 11, at: 25500,   name: 'Instancabile' },
  { n: 12, at: 32500,   name: 'Raffinata' },
  { n: 13, at: 41000,   name: 'Sapiente' },
  { n: 14, at: 51000,   name: 'Maestra delle parole' },
  { n: 15, at: 62500,   name: 'Custode del vocabolario' },
  { n: 16, at: 76000,   name: 'Tessitrice di lettere' },
  { n: 17, at: 91500,   name: 'Cercatrice d’oro' },
  { n: 18, at: 109000,  name: 'Campionessa' },
  { n: 19, at: 129000,  name: 'Virtuosa' },
  { n: 20, at: 151000,  name: 'Fuoriclasse' },
  { n: 21, at: 176000,  name: 'Cacciatrice di parole' },
  { n: 22, at: 204000,  name: 'Signora delle sillabe' },
  { n: 23, at: 235000,  name: 'Alchimista delle lettere' },
  { n: 24, at: 269000,  name: 'Memoria di ferro' },
  { n: 25, at: 307000,  name: 'Enciclopedia vivente' },
  { n: 26, at: 349000,  name: 'Oracolo delle parole' },
  { n: 27, at: 395000,  name: 'Custode dei dizionari' },
  { n: 28, at: 445000,  name: 'Gran Maestra' },
  { n: 29, at: 500000,  name: 'Leggenda delle parole' },
  { n: 30, at: 560000,  name: 'Regina delle parole' }
];

function levelFor(points) {
  var cur = LEVELS[0];
  for (var i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].at) cur = LEVELS[i];
  }
  var next = null;
  for (var j = 0; j < LEVELS.length; j++) {
    if (LEVELS[j].at > points) { next = LEVELS[j]; break; }
  }
  var into = points - cur.at;
  var span = next ? (next.at - cur.at) : 0;
  return {
    level: cur,
    next: next,
    into: into,
    span: span,
    toNext: next ? (next.at - points) : 0,
    pct: next ? Math.max(0, Math.min(100, Math.round(into * 100 / span))) : 100
  };
}

/*
 * Trophies. `timed` marks the ones that only make sense against a clock —
 * without it, Senza fretta would hand out every score trophy on day one.
 */
var TROPHIES = [
  { id: 'prima',       icon: '✦', name: 'Prima parola',
    desc: 'Trova la tua prima parola',
    test: function (c) { return c.words >= 1; } },

  { id: 'lunga',       icon: '✧', name: 'Parola lunga',
    desc: 'Trova una parola di 8 lettere',
    test: function (c) { return c.longest >= 8; } },

  { id: 'parolona',    icon: '❋', name: 'Parolona',
    desc: 'Trova una parola di 10 lettere',
    test: function (c) { return c.longest >= 10; } },

  { id: 'venti',       icon: '❍', name: 'Venti parole',
    desc: 'Trova 20 parole in una partita',
    test: function (c) { return c.words >= 20; } },

  { id: 'trenta',      icon: '❈', name: 'Trenta parole',
    desc: 'Trova 30 parole in una partita',
    test: function (c) { return c.words >= 30; } },

  { id: 'cento',       icon: '★', name: 'Cento punti', timed: true,
    desc: '100 punti in una partita a tempo',
    test: function (c) { return c.score >= 100; } },

  { id: 'trecento',    icon: '★', name: 'Trecento punti', timed: true,
    desc: '300 punti in una partita a tempo',
    test: function (c) { return c.score >= 300; } },

  { id: 'cinquecento', icon: '★', name: 'Cinquecento punti', timed: true,
    desc: '500 punti in una partita a tempo',
    test: function (c) { return c.score >= 500; } },

  { id: 'sfida',       icon: '◆', name: 'Sfida migliorata',
    desc: 'Migliora il tuo risultato nella sfida del giorno',
    test: function (c) { return c.mode === 'daily' && c.beatIt && c.prevBest > 0; } },

  { id: 'calma',       icon: '❀', name: 'Con calma',
    desc: 'Finisci una partita senza fretta',
    test: function (c) { return c.mode === 'zen' && c.words >= 1; } },

  { id: 'settimana',   icon: '☀', name: 'Una settimana',
    desc: 'Gioca in 7 giorni diversi',
    test: function (c) { return c.daysPlayed >= 7; } },

  { id: 'mese',        icon: '☾', name: 'Un mese',
    desc: 'Gioca in 30 giorni diversi',
    test: function (c) { return c.daysPlayed >= 30; } },

  { id: 'mille',       icon: '❖', name: 'Mille parole',
    desc: 'Trova 1000 parole in tutto',
    test: function (c) { return c.totalWords >= 1000; } }
];

function loadTrophies() { return Store.get('trophies', {}); }

/* Returns the trophies earned by this round, and records them. */
function awardTrophies(ctx) {
  var have = loadTrophies();
  var fresh = [];
  TROPHIES.forEach(function (t) {
    if (have[t.id]) return;
    if (t.timed && ctx.mode === 'zen') return;
    var ok = false;
    try { ok = t.test(ctx); } catch (e) { ok = false; }
    if (ok) {
      have[t.id] = ctx.date;
      fresh.push(t);
    }
  });
  if (fresh.length) Store.set('trophies', have);
  return fresh;
}

/* ------------------------------------------------------------- day diary */

function loadPlayedDates() { return Store.get('playedDates', {}); }

function recordDay(dateKey) {
  var d = loadPlayedDates();
  d[dateKey] = (d[dateKey] || 0) + 1;
  Store.set('playedDates', d);
  return d;
}

function daysPlayedCount() { return Object.keys(loadPlayedDates()).length; }

/*
 * A month of the diary, weeks starting Monday as they do on an Italian
 * calendar. `blank` cells pad the first row.
 */
function calendarMonth(year, month) {
  var first = new Date(year, month, 1);
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var offset = (first.getDay() + 6) % 7;          // Sunday is 0 in JS
  var played = loadPlayedDates();
  var cells = [];

  for (var b = 0; b < offset; b++) cells.push({ blank: true });

  for (var d = 1; d <= daysInMonth; d++) {
    var key = year + '-' + pad2(month + 1) + '-' + pad2(d);
    var daily = Store.get('daily.' + key, 0);
    cells.push({
      day: d,
      date: key,
      daily: daily,
      played: !!played[key],
      today: key === todayKey()
    });
  }

  var label;
  try {
    label = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  } catch (e) {
    label = (month + 1) + '/' + year;
  }
  return { label: label, cells: cells, year: year, month: month };
}
