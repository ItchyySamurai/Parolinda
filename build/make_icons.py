"""Generate the PWA icons without an image library.

Signed-distance rounded rectangles, antialiased by smoothstepping the distance,
written out through a minimal PNG encoder. Chrome needs 192 and 512 PNGs in the
manifest before it will offer 'Install app'.
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")

BG = (0x10, 0x18, 0x15)
TILE = (0xee, 0xf2, 0xe9)
ACCENT = (0x7f, 0xc7, 0x9b)


def rounded_rect_sd(px, py, cx, cy, hw, hh, r):
    dx = abs(px - cx) - (hw - r)
    dy = abs(py - cy) - (hh - r)
    ox, oy = max(dx, 0.0), max(dy, 0.0)
    return (ox * ox + oy * oy) ** 0.5 + min(max(dx, dy), 0.0) - r


def monogram_sd(px, py, cx, cy, size):
    """An L built from two bars — no font needed, and it stays crisp small.

    Returns the union (minimum) of the stem and the foot.
    """
    w = size * 0.52          # overall width of the letter
    h = size * 0.68          # overall height
    bar = size * 0.165       # stroke thickness
    left = cx - w / 2.0
    top = cy - h / 2.0

    stem = rounded_rect_sd(px, py, left + bar / 2.0, cy,
                           bar / 2.0, h / 2.0, bar * 0.22)
    foot = rounded_rect_sd(px, py, left + w / 2.0, top + h - bar / 2.0,
                           w / 2.0, bar / 2.0, bar * 0.22)
    return min(stem, foot)


def smoothstep(edge0, edge1, x):
    t = (x - edge0) / (edge1 - edge0)
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return t * t * (3.0 - 2.0 * t)


def blend(dst, src, a):
    return tuple(int(round(d + (s - d) * a)) for d, s in zip(dst, src))


def render(size, maskable):
    """Returns a flat RGBA bytearray."""
    # A maskable icon can be cropped to a circle, so keep the board inside the
    # safe zone and let the background bleed to the edges.
    inset = 0.30 if maskable else 0.18
    corner = size * (0.5 if maskable else 0.22)

    board = size * (1.0 - 2 * inset)
    gap = board * 0.085
    cell = (board - gap) / 2.0
    x0 = size * inset
    y0 = size * inset

    px = bytearray(size * size * 4)
    aa = size / 220.0                      # antialias width, scales with size

    for y in range(size):
        fy = y + 0.5
        row = y * size * 4
        for x in range(size):
            fx = x + 0.5

            if maskable:
                col, alpha = BG, 1.0
            else:
                d = rounded_rect_sd(fx, fy, size / 2.0, size / 2.0,
                                    size / 2.0, size / 2.0, corner)
                alpha = 1.0 - smoothstep(-aa, aa, d)
                col = BG

            for i in range(2):
                for j in range(2):
                    cx = x0 + i * (cell + gap) + cell / 2.0
                    cy = y0 + j * (cell + gap) + cell / 2.0
                    d = rounded_rect_sd(fx, fy, cx, cy, cell / 2.0, cell / 2.0,
                                        cell * 0.22)
                    cov = 1.0 - smoothstep(-aa, aa, d)
                    if cov > 0.0:
                        want = ACCENT if (i == 0 and j == 0) else TILE
                        col = blend(col, want, cov)
                        if alpha < cov:
                            alpha = cov
                        # Linda's initial, on the accent tile.
                        if i == 0 and j == 0:
                            dl = monogram_sd(fx, fy, cx, cy, cell)
                            lcov = (1.0 - smoothstep(-aa, aa, dl)) * cov
                            if lcov > 0.0:
                                col = blend(col, BG, lcov)

            o = row + x * 4
            px[o] = col[0]
            px[o + 1] = col[1]
            px[o + 2] = col[2]
            px[o + 3] = int(round(alpha * 255))
    return px


def write_png(path, size, px):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)                       # filter type 0
        raw += px[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [("icon-192.png", 192, False),
            ("icon-512.png", 512, False),
            ("icon-maskable-512.png", 512, True),
            ("apple-touch-icon.png", 180, True)]
    for name, size, maskable in jobs:
        path = os.path.join(OUT, name)
        write_png(path, size, render(size, maskable))
        print("%-26s %6d bytes" % (name, os.path.getsize(path)))


if __name__ == "__main__":
    main()
