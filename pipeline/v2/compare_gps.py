"""Preview pipeline (v1) against GUNW-HDF5 pipeline (v2), both checked against the same GPS.

    python pipeline/v2/compare_gps.py mexico_city sjv [--extra-sjv]

Method, identical for both pipelines (the v1 method): radar line of sight at the station (median of the
cells within the configured radius) against GPS daily 'up' (NGL, +-4 day median) x the site's assumed
cos(incidence), both zeroed at the first radar date; Pearson r and RMS difference over common dates.
v2 additionally reports the comparison against GPS east/north/up projected on the product's LOS vector.

Sources:  v1 = site/data/<id>.js if built by refresh.py, else pipeline/out/<id>/<id>.js (refresh.py output)
          v2 = pipeline/out_v2/<id>/<id>.js
--extra-sjv: also samples both pipelines' value grids at the other NGL stations listed in the research
export (site/data/sjv.js), for a larger like-for-like sample. Grid sampling: 3x3 median of the coarse
click-to-read grid (0.4 cm steps) at the station.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.dirname(HERE)
SITE = os.path.join(PIPE, '..', 'site')
sys.path.insert(0, PIPE)
from nisar import export, georef, gps, search  # noqa: E402


def load(path):
    return export.read_site_js(path) if os.path.exists(path) else None


def v1_payload(site_id):
    b = load(os.path.join(PIPE, 'out_v2', '_backup', site_id, site_id + '.js'))     # preview data replaced by v2
    if b and b['provenance'].get('built_by') == 'pipeline/refresh.py':
        return b, 'pipeline/out_v2/_backup'
    s = load(os.path.join(SITE, 'data', site_id + '.js'))
    if s and s['provenance'].get('built_by') == 'pipeline/refresh.py':
        return s, 'site/data'
    s = load(os.path.join(PIPE, 'out', site_id, site_id + '.js'))
    return s, 'pipeline/out'


def grid_sampler(payload, png_dir):
    """Return f(lon, lat) -> series (cm) from the stride-2 value grid, using the overlay PNG for the full size."""
    g = payload['grid']
    frames = np.stack([np.frombuffer(__import__('base64').b64decode(b), np.int8).reshape(g['height'], g['width'])
                       for b in g['frames_b64']]).astype(float)
    frames[frames == g['nodata']] = np.nan
    frames *= g['step_cm']
    first = os.path.join(png_dir, os.path.basename(payload['overlay']['files'][0]))
    W, H = Image.open(first).size
    (south, west), (north, east) = payload['overlay']['bounds']
    lons = west + (np.arange(W) + 0.5) * (east - west) / W
    ys = georef.mercator_y(north) - (np.arange(H) + 0.5) * (georef.mercator_y(north) - georef.mercator_y(south)) / H
    lats = georef.inverse_mercator_y(ys)
    glon, glat = lons[::2], lats[::2]

    def sample(lon, lat):
        j, i = int(np.argmin(np.abs(glon - lon))), int(np.argmin(np.abs(glat - lat)))
        win = frames[:, max(i - 1, 0):i + 2, max(j - 1, 0):j + 2].reshape(len(frames), -1)
        with np.errstate(all='ignore'):
            return np.array([np.nanmedian(w) if np.isfinite(w).any() else np.nan for w in win])
    return sample


def gps_up_at(station, days):
    d, up = gps.read_tenv3(gps.fetch_tenv3(station, os.path.join(PIPE, 'cache', 'gnss'), search.tls_context()))
    u = gps.at_epochs(d, up, days)
    return u - u[np.isfinite(u)][0] if np.isfinite(u).any() else u


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sites = json.load(open(os.path.join(PIPE, 'sites.json'), encoding='utf-8'))
    rows = []
    for sid in args:
        v1, v1_src = v1_payload(sid)
        v2 = load(os.path.join(PIPE, 'out_v2', sid, sid + '.js'))
        cos = sites[sid].get('cos_incidence_assumed', 0.77)
        v1g = {g['id']: g for g in (v1 or {}).get('gps', [])}
        for g in (v2 or {}).get('gps', []):
            a = v1g.get(g['id'], {})
            same = g['up_x_assumed']
            rows.append([sid, g['id'], 'station', a.get('r'), a.get('rms_cm'), same['r'], same['rms_cm'], g['r'], g['rms_cm'], same['n']])
        if sid == 'sjv' and '--extra-sjv' in sys.argv and v1 and v2:
            research = load(os.path.join(SITE, 'data', 'sjv.js'))
            s1 = grid_sampler(v1, os.path.join(PIPE, 'out', sid, 'img'))
            s2 = grid_sampler(v2, os.path.join(PIPE, 'out_v2', sid, 'img'))
            d1 = [gps.ordinal(d) for d in v1['dates']]
            d2 = [gps.ordinal(d) for d in v2['dates']]
            for st in research['gps']:
                g1 = gps_up_at(st['id'], d1) * cos
                g2 = gps_up_at(st['id'], d2) * cos
                c1 = gps.compare(s1(st['lon'], st['lat']), g1)
                c2 = gps.compare(s2(st['lon'], st['lat']), g2)
                rows.append([sid, st['id'], 'grid', c1['r'], c1['rms_cm'], c2['r'], c2['rms_cm'], None, None, c2['n']])
                rows[-1].append((st['r'], st['rms_cm']))
        print('%s: v1 from %s (%s), v2 from pipeline/out_v2' % (sid, v1_src, (v1 or {}).get('provenance', {}).get('built_by')))
    print('\n%-12s %-5s %-7s | %-15s | %-15s | %-15s | n' % ('site', 'sta', 'sample', 'v1 preview r/RMS', 'v2 r/RMS (same)', 'v2 full-LOS'))
    f = lambda r, m: ('%6s / %5s' % (r, m))
    for row in rows:
        print('%-12s %-5s %-7s | %s | %s | %s | %s %s' % (row[0], row[1], row[2], f(row[3], row[4]), f(row[5], row[6]),
                                                       f(row[7], row[8]) if row[7] is not None else '        -      ', row[9],
                                                       ('research-export(tied,vertical) r=%s RMS=%s' % row[10]) if len(row) > 10 else ''))
    out = os.path.join(PIPE, 'out_v2', 'gps_comparison.json')
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump([dict(zip(['site', 'station', 'sample', 'v1_r', 'v1_rms_cm', 'v2_r', 'v2_rms_cm', 'v2_los_r', 'v2_los_rms_cm', 'n', 'research_export'], r)) for r in rows], fh, indent=1)
    print('\nwrote', os.path.relpath(out))


if __name__ == '__main__':
    main()
