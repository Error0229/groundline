"""Groundline pipeline v2: one site from the full NISAR L2 GUNW HDF5 products (Earthdata login via netrc).

    python pipeline/v2/run.py <site-id> [--publish] [--out DIR] [--no-fetch] [--allow-download]
                                        [--no-iono] [--tropo SIGN] [--no-elevation] [--coh-min X] [--tag NAME]

Writes pipeline/out_v2/<id>/<id>.js (same window.SITE_DATA schema as site/data/<id>.js), img/*.png and
report.json (gate numbers, GPS statistics, timings, data volume). With --publish, and only if the quality
gate passes, the old site/data/<id>.js and site/img/<id>/ are copied to pipeline/out_v2/_backup/<id>/
and replaced. Sites whose config says "publish": false are never published.

Exit codes: 0 gate passed; 2 quality gate refused (report.json says why); 3 no usable data.
"""
import argparse
import datetime as dt
import json
import os
import shutil
import sys
import time

import numpy as np
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.dirname(HERE)
SITE = os.path.join(PIPE, '..', 'site')
sys.path.insert(0, PIPE)
sys.path.insert(0, HERE)

from nisar import export, georef, gps, search  # noqa: E402

import dem  # noqa: E402
import fetch  # noqa: E402
import gunw  # noqa: E402
import process  # noqa: E402
import remote  # noqa: E402

# ---------------------------------------------------------------- quality gate (v2)
# Thresholds were FROZEN on 2026-11-14 after calibrating on the two GPS-validated sites (mexico_city: epoch
# noise 0.44 cm, coherent fraction 0.94; sjv: 0.94 cm, 0.93) and physical reasoning, BEFORE
# the other sites were run; see README "Pipeline v2" for the rationale of each number.
GATE = {
    'min_pairs': 3,               # a chain needs at least 3 pairs (36 days) to separate motion from noise
    'pair_coherent_frac': 0.20,   # a pair with < 20 % usable land cells is dropped before chaining
    'coherent_frac': 0.40,        # mean usable fraction of land cells over the chain
    'usable_frac': 0.30,          # land cells that survive the whole chain (gap-filled in <= 30 % of pairs)
    'temporal_noise_cm': 1.0,     # median epoch noise about a smooth trajectory (closure proxy), LOS cm
    'reference_ok_frac': 0.80,    # the stable reference must be coherent in >= 80 % of the pairs
    'signal_snr': 3.0,            # deepest point (3x3 median) must exceed 3 sigma of its own uncertainty
}


CANDIDATES = os.path.join(PIPE, 'hotspots_candidates.json')


def load_sites():
    """sites.json plus the gap-region catalogue (hotspots_candidates.json, same entry schema).

    A sites.json entry wins when an id exists in both. Catalogue entries are always publish:false here:
    their outputs go to pipeline/out_v2/<id>/ only.
    """
    with open(os.path.join(PIPE, 'sites.json'), encoding='utf-8') as fh:
        sites = json.load(fh)
    if os.path.exists(CANDIDATES):
        with open(CANDIDATES, encoding='utf-8') as fh:
            cands = json.load(fh)
        for k, v in cands.items():
            if k.startswith('_') or not isinstance(v, dict) or k in sites or 'bbox' not in v or 'track' not in v:
                continue
            sites[k] = dict(v, publish=False, catalogue=True)
    return sites


def gps_enu(station, cache_dir, ctx):
    """(days, east, north, up) in cm from the NGL tenv3 file (same source and cache as v1)."""
    path = gps.fetch_tenv3(station, cache_dir, ctx)
    import datetime as _dt
    days, e, n, u = [], [], [], []
    with open(path, encoding='latin-1') as fh:
        for line in fh:
            p = line.split()
            try:
                day = _dt.date(2000 + int(p[1][:2]), gps.MONTHS[p[1][2:5]], int(p[1][5:]))
                vals = [(float(p[7]) + float(p[8])) * 100, (float(p[9]) + float(p[10])) * 100, (float(p[11]) + float(p[12])) * 100]
            except (IndexError, KeyError, ValueError):
                continue
            days.append(day.toordinal())
            e.append(vals[0]); n.append(vals[1]); u.append(vals[2])
    return np.array(days), np.array(e), np.array(n), np.array(u)


HOLDINGS_URL = 'https://geodesy.unr.edu/NGLStationPages/DataHoldings.txt'


