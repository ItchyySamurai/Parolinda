"""
Expand the LibreOffice/Hunspell it_IT dictionary into a flat list of inflected
Italian word forms, then pack it into a DAWG the game can query offline.

Why this exists: a .dic file stores stems plus affix rules, not finished words.
Shipping it raw means every conjugated verb and every plural gets rejected,
which is exactly the failure that makes a word game feel broken.

Outputs:
  ../dict.bin       packed DAWG (uint32 edges, little-endian)
  ./words.txt       expanded list, for eyeballing only
  ./stats.json      letter frequencies + counts
"""

import json
import os
import re
import struct
import sys
import unicodedata
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..")          # the repo root is the site

# The board only ever shows these. J K W X Y are not Italian letters, so any
# word needing one is unfindable and only bloats the file.
ALPHABET = "abcdefghilmnopqrstuvz"
LETTER_INDEX = {c: i for i, c in enumerate(ALPHABET)}

# 2-letter forms are 60% unit symbols (mq, cl, hg, dm) in this source, and a
# player can farm them by tapping adjacent pairs at random. Not worth the ~35
# real words they'd bring with them.
MIN_LEN = 3
MAX_LEN = 16  # a 4x4 board has 16 tiles; nothing longer is reachable

# Findable band: the lengths a player actually reaches in a timed round. Used
# for the tile distribution, so the board isn't shaped by 16-letter inflections.
BAND = (3, 8)

_ROMAN = re.compile(r"^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$")


# ---------------------------------------------------------------- affix file

class Rule:
    __slots__ = ("strip", "add", "cond", "cont")

    def __init__(self, strip, add, cond, cont):
        self.strip = strip
        self.add = add
        self.cond = cond
        self.cont = cont


def parse_aff(path):
    """Returns (sfx, pfx, cross) keyed by single-char flag."""
    sfx, pfx, cross = {}, {}, {}
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()

    i = 0
    while i < len(lines):
        parts = lines[i].split()
        i += 1
        if len(parts) < 4 or parts[0] not in ("SFX", "PFX"):
            continue
        kind, flag, xprod, count = parts[0], parts[1], parts[2], parts[3]
        if not count.isdigit():
            continue
        cross[flag] = (xprod.upper() == "Y")
        table = sfx if kind == "SFX" else pfx
        bucket = table.setdefault(flag, [])
        for _ in range(int(count)):
            if i >= len(lines):
                break
            row = lines[i].split()
            i += 1
            if len(row) < 4 or row[0] != kind or row[1] != flag:
                continue
            strip = "" if row[2] == "0" else row[2]
            add = row[3]
            cont = ""
            if "/" in add:                       # continuation flags
                add, cont = add.split("/", 1)
            if add == "0":
                add = ""
            cond = row[4] if len(row) > 4 else "."
            if cond == ".":
                rx = None
            elif kind == "SFX":
                rx = re.compile(cond + "$")
            else:
                rx = re.compile("^" + cond)
            bucket.append(Rule(strip, add, rx, cont))
    return sfx, pfx, cross


def apply_sfx(word, rule):
    if rule.cond is not None and not rule.cond.search(word):
        return None
    if rule.strip:
        if not word.endswith(rule.strip):
            return None
        return word[: -len(rule.strip)] + rule.add
    return word + rule.add


def apply_pfx(word, rule):
    if rule.cond is not None and not rule.cond.match(word):
        return None
    if rule.strip:
        if not word.startswith(rule.strip):
            return None
        return rule.add + word[len(rule.strip):]
    return rule.add + word


# ---------------------------------------------------------------- dic file

def parse_dic(path):
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    out = []
    for line in lines[1:]:                       # line 0 is the entry count
        line = line.strip()
        # This file embeds its licence header as lines beginning with '/'.
        if not line or line.startswith("/") or line.startswith("#"):
            continue
        line = line.split("\t")[0].strip()       # drop morphological fields
        if not line:
            continue
        m = re.match(r"^((?:[^/\\]|\\.)+)(?:/(\S*))?$", line)
        if not m:
            continue
        word = m.group(1).replace("\\/", "/")
        flags = m.group(2) or ""
        out.append((word, flags))
    return out


