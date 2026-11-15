"""Step 2: download the public preview PNGs and turn their colours back into interferometric phase.

The previews are drawn with matplotlib's cyclic 'twilight' colour map. Every data pixel matches one of its
510 native colours exactly, so a lookup table (twilight510.json) recovers the phase without any search.
"""
import json
import os

import numpy as np
from PIL import Image

from .search import http_get

LUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'twilight510.json')
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
ZERO_PHASE_RGB = (47 << 16) | (19 << 8) | 55     # the zero-phase colour doubles as fill inside the frame


def download(pair, cache_dir, ctx, offline=False):
    """Fetch one preview into the cache (atomic write). Returns (path, bytes downloaded)."""
    dst = os.path.join(cache_dir, pair['granule'] + '_LATLON.png')
    if os.path.exists(dst) and os.path.getsize(dst) > 10000:
        return dst, 0
    if offline:
        raise FileNotFoundError('not in cache and --offline given: ' + dst)
    data = http_get(pair['url'], ctx)
    if data[:8] != PNG_MAGIC:
        raise RuntimeError('not a PNG: ' + pair['url'])
    with open(dst + '.part', 'wb') as fh:
        fh.write(data)
    os.replace(dst + '.part', dst)
    return dst, len(data)


def opaque_mask(path):
    """Only the transparency channel: where the picture carries data."""
    return np.asarray(Image.open(path).convert('RGBA').getchannel('A')) > 250


def load_lut(path=LUT_FILE):
    """Return (table, n): table maps a packed 24-bit RGB value to its colour index, or -1."""
    with open(path, encoding='utf-8') as fh:
        rgb = np.array(json.load(fh)['rgb'], np.int32).reshape(-1, 3)
    table = np.full(1 << 24, -1, np.int16)
    for i in range(len(rgb) - 1, -1, -1):        # first occurrence wins for duplicated colours
        table[(rgb[i, 0] << 16) | (rgb[i, 1] << 8) | rgb[i, 2]] = i
    return table, len(rgb)


def load_phase(path, lut):
    """PNG -> (phase in radians, valid mask, opaque mask, zero-colour mask)."""
    table, n = lut
    rgba = np.asarray(Image.open(path).convert('RGBA'))
    packed = (rgba[..., 0].astype(np.int32) << 16) | (rgba[..., 1].astype(np.int32) << 8) | rgba[..., 2]
    index = table[packed]
    opaque = rgba[..., 3] > 250
    valid = opaque & (index >= 0)
    phase = ((index / (n - 1.0)) - 0.5) * 2 * np.pi
    return phase.astype(np.float32), valid, opaque, packed == ZERO_PHASE_RGB