def ngl_stations(bbox, first, last, cache_dir, ctx, exclude=()):
    """Every NGL station inside the bbox with data covering at least part of [first, last] (YYYYMMDD)."""
    path = os.path.join(cache_dir, 'DataHoldings.txt')
    if not os.path.exists(path) or os.path.getmtime(path) < time.time() - 7 * 86400:
        data = search.http_get(HOLDINGS_URL, ctx)
        with open(path + '.part', 'wb') as fh:
            fh.write(data)
        os.replace(path + '.part', path)
    west, south, east, north = bbox
    f0 = '%s-%s-%s' % (first[:4], first[4:6], first[6:])
    l0 = '%s-%s-%s' % (last[:4], last[4:6], last[6:])
    out = []
    with open(path, encoding='latin-1') as fh:
        next(fh)
        for line in fh:
            p = line.split()
            try:
                lat, lon, beg, end = float(p[1]), float(p[2]), p[7], p[8]
            except (IndexError, ValueError):
                continue
            lon = lon - 360 if lon > 180 else lon
            if west <= lon <= east and south <= lat <= north and end >= f0 and beg <= l0 and p[0] not in exclude:
                out.append({'id': p[0], 'lon': lon, 'lat': lat, 'radius_px': 1})
    return out


def zero_first(series):
    s = np.asarray(series, float)
    ok = np.isfinite(s)
    return s - s[ok][0] if ok.any() else s


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('site')
    ap.add_argument('--out', default=os.path.join(PIPE, 'out_v2'))
    ap.add_argument('--cache', default=os.path.join(PIPE, 'cache'))
    ap.add_argument('--publish', action='store_true', help='replace site/data/<id>.js if the gate passes (old copy backed up)')
    ap.add_argument('--no-fetch', action='store_true', help='use cached subsets only')
    ap.add_argument('--allow-download', action='store_true', help='fall back to download-subset-delete if byte ranges fail')
    ap.add_argument('--no-iono', action='store_true')
    ap.add_argument('--tropo', type=float, default=0.0, help='subtract SIGN x (wet+hydrostatic) cube screens (ablation)')
    ap.add_argument('--no-elevation', action='store_true')
    ap.add_argument('--coh-min', type=float, default=None)
    ap.add_argument('--no-recover', action='store_true', help='keep only main-component cells (ablation)')
    ap.add_argument('--no-ngl', action='store_true', help='do not add NGL stations found inside the bbox')
    ap.add_argument('--tag', default='', help='suffix for the output folder (ablation runs)')
    args = ap.parse_args(argv)
    t_start = time.time()

    sites = load_sites()
    if args.site not in sites:
        sys.exit('unknown site %r; known: %s' % (args.site, ', '.join(sites)))
    cfg = sites[args.site]
    opts = process.Options(iono=not args.no_iono, tropo=args.tropo, elevation=not args.no_elevation)
    if args.coh_min is not None:
        opts.coh_min = args.coh_min
    opts.recover = not args.no_recover
    v2cache = os.path.join(args.cache, 'v2')
    os.makedirs(v2cache, exist_ok=True)
    out_dir = os.path.join(args.out, args.site + (('_' + args.tag) if args.tag else ''))
    img_dir = os.path.join(out_dir, 'img')
    os.makedirs(img_dir, exist_ok=True)
    report = {'site': args.site, 'options': dict(opts.__dict__), 'gate_thresholds': GATE}

    # ---- 1-2 find and read (subsets cached as .npz)
    if args.no_fetch:
        cands = fetch.candidates(args.site, cfg, v2cache)
        got = [(r, os.path.join(v2cache, args.site, r['granule'] + '.npz')) for r in cands]
        got = [(r, p) for r, p in got if os.path.exists(p)]
        fetch_info = {'bytes': 0, 'seconds': 0, 'candidates': len(cands)}
    else:
        got, fetch_info = fetch.fetch_site(args.site, cfg, v2cache, allow_download=args.allow_download)
    report['fetch'] = fetch_info
    if len(got) < GATE['min_pairs']:
        return finish(report, out_dir, 3, 'only %d pairs with data' % len(got))
    subs = {r['granule']: gunw.load_npz(p) for r, p in got}
    recs = [r for r, _ in got]
    shape0 = subs[recs[0]['granule']]['unw'].shape
    same = [r for r in recs if subs[r['granule']]['unw'].shape == shape0
            and np.allclose(subs[r['granule']]['x'], subs[recs[0]['granule']]['x'])
            and np.allclose(subs[r['granule']]['y'], subs[recs[0]['granule']]['y'])]
    if len(same) < len(recs):
        print('note: %d pairs on a different grid were left out' % (len(recs) - len(same)))
    recs = same

    # ---- terrain
    s0 = subs[recs[0]['granule']]
    heights = dem.heights_utm(s0['x'], s0['y'], s0['epsg'], os.path.join(args.cache, 'dem'))

    # ---- pair-level gate, then the longest chain
    probe = process.Stack([subs[r['granule']] for r in recs], recs, cfg, heights, opts)
    pair_frac = {}
    for r in recs:
        _, valid, land = probe.pair_cm(subs[r['granule']])
        valid = valid & ~probe.last_recovered          # gate on reliable cells, not recovered ones
        box = probe.in_bbox & land
        pair_frac[r['granule']] = float((valid & box).sum() / max(box.sum(), 1))
    dropped = [r for r in recs if pair_frac[r['granule']] < GATE['pair_coherent_frac']]
    kept = [r for r in recs if pair_frac[r['granule']] >= GATE['pair_coherent_frac']]
    chain = search.longest_chain(kept)
    report['pairs'] = {'candidates': len(recs), 'dropped_low_coherence': [[r['ref'], r['sec'], round(pair_frac[r['granule']], 3)] for r in dropped],
                       'chain': len(chain)}
    print('pairs: %d with data, %d dropped (coherent fraction < %.2f), chain of %d'
          % (len(recs), len(dropped), GATE['pair_coherent_frac'], len(chain)))
    if len(chain) < GATE['min_pairs']:
        report['gate'] = {'passed': False, 'checks': {'min_pairs': {'value': len(chain), 'threshold': GATE['min_pairs'], 'ok': False}}}
        return finish(report, out_dir, 2, 'chain of %d pairs' % len(chain))

    # ---- two passes: (1) all valid cells fit, (2) fit only on cells that do not move
    st = process.Stack([subs[r['granule']] for r in chain], chain, cfg, heights, opts)
    st.run()
    quiet = st.quiet_mask()
    st.run(quiet)
    sigma_t = st.temporal_noise()
    sigma = st.uncertainty(sigma_t)
    extra = [(r, subs[r['granule']]) for r in recs if r not in chain]
    closures = st.closures(extra)
    cube = st.cube
    dates, days = st.dates, st.days
    span_days = int(days[-1] - days[0])
    land_box = st.in_bbox & np.isfinite(heights)

    # ---- gate
    land_cells = st.in_bbox & (np.mean([subs[r['granule']]['land_frac'] for r in chain], 0) >= 0.5)
    coherent = float(np.mean([p['coherent_frac'] for p in st.pair_info]))
    usable = float((st.usable & land_cells).sum() / max(land_cells.sum(), 1))
    tnoise = float(np.nanmedian(sigma_t[st.usable & land_cells])) if (st.usable & land_cells).any() else np.inf
    ref_frac = float(np.mean([p['reference_ok'] for p in st.pair_info])) if st.reference is not None else None
    final = cube[-1]
    med3 = np.where(np.isfinite(final), ndi.median_filter(np.nan_to_num(final), 3), np.nan)
    med3[~st.in_bbox] = np.nan
    # signal: the MOST SIGNIFICANT sinking anywhere in the box (3x3 median of value / 3x3 median of 1 sigma),
    # not the SNR at the deepest point, which is often a noisy cell with a large sigma of its own
    sig3 = np.where(np.isfinite(sigma[-1]), ndi.median_filter(np.nan_to_num(sigma[-1], nan=1e3), 3), np.nan)
    with np.errstate(invalid='ignore', divide='ignore'):
        z = np.where(np.isfinite(med3) & (sig3 > 0), -med3 / sig3, np.nan)
    if np.isfinite(z).any():
        iy, ix = np.unravel_index(np.nanargmax(z), z.shape)
        snr = float(z[iy, ix])
        report['most_significant'] = {'value_cm': round(float(med3[iy, ix]), 2), 'sigma_cm': round(float(sig3[iy, ix]), 2),
                                      'lon': round(float(st.lon[iy, ix]), 4), 'lat': round(float(st.lat[iy, ix]), 4)}
    else:
        snr = 0.0
    checks = {
        'min_pairs': {'value': len(chain), 'threshold': GATE['min_pairs'], 'ok': len(chain) >= GATE['min_pairs']},
        'coherent_frac': {'value': round(coherent, 3), 'threshold': GATE['coherent_frac'], 'ok': coherent >= GATE['coherent_frac']},
        'usable_frac': {'value': round(usable, 3), 'threshold': GATE['usable_frac'], 'ok': usable >= GATE['usable_frac']},
        'temporal_noise_cm': {'value': round(tnoise, 2), 'threshold': GATE['temporal_noise_cm'], 'ok': tnoise <= GATE['temporal_noise_cm']},
        'reference_ok_frac': {'value': None if ref_frac is None else round(ref_frac, 2), 'threshold': GATE['reference_ok_frac'],
                              'ok': ref_frac is None or ref_frac >= GATE['reference_ok_frac']},
        'signal_snr': {'value': round(snr, 1), 'threshold': GATE['signal_snr'], 'ok': snr >= GATE['signal_snr']},
    }
    failed = [k for k, c in checks.items() if not c['ok']]
    report['gate'] = {'passed': not failed, 'failed': failed, 'checks': checks, 'closures': closures}
    print('gate: %s' % ('PASSED' if not failed else 'REFUSED (' + ', '.join(failed) + ')'))
    for k, c in checks.items():
        print('  %-18s %8s  (threshold %s)%s' % (k, c['value'], c['threshold'], '' if c['ok'] else '  <-- fails'))
    if closures:
        print('  closures:', closures)

    # ---- GPS
    ctx = search.tls_context()
    gnss_dir = os.path.join(args.cache, 'gnss')
    os.makedirs(gnss_dir, exist_ok=True)
    cos_assumed = cfg.get('cos_incidence_assumed', 0.77)
    stations, extra_stats = [], []
    auto = [] if args.no_ngl else ngl_stations(cfg['bbox'], dates[0], dates[-1], gnss_dir, ctx, {g['id'] for g in cfg.get('gps', [])})
    for sta in cfg.get('gps', []) + auto:
        configured = sta not in auto
        try:
            gd, ge, gn, gu = gps_enu(sta['id'], gnss_dir, ctx)
        except Exception as err:                 # noqa: BLE001
            print('  GPS %s unavailable: %s' % (sta['id'], err))
            continue
        sx, sy = process.utm_of(sta['lon'], sta['lat'], st.epsg)
        win = process.disk(st.shape, st.x, st.y, sx[0], sy[0], max(sta.get('radius_px', 1) * 240.0, 0.75 * st.cell_m))
        radar = np.array([np.nanmedian(layer[win]) if np.isfinite(layer[win]).any() else np.nan for layer in cube])
        rsig = np.array([np.nanmedian(layer[win]) if np.isfinite(layer[win]).any() else np.nan for layer in sigma])
        enu = [zero_first(gps.at_epochs(gd, comp, days)) for comp in (ge, gn, gu)]
        los = st.los_enu[:, win].mean(1) if win.any() else np.array([0, 0, 1.0])
        cos_inc = float(np.cos(np.radians(np.nanmean(st.incidence[win])))) if win.any() else cos_assumed
        gps_los = enu[0] * los[0] + enu[1] * los[1] + enu[2] * los[2]
        same_method = gps.compare(radar, enu[2] * cos_assumed)
        los_stats = gps.compare(radar, gps_los)
        motion = float(np.nanmax(gps_los) - np.nanmin(gps_los)) if np.isfinite(gps_los).any() else None
        if configured or same_method['r'] is not None:
            print('  GPS %s%s: up x %.2f r=%s RMS=%s | full LOS r=%s RMS=%s | n=%d | GPS LOS range %.1f cm'
                  % (sta['id'], '' if configured else ' (NGL, auto)', cos_assumed, same_method['r'], same_method['rms_cm'],
                     los_stats['r'], los_stats['rms_cm'], los_stats['n'], motion or 0))
        if not configured:
            if los_stats['r'] is not None:
                extra_stats.append({'id': sta['id'], 'lat': round(sta['lat'], 4), 'lon': round(sta['lon'], 4), **los_stats,
                                    'gps_range_cm': round(motion, 2), 'radar_last_cm': export.rounded(radar[-1:])[0],
                                    'gps_last_cm': export.rounded(gps_los[-1:])[0],
                                    'radar_sigma_last_cm': export.rounded(rsig[-1:])[0], 'up_x_assumed': same_method})
            continue
        stations.append({'id': sta['id'], 'lat': sta['lat'], 'lon': sta['lon'],
                         'gps_cm': export.rounded(gps_los), 'gps_up_cm': export.rounded(enu[2]),
                         'radar_cm': export.rounded(radar), **los_stats,
                         'gps_label': 'GPS east, north and up projected onto the radar line of sight (product geometry)',
                         'radar_label': 'Radar, line of sight',
                         'radar_sigma_cm': export.rounded(rsig),
                         'los_unit_enu': [round(float(v), 4) for v in los], 'cos_incidence': round(cos_inc, 3),
                         'up_x_assumed': {'cos': cos_assumed, **same_method}})
    for s_ in stations:
        g_ = np.array([np.nan if v is None else v for v in s_['gps_cm']], float)
        s_['gps_range_cm'] = round(float(np.nanmax(g_) - np.nanmin(g_)), 2) if np.isfinite(g_).any() else None
    report['gps'] = [{'id': s['id'], 'r': s['r'], 'rms_cm': s['rms_cm'], 'n': s['n'], 'gps_range_cm': s['gps_range_cm'],
                      'up_x_assumed': s['up_x_assumed']} for s in stations]
    report['gps_extra'] = extra_stats

    # ---- stable areas, places, extreme (same definitions as v1)
    stable = []
    for area in cfg.get('stable_areas', []):
        w_, s_, e_, n_ = area['bbox']
        box = (st.lon >= w_) & (st.lon <= e_) & (st.lat >= s_) & (st.lat <= n_)
        values = final[box]
        if np.isfinite(values).sum() > 5:
            stable.append({'name': area['name'], 'std_cm': round(float(np.nanstd(values)), 2), 'mean_cm': round(float(np.nanmean(values)), 2)})
    noise_cm = max([s['std_cm'] for s in stable], default=None)
    places = []
    for place in cfg.get('places', []):
        px, py = process.utm_of(place['lon'], place['lat'], st.epsg)
        near = process.disk(st.shape, st.x, st.y, px[0], py[0], place['radius_km'] * 1000)
        if np.isfinite(final[near]).sum() < 3:
            continue
        places.append({'name': place['name'], 'lat': place['lat'], 'lon': place['lon'], 'radius_km': place['radius_km'],
                       'median_cm': round(float(np.nanmedian(final[near])), 1), 'p05_cm': round(float(np.nanpercentile(final[near], 5)), 1),
                       'p95_cm': round(float(np.nanpercentile(final[near], 95)), 1),
                       'series_cm': export.rounded([np.nanmedian(layer[near]) for layer in cube]),
                       'sigma_cm': round(float(np.nanmedian(sigma[-1][near])), 2)})

    # ---- regrid to the web map
    west, south, east, north = cfg['bbox']
    lat_mid = (south + north) / 2
    step_deg = st.cell_m / (111320.0 * np.cos(np.radians(lat_mid)))
    lons, lats = georef.web_grid(west, south, east, north, step_deg)
    layout = existing_layout(args.site, cfg)
    if layout:                         # keep the published image layout (other layers, e.g. impact, share it)
        W, H = layout
        lons = west + (np.arange(W) + 0.5) * (east - west) / W
        ys = georef.mercator_y(north) - (np.arange(H) + 0.5) * (georef.mercator_y(north) - georef.mercator_y(south)) / H
        lats = georef.inverse_mercator_y(ys)
    LON, LAT = np.meshgrid(lons, lats)
    ux, uy = process.utm_of(LON.ravel(), LAT.ravel(), st.epsg)
    cols = ((ux - st.x[0]) / (st.x[1] - st.x[0])).reshape(LON.shape)
    rows = ((uy - st.y[0]) / (st.y[1] - st.y[0])).reshape(LON.shape)

    def regrid(a):
        return ndi.map_coordinates(a, [rows, cols], order=1, cval=np.nan).astype(np.float32)

    web = np.stack([regrid(layer) for layer in cube])
    web_sigma = regrid(sigma[-1])
    web_coh = regrid(np.where(st.usable, np.mean([subs[r['granule']]['coh'] for r in chain], 0), np.nan))
    # fastest-sinking spot: deepest 3x3 median among cells that are themselves significant (>= 3 sigma),
    # so a noisy cell at a frame edge cannot win
    fm = np.where(np.isfinite(web[-1]), ndi.median_filter(np.nan_to_num(web[-1]), 3), np.nan)
    fs = np.where(np.isfinite(web_sigma), ndi.median_filter(np.nan_to_num(web_sigma, nan=1e3), 3), np.nan)
    with np.errstate(invalid='ignore', divide='ignore'):
        significant = np.isfinite(fm) & (fs > 0) & (-fm / fs >= GATE['signal_snr'])
    pick = np.where(significant, fm, np.nan) if significant.any() else fm
    jy, jx = np.unravel_index(np.nanargmin(pick), pick.shape)
    extreme = {'min_cm': round(float(fm[jy, jx]), 1), 'lat': round(float(lats[jy]), 4), 'lon': round(float(lons[jx]), 4),
               'sigma_cm': round(float(web_sigma[jy, jx]), 2) if np.isfinite(web_sigma[jy, jx]) else None}

    # ---- compact publishing (sites.json "publish_compact": {"every_days": 24, "image_stride": 2})
    # Gap-region sites ship fewer dated frames (about monthly) and fallback pictures at the resolution of the
    # value grid (which is what the page draws). The gate, the uncertainty and the GPS numbers in report.json
    # always use the full chain; only what is written to the data file is thinned.
    compact = cfg.get('publish_compact') or {}
    keep = list(range(len(dates)))
    if compact.get('every_days'):
        keep = [0]
        for i in range(1, len(dates)):
            if days[i] - days[keep[-1]] >= compact['every_days'] - 1:
                keep.append(i)
        if keep[-1] != len(dates) - 1:
            keep.append(len(dates) - 1)
        stations = [dict(s_, **thin_station(s_, keep)) for s_ in stations]
        for p in places:
            p['series_cm'] = [p['series_cm'][i] for i in keep]
    pub_dates, pub_web = [dates[i] for i in keep], web[keep]
    img_stride = int(compact.get('image_stride', 1))
    pic = (lambda a: a[..., ::img_stride, ::img_stride]) if img_stride > 1 else (lambda a: a)

    # ---- write
    image_url = 'img/%s/' % args.site
    vmax = cfg['vmax_cm']
    files = []
    for name in os.listdir(img_dir):
        if name.endswith('.png'):
            os.remove(os.path.join(img_dir, name))
    for date, layer in zip(pub_dates, pub_web):
        name = 'los_%s.png' % date
        export.save_overlay(os.path.join(img_dir, name), pic(layer), vmax)
        files.append(image_url + name)
    sig_max = max(2.0, float(np.ceil(np.nanpercentile(web_sigma, 98))))
    save_sequential(os.path.join(img_dir, 'sigma.png'), pic(web_sigma), sig_max)
    save_sequential(os.path.join(img_dir, 'coherence.png'), pic(web_coh), 1.0)
    cos_mean = float(np.cos(np.radians(np.nanmean(st.incidence[st.in_bbox]))))
    track = cfg['track']
    versions = sorted({(p['product_version'], p['crid']) for p in st.pair_info})
    elapsed = time.time() - t_start
    payload = {
        'schema': 1, 'id': args.site, 'name': cfg['name'], 'role': cfg.get('role', ''),
        'quantity': {'key': 'los', 'label': 'Line-of-sight change', 'short': 'line of sight',
                     'note': 'Motion toward (+) or away from (-) the satellite. Vertical is roughly this divided by %.2f '
                             '(incidence %.0f degrees, from the product metadata), if the ground moves only vertically.'
                             % (cos_mean, np.degrees(np.arccos(cos_mean)))},
        'dates': pub_dates, 'span_days': span_days,
        'view': {'center': view_center(web[-1], cfg['bbox'], (south + north) / 2, (west + east) / 2), 'zoom': cfg.get('zoom', 11 if east - west < 1.2 else 8)},
        'overlay': {'bounds': [[south, west], [north, east]], 'files': files, 'vmax_cm': vmax,
                    'web_size': [int(web.shape[2]), int(web.shape[1])], 'image_stride': img_stride},
        'extra_overlays': [
            {'id': 'sigma', 'label': 'Uncertainty map', 'file': image_url + 'sigma.png',
             'note': '1 sigma of the final map, 0 (dark) to %g cm (yellow).' % sig_max},
            {'id': 'coherence', 'label': 'Coherence', 'file': image_url + 'coherence.png',
             'note': 'Mean interferometric coherence over the chain, 0 (dark) to 1 (yellow); grey-free areas were masked.'},
        ],
        'noise': {'value_cm': noise_cm, 'label': 'spread inside areas assumed stable', 'areas': stable or None},
        'grid': export.value_grid(pub_web, step_cm=0.4),
        'search_point': cfg['search_point'],
        'tracks': [{'path': track['path'], 'frame': track['frame'], 'direction': track.get('direction', ''),
                    'pairs': len(chain), 'first': dates[0], 'last': dates[-1]}],
        'published_dates': None if len(keep) == len(dates) else {
            'every_days': compact['every_days'], 'chain_dates': len(dates), 'published': len(keep),
            'note': 'Processed on all %d dates of the chain; about one date in every %d days is published to keep the page small. '
                    'Quality gate, uncertainty and GPS statistics use every date.' % (len(dates), compact['every_days'])},
        'reference': cfg.get('reference'),
        # stations with no date in common with the radar have no r/RMS to show; they stay in report.json
        'gps': [s_ for s_ in stations if s_['r'] is not None], 'places': places,
        'gps_without_overlap': [s_['id'] for s_ in stations if s_['r'] is None] or None, 'alignments': [], 'reaches': [], 'extreme': extreme,
        'source': 'GUNW-HDF5',
        'gps_extra': {'label': 'Other NGL stations inside the map (found automatically): radar LOS against GPS east/north/up projected on the LOS',
                      'stations': extra_stats} if extra_stats else None,
        'coherence': {'mean': round(float(np.mean([p['mean_coherence'] for p in st.pair_info])), 3),
                      'min_pair': round(float(min(p['mean_coherence'] for p in st.pair_info)), 3),
                      'coherent_fraction': round(coherent, 3)},
        'uncertainty': {'final_median_cm': round(float(np.nanmedian(sigma[-1][st.in_bbox])), 2),
                        'final_p90_cm': round(float(np.nanpercentile(sigma[-1][st.in_bbox], 90)), 2),
                        'temporal_noise_median_cm': round(tnoise, 2),
                        'grid': export.value_grid(web_sigma[None], step_cm=0.1),
                        'method': '1 sigma = sqrt(2 x epoch noise about a smooth trajectory + accumulated decorrelation noise (from coherence) + gap filling)'},
        'quality_gate': report['gate'],
        'provenance': {
            'generated_utc': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'built_by': 'pipeline/v2/run.py',
            'source': 'NISAR L2 GUNW science products (HDF5; NASA/JPL and ISRO, via ASF DAAC), site subset read over HTTPS with an Earthdata login',
            'method': 'per pair: unwrapped phase %s, coherence >= %.2f and main connected component (other cells recovered by re-wrapping the multilooked phase about a smooth field), robust plane%s fitted on non-moving cells, '
                      'referenced to the stable area, summed over consecutive pairs; %d m cells'
                      % ('minus ionosphere screen' if opts.iono else 'as delivered', opts.coh_min,
                         ' + phase-elevation term' if st.used_elevation else '', round(st.cell_m)),
            'sign_convention': 'd_los = -(lambda/4pi) x phase, lambda = 23.84 cm; positive = toward the satellite',
            'pixel_m': [round(st.cell_m), round(st.cell_m)],
            'dropped_low_coherence_pairs': report['pairs']['dropped_low_coherence'],
            # v1 (preview) fields kept for schema compatibility; they do not apply to geocoded science products
            'coherence_proxy': None, 'dropped_noise_only_pairs': [], 'georeference_misfit_px': None,
            'v1_fields_note': 'coherence_proxy and georeference_misfit_px describe the preview-image method; v2 reads '
                              'real coherence (see coherence{}) from products that are already geocoded',
            'pairs': st.pair_info,
            'product_versions': [list(v) for v in versions],
            'collections': sorted({r['collection'] for r in chain}),
            'newest_processed': max(r['processed'] for r in chain),
            'granules': [r['granule'] for r in chain], 'candidates': [r['granule'] for r in recs],
            'dem': 'Copernicus GLO-90 (AWS open data)',
            'runtime_s': round(elapsed), 'transferred_mb': round(fetch_info['bytes'] / 1e6),
        },
    }
    js = os.path.join(out_dir, args.site + '.js')
    export.write_site_js(js, args.site, payload)
    report.update(dates=[dates[0], dates[-1]], span_days=span_days, extreme=extreme, places=[{k: p[k] for k in ('name', 'median_cm', 'sigma_cm')} for p in places],
                  noise_cm=noise_cm, cell_m=st.cell_m, used_elevation=st.used_elevation, pair_info=st.pair_info,
                  coherence=payload['coherence'], uncertainty={k: v for k, v in payload['uncertainty'].items() if k != 'grid'},
                  runtime_s=round(elapsed), product_versions=payload['provenance']['product_versions'])
    print('wrote %s (%d kB), %d overlays; final p1 %.1f p50 %.1f p99 %.1f cm; peak %.1f cm +- %s; %.0f s'
          % (os.path.relpath(js), os.path.getsize(js) // 1024, len(files), *np.nanpercentile(final[st.in_bbox], [1, 50, 99]),
             extreme['min_cm'], extreme['sigma_cm'], elapsed))
    for p in places:
        print('  %-24s %+6.1f cm +- %.1f' % (p['name'], p['median_cm'], p['sigma_cm']))
    code = 0 if report['gate']['passed'] else 2
    if args.publish:
        publish(args.site, cfg, out_dir, report)
    return finish(report, out_dir, code)


