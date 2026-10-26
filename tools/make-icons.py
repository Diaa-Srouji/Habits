#!/usr/bin/env python3
"""Draws the app icon as PNGs (same artwork as public/icon.svg). Needs: pip install pillow
   python3 tools/make-icons.py
Writes into public/:  icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = '#14213D'
# (x, y, colour) of the 9 tiles, each 76x76 with radius 14, on a 512x512 canvas (taken from icon.svg)
TILES = [(96,96,'#1A9850'),(218,96,'#A6D96A'),(340,96,'#1A9850'),
         (96,218,'#006837'),(218,218,'#1A9850'),(340,218,'#A6D96A'),
         (96,340,'#FEE08B'),(218,340,'#006837'),(340,340,'#1A9850')]
OUT = Path(__file__).resolve().parent.parent / 'public'
SS = 4  # draw at 4x and shrink for smooth edges

def draw(size, rounded, scale=1.0):
    s = size * SS
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = s / 512
    if rounded: d.rounded_rectangle([0, 0, s - 1, s - 1], radius=110 * k, fill=BG)
    else: d.rectangle([0, 0, s, s], fill=BG)
    c = 256  # shrink the artwork around the centre (used for the maskable icon's safe zone)
    for x, y, col in TILES:
        x0, y0 = c + (x - c) * scale, c + (y - c) * scale
        w = 76 * scale
        d.rounded_rectangle([x0 * k, y0 * k, (x0 + w) * k, (y0 + w) * k], radius=14 * scale * k, fill=col)
    return im.resize((size, size), Image.LANCZOS)

draw(192, True).save(OUT / 'icon-192.png', optimize=True)
draw(512, True).save(OUT / 'icon-512.png', optimize=True)
# Maskable: full-bleed background, artwork kept inside the central 80% circle so any OS mask shape is safe
draw(512, False, 0.85).save(OUT / 'icon-maskable-512.png', optimize=True)
# iOS applies its own rounded mask and dislikes transparency
draw(180, False, 1.0).convert('RGB').save(OUT / 'apple-touch-icon.png', optimize=True)
print('icons written to', OUT)
