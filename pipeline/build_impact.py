"""Write site/data/<id>_impact.js: who and what sits on sinking ground, and what changed since the last passes.

    python -I pipeline/build_impact.py                 # all published sites
    python -I pipeline/build_impact.py tehran konya    # some of them
    options: --cache DIR (default pipeline/cache), --offline (cached downloads only), --refresh-osm

Run it after refresh.py / import_research_export.py. It only READS site/data/<id>.js and writes a new
site/data/<id>_impact.js next to it:

    window.IMPACT = window.IMPACT || {};
    window.IMPACT[id] = {schema, id, generated_utc, map, exposure, change, sources, caveats}

A. Exposure ("who and what is affected")
   * People: GHS-POP R2023A, epoch 2025, 3 arc-second grid (JRC, CC BY 4.0). Every population pixel is
     added to the map cell (the ~480 m cell of the site's value grid) that contains its centre, then
     counted where the cumulative change on the last date is at or below -2 sigma ("beyond noise"),
     -5 cm and -10 cm. Thresholds apply to the map's own quantity (line of sight for every site except
     sjv, which is vertical-equivalent).
   * Infrastructure: sjv reuses the canal/road/rail profiles and 10 km reaches already in sjv.js. The
     other sites query OpenStreetMap (Overpass API, one query per site, cached) for motorway/trunk/primary
     roads, rail, metro/light rail, canals and airports with an IATA code.

B. Change ("what changed since the last satellite passes")
   For every cell, a least-squares rate over the RECENT window (last 4 dates, ~3 repeat passes) and over
   the PREVIOUS window (up to 6 dates immediately before it; the windows share no date). With an
   independent error sigma on every date's cumulative value, the rate error over a window is
   sigma / sqrt(Sxx), Sxx = sum (t - mean t)^2 in days^2, so the difference of the two rates has
       sigma_diff = sigma * sqrt(1/Sxx_recent + 1/Sxx_previous)            (cm per day; x12 per 12 days)
   A cell is flagged when |rate_recent - rate_previous| >= 3 * sigma_diff, and flagged cells of the same
   sign are kept only in connected groups (8-neighbour) of at least 4 cells.
   sigma = the larger of (a) the site noise estimate from site/data/<id>.js combined with the grid's
   rounding step (step/sqrt 12), and (b) an empirical per-date noise from second differences of the
   series inside the two windows (robust, median absolute deviation). Using the larger one means a noisy
   season can only make the test stricter.
   Earlier window pairs, where the record is long enough, are run through the same test to show how much
   area the test flags when nothing is expected to have changed ("background").
   GPS (mexico_city MMX1, sjv stations): the same two windows are fitted to the GPS series stored in the
   site file, and the change in speed is compared with the radar's.

Rates are given per 12 days (one NISAR repeat) and per 30.44 days. Nothing is annualised.
Downloaded files (population tiles, Overpass responses) are untrusted data: run this with python -I.
"""
import argparse
import base64
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile

import numpy as np
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, '..', 'site')
DATA = os.path.join(SITE, 'data')
PUBLISHED = ['mexico_city', 'sjv', 'tehran', 'mashhad', 'rafsanjan', 'konya', 'celaya']
SCHEMA = 1

USER_AGENT = 'groundline-impact-builder/1.0 (open-source research script)'
GHS_BASE = ('https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/'
            'GHS_POP_E2025_GLOBE_R2023A_4326_3ss/V1-0/tiles/')
GHS_NAME = 'GHS_POP_E2025_GLOBE_R2023A_4326_3ss_V1_0_R%d_C%d'
# Tile grid of the 4326 / 3 arc-second product, read from the GeoTIFF tags (ModelTiepoint) of tile R4_C10:
# 12000 x 12000 pixels of 1/1200 degree, column 1 starts at -180.0079, row 1 starts at 89.0996 (top).
GHS_LON0, GHS_LAT0, GHS_TILE_DEG, GHS_PIX = -180.00791628776955, 89.099583298383465, 10.0, 12000
OVERPASS = 'https://overpass-api.de/api/interpreter'

RECENT_DATES = 4          # last 4 dates = 3 repeat intervals (~36 days)
PREVIOUS_DATES = 6        # up to 6 dates immediately before
K_SIGMA = 3.0             # per-cell flag threshold in units of sigma_diff
MIN_CELLS = 4             # smallest connected group reported as an area
BEYOND_NOISE_SIGMA = 2.0  # "beyond noise" for cumulative sinking = at or below -2 sigma
MONTH_DAYS = 30.44
LOO_SIGMA = 2.0           # a flagged cell is "robust" if it stays >= 2 sigma when any single date is dropped


# ------------------------------------------------------------------ helpers
def log(*a):
    print(*a, flush=True)


def read_site(site_id):
    with open(os.path.join(DATA, site_id + '.js'), encoding='utf-8') as fh:
        text = fh.read()
    return json.loads(text[text.index('= {') + 2:].rstrip().rstrip(';'))


def r(x, d=2):
    if x is None:
        return None
    x = float(x)
    return None if not math.isfinite(x) else round(x, d)


def merc_y(lat):
    return np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))


