/*
 * Small DOM-driven effects. No canvas and no library: every one of these is a
 * handful of spans with CSS custom properties driving a keyframe, cleaned up
 * on animationend.
 *
 * All of them check prefers-reduced-motion and quietly do nothing if the
 * player has asked the system for less movement.
 */

'use strict';

function fxReduced() {
  return window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* The score of a found word, rising from where the word ended. */
function fxFloatScore(holder, anchorRect, text, kind) {
  if (!holder) return;
  var box = holder.getBoundingClientRect();
  var el = document.createElement('span');
  el.className = 'fx-float ' + (kind || 'good');
  el.textContent = text;
  el.style.left = (anchorRect.left - box.left + anchorRect.width / 2) + 'px';
  el.style.top = (anchorRect.top - box.top) + 'px';
  holder.appendChild(el);
  if (fxReduced()) {
    setTimeout(function () { el.remove(); }, 400);
    return;
  }
  el.addEventListener('animationend', function () { el.remove(); });
}

/* A burst of paper. `strength` scales both count and spread. */
function fxConfetti(holder, strength) {
  if (!holder || fxReduced()) return;
  var n = Math.round(14 * (strength || 1));
  var colors = ['var(--accent)', 'var(--tile-head)', 'var(--tile)', 'var(--accent-deep)'];
  for (var i = 0; i < n; i++) {
    var c = document.createElement('span');
    c.className = 'confetto';
    var angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    var dist = (60 + Math.random() * 120) * (strength || 1);
    c.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    c.style.setProperty('--dy', (Math.sin(angle) * dist - 40) + 'px');
    c.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
    c.style.setProperty('--dur', (0.7 + Math.random() * 0.6) + 's');
    c.style.background = colors[i % colors.length];
    if (i % 3 === 0) c.style.borderRadius = '50%';
    holder.appendChild(c);
    c.addEventListener('animationend', function () { this.remove(); });
  }
}

/* Roll a number up rather than snapping it, so a big word reads as a big
   word. Falls back to setting the value directly when motion is reduced. */
function fxCountUp(el, from, to, ms) {
  if (!el) return;
  if (fxReduced() || from === to) { el.textContent = String(to); return; }
  var start = performance.now();
  var span = to - from;
  var dur = ms || 420;
  function frame(now) {
    var t = Math.min(1, (now - start) / dur);
    var eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + span * eased));
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = String(to);
  }
  requestAnimationFrame(frame);
}

/* Tiles drop in when a board is built. Staggered by position so it reads as
   one movement rather than sixteen. */
function fxTileEntrance(tiles) {
  if (!tiles) return;
  tiles.forEach(function (t, i) {
    t.classList.remove('fx-in');
    if (fxReduced()) return;
    var row = (i / 4) | 0, col = i % 4;
    t.style.animationDelay = ((row + col) * 28) + 'ms';
    void t.offsetWidth;
    t.classList.add('fx-in');
  });
}

/* A brief flare behind an element — used for a level-up or a pass tier. */
function fxCelebrate(holder, strength) {
  if (!holder) return;
  fxConfetti(holder, strength || 1.6);
  if (fxReduced()) return;
  holder.classList.remove('fx-flare');
  void holder.offsetWidth;
  holder.classList.add('fx-flare');
}