# ---------------------------------------------------------------- normalise

_KEEP = set(ALPHABET)


def normalise(word):
    """Fold accents to base letters so tracing C-I-T-T-A finds 'citta'.

    Returns None for anything the board could never spell.
    """
    if word[:1].isupper():                       # proper nouns, acronyms
        return None
    w = unicodedata.normalize("NFD", word.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    if not w or len(w) < MIN_LEN or len(w) > MAX_LEN:
        return None
    for c in w:
        if c not in _KEEP:
            return None
    if _ROMAN.match(w):                          # clv, lvi, mcv, iii ...
        return None
    return w


# ---------------------------------------------------------------- expansion

def expand(entries, sfx, pfx, cross):
    forms = set()
    dropped_cont = 0

    for word, flags in entries:
        forms.add(word)
        sfx_flags = [f for f in flags if f in sfx]
        pfx_flags = [f for f in flags if f in pfx]

        suffixed = []
        for f in sfx_flags:
            for rule in sfx[f]:
                r = apply_sfx(word, rule)
                if r is None:
                    continue
                forms.add(r)
                if rule.cont:
                    dropped_cont += 1
                if cross.get(f, False):
                    suffixed.append(r)

        for f in pfx_flags:
            for rule in pfx[f]:
                r = apply_pfx(word, rule)
                if r is not None:
                    forms.add(r)
                if cross.get(f, False):
                    for s in suffixed:
                        r2 = apply_pfx(s, rule)
                        if r2 is not None:
                            forms.add(r2)

    return forms, dropped_cont


# ---------------------------------------------------------------- DAWG

class Node:
    __slots__ = ("final", "edges", "uid", "block")
    _next = 0

    def __init__(self):
        self.final = False
        self.edges = {}
        Node._next += 1
        self.uid = Node._next
        self.block = 0

    def key(self):
        return (self.final, tuple((c, n.uid) for c, n in sorted(self.edges.items())))


class Dawg:
    def __init__(self):
        self.root = Node()
        self.register = {}
        self.prev = ""
        self.stack = []      # (parent, char, child) along the path of `prev`

    def insert(self, word):
        common = 0
        while common < min(len(word), len(self.prev)) and word[common] == self.prev[common]:
            common += 1
        self._minimise(common)
        node = self.root if not self.stack else self.stack[-1][2]
        for ch in word[common:]:
            child = Node()
            node.edges[ch] = child
            self.stack.append((node, ch, child))
            node = child
        node.final = True
        self.prev = word

    def _minimise(self, down_to):
        while len(self.stack) > down_to:
            parent, ch, child = self.stack.pop()
            k = child.key()
            found = self.register.get(k)
            if found is not None:
                parent.edges[ch] = found
            else:
                self.register[k] = child

    def finish(self):
        self._minimise(0)
        k = self.root.key()
        self.register.setdefault(k, self.root)


def serialise(dawg):
    """Edge = uint32: letter(5) | final(1) | last(1) | childBlock(25).

    Block 0 is a reserved dummy so childBlock == 0 can mean 'no children'.
    """
    nodes, seen = [], set()
    stack = [dawg.root]
    while stack:
        n = stack.pop()
        if id(n) in seen:
            continue
        seen.add(id(n))
        nodes.append(n)
        for c in n.edges.values():
            if id(c) not in seen:
                stack.append(c)

    nodes.sort(key=lambda n: (n is not dawg.root, n.uid))
    assert nodes[0] is dawg.root

    cursor = 1                                   # slot 0 reserved
    for n in nodes:
        if n.edges:
            n.block = cursor
            cursor += len(n.edges)
        else:
            n.block = 0

    words = [0] * cursor
    for n in nodes:
        if not n.edges:
            continue
        items = sorted(n.edges.items())
        for i, (ch, child) in enumerate(items):
            last = 1 if i == len(items) - 1 else 0
            val = (LETTER_INDEX[ch]
                   | (1 if child.final else 0) << 5
                   | last << 6
                   | child.block << 7)
            words[n.block + i] = val
    return words


def verify(words, sample):
    """Walk the packed structure exactly as the game will."""
    def contains(w):
        block = 1                                # root
        for ch in w:
            if block == 0:
                return False
            li = LETTER_INDEX.get(ch)
            if li is None:
                return False
            i, found = block, False
            while True:
                e = words[i]
                if (e & 31) == li:
                    found = True
                    break
                if (e >> 6) & 1:
                    break
                i += 1
            if not found:
                return False
            final = (e >> 5) & 1
            block = e >> 7
        return bool(final)
    return contains


# ---------------------------------------------------------------- main

def main():
    aff = os.path.join(HERE, "it_IT.aff")
    dic = os.path.join(HERE, "it_IT.dic")

    sys.stderr.write("parsing affix rules...\n")
    sfx, pfx, cross = parse_aff(aff)
    entries = parse_dic(dic)
    sys.stderr.write("  %d stems, %d suffix classes, %d prefix classes\n"
                     % (len(entries), len(sfx), len(pfx)))

    sys.stderr.write("expanding...\n")
    raw, cont = expand(entries, sfx, pfx, cross)
    sys.stderr.write("  %d raw forms (%d had continuation flags, applied once)\n"
                     % (len(raw), cont))

    sys.stderr.write("normalising...\n")
    words = set()
    for w in raw:
        n = normalise(w)
        if n:
            words.add(n)
    words = sorted(words)
    sys.stderr.write("  %d playable forms\n" % len(words))

    # Every word the roman-numeral filter took out, so a real word going
    # missing shows up here instead of silently.
    culled = sorted({normalise(w.lower()) or w.lower() for w in raw
                     if _ROMAN.match(unicodedata.normalize("NFKD", w.lower()))
                     and MIN_LEN <= len(w) <= MAX_LEN and not w[:1].isupper()})
    sys.stderr.write("  roman-numeral filter removed: %s\n" % (" ".join(culled) or "nothing"))

    # Tile distribution: per-word presence across the findable band, so a
    # letter that appears twice in one word doesn't count twice.
    band = Counter()
    band_words = 0
    for w in words:
        if BAND[0] <= len(w) <= BAND[1]:
            band.update(set(w))
            band_words += 1
    band_total = sum(band.values())

    freq = Counter()
    for w in words:
        freq.update(w)
    total = sum(freq.values())

    sys.stderr.write("building DAWG...\n")
    dawg = Dawg()
    for w in words:
        dawg.insert(w)
    dawg.finish()
    packed = serialise(dawg)
    sys.stderr.write("  %d edges (%.2f MB)\n" % (len(packed), len(packed) * 4 / 1048576))

    sys.stderr.write("verifying against the packed bytes...\n")
    contains = verify(packed, words)
    step = max(1, len(words) // 20000)
    checked = 0
    for w in words[::step]:
        assert contains(w), "false negative: %s" % w
        checked += 1
    for bad in ("qqqq", "zzzz", "abcdz", "aaaaaa", "xyz"):
        assert not contains(bad), "false positive: %s" % bad
    # Prefixes of real words must not read as words unless they are words.
    assert contains("casa") and contains("case")
    sys.stderr.write("  %d sampled forms round-tripped\n" % checked)

    os.makedirs(APP, exist_ok=True)
    with open(os.path.join(APP, "dict.bin"), "wb") as fh:
        fh.write(struct.pack("<%dI" % len(packed), *packed))
    with open(os.path.join(HERE, "words.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(words))
    stats = {
        "words": len(words),
        "edges": len(packed),
        "bandWords": band_words,
        "tileDistribution": {c: round(band[c] / band_total, 6) for c in ALPHABET},
        "letterFrequency": {c: round(freq[c] / total, 6) for c in ALPHABET},
        "byLength": {str(n): sum(1 for w in words if len(w) == n) for n in range(MIN_LEN, MAX_LEN + 1)},
        "romanCulled": culled,
    }
    with open(os.path.join(HERE, "stats.json"), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, indent=2, ensure_ascii=False)
    print(json.dumps(stats, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