def inv_merc_y(y):
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def fetch(url, dest, data=None, timeout=300):
    """Download to dest (via .part). data = POST body (bytes)."""
    req = urllib.request.Request(url, data=data, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(dest + '.part', 'wb') as fh:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
    os.replace(dest + '.part', dest)


def days(d):
    return dt.date(int(d[:4]), int(d[4:6]), int(d[6:])).toordinal()


def fmt_date(d):
    return '%s-%s-%s' % (d[:4], d[4:6], d[6:])


# ------------------------------------------------------------------ the site's value grid
class Grid:
    """The int8 per-date grid of site/data/<id>.js as a float cube, with cell geometry (same mapping as app.js)."""

    def __init__(self, s):
        g = s['grid']
        self.w, self.h, self.step = g['width'], g['height'], g['step_cm']
        (self.s_lat, self.w_lon), (self.n_lat, self.e_lon) = s['overlay']['bounds']
        frames = [np.frombuffer(base64.b64decode(f), np.int8).reshape(self.h, self.w) for f in g['frames_b64']]
        cube = np.stack(frames).astype(np.float32)
        cube[np.stack(frames) == g['nodata']] = np.nan
        self.cube = cube * self.step
        self.clip = g.get('clipped_at_cm')
        ys, yn = merc_y(self.s_lat), merc_y(self.n_lat)
        edges = inv_merc_y(yn - (yn - ys) * np.arange(self.h + 1) / self.h)     # north first
        self.lat_edges = edges
        self.lat = inv_merc_y(yn - (yn - ys) * (np.arange(self.h) + 0.5) / self.h)
        self.dlon = (self.e_lon - self.w_lon) / self.w
        self.lon = self.w_lon + (np.arange(self.w) + 0.5) * self.dlon
        dy_km = (edges[:-1] - edges[1:]) * 110.574
        dx_km = self.dlon * 111.320 * np.cos(np.radians(self.lat))
        self.cell_km2 = (dx_km * dy_km)[:, None] * np.ones((1, self.w))
        self.cell_m = float(np.sqrt(np.median(self.cell_km2))) * 1000

    def index(self, lat, lon):
        """Row, col (int arrays, -1 outside) of the cell containing lat/lon; same formula as app.js gridSeries."""
        lat, lon = np.asarray(lat, float), np.asarray(lon, float)
        ys, yn = merc_y(self.s_lat), merc_y(self.n_lat)
        col = np.floor((lon - self.w_lon) / (self.e_lon - self.w_lon) * self.w).astype(int)
        with np.errstate(invalid='ignore'):
            row = np.floor((yn - merc_y(np.clip(lat, -85, 85))) / (yn - ys) * self.h).astype(int)
        bad = (col < 0) | (col >= self.w) | (row < 0) | (row >= self.h)
        return np.where(bad, -1, row), np.where(bad, -1, col)


# ------------------------------------------------------------------ noise
def empirical_noise(cube, t, idx):
    """Robust per-date noise from second differences: e_k = y_k - (w1 y_k-1 + w2 y_k+1), var = s^2 (1 + w1^2 + w2^2)."""
    vals = []
    for a, b, c in zip(idx[:-2], idx[1:-1], idx[2:]):
        w1 = (t[c] - t[b]) / (t[c] - t[a])
        w2 = 1 - w1
        e = (cube[b] - (w1 * cube[a] + w2 * cube[c])) / math.sqrt(1 + w1 ** 2 + w2 ** 2)
        vals.append(e[np.isfinite(e)])
    v = np.concatenate(vals) if vals else np.array([])
    if v.size < 50:
        return None
    return float(1.4826 * np.median(np.abs(v - np.median(v))))


def noise_model(s, grid, t, idx):
    site_sigma = s['noise'].get('value_cm')
    q = grid.step / math.sqrt(12)
    emp = empirical_noise(grid.cube, t, idx)
    cands = []
    if site_sigma:
        cands.append(('site', math.sqrt(site_sigma ** 2 + q ** 2)))
    if emp:
        cands.append(('empirical', emp))
    if not cands:
        raise SystemExit('%s: no noise estimate at all' % s['id'])
    src, sigma = max(cands, key=lambda c: c[1])
    return {
        'sigma_cm': r(sigma, 3), 'used': src,
        'site_cm': site_sigma, 'site_label': s['noise'].get('label'),
        'rounding_cm': r(q, 3), 'empirical_cm': r(emp, 3),
        'empirical_label': 'per-date scatter from second differences of every cell\'s series (robust MAD), dates of the change windows',
        'note': ('The larger of the site estimate (with the grid\'s rounding step) and the empirical scatter is used.'
                 + ('' if site_sigma else ' This site has no stable-area noise estimate, so only the empirical value is available; treat with extra caution.')),
    }


# ------------------------------------------------------------------ population (GHS-POP)
def ghs_tiles_for(bbox):
    w, s_, e, n = bbox
    rows = range(int((GHS_LAT0 - n) // GHS_TILE_DEG) + 1, int((GHS_LAT0 - s_) // GHS_TILE_DEG) + 2)
    cols = range(int((w - GHS_LON0) // GHS_TILE_DEG) + 1, int((e - GHS_LON0) // GHS_TILE_DEG) + 2)
    return [(rr, cc) for rr in rows for cc in cols]


def ghs_tif(cache, rr, cc, offline):
    import tifffile  # noqa: F401  (fail early with a clear message)
    name = GHS_NAME % (rr, cc)
    d = os.path.join(cache, 'ghs_pop', 'R%d_C%d' % (rr, cc))
    os.makedirs(d, exist_ok=True)
    tif = os.path.join(d, name + '.tif')
    if os.path.exists(tif):
        return tif
    z = os.path.join(d, name + '.zip')
    if not os.path.exists(z):
        if offline:
            raise SystemExit('missing %s (offline)' % z)
        log('  downloading', name + '.zip')
        fetch(GHS_BASE + name + '.zip', z)
    with zipfile.ZipFile(z) as zf:
        member = name + '.tif'
        if member not in zf.namelist():
            raise SystemExit('%s does not contain %s' % (z, member))
        with zf.open(member) as src, open(tif + '.part', 'wb') as dst:
            while True:
                chunk = src.read(1 << 20)
                if not chunk:
                    break
                dst.write(chunk)
    os.replace(tif + '.part', tif)
    return tif


def read_window(tif, r0, r1, c0, c1):
    """Rows r0..r1-1, cols c0..c1-1 of a tiled GeoTIFF, decoding only the 256x256 tiles needed."""
    import tifffile
    out = np.zeros((r1 - r0, c1 - c0), np.float32)
    with tifffile.TiffFile(tif) as t:
        p = t.pages[0]
        if not p.is_tiled:
            raise SystemExit('%s: expected a tiled GeoTIFF' % tif)
        tw, tl = p.tilewidth, p.tilelength
        ntx = -(-p.imagewidth // tw)
        fh = t.filehandle
        for ty in range(r0 // tl, (r1 - 1) // tl + 1):
            for tx in range(c0 // tw, (c1 - 1) // tw + 1):
                k = ty * ntx + tx
                if p.databytecounts[k] == 0:
                    continue
                fh.seek(p.dataoffsets[k])
                seg = p.decode(fh.read(p.databytecounts[k]), k)[0]
                seg = np.asarray(seg).reshape(tl, tw)
                ya, yb = max(r0, ty * tl), min(r1, (ty + 1) * tl)
                xa, xb = max(c0, tx * tw), min(c1, (tx + 1) * tw)
                out[ya - r0:yb - r0, xa - c0:xb - c0] = seg[ya - ty * tl:yb - ty * tl, xa - tx * tw:xb - tx * tw]
    out[~np.isfinite(out) | (out < 0)] = 0
    return out


def population_on_grid(site_id, grid, cache, offline):
    """People per map cell (sum of GHS-POP pixels whose centre falls in the cell). Cached as .npy."""
    d = os.path.join(cache, 'impact')
    os.makedirs(d, exist_ok=True)
    key = os.path.join(d, '%s_pop_%dx%d_%.4f_%.4f_%.4f_%.4f.npy' % (site_id, grid.w, grid.h, grid.w_lon, grid.s_lat, grid.e_lon, grid.n_lat))
    if os.path.exists(key):
        return np.load(key, allow_pickle=False)
    pop = np.zeros(grid.h * grid.w)
    total_in_bbox = 0.0
    px = 1.0 / 1200
    for rr, cc in ghs_tiles_for([grid.w_lon, grid.s_lat, grid.e_lon, grid.n_lat]):
        top = GHS_LAT0 - (rr - 1) * GHS_TILE_DEG
        left = GHS_LON0 + (cc - 1) * GHS_TILE_DEG
        r0 = max(0, int(math.floor((top - grid.n_lat) / px)))
        r1 = min(GHS_PIX, int(math.ceil((top - grid.s_lat) / px)))
        c0 = max(0, int(math.floor((grid.w_lon - left) / px)))
        c1 = min(GHS_PIX, int(math.ceil((grid.e_lon - left) / px)))
        if r1 <= r0 or c1 <= c0:
            continue
        tif = ghs_tif(cache, rr, cc, offline)
        win = read_window(tif, r0, r1, c0, c1)
        lats = top - (np.arange(r0, r1) + 0.5) * px
        lons = left + (np.arange(c0, c1) + 0.5) * px
        row, col = grid.index(np.repeat(lats, len(lons)), np.tile(lons, len(lats)))
        ok = row >= 0
        flat = (row * grid.w + col)[ok]
        vals = win.ravel()[ok]
        total_in_bbox += vals.sum()
        pop += np.bincount(flat, weights=vals, minlength=grid.h * grid.w)
    pop = pop.reshape(grid.h, grid.w)
    np.save(key, pop, allow_pickle=False)
    return pop


# ------------------------------------------------------------------ OpenStreetMap
def overpass(site_id, bbox, cache, offline, refresh, places_only=False):
    d = os.path.join(cache, 'osm')
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, site_id + ('_places' if places_only else '') + '.json')
    if os.path.exists(path) and not refresh:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh), path
    if offline:
        raise SystemExit('missing %s (offline)' % path)
    w, s_, e, n = bbox
    if places_only:
        body = 'node[place~"^(city|town|village)$"];'
    else:
        body = ('way[highway~"^(motorway|trunk|primary)$"];'
                'way[railway~"^(rail|light_rail|subway)$"][!service];'
                'way[waterway=canal];'
                'nwr[aeroway=aerodrome][iata];'
                'node[place~"^(city|town|village|suburb)$"];')
    q = '[out:json][timeout:180][bbox:%.4f,%.4f,%.4f,%.4f];(%s);out geom;' % (s_, w, n, e, body)
    log('  Overpass query for', site_id, '(places only)' if places_only else '')
    for attempt in range(3):
        try:
            fetch(OVERPASS, path, data=urllib.parse.urlencode({'data': q}).encode(), timeout=240)
            break
        except Exception as exc:   # rate limited or busy: wait politely and retry
            log('   Overpass failed (%s), retrying in 60 s' % exc)
            time.sleep(60)
    else:
        raise SystemExit('Overpass failed three times for ' + site_id)
    time.sleep(5)  # be polite between queries
    with open(path, encoding='utf-8') as fh:
        return json.load(fh), path


def osm_places(elements):
    out = []
    for el in elements:
        if el.get('type') == 'node' and 'place' in el.get('tags', {}) and 'name' in el['tags']:
            t = el['tags']
            out.append({'name': str(t.get('name:en') or t['name'])[:80], 'lat': float(el['lat']), 'lon': float(el['lon']),
                        'rank': {'city': 0, 'town': 1, 'suburb': 2, 'village': 3}.get(t['place'], 4)})
    return out


def nearest_place(places, lat, lon, max_rank=4):
    best = None
    for p in places:
        if p.get('rank', 0) > max_rank:
            continue
        dkm = float(haversine_km(lat, lon, p['lat'], p['lon']))
        # prefer bigger places unless a small one is much closer
        score = dkm * (1 + 0.15 * p.get('rank', 0))
        if best is None or score < best[0]:
            best = (score, p['name'], dkm)
    return (best[1], round(best[2], 1)) if best else (None, None)


def feature_kind(tags):
    if 'highway' in tags:
        return 'road', tags['highway']
    if 'railway' in tags:
        return ('rail', 'rail') if tags['railway'] == 'rail' else ('metro', tags['railway'])
    if tags.get('waterway') == 'canal':
        return 'canal', 'canal'
    if tags.get('aeroway') == 'aerodrome':
        return 'airport', 'airport'
    return None, None


def feature_name(tags, cls):
    name = tags.get('name:en') or tags.get('name')
    ref = tags.get('ref')
    if name and ref and ref not in name:
        name = '%s (%s)' % (name, ref)
    return str(name or ref or 'unnamed %s' % cls.replace('_', ' '))[:100]


def densify(coords, step_km=0.1):
    """Points every ~100 m along a polyline, each with the length it represents."""
    pts, lens = [], []
    for (a_lat, a_lon), (b_lat, b_lon) in zip(coords[:-1], coords[1:]):
        seg = float(haversine_km(a_lat, a_lon, b_lat, b_lon))
        k = max(1, int(math.ceil(seg / step_km)))
        f = (np.arange(k) + 0.5) / k
        pts.extend(zip(a_lat + (b_lat - a_lat) * f, a_lon + (b_lon - a_lon) * f))
        lens.extend([seg / k] * k)
    return np.array(pts).reshape(-1, 2), np.array(lens)


def point_in_poly(lat, lon, ring):
    """Even-odd rule; ring = [(lat, lon), ...]."""
    inside = np.zeros(lat.shape, bool)
    ys = np.array([p[0] for p in ring])
    xs = np.array([p[1] for p in ring])
    j = len(ring) - 1
    for i in range(len(ring)):
        cond = ((ys[i] > lat) != (ys[j] > lat))
        with np.errstate(divide='ignore', invalid='ignore'):
            xint = (xs[j] - xs[i]) * (lat - ys[i]) / (ys[j] - ys[i]) + xs[i]
        inside ^= cond & (lon < xint)
        j = i
    return inside


def osm_infrastructure(elements, grid, total, thresholds, places, sigma):
    """Length of each class within the sinking zones and the 5 worst ~1 km pieces of named features."""
    zones = [('beyond_noise', thresholds['beyond_noise_cm']), ('ge_5cm', -5.0), ('ge_10cm', -10.0)]
    by_kind, pieces, airports = {}, [], []
    for el in elements:
        tags = el.get('tags', {})
        kind, cls = feature_kind(tags)
        if kind is None:
            continue
        if kind == 'airport':
            rings = []
            if el['type'] == 'way' and el.get('geometry'):
                rings = [[(p['lat'], p['lon']) for p in el['geometry']]]
            elif el['type'] == 'relation':
                rings = [[(p['lat'], p['lon']) for p in m['geometry']] for m in el.get('members', [])
                         if m.get('role') == 'outer' and m.get('geometry')]
            if rings:
                la, lo = np.meshgrid(grid.lat, grid.lon, indexing='ij')
                mask = np.zeros(la.shape, bool)
                for ring in rings:
                    mask ^= point_in_poly(la, lo, ring)
            else:
                mask = np.zeros(grid.cube[0].shape, bool)
            if not mask.any():
                c = el.get('center') or (el.get('bounds') and {'lat': (el['bounds']['minlat'] + el['bounds']['maxlat']) / 2,
                                                              'lon': (el['bounds']['minlon'] + el['bounds']['maxlon']) / 2}) or el
                if 'lat' not in c:
                    continue
                rr, cc = grid.index([c['lat']], [c['lon']])
                if rr[0] < 0:
                    continue
                mask[rr[0], cc[0]] = True
            vals = total[mask & np.isfinite(total)]
            ys, xs = np.nonzero(mask)
            airports.append({
                'name': feature_name(tags, 'airport'), 'iata': str(tags.get('iata', ''))[:4],
                'lat': r(grid.lat[ys].mean(), 4), 'lon': r(grid.lon[xs].mean(), 4),
                'cells': int(mask.sum()), 'mapped_cells': int(vals.size),
                'median_cm': r(np.median(vals), 1) if vals.size else None,
                'p05_cm': r(np.percentile(vals, 5), 1) if vals.size else None,
                'share_beyond_noise': r(np.mean(vals <= thresholds['beyond_noise_cm']), 2) if vals.size else None,
                'beyond_noise': bool(vals.size and np.median(vals) <= thresholds['beyond_noise_cm']),
            })
            continue
        geom = el.get('geometry')
        if el.get('type') != 'way' or not geom or len(geom) < 2:
            continue
        coords = [(p['lat'], p['lon']) for p in geom]
        pts, lens_full = densify(coords)
        # divided highways are mapped as two one-way carriageways: count each at half length
        divided = kind == 'road' and tags.get('oneway') == 'yes' and cls in ('motorway', 'trunk')
        lens = lens_full * 0.5 if divided else lens_full
        rr, cc = grid.index(pts[:, 0], pts[:, 1])
        v = np.full(len(pts), np.nan)
        ok = rr >= 0
        v[ok] = total[rr[ok], cc[ok]]
        k = by_kind.setdefault(kind, {'mapped_km': 0.0, 'unmapped_km': 0.0, 'classes': set(), **{z: 0.0 for z, _ in zones}})
        k['classes'].add(cls)
        fin = np.isfinite(v)
        k['mapped_km'] += lens[fin].sum()
        k['unmapped_km'] += lens[~fin].sum()
        for z, thr in zones:
            k[z] += lens[fin & (v <= thr)].sum()
        # ~1 km pieces along this way
        name = feature_name(tags, cls)
        piece = (np.cumsum(lens_full) // 1.0).astype(int)
        for pid in np.unique(piece):
            sel = (piece == pid) & fin
            seg_len = float(lens_full[piece == pid].sum())
            if sel.sum() < 3 or seg_len < 0.5:
                continue
            cells = {}
            for a, b, val in zip(rr[sel], cc[sel], v[sel]):
                cells[(a, b)] = val
            cv = np.array(list(cells.values()))
            ii = np.nonzero(piece == pid)[0]
            ref = ''.join(ch for ch in str(tags.get('ref', '')).upper() if ch.isalnum())
            pieces.append({'name': name, 'key': (kind, ref) if ref else (kind, name), 'kind': kind, 'class': cls, 'mean_cm': float(cv.mean()), 'min_cm': float(cv.min()),
                           'length_km': seg_len, 'cells': len(cells),
                           'from': [r(pts[ii[0], 0], 4), r(pts[ii[0], 1], 4)], 'to': [r(pts[ii[-1], 0], 4), r(pts[ii[-1], 1], 4)],
                           'lat': float(pts[ii, 0].mean()), 'lon': float(pts[ii, 1].mean())})
    lengths = {}
    for kind, k in by_kind.items():
        lengths[kind] = {'classes': sorted(k['classes']), 'mapped_km': r(k['mapped_km'], 1), 'unmapped_km': r(k['unmapped_km'], 1),
                         **{z + '_km': r(k[z], 1) for z, _ in zones}}
    worst, seen = [], set()
    for p in sorted(pieces, key=lambda p: p['mean_cm']):
        if p['key'] in seen or p['name'].startswith('unnamed'):
            continue
        # the two carriageways of one road, or one road under two names, show up as separate ways: skip near-duplicates
        if any(w['kind'] == p['kind'] and haversine_km(w['lat'], w['lon'], p['lat'], p['lon']) < 1.5 for w in worst):
            continue
        seen.add(p['key'])
        near, near_km = nearest_place(places, p['lat'], p['lon'])
        worst.append({'name': p['name'], 'kind': p['kind'], 'class': p['class'], 'length_km': r(p['length_km'], 1),
                      'mean_cm': r(p['mean_cm'], 1), 'min_cm': r(p['min_cm'], 1),
                      'beyond_noise': p['mean_cm'] <= thresholds['beyond_noise_cm'],
                      'lat': r(p['lat'], 4), 'lon': r(p['lon'], 4), 'from': p['from'], 'to': p['to'],
                      'near': near, 'near_km': near_km})
        if len(worst) == 5:
            break
    airports.sort(key=lambda a: (a['median_cm'] is None, -a['cells']))
    uniq = {}
    for a in airports:                       # one entry per IATA code (an airport can be mapped as a way and a relation)
        k = a['iata'] or a['name']
        if k not in uniq:
            uniq[k] = a
        elif 'airport' in a['name'].lower() and 'airport' not in uniq[k]['name'].lower():
            uniq[k]['name'] = a['name']      # keep the larger outline, show the civil name
    airports = sorted(uniq.values(), key=lambda a: (a['median_cm'] is None, a['median_cm'] or 0))
    for a in airports:
        a['near'], a['near_km'] = nearest_place(places, a['lat'], a['lon'], max_rank=1) if a['lat'] is not None else (None, None)
    return {'source': 'osm', 'lengths': lengths, 'worst_segments': worst, 'airports': airports[:6],
            'segment_rule': 'roads, railways and canals cut into ~1 km pieces along each OSM way; mean of the map cells each piece crosses; the worst piece of each named feature, 5 features',
            'length_rule': 'length of the OSM centre lines whose map cell is at or below each threshold; one-way motorway/trunk carriageways count half so a divided highway counts once'}


def sjv_infrastructure(s, thresholds, places):
    zones = [('beyond_noise', thresholds['beyond_noise_cm']), ('ge_5cm', -5.0), ('ge_10cm', -10.0)]
    lengths = {}
    for a in s['alignments']:
        dist = np.array(a['dist_km'])
        tot = np.array([np.nan if v is None else v for v in a['total_cm']], float)
        step = np.gradient(dist) if len(dist) > 1 else np.array([0.0])
        k = lengths.setdefault(a['kind'], {'classes': [], 'mapped_km': 0.0, **{z + '_km': 0.0 for z, _ in zones}})
        k['classes'].append(a['name'])
        fin = np.isfinite(tot)
        k['mapped_km'] += step[fin].sum()
        for z, thr in zones:
            k[z + '_km'] += step[fin & (tot <= thr)].sum()
    for k in lengths.values():
        for key in list(k):
            if key.endswith('_km'):
                k[key] = r(k[key], 1)
    reaches = sorted(s['reaches'], key=lambda x: x['mean_cm'])
    worst = [{'name': x['alignment'], 'kind': next(a['kind'] for a in s['alignments'] if a['name'] == x['alignment']),
              'km_from': x['km_from'], 'km_to': x['km_to'], 'length_km': r(x['km_to'] - x['km_from'], 1),
              'mean_cm': r(x['mean_cm'], 1), 'sigma_cm': r(x['sigma_cm'], 2), 'beyond_noise': bool(x['exceeds_noise']),
              'summer_two_track_confirmed': bool(x.get('summer_two_track_confirmed')),
              'lat': x['lat'], 'lon': x['lon'], 'near': x.get('near'), 'near_km': x.get('near_km')} for x in reaches[:10]]
    per_alignment = []
    for a in s['alignments']:
        rs = [x for x in reaches if x['alignment'] == a['name']]
        if rs:
            x = rs[0]
            per_alignment.append({'name': a['name'], 'kind': a['kind'], 'km_from': x['km_from'], 'km_to': x['km_to'],
                                  'mean_cm': r(x['mean_cm'], 1), 'sigma_cm': r(x['sigma_cm'], 2), 'beyond_noise': bool(x['exceeds_noise']),
                                  'near': x.get('near'), 'reaches_beyond_noise': sum(1 for y in rs if y['exceeds_noise']), 'reaches_total': len(rs)})
    per_alignment.sort(key=lambda x: x['mean_cm'])
    return {'source': 'sjv_profiles', 'lengths': lengths, 'worst_segments': worst, 'worst_per_alignment': per_alignment, 'airports': [],
            'segment_rule': '10 km reaches of the profiles in sjv.js (mean and 1-sigma from the research export; beyond_noise = that file\'s exceeds_noise)',
            'length_rule': 'length of profile samples at or below each threshold (the profile samples are ~1.5 km apart)'}


# ------------------------------------------------------------------ change / acceleration
def window_rate(cube, t, idx):
    """Least-squares slope (cm/day) per cell over dates idx; NaN if any date is missing."""
    tt = t[idx]
    tc = tt - tt.mean()
    sxx = float((tc ** 2).sum())
    y = cube[idx]
    slope = np.tensordot(tc, y - y.mean(axis=0), axes=(0, 0)) / sxx
    return slope, sxx


def change_test(cube, t, new_idx, old_idx, sigma, valid):
    b_new, sxx_new = window_rate(cube, t, new_idx)
    b_old, sxx_old = window_rate(cube, t, old_idx)
    sd = sigma * math.sqrt(1 / sxx_new + 1 / sxx_old)                  # cm/day
    diff = b_new - b_old
    z = diff / sd
    ok = valid & np.isfinite(z)
    flags = {}
    for sign, name in ((-1, 'faster'), (1, 'slower')):
        m = ok & (sign * z >= K_SIGMA)
        lab, n = ndi.label(m, structure=np.ones((3, 3)))
        sizes = ndi.sum(m, lab, np.arange(1, n + 1))
        keep = np.isin(lab, 1 + np.nonzero(sizes >= MIN_CELLS)[0])
        flags[name] = (keep, lab * keep)
    # leave one date out (from either window): the smallest signed z left; a single bad date cannot carry a robust flag
    loo = np.full(diff.shape, np.inf)
    for idx_list, other, is_new in ((new_idx, old_idx, True), (old_idx, new_idx, False)):
        if len(idx_list) < 4:
            continue
        for j in idx_list:
            sub = [i for i in idx_list if i != j]
            b_sub, sxx_sub = window_rate(cube, t, sub)
            d_sub = (b_sub - b_old) if is_new else (b_new - b_sub)
            sd_sub = sigma * math.sqrt(1 / sxx_sub + 1 / (sxx_old if is_new else sxx_new))
            loo = np.minimum(loo, np.sign(diff) * d_sub / sd_sub)
    return {'loo_min_z': loo, 'b_new': b_new, 'b_old': b_old, 'diff': diff, 'z': z, 'sd': sd, 'sxx_new': sxx_new, 'sxx_old': sxx_old,
            'ok': ok, 'flags': flags}


def windows(n, shift=0):
    end = n - shift
    new = list(range(end - RECENT_DATES, end))
    old = list(range(max(0, end - RECENT_DATES - PREVIOUS_DATES), end - RECENT_DATES))
    return new, old


def gps_change(s, t, new_idx, old_idx, grid, res):
    out = []
    for g in s.get('gps', []):
        series = g.get('gps_raw_cm') or g.get('gps_cm')
        label = 'gps_raw_cm' if g.get('gps_raw_cm') else 'gps_cm'
        fits = {}
        resid = []
        for wname, idx in (('new', new_idx), ('old', old_idx)):
            pts = [(t[i], series[i]) for i in idx if series[i] is not None]
            if len(pts) < 3:
                fits = None
                break
            x = np.array([p[0] for p in pts], float)
            y = np.array([p[1] for p in pts], float)
            xc = x - x.mean()
            sxx = float((xc ** 2).sum())
            b = float((xc * (y - y.mean())).sum() / sxx)
            res_ = y - (y.mean() + b * xc)
            resid.append((res_, len(pts) - 2))
            fits[wname] = (b, sxx)
        if not fits:
            out.append({'id': g['id'], 'usable': False, 'reason': 'fewer than 3 GPS dates in a window'})
            continue
        ss = sum(float((rr ** 2).sum()) for rr, _ in resid)
        dof = sum(d for _, d in resid)
        s_gps = max(math.sqrt(ss / dof) if dof > 0 else 0.0, 0.3)       # floor: ~3 mm daily vertical precision
        sd = s_gps * math.sqrt(1 / fits['new'][1] + 1 / fits['old'][1])
        d_gps = fits['new'][0] - fits['old'][0]
        # radar at the station: the station's own radar series in the site file, else the grid cell
        rad = g.get('radar_cm')
        rad_new = rad_old = None
        if rad and all(rad[i] is not None for i in new_idx + old_idx):
            ra = np.array(rad, float)
            rad_new = window_rate(ra[:, None, None], t, new_idx)[0].item()
            rad_old = window_rate(ra[:, None, None], t, old_idx)[0].item()
            rad_src = 'radar_cm series of this station in the site file'
        else:
            rr, cc = grid.index([g['lat']], [g['lon']])
            if rr[0] >= 0 and np.isfinite(res['diff'][rr[0], cc[0]]):
                rad_new, rad_old = float(res['b_new'][rr[0], cc[0]]), float(res['b_old'][rr[0], cc[0]])
            rad_src = 'map cell containing the station'
        z_gps = d_gps / sd
        rad_d = None if rad_new is None else rad_new - rad_old
        z_rad = None if rad_d is None else rad_d / res['sd']
        sig_g, sig_r = abs(z_gps) >= 2, (z_rad is not None and abs(z_rad) >= 2)
        if rad_d is None:
            verdict = 'no radar value'
        elif not sig_g and not sig_r:
            verdict = 'agree: neither shows a change beyond its noise'
        elif sig_g and sig_r and np.sign(d_gps) == np.sign(rad_d):
            verdict = 'agree: both show the same change'
        elif sig_g and not sig_r:
            verdict = 'GPS shows a change the radar cannot resolve'
        elif sig_r and not sig_g:
            verdict = 'radar shows a change GPS does not confirm'
        else:
            verdict = 'disagree: opposite changes'
        f12 = 12.0
        same_dir = None if rad_d is None else bool(np.sign(rad_d) == np.sign(d_gps))
        out.append({
            'id': g['id'], 'usable': True, 'radar_same_direction': same_dir, 'lat': g['lat'], 'lon': g['lon'], 'gps_series': label,
            'gps_quantity': 'GPS up, daily values (not smoothed)' if label == 'gps_raw_cm' else g.get('gps_label'),
            'gps_old_cm_per_12d': r(fits['old'][0] * f12), 'gps_new_cm_per_12d': r(fits['new'][0] * f12),
            'gps_change_cm_per_12d': r(d_gps * f12), 'gps_change_sigma_cm_per_12d': r(sd * f12), 'gps_z': r(z_gps, 1),
            'radar_old_cm_per_12d': r(None if rad_old is None else rad_old * f12), 'radar_new_cm_per_12d': r(None if rad_new is None else rad_new * f12),
            'radar_change_cm_per_12d': r(None if rad_d is None else rad_d * f12), 'radar_z': r(z_rad, 1), 'radar_source': rad_src,
            'verdict': verdict,
        })
    return out


def change_analysis(s, grid, places):
    dates = s['dates']
    n = len(dates)
    t = np.array([days(d) - days(dates[0]) for d in dates], float)
    new_idx, old_idx = windows(n)
    noise = noise_model(s, grid, t, old_idx + new_idx)
    sigma = noise['sigma_cm']
    valid = np.all(np.isfinite(grid.cube[old_idx + new_idx]), axis=0)
    clipped_cells = 0
    if grid.clip:
        near_clip = np.any(np.abs(grid.cube[old_idx + new_idx]) >= grid.clip - grid.step, axis=0)
        clipped_cells = int((valid & near_clip).sum())
        valid &= ~near_clip
    res = change_test(grid.cube, t, new_idx, old_idx, sigma, valid)
    f12, fmo = 12.0, MONTH_DAYS
    sd12 = res['sd'] * f12

    areas = []
    total_km2 = {}
    for name in ('faster', 'slower'):
        keep, lab = res['flags'][name]
        total_km2[name] = float(grid.cell_km2[keep].sum())
        for lid in np.unique(lab[lab > 0]):
            m = lab == lid
            ys, xs = np.nonzero(m)
            w = grid.cell_km2[m]
            clat, clon = float((grid.lat[ys] * w).sum() / w.sum()), float((grid.lon[xs] * w).sum() / w.sum())
            zmed = float(np.median(np.abs(res['z'][m])))
            ncell = int(m.sum())
            robust = float(np.mean(res['loo_min_z'][m] >= LOO_SIGMA))
            conf = 'high' if (ncell >= 8 and zmed >= 4 and robust >= 0.5) else 'medium' if robust >= 0.5 else 'low'
            near, near_km = nearest_place(places, clat, clon)
            grown = ndi.binary_dilation(m, structure=np.ones((3, 3)))
            edge = bool(ys.min() == 0 or xs.min() == 0 or ys.max() == grid.h - 1 or xs.max() == grid.w - 1 or (grown & ~valid).any())
            if edge and conf != 'low':
                conf = 'medium' if conf == 'high' else 'low'
            areas.append({
                'touches_edge_or_gap': edge,
                'kind': 'sinking_faster' if name == 'faster' else 'sinking_slower',
                'lat': r(clat, 4), 'lon': r(clon, 4), 'near': near, 'near_km': near_km,
                'area_km2': r(w.sum(), 2), 'cells': ncell,
                'bbox': [r(grid.lon[xs].min() - grid.dlon / 2, 4), r(grid.lat_edges[ys.max() + 1], 4),
                         r(grid.lon[xs].max() + grid.dlon / 2, 4), r(grid.lat_edges[ys.min()], 4)],
                'old_rate_cm_per_12d': r(np.median(res['b_old'][m]) * f12), 'new_rate_cm_per_12d': r(np.median(res['b_new'][m]) * f12),
                'old_rate_cm_per_month': r(np.median(res['b_old'][m]) * fmo), 'new_rate_cm_per_month': r(np.median(res['b_new'][m]) * fmo),
                'change_cm_per_12d': r(np.median(res['diff'][m]) * f12), 'median_z': r(zmed, 1),
                'robust_share': r(robust, 2), 'robust_to_single_date': robust >= 0.5, 'confidence': conf,
            })
    areas.sort(key=lambda a: -a['area_km2'])

    # background: the same test on earlier window pairs
    def run_background(bn, bo):
        bvalid = np.all(np.isfinite(grid.cube[bo + bn]), axis=0)
        if grid.clip:
            bvalid &= ~np.any(np.abs(grid.cube[bo + bn]) >= grid.clip - grid.step, axis=0)
        b = change_test(grid.cube, t, bn, bo, sigma, bvalid)
        return {'previous': [fmt_date(dates[bo[0]]), fmt_date(dates[bo[-1]])], 'recent': [fmt_date(dates[bn[0]]), fmt_date(dates[bn[-1]])],
                'faster_km2': r(grid.cell_km2[b['flags']['faster'][0]].sum(), 1),
                'slower_km2': r(grid.cell_km2[b['flags']['slower'][0]].sum(), 1),
                'tested_km2': r(grid.cell_km2[b['ok']].sum(), 0)}

    background = []
    shift = RECENT_DATES
    while True:
        bn, bo = windows(n, shift)
        if len(bo) < 3:
            break
        background.append(run_background(bn, bo))
        shift += RECENT_DATES
    if not background and n >= RECENT_DATES + 3:   # short records: one earlier comparison with 3 previous dates
        background.append(run_background(list(range(3, 3 + RECENT_DATES)), [0, 1, 2]))

    tested_km2 = float(grid.cell_km2[res['ok']].sum())
    method = (s.get('provenance', {}).get('method') or '') + ' ' + ' '.join(s.get('provenance', {}).get('assumptions') or [])
    smoothing = 'temporal smoothing' if ('temporal smoothing' in method or 'time series smoothed' in method) else None
    sens = None
    alt = [v for v in (noise['site_cm'] and math.sqrt(noise['site_cm'] ** 2 + noise['rounding_cm'] ** 2), noise['empirical_cm']) if v]
    if len(alt) == 2 and min(alt) < sigma * 0.95:
        rs = change_test(grid.cube, t, new_idx, old_idx, min(alt), valid)
        sens = {'sigma_cm': r(min(alt), 3), 'min_detectable_change_cm_per_12d': r(K_SIGMA * rs['sd'] * 12, 2),
                'faster_km2': r(grid.cell_km2[rs['flags']['faster'][0]].sum(), 1), 'slower_km2': r(grid.cell_km2[rs['flags']['slower'][0]].sum(), 1),
                'robust_km2': r(grid.cell_km2[(rs['flags']['faster'][0] | rs['flags']['slower'][0]) & (rs['loo_min_z'] >= LOO_SIGMA)].sum(), 1),
                'note': 'What the test would flag with the smaller of the two noise estimates. For information only; the headline uses the larger one.'
                        + (' Here the empirical value is NOT meaningful: this map is smoothed in time (%s), which hides date-to-date scatter.' % smoothing if smoothing else '')}
    bg_mean = (np.mean([b['faster_km2'] + b['slower_km2'] for b in background]) if background else None)
    flagged = total_km2['faster'] + total_km2['slower']
    if bg_mean is not None and flagged > 0 and flagged < 2 * bg_mean:
        for a in areas:
            a['confidence'] = {'high': 'medium', 'medium': 'low', 'low': 'low'}[a['confidence']]
            a['confidence_note'] = 'earlier window pairs flag a similar amount of area, so this may be seasonal change or noise'

    # site-wide speeds where the ground is sinking (cells beyond noise on the last date)
    last = grid.cube[-1]
    sinking = res['ok'] & (last <= -BEYOND_NOISE_SIGMA * sigma)
    if sinking.sum() >= MIN_CELLS:
        sink_old = float(np.median(res['b_old'][sinking]) * f12)
        sink_new = float(np.median(res['b_new'][sinking]) * f12)
        sink_sd = sd12 / math.sqrt(1)   # medians over many cells share the (spatially correlated) noise: no sqrt(N) credit
    else:
        sink_old = sink_new = sink_sd = None

    if not areas:
        verdict = ('No change in sinking speed detectable above noise between %s to %s and %s to %s. '
                   'A cell would need its speed to change by %.2f cm per 12 days (%.1f cm per month) to be flagged.'
                   % (fmt_date(dates[old_idx[0]]), fmt_date(dates[old_idx[-1]]), fmt_date(dates[new_idx[0]]), fmt_date(dates[new_idx[-1]]),
                      K_SIGMA * sd12, K_SIGMA * sd12 * fmo / 12))
        status = 'none_detected'
    else:
        nf = sum(1 for a in areas if a['kind'] == 'sinking_faster')
        trusted = [a for a in areas if a['confidence'] != 'low']
        ns = len(areas) - nf
        verdict = ('%d area(s) sinking faster (%.1f km2) and %d sinking slower (%.1f km2) in %s to %s than in %s to %s, beyond %.0f sigma of noise.'
                   % (nf, total_km2['faster'], ns, total_km2['slower'], fmt_date(dates[new_idx[0]]), fmt_date(dates[new_idx[-1]]),
                      fmt_date(dates[old_idx[0]]), fmt_date(dates[old_idx[-1]]), K_SIGMA))
        if trusted:
            status = 'flagged'
            verdict += ' %d of them pass the robustness checks (medium or high confidence).' % len(trusted)
        else:
            status = 'flagged_low_confidence'
            verdict += (' None of them passes the robustness checks: each depends on a single date, touches the map edge, or earlier window pairs flag as much area, '
                        'so we treat this as no confirmed change.')

    # coarse grids for drawing: rate change (int8, step 0.05 cm/12d) and the flag mask, same layout as SITE_DATA grid
    step = 0.05
    q = np.where(res['ok'], np.clip(np.round(np.nan_to_num(res['diff'] * f12) / step), -127, 127), -128).astype(np.int8)
    mask = np.zeros(q.shape, np.uint8)
    mask[res['flags']['faster'][0]] = 1
    mask[res['flags']['slower'][0]] = 2

    return {
        'status': status, 'verdict': verdict,
        'windows': {
            'previous': {'from': fmt_date(dates[old_idx[0]]), 'to': fmt_date(dates[old_idx[-1]]), 'dates': len(old_idx),
                         'days': int(t[old_idx[-1]] - t[old_idx[0]])},
            'recent': {'from': fmt_date(dates[new_idx[0]]), 'to': fmt_date(dates[new_idx[-1]]), 'dates': len(new_idx),
                       'days': int(t[new_idx[-1]] - t[new_idx[0]])},
            'rule': 'recent = last %d dates; previous = up to %d dates immediately before; no shared date' % (RECENT_DATES, PREVIOUS_DATES),
        },
        'noise': noise,
        'threshold': {
            'k_sigma': K_SIGMA, 'min_cells': MIN_CELLS,
            'sigma_change_cm_per_12d': r(sd12, 3),
            'min_detectable_change_cm_per_12d': r(K_SIGMA * sd12, 2),
            'min_detectable_change_cm_per_month': r(K_SIGMA * sd12 * fmo / 12, 2),
            'robustness': 'an area touching the map edge or a no-data gap drops one level; an area is robust_to_single_date when at least half its cells keep |z| >= %g after dropping any one date of either window; confidence: high = robust, >= 8 cells and median |z| >= 4; medium = robust; low = not robust; one level lower when earlier window pairs flag at least half as much area' % LOO_SIGMA,
            'formula': 'sigma_change = 12 * sigma * sqrt(1/Sxx_recent + 1/Sxx_previous) cm per 12 days, Sxx = sum (t - mean t)^2 over the window dates in days^2; flag |rate_recent - rate_previous| >= %g * sigma_change, keep connected groups of >= %d cells' % (K_SIGMA, MIN_CELLS),
            'sxx_recent_days2': r(res['sxx_new'], 0), 'sxx_previous_days2': r(res['sxx_old'], 0), 'sigma_cm': sigma,
        },
        'tested_km2': r(tested_km2, 0), 'excluded_clipped_cells': clipped_cells,
        'flagged_km2': {'faster': r(total_km2['faster'], 1), 'slower': r(total_km2['slower'], 1)},
        'areas': areas[:25],
        'areas_total': len(areas),
        'background': background,
        'sensitivity': sens,
        'background_note': ('Same test on earlier window pairs of this record. If they flag as much area as the latest pair, a flag now is not unusual.'
                            if background else 'Record too short for an earlier comparison.'),
        'sinking_zone_rates': None if sink_old is None else {
            'cells': int(sinking.sum()), 'old_cm_per_12d': r(sink_old), 'new_cm_per_12d': r(sink_new),
            'old_cm_per_month': r(sink_old * fmo / 12), 'new_cm_per_month': r(sink_new * fmo / 12),
            'note': 'median over all cells beyond noise on the last date; noise is spatially correlated, so this median is not much more precise than one cell (sigma of the change ~ %.2f cm per 12 days)' % sd12},
        'gps': None,   # filled by caller
        'grid': {'width': grid.w, 'height': grid.h, 'bounds': [[grid.s_lat, grid.w_lon], [grid.n_lat, grid.e_lon]],
                 'rows': 'evenly spaced in Web Mercator, north first (same layout as SITE_DATA[id].grid)',
                 'rate_change_step_cm_per_12d': step, 'nodata': -128,
                 'rate_change_b64': base64.b64encode(q.tobytes()).decode('ascii'),
                 'flags_b64': base64.b64encode(mask.tobytes()).decode('ascii'),
                 'flags_legend': {'0': 'no flag', '1': 'sinking faster (recent minus previous rate <= -%g sigma)' % K_SIGMA,
                                  '2': 'sinking slower or rising (>= +%g sigma)' % K_SIGMA}},
        '_internal': (t, new_idx, old_idx, res),
    }


# ------------------------------------------------------------------ exposure
def exposure(s, grid, pop, sigma, quantity):
    last = grid.cube[-1]
    mapped = np.isfinite(last)
    thr = {'beyond_noise_cm': r(-BEYOND_NOISE_SIGMA * sigma, 2), 'ge_5cm': -5.0, 'ge_10cm': -10.0}
    area_mapped = float(grid.cell_km2[mapped].sum())
    pop_mapped = float(pop[mapped].sum())
    out = {}
    for key, cut in (('beyond_noise', thr['beyond_noise_cm']), ('ge_5cm', -5.0), ('ge_10cm', -10.0)):
        m = mapped & (last <= cut)
        out[key] = {'threshold_cm': cut, 'people': int(round(float(pop[m].sum()), -2)),
                    'area_km2': r(grid.cell_km2[m].sum(), 1),
                    'share_of_mapped_area': r(grid.cell_km2[m].sum() / area_mapped, 3) if area_mapped else None,
                    'share_of_mapped_people': r(pop[m].sum() / pop_mapped, 3) if pop_mapped else None,
                    'threshold_is_beyond_noise': cut <= -BEYOND_NOISE_SIGMA * sigma}
    dens = pop / grid.cell_km2
    hot = mapped & (dens > 50000)
    return {
        'population_check': {
            'cells_over_50k_per_km2': int(hot.sum()), 'people_in_them': int(round(float(pop[hot].sum()), -3)),
            'max_cell_people_per_km2': int(round(float(dens[mapped].max()), -3)) if mapped.any() else None,
            'note': 'Densities above 50,000 per km2 over a ~0.25 km2 cell are rare in reality; many such cells mean the population model may over-allocate here.'},
        'quantity': quantity, 'period': {'from': fmt_date(s['dates'][0]), 'to': fmt_date(s['dates'][-1]), 'days': s['span_days']},
        'sigma_cm': sigma, 'beyond_noise_rule': 'cumulative change on the last date at or below -%g sigma' % BEYOND_NOISE_SIGMA,
        'mapped': {'area_km2': r(area_mapped, 0), 'people': int(round(pop_mapped, -3)),
                   'people_in_bbox': int(round(float(pop.sum()), -3))},
        'people': out,
        'cell_m': r(grid.cell_m, 0),
        'rounding': 'people rounded to the nearest 100; mapped totals to the nearest 1000',
    }


# ------------------------------------------------------------------ per site
def build(site_id, cfg, cache, offline, refresh_osm):
    s = read_site(site_id)
    grid = Grid(s)
    log('[%s] %d dates, grid %dx%d (%.0f m cells), quantity %s' % (site_id, len(s['dates']), grid.w, grid.h, grid.cell_m, s['quantity']['key']))
    bbox = [grid.w_lon, grid.s_lat, grid.e_lon, grid.n_lat]

    # places for naming: OSM place nodes + the site's own named places
    if site_id == 'sjv':
        osm, osm_path = overpass(site_id, bbox, cache, offline, refresh_osm, places_only=True)
    else:
        osm, osm_path = overpass(site_id, bbox, cache, offline, refresh_osm)
    elements = osm.get('elements', [])
    places = osm_places(elements) + [{'name': p['name'], 'lat': p['lat'], 'lon': p['lon'], 'rank': 0} for p in s.get('places', [])]

    change = change_analysis(s, grid, places)
    t, new_idx, old_idx, res = change.pop('_internal')
    sigma = change['noise']['sigma_cm']
    gps = gps_change(s, t, new_idx, old_idx, grid, res) if s.get('gps') else []
    change['gps'] = gps or None
    if gps:
        usable = [g for g in gps if g.get('usable')]
        agree = sum(1 for g in usable if g['verdict'].startswith('agree'))
        gps_moved = sum(1 for g in usable if abs(g['gps_z']) >= 2)
        moved = [g for g in usable if abs(g['gps_z']) >= 2]
        same = sum(1 for g in moved if g['radar_same_direction'])
        change['gps_summary'] = ('%d of %d GPS stations agree with the radar verdict. %d station(s) show a change in speed beyond 2 sigma of their own scatter%s.'
                                 % (agree, len(usable), gps_moved,
                                    '' if not moved else '; at %d of them the radar rate changed in the same direction, but by less than its own noise allows us to call' % same
                                    if not any(abs(g['radar_z'] or 0) >= 2 for g in moved) else '; at %d of them the radar rate changed in the same direction' % same))

    usable = [g for g in gps if g.get('usable') and g.get('radar_change_cm_per_12d') is not None]
    if len(usable) >= 5:
        rd = np.array([g['radar_change_cm_per_12d'] for g in usable])
        gd = np.array([g['gps_change_cm_per_12d'] for g in usable])
        sd_obs = float(np.std(rd - gd, ddof=1))
        thr = change['threshold']
        sigma_eq = sd_obs / thr['sigma_change_cm_per_12d'] * sigma          # per-date sigma that would give this change noise
        valid = np.all(np.isfinite(grid.cube[old_idx + new_idx]), axis=0)
        if grid.clip:
            valid &= ~np.any(np.abs(grid.cube[old_idx + new_idx]) >= grid.clip - grid.step, axis=0)
        alt = change_test(grid.cube, t, new_idx, old_idx, sigma_eq, valid)
        change['gps_check'] = {
            'stations': len(usable), 'sigma_change_radar_minus_gps_cm_per_12d': r(sd_obs, 3),
            'mean_radar_minus_gps_cm_per_12d': r(float(np.mean(rd - gd)), 3), 'r': r(float(np.corrcoef(rd, gd)[0, 1]), 2),
            'model_sigma_change_cm_per_12d': thr['sigma_change_cm_per_12d'],
            'with_gps_sigma': {'min_detectable_change_cm_per_12d': r(K_SIGMA * sd_obs, 2),
                               'faster_km2': r(grid.cell_km2[alt['flags']['faster'][0]].sum(), 1),
                               'slower_km2': r(grid.cell_km2[alt['flags']['slower'][0]].sum(), 1),
                               'robust_km2': r(grid.cell_km2[(alt['flags']['faster'][0] | alt['flags']['slower'][0]) & (alt['loo_min_z'] >= LOO_SIGMA)].sum(), 1)},
            'note': ('Scatter of (radar change in speed - GPS change in speed) across stations. It includes GPS noise, so it is an upper bound for the radar alone. '
                     'If it is smaller than the model value, the model is cautious; with_gps_sigma shows what the test would flag at this noise.'),
        }

    gc = change.get('gps_check')
    if gc and gc['sigma_change_radar_minus_gps_cm_per_12d'] < gc['model_sigma_change_cm_per_12d']:
        w = gc['with_gps_sigma']
        change['verdict'] += (" Checked against %d GPS stations, the radar's real noise on a change in speed is smaller (%.2f instead of %.2f cm per 12 days); "
                              'at that noise the same test would flag %.0f km2 sinking slower and %.0f km2 sinking faster (%.0f km2 robust to dropping any one date). '
                              'This is a secondary result: it relies on the GPS-based noise, not the site noise.'
                              % (gc['stations'], gc['sigma_change_radar_minus_gps_cm_per_12d'], gc['model_sigma_change_cm_per_12d'],
                                 w['slower_km2'], w['faster_km2'], w['robust_km2']))

    pop = population_on_grid(site_id, grid, cache, offline)
    expo = exposure(s, grid, pop, sigma, s['quantity'])
    thresholds = {'beyond_noise_cm': expo['people']['beyond_noise']['threshold_cm']}
    if site_id == 'sjv':
        infra = sjv_infrastructure(s, thresholds, places)
    else:
        infra = osm_infrastructure(elements, grid, grid.cube[-1], thresholds, places, sigma)
    expo['infrastructure'] = infra

    sources = [
        {'id': 'nisar', 'name': 'Groundline map of this site (NISAR L2 GUNW previews, NASA/JPL and ISRO via ASF DAAC)', 'file': 'data/%s.js' % site_id,
         'licence': 'NASA/ISRO open data', 'url': 'https://search.asf.alaska.edu/'},
        {'id': 'population', 'name': 'GHS-POP R2023A, residential population, epoch 2025, 3 arc-second (~90 m), WGS84 (GHS_POP_E2025_GLOBE_R2023A_4326_3ss V1-0)',
         'licence': 'CC BY 4.0, European Commission Joint Research Centre', 'citation': 'Schiavina M., Freire S., Carioli A., MacManus K. (2023): GHS-POP R2023A - GHS population grid multitemporal (1975-2030). European Commission, JRC. doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE',
         'url': 'https://ghsl.jrc.ec.europa.eu/ghs_pop2023.php',
         'tiles': ['R%d_C%d' % rc for rc in ghs_tiles_for(bbox)], 'year': 2025,
         'note': 'Epoch 2025 is modelled from census data of earlier years and built-up area; it is not a 2025 census.'},
        {'id': 'osm', 'name': 'OpenStreetMap contributors, via the Overpass API' + (' (place names only)' if site_id == 'sjv' else ''),
         'licence': 'ODbL 1.0', 'attribution': '© OpenStreetMap contributors', 'url': 'https://www.openstreetmap.org/copyright',
         'retrieved': dt.datetime.utcfromtimestamp(os.path.getmtime(osm_path)).strftime('%Y-%m-%d')},
    ]
    if site_id == 'sjv':
        sources.append({'id': 'profiles', 'name': 'Infrastructure profiles and 10 km reaches in data/sjv.js (team research export; alignments from OpenStreetMap)',
                        'licence': 'ODbL 1.0 for the alignments', 'file': 'data/sjv.js'})
    if gps:
        sources.append({'id': 'gps', 'name': 'GPS daily positions, Nevada Geodetic Laboratory (series as stored in data/%s.js)' % site_id,
                        'url': 'https://geodesy.unr.edu/', 'licence': 'free use with citation of Blewitt et al. 2018, Eos 99'})

    q = s['quantity']['key']
    caveats = [
        'Estimates from our map: cells of about %d m and a noise level of %.2f cm (%s). A cell is one value; a street or a building inside it can differ.'
        % (round(grid.cell_m, -1), sigma, change['noise']['used']),
        ('Thresholds apply to line-of-sight change; vertical sinking is roughly 1.3 times larger (LOS / 0.77, assumed angle), so the 5 and 10 cm counts are conservative.'
         if q == 'los' else 'Thresholds apply to vertical-equivalent change (line of sight / cos of an assumed angle; horizontal motion ignored).'),
        'All values are relative to the reference area of the map; if it moves, every number shifts with it.',
        'The "beyond noise" counts use a per-cell noise level. Errors that stretch over tens of km (a leftover tilt or a weather front) are not in it, so a broad area of 1 to 3 cm can pass the test without being real; the 5 and 10 cm counts are the safer headline.',
        'People are the GHS-POP 2025 model assigned to map cells by pixel centre; it counts residents, not workers or visitors.',
        'Period: %s to %s (%d days). Totals over a dry season are not yearly totals.' % (fmt_date(s['dates'][0]), fmt_date(s['dates'][-1]), s['span_days']),
        'The change test assumes independent errors on each date. Weather that persists over several passes, or seasonal pumping, can still create a real-looking change; the background comparisons show how often that happens.',
        'Not for engineering design or enforcement: use it to decide where to look, then confirm with surveyed data.',
    ]
    if site_id == 'sjv':
        caveats.append('The sjv map is clipped at 12 cm and smoothed in time with an 18-day kernel; cells near the clip are left out of the change test, and the smoothing spreads a change over neighbouring dates.')
        caveats.append('The sjv noise (2.52 cm) is the error of the final cumulative value against held-out GPS; using it as a per-date error makes the change test strict.')
    pc = expo['population_check']
    if pc['cells_over_50k_per_km2'] >= 10:
        caveats.append('Population check: GHS-POP puts %s people in %d map cells denser than 50,000 per km2 (up to %s per km2). That is implausible for whole cells, '
                       'so people counts here may be too high; treat them as upper-end estimates.' % (format(pc['people_in_them'], ','), pc['cells_over_50k_per_km2'], format(pc['max_cell_people_per_km2'], ',')))
    if site_id == 'rafsanjan':
        caveats.append('Rafsanjan has no stable-area noise estimate and its reference is the city core, which may itself sink: numbers are lower bounds and the noise is only the empirical value.')
    if site_id != 'sjv':
        caveats.append('Infrastructure from OpenStreetMap: completeness varies by country; lengths are centre lines. © OpenStreetMap contributors, ODbL.')

    payload = {
        'schema': SCHEMA, 'id': site_id, 'generated_utc': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'built_by': 'pipeline/build_impact.py',
        'map': {'quantity': q, 'dates': [fmt_date(s['dates'][0]), fmt_date(s['dates'][-1])], 'cell_m': r(grid.cell_m, 0),
                'sigma_cm': sigma, 'grid_step_cm': grid.step},
        'exposure': expo, 'change': change, 'sources': sources, 'caveats': caveats,
    }
    path = os.path.join(DATA, site_id + '_impact.js')
    text = ('// Written by pipeline/build_impact.py from data/%s.js, GHS-POP 2025 and OpenStreetMap. Do not edit by hand.\n'
            'window.IMPACT = window.IMPACT || {};\nwindow.IMPACT[%s] = ' % (site_id, json.dumps(site_id))
            + json.dumps(payload, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + ';\n')
    with open(path + '.part', 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    os.replace(path + '.part', path)
    p = expo['people']
    log('  wrote %s (%d kB)' % (os.path.relpath(path), len(text.encode()) // 1024))
    log('  sigma %.2f cm (%s); people beyond noise %s, >=5 cm %s, >=10 cm %s' % (sigma, change['noise']['used'], p['beyond_noise']['people'], p['ge_5cm']['people'], p['ge_10cm']['people']))
    log('  change: %s' % change['verdict'])
    for g in gps or []:
        if g.get('usable'):
            log('   GPS %s: gps %+.2f -> %+.2f (z %.1f), radar %s -> %s (z %s): %s' % (g['id'], g['gps_old_cm_per_12d'], g['gps_new_cm_per_12d'], g['gps_z'],
                                                                               g['radar_old_cm_per_12d'], g['radar_new_cm_per_12d'], g['radar_z'], g['verdict']))
    return payload


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('sites', nargs='*', default=PUBLISHED)
    ap.add_argument('--cache', default=os.path.join(HERE, 'cache'))
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--refresh-osm', action='store_true')
    a = ap.parse_args()
    with open(os.path.join(HERE, 'sites.json'), encoding='utf-8') as fh:
        cfg = json.load(fh)
    for sid in a.sites:
        if not os.path.exists(os.path.join(DATA, sid + '.js')):
            log('skip %s: no site/data/%s.js' % (sid, sid))
            continue
        build(sid, cfg.get(sid, {}), a.cache, a.offline, a.refresh_osm)


if __name__ == '__main__':
    sys.exit(main())