def thin_station(sta, keep):
    """GPS station series reduced to the published dates, with r and RMS recomputed on exactly those dates."""
    out = {k: [sta[k][i] for i in keep] for k in ('gps_cm', 'gps_up_cm', 'radar_cm', 'radar_sigma_cm')}
    arr = lambda v: np.array([np.nan if x is None else x for x in v], float)
    out.update(gps.compare(arr(out['radar_cm']), arr(out['gps_cm'])))
    out['stats_full_chain'] = {k: sta[k] for k in ('r', 'rms_cm', 'n')}
    return out


def view_center(final, bbox, lat0, lon0):
    """Box centre if the click-to-read grid has data there, else the centre of the nearest grid cell with data.

    Uses the page's own cell mapping (app.js gridSeries: floor over the bounds, rows evenly spaced in Web
    Mercator), so a click at the returned point always lands on a cell with a value.
    """
    g = final[::2, ::2]
    h, w = g.shape
    west, south, east, north = bbox
    yn, ys = georef.mercator_y(north), georef.mercator_y(south)
    col = min(w - 1, max(0, int(np.floor((lon0 - west) / (east - west) * w))))
    row = min(h - 1, max(0, int(np.floor((yn - georef.mercator_y(lat0)) / (yn - ys) * h))))
    ok = np.isfinite(g)
    if ok[row, col] or not ok.any():
        return [lat0, lon0]
    ii, jj = np.nonzero(ok)
    k = int(np.argmin((ii - row) ** 2 + (jj - col) ** 2))
    lat = float(georef.inverse_mercator_y(yn - (ii[k] + 0.5) / h * (yn - ys)))
    return [round(lat, 4), round(west + (jj[k] + 0.5) / w * (east - west), 4)]


