"""Step 6: write what the static site needs: coloured overlays, a small value grid, and one data script.

Data is shipped as a script (window.SITE_DATA[id] = {...}) because browsers refuse fetch() of local files,
and the site must also work when index.html is opened straight from disk.
"""
import base64
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# ColorBrewer 11-class RdBu: red = sinking, near-white = no change, blue = rising. Colour-blind safe.
RDBU = np.array([[103, 0, 31], [178, 24, 43], [214, 96, 77], [244, 165, 130], [253, 219, 199], [247, 247, 247],
                 [209, 229, 240], [146, 197, 222], [67, 147, 195], [33, 102, 172], [5, 48, 97]], float)


def diverging_rgb(values_cm, vmax_cm):
    t = np.clip((np.nan_to_num(values_cm) / vmax_cm + 1) / 2, 0, 1) * (len(RDBU) - 1)
    i = np.minimum(t.astype(int), len(RDBU) - 2)
    f = (t - i)[..., None]
    return (RDBU[i] * (1 - f) + RDBU[i + 1] * f + 0.5).astype(np.uint8)


def regrid(image, georef, origin_xy, lons, lats):
    """Sample a cropped native-grid image at output cell centres (bilinear; NaN stays NaN)."""
    x, y = georef.to_pixel(lons[None, :], lats[:, None])
    rows = np.broadcast_to(y - origin_xy[1], (len(lats), len(lons)))
    cols = np.broadcast_to(x - origin_xy[0], (len(lats), len(lons)))
    return ndi.map_coordinates(image, [rows, cols], order=1, cval=np.nan).astype(np.float32)


def save_indexed(path, index, palette_rgb):
    """Write a palette PNG; index 0 is transparent (no data). Roughly half the size of an RGBA PNG."""
    palette = np.zeros((256, 3), np.uint8)
    palette[1:1 + len(palette_rgb)] = palette_rgb
    image = Image.fromarray(index.astype(np.uint8), 'P')
    image.putpalette(palette.tobytes())
    image.save(path, optimize=True, transparency=0)


def save_overlay(path, values_cm, vmax_cm):
    """Colour a displacement map in 255 steps between -vmax and +vmax."""
    levels = np.linspace(-vmax_cm, vmax_cm, 255)
    index = np.clip(np.round((np.nan_to_num(values_cm) / vmax_cm + 1) / 2 * 254), 0, 254) + 1
    save_indexed(path, np.where(np.isfinite(values_cm), index, 0), diverging_rgb(levels, vmax_cm))


def value_grid(cube_cm, step_cm, stride=2):
    """Coarse signed-byte copy of the cube for click-to-read in the browser. -128 = no data."""
    sub = cube_cm[:, ::stride, ::stride]
    q = np.where(np.isfinite(sub), np.clip(np.round(np.nan_to_num(sub) / step_cm), -127, 127), -128).astype(np.int8)
    return {'width': int(sub.shape[2]), 'height': int(sub.shape[1]), 'step_cm': step_cm, 'nodata': -128,
            'rows': 'evenly spaced in Web Mercator, north first',
            'frames_b64': [base64.b64encode(frame.tobytes()).decode('ascii') for frame in q]}


JS_HEAD = 'window.SITE_DATA = window.SITE_DATA || {};\nwindow.SITE_DATA[%s] = '


def write_site_js(path, site_id, payload):
    text = JS_HEAD % json.dumps(site_id) + json.dumps(payload, separators=(',', ':'), allow_nan=False) + ';\n'
    with open(path + '.part', 'w', encoding='utf-8') as fh:
        fh.write(text)
    os.replace(path + '.part', path)


def read_site_js(path):
    """Load the payload back (used to detect 'nothing new')."""
    with open(path, encoding='utf-8') as fh:
        text = fh.read()
    start = text.index('] = ') + 4
    return json.loads(text[start:text.rindex(';')])


def rounded(values, digits=2):
    return [None if not np.isfinite(v) else round(float(v), digits) for v in values]
