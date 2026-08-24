/*
 * All sound is synthesised at runtime — there is not a single audio file in
 * this project, which is why the whole game still fits in a few hundred KB.
 *
 * Four packs, each a different set of oscillator settings, unlocked like any
 * other collectible. A pack is really just a waveform, a decay time and the
 * intervals of the chord a found word plays.
 */

'use strict';

var SOUND_PACKS = [
  { id: 'classico', name: 'Classico', unlock: { type: 'free' },
    wave: 'triangle', decay: 1.0,  chord: [1, 1.5],
    bad: 'sawtooth', spread: 70 },

  { id: 'campane',  name: 'Campane', unlock: { type: 'level', n: 6 },
    wave: 'sine',     decay: 2.4,  chord: [1, 1.5, 2],
    bad: 'sine',     spread: 110 },

  { id: 'legno',    name: 'Legno',   unlock: { type: 'trophy', id: 'venti' },
    wave: 'square',   decay: 0.45, chord: [1, 1.25, 1.5],
    bad: 'square',   spread: 45 },

  { id: 'arpa',     name: 'Arpa',    unlock: { type: 'level', n: 15 },
    wave: 'sawtooth', decay: 1.7,  chord: [1, 1.25, 1.5, 2],
    bad: 'triangle', spread: 60 }
];

var Sound = {
  ctx: null,

  /* Off, quiet, medium, loud. Four steps beat a checkbox for someone who
     plays in a quiet room in the evening. */
  LEVELS: [0, 0.07, 0.15, 0.26],
  volume: 2,
  packId: 'classico',

  pack: function () {
    for (var i = 0; i < SOUND_PACKS.length; i++) {
      if (SOUND_PACKS[i].id === this.packId) return SOUND_PACKS[i];
    }
    return SOUND_PACKS[0];
  },

  gain: function () { return this.LEVELS[this.volume] || 0; },

  ensure: function () {
    if (!this.ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) this.ctx = new C();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  /* One note. `mul` scales against the current volume setting. */
  note: function (freq, dur, wave, mul, delay) {
    if (this.volume === 0) return;
    var ctx = this.ensure();
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var peak = Math.max(0.0002, this.gain() * (mul === undefined ? 1 : mul));

    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = wave || this.pack().wave;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  },

  /* A found word. Longer words start higher, and a run of them climbs a
     semitone at a time — the escalation is most of why it feels good. */
  good: function (len, streak) {
    var p = this.pack();
    var step = Math.min(streak || 0, 8);
    var base = 392 * Math.pow(2, (Math.min(len, 9) - 3) / 12)
                   * Math.pow(2, step / 12);
    var self = this;
    p.chord.forEach(function (mult, i) {
      self.note(base * mult, 0.10 + p.decay * 0.10, p.wave,
                1 - i * 0.12, i * (p.spread / 1000));
    });
  },

  bad: function () {
    var p = this.pack();
    this.note(150, 0.16, p.bad, 0.6);
    this.note(120, 0.20, p.bad, 0.45, 0.05);
  },

  dupe: function () { this.note(330, 0.10, 'sine', 0.5); },

  /* Very quiet: this fires on every tile the finger crosses. */
  tap: function (n) {
    this.note(520 + (n % 8) * 26, 0.035, 'sine', 0.22);
  },

  tick: function () { this.note(880, 0.05, 'square', 0.3); },

  start: function () {
    var p = this.pack();
    this.note(392, 0.12, p.wave, 0.6);
    this.note(523, 0.16, p.wave, 0.6, 0.09);
  },

  over: function () {
    var p = this.pack(), self = this;
    [660, 523, 415, 330].forEach(function (n, i) {
      self.note(n, 0.24, p.wave, 0.75, i * 0.14);
    });
  },

  /* Reserved for a personal best or a pass tier. */
  fanfare: function () {
    var p = this.pack(), self = this;
    [523, 659, 784, 1047].forEach(function (n, i) {
      self.note(n, 0.26, p.wave, 0.9, i * 0.11);
    });
  },

  /* Bigger, and distinct from a tier so a level-up is unmistakable. */
  levelUp: function () {
    var p = this.pack(), self = this;
    [523, 659, 784, 1047, 1319].forEach(function (n, i) {
      self.note(n, 0.30, p.wave, 0.95, i * 0.10);
    });
    setTimeout(function () {
      self.note(1047, 0.5, p.wave, 0.7);
      self.note(1319, 0.5, p.wave, 0.55);
      self.note(1568, 0.5, p.wave, 0.45);
    }, 560);
  },

  /* The board refreshing under her in Infinito. */
  refresh: function () {
    var p = this.pack(), self = this;
    [440, 587, 740].forEach(function (n, i) {
      self.note(n, 0.14, p.wave, 0.6, i * 0.05);
    });
  }
};