def existing_layout(site_id, cfg):
    """(width, height) of the overlay grid already published for this site, from its backup if one exists."""
    from PIL import Image
    for js, base in ((os.path.join(PIPE, 'out_v2', '_backup', site_id, site_id + '.js'), os.path.join(PIPE, 'out_v2', '_backup', site_id)),
                     (os.path.join(SITE, 'data', site_id + '.js'), SITE)):
        if not os.path.exists(js):
            continue
        old = export.read_site_js(js)
        if old.get('overlay', {}).get('bounds') != [[cfg['bbox'][1], cfg['bbox'][0]], [cfg['bbox'][3], cfg['bbox'][2]]]:
            continue
        if old['overlay'].get('web_size'):        # written since compact publishing: the true map grid
            return tuple(old['overlay']['web_size'])
        if 'published_dates' in old:              # first compact files had no web_size; their PNGs are thinned
            continue
        first = old['overlay']['files'][0]
        png = os.path.join(base, 'img', os.path.basename(first)) if 'out_v2' in base else os.path.join(SITE, first)
        if os.path.exists(png):
            return Image.open(png).size
    return None


def save_sequential(path, values, vmax):
    """Dark-to-yellow (viridis-like) palette PNG for the uncertainty and coherence layers."""
    stops = np.array([[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]], float)
    t = np.linspace(0, 1, 255) * (len(stops) - 1)
    i = np.minimum(t.astype(int), len(stops) - 2)
    f = (t - i)[:, None]
    pal = (stops[i] * (1 - f) + stops[i + 1] * f + 0.5).astype(np.uint8)
    index = np.clip(np.round(np.nan_to_num(values) / vmax * 254), 0, 254) + 1
    export.save_indexed(path, np.where(np.isfinite(values), index, 0), pal)


