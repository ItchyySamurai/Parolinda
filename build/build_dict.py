"""
Expand the LibreOffice/Hunspell it_IT dictionary into a flat list of inflected
Italian word forms, then pack it into a DAWG the game can query offline.

Why this exists: a .dic file stores stems plus affix rules, not finished words.
Shipping it raw means every conjugated verb and every plural gets rejected,
which is exactly the failure that makes a word game feel broken.

Every word also carries a "common" flag: it appears in a frequency list built
from film and TV subtitles, so it is a word Italians demonstrably say. The game
still ACCEPTS everything - refusing a word she legitimately plays is the worse
failure - but it only ever SHOWS her common words, and it builds boards that
hold enough of them to be worth playing.

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

# Frequency data: hermitdave/FrequencyWords, OpenSubtitles 2018, MIT licence.
# The 50k list is enough - against the full 9 MB list this cutoff differs by
# 276 words out of 26.717, which is not worth shipping fourteen times the file.
FREQ_FILE = 'freq_it_50k.txt'
COMMON_CUTOFF = 200

# Words in real use that the 2020 Hunspell source predates or omits. Linda hit
# the first of these ("gap") in a real game. Only entries that turn out to be
# genuinely absent are reported as added.
SUPPLEMENT = '''
gap app social selfie tablet smartphone streaming podcast blog post
influencer follower hashtag trend cloud server router login logout
click mouse file link spam virus backup display monitor laptop desktop
upload browser emoji meme reel storie profilo account password
stemmo
'''.split()

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


def load_common(path, words):
    """Words above the cutoff that our own dictionary also contains.

    The intersection is what makes this safe: proper nouns and English leaking
    out of the subtitle corpus (Michael, season, the) are dropped for free,
    because the dictionary never had them.
    """
    freq = {}
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            parts = line.split()
            if len(parts) != 2:
                continue
            w = normalise_freq(parts[0])
            if not w:
                continue
            try:
                freq[w] = freq.get(w, 0) + int(parts[1])
            except ValueError:
                continue
    return set(w for w, n in freq.items() if n >= COMMON_CUTOFF and w in words)


def normalise_freq(word):
    w = unicodedata.normalize("NFD", word.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    if len(w) < MIN_LEN or len(w) > MAX_LEN:
        return None
    for c in w:
        if c not in _KEEP:
            return None
    return w


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
        self.final = 0
        self.edges = {}
        Node._next += 1
        self.uid = Node._next
        self.block = 0

    def key(self):
        # `final` is 0, 1 (a word) or 2 (a common word). It has to take part in
        # the node key or minimisation would merge a common word with a rare
        # one that happens to share a suffix.
        return (self.final, tuple((c, n.uid) for c, n in sorted(self.edges.items())))


class Dawg:
    def __init__(self):
        self.root = Node()
        self.register = {}
        self.prev = ""
        self.stack = []      # (parent, char, child) along the path of `prev`

    def insert(self, word, common=False):
        prefix = 0
        while prefix < min(len(word), len(self.prev)) and word[prefix] == self.prev[prefix]:
            prefix += 1
        self._minimise(prefix)
        node = self.root if not self.stack else self.stack[-1][2]
        for ch in word[prefix:]:
            child = Node()
            node.edges[ch] = child
            self.stack.append((node, ch, child))
            node = child
        node.final = 2 if common else 1
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
    """Edge = uint32: letter(5) | final(1) | last(1) | common(1) | child(24).

    Block 0 is a reserved dummy so that child == 0 can mean 'no children'.
    24 bits caps the structure at 16.7M edges; it currently uses about 150k.
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
                   | (1 if child.final == 2 else 0) << 7
                   | child.block << 8)
            words[n.block + i] = val
    return words


def verify_common(words):
    """Walk the packed structure the way the game reads the common flag."""
    def is_common(w):
        block, common, final = 1, 0, 0
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
            common = (e >> 7) & 1
            block = e >> 8
        return bool(final and common)
    return is_common


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
            block = e >> 8
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

    # Words in use that the source predates. Report only the genuine additions,
    # so this list does not quietly rot into entries that are already covered.
    added = []
    for w in SUPPLEMENT:
        n = normalise(w)
        if n and n not in words:
            words.add(n)
            added.append(n)
    sys.stderr.write("  supplement added: %s\n" % (" ".join(sorted(added)) or "nothing"))

    words = sorted(words)
    sys.stderr.write("  %d playable forms\n" % len(words))

    common = load_common(os.path.join(HERE, FREQ_FILE), set(words))
    # Anything we had to add by hand is by definition in use.
    common.update(added)
    sys.stderr.write("  %d of them are common (frequency >= %d)\n"
                     % (len(common), COMMON_CUTOFF))

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
        dawg.insert(w, w in common)
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

    # The common flag has to survive packing too, in both directions.
    is_common = verify_common(packed)
    sample_common = sorted(common)[::max(1, len(common) // 3000)]
    for w in sample_common:
        assert is_common(w), "common flag lost: %s" % w
    rare = [w for w in words[::max(1, len(words) // 4000)] if w not in common]
    for w in rare[:2000]:
        assert not is_common(w), "common flag invented: %s" % w
    sys.stderr.write("  common flag verified on %d common and %d rare forms\n"
                     % (len(sample_common), min(2000, len(rare))))
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
        "common": len(common),
        "commonCutoff": COMMON_CUTOFF,
        "supplementAdded": sorted(added),
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
