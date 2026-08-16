/*
 * Reader for the packed dictionary produced by build/build_dict.py.
 *
 * The file is a flat Uint32Array of edges. Each node owns a contiguous run of
 * edges; the run ends at the edge whose LAST bit is set. Slot 0 is a reserved
 * dummy so that a child block of 0 unambiguously means "no children", which
 * lets a leaf be encoded without a block of its own.
 *
 *   bits  0-4   letter index into ALPHABET
 *   bit   5     the node this edge leads to terminates a word
 *   bit   6     last edge of this node's run
 *   bits  7-31  block index of the node this edge leads to
 */

var ALPHABET = 'abcdefghilmnopqrstuvz';

var LETTER_INDEX = (function () {
  var m = Object.create(null);
  for (var i = 0; i < ALPHABET.length; i++) m[ALPHABET[i]] = i;
  return m;
})();

var ROOT_BLOCK = 1;

function Dawg(buffer) {
  this.edges = new Uint32Array(buffer);
}

/* Returns the edge word, or -1 when this node has no edge for that letter. */
Dawg.prototype.edge = function (block, letterIndex) {
  if (block === 0) return -1;
  var e = this.edges;
  for (var i = block; ; i++) {
    var v = e[i];
    if ((v & 31) === letterIndex) return v;
    if ((v >>> 6) & 1) return -1;
  }
};

Dawg.prototype.has = function (word) {
  var block = ROOT_BLOCK, final = 0;
  for (var i = 0; i < word.length; i++) {
    var li = LETTER_INDEX[word[i]];
    if (li === undefined) return false;
    var v = this.edge(block, li);
    if (v === -1) return false;
    final = (v >>> 5) & 1;
    block = v >>> 7;
  }
  return final === 1;
};

/*
 * Every word reachable on a 4x4 board, with the highest-scoring path for each.
 * Walked against the DAWG so a dead prefix prunes the whole subtree — without
 * that this is 12 million paths, with it a handful of milliseconds.
 */
Dawg.prototype.solveBoard = function (board, minLen, scoreFn) {
  var found = new Map();
  var edges = this.edges;
  var path = [];
  var letters = board.letters;
  var self = this;

  function walk(cell, used, block, len) {
    var li = LETTER_INDEX[letters[cell]];
    var v = self.edge(block, li);
    if (v === -1) return;

    path[len] = cell;
    len++;
    used |= (1 << cell);

    if (((v >>> 5) & 1) && len >= minLen) {
      var word = '';
      for (var k = 0; k < len; k++) word += letters[path[k]];
      var s = scoreFn(board, path.slice(0, len));
      var prev = found.get(word);
      if (prev === undefined || s > prev.score) {
        found.set(word, { score: s, path: path.slice(0, len) });
      }
    }

    var next = v >>> 7;
    if (next !== 0 && len < 16) {
      var nb = NEIGHBOURS[cell];
      for (var i = 0; i < nb.length; i++) {
        var n = nb[i];
        if ((used & (1 << n)) === 0) walk(n, used, next, len);
      }
    }
  }

  for (var c = 0; c < 16; c++) walk(c, 0, ROOT_BLOCK, 0);
  return found;
};

/* Precomputed adjacency for a 4x4 grid, including diagonals. */
var NEIGHBOURS = (function () {
  var out = [];
  for (var i = 0; i < 16; i++) {
    var r = (i / 4) | 0, c = i % 4, list = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) list.push(nr * 4 + nc);
      }
    }
    out.push(list);
  }
  return out;
})();