def publish(site_id, cfg, out_dir, report):
    """Copy out_v2/<id>/ into the site, after backing up what is there. Only when the gate passed."""
    if not cfg.get('publish'):
        print('publish: skipped, sites.json says this site is not published by the pipeline')
        report['published'] = False
        return
    if not report['gate']['passed']:
        print('publish: skipped, the quality gate refused this stack')
        report['published'] = False
        return
    data_js = os.path.join(SITE, 'data', site_id + '.js')
    img = os.path.join(SITE, 'img', site_id)
    backup = os.path.join(PIPE, 'out_v2', '_backup', site_id)
    if os.path.exists(data_js) and not os.path.exists(os.path.join(backup, site_id + '.js')):
        os.makedirs(backup, exist_ok=True)
        shutil.copy2(data_js, backup)
        if os.path.isdir(img):
            shutil.copytree(img, os.path.join(backup, 'img'), dirs_exist_ok=True)
    if os.path.isdir(img):
        shutil.rmtree(img)
    shutil.copytree(os.path.join(out_dir, 'img'), img)
    shutil.copy2(os.path.join(out_dir, site_id + '.js'), data_js)
    report['published'] = True
    print('publish: replaced site/data/%s.js and site/img/%s/ (backup in out_v2/_backup/%s/)' % (site_id, site_id, site_id))


def finish(report, out_dir, code, note=''):
    report['exit_code'] = code
    if note:
        report['note'] = note
        print('stop:', note)
    report['transferred_mb_total'] = round(remote.STATS.bytes / 1e6)
    with open(os.path.join(out_dir, 'report.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    return code


if __name__ == '__main__':
    sys.exit(main())
