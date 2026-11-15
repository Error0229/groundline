"""Rebuild one case study from public data, with no login.

    python refresh.py <site-id> [--cache DIR] [--cafile PEM] [--offline] [--listing FILE] [--force]

Site ids and their settings live in sites.json. The six steps (the code comments use the same numbers):
  1 find     ASF search API -> every GUNW pair of the configured track/frame       (nisar/search.py)
  2 read     download each pair's public preview PNG (URL from the listing) and
             turn its colours back into phase with an exact lookup table           (nisar/previews.py)
  3 stack    drop noise-only pairs, chain consecutive pairs, unwrap, deramp, sum   (nisar/stack.py)
  4 locate   opaque part of the image <-> footprint polygon; Web Mercator grid     (nisar/georef.py)
  5 check    compare with continuous GPS projected to the radar line of sight     (nisar/gps.py)
  6 publish  dated overlay PNGs + site/data/<id>.js                                (nisar/export.py)

Exit codes: 0 written or nothing new; 2 quality gate refused to publish; 3 georeferencing not trustworthy.
"""
import argparse
import concurrent.futures
import datetime as dt
import json
import os
import sys

import numpy as np
from scipy import ndimage as ndi

HERE =os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)                         # so that "python -I refresh.py" (isolated mode) also finds the package

from nisar import export, georef, gps, previews, search, stack  # noqa: E402

SITE_DIR = os.path.join(HERE, '..', 'site')
MIN_PAIRS = 3
MIN_STACK_COHERENCE = 0.6
MAX_GEOREF_MISFIT_PX = 1.5


def crop_window(geo, bbox, shape, margin=8):
    """Pixel window (x0, x1, y0, y1) covering the site's bounding box, clipped to the image."""
    west, south, east, north = bbox
    (xa, xb), (yb, ya) = geo.to_pixel([west, east], [south, north])
    return (max(int(np.floor(xa)) - margin, 0), min(int(np.ceil(xb)) + margin + 1, shape[1]),
            max(int(np.floor(ya)) - margin, 0), min(int(np.ceil(yb)) + margin + 1, shape[0]))


def window_around(geo, lon, lat, radius_px, origin):
    x, y = geo.to_pixel(lon, lat)
    col, row = int(round(float(x))) - origin[0], int(round(float(y))) - origin[1]
    return slice(max(row - radius_px, 0), row + radius_px + 1), slice(max(col - radius_px, 0), col + radius_px + 1)


def box_window(geo, bbox, origin):
    west, south, east, north = bbox
    (xa, xb), (yb, ya) = geo.to_pixel([west, east], [south, north])
    return (slice(max(int(ya) - origin[1], 0), int(yb) - origin[1] + 1),
            slice(max(int(xa) - origin[0], 0), int(xb) - origin[0] + 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('site')
    ap.add_argument('--cache', default=os.path.join(HERE, 'cache'), help='folder for downloaded previews and GPS files')
    ap.add_argument('--cafile', help='certificate bundle, if the system store is not usable')
    ap.add_argument('--offline', action='store_true', help='use only cached previews and GPS files')
    ap.add_argument('--listing', help='use a saved ASF geojson listing instead of calling the API')
    ap.add_argument('--force', action='store_true', help='rebuild even if no new pair was published')
    args = ap.parse_args()

    with open(os.path.join(HERE, 'sites.json'), encoding='utf-8') as fh:
        sites = json.load(fh)
    if args.site not in sites:
        sys.exit('unknown site %r; known: %s' % (args.site, ', '.join(sites)))
    cfg = sites[args.site]
    ctx = search.tls_context(args.cafile)
    preview_dir = os.path.join(args.cache, 'previews', args.site)
    gnss_dir = os.path.join(args.cache, 'gnss')
    os.makedirs(preview_dir, exist_ok=True)
    os.makedirs(gnss_dir, exist_ok=True)
    if cfg.get('publish'):
        data_js = os.path.join(SITE_DIR, 'data', args.site + '.js')
        image_dir, image_url = os.path.join(SITE_DIR, 'img', args.site), 'img/%s/' % args.site
    else:
        out = os.path.join(HERE, 'out', args.site)
        data_js, image_dir, image_url = os.path.join(out, args.site + '.js'), os.path.join(out, 'img'), 'img/'
        print('note: this site is not published by the pipeline:', cfg.get('publish_note', ''))
    os.makedirs(os.path.dirname(data_js), exist_ok=True)
    os.makedirs(image_dir, exist_ok=True)

    # ---- 1 find
    lon, lat = cfg['search_point']
    if args.listing:
        with open(args.listing, encoding='utf-8') as fh:
            listing = search.parse_listing(json.load(fh))
    else:
        listing = search.fetch_listing(lon, lat, ctx)
    track = cfg['track']
    candidates = sorted(search.pairs_for_track(listing, track['path'], track['frame']), key=lambda r: (r['ref'], r['sec']))
    print('step 1: %d products at the point, %d pairs on track %d frame %d' % (len(listing), len(candidates), track['path'], track['frame']))
    if len(candidates) < MIN_PAIRS:
        print('QUALITY GATE: fewer than %d pairs; nothing written' % MIN_PAIRS)
        return 2
    candidate_names = [r['granule'] for r in candidates]
    if os.path.exists(data_js) and not args.force:
        if export.read_site_js(data_js).get('provenance', {}).get('candidates') == candidate_names:
            print('nothing new: the listing has the same pairs as the published data')
            return 0

    # ---- 2 read (a): download
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        got = list(pool.map(lambda r: previews.download(r, preview_dir, ctx, args.offline), candidates))
    print('step 2a: %d previews (%d new, %.1f MB downloaded)' % (len(got), sum(n > 0 for _, n in got), sum(n for _, n in got) / 1e6))

    # ---- 2 read (b): colour -> phase, cropped to the site
    # (the canvas mapping of step 4 is fitted first, because it decides which part of each image to keep)
    masks = [previews.opaque_mask(path) for path, _ in got]
    shape = masks[0].shape
    if any(m.shape != shape for m in masks):
        print('GEOREFERENCE: preview size changes inside the track; nothing written')
        return 3
    geo, misfit_px, worst_px = georef.from_footprints([georef.opaque_bbox(m) for m in masks], [r['footprint'] for r in candidates])
    del masks
    if misfit_px > MAX_GEOREF_MISFIT_PX:
        print('GEOREFERENCE: images and footprints disagree by %.1f px (median); nothing written' % misfit_px)
        return 3
    window = crop_window(geo, cfg['bbox'], shape)
    x0, x1, y0, y1 = window
    lut = previews.load_lut()
    crops = []
    for path, _ in got:
        phase, valid, _, zero = previews.load_phase(path, lut)
        crops.append((phase[y0:y1, x0:x1], valid[y0:y1, x0:x1], zero[y0:y1, x0:x1]))
    print('step 2b: phase recovered; processing window %d x %d px' % (x1 - x0, y1 - y0))

    # ---- 3 stack: quality gate, chain, cumulative displacement
    coherence = [stack.pair_coherence(p, v) for p, v, _ in crops]
    noise_only = [r for r, c in zip(candidates, coherence) if c < stack.NOISE_ONLY_COHERENCE]
    if noise_only:
        print('dropped noise-only pairs:', [(r['ref'], r['sec']) for r in noise_only])
    kept = [r for r, c in zip(candidates, coherence) if c >= stack.NOISE_ONLY_COHERENCE]
    chain = search.longest_chain(kept)
    index = [candidates.index(r) for r in chain]
    chain_coherence = [coherence[i] for i in index]
    if len(chain) < MIN_PAIRS or np.mean(chain_coherence) < MIN_STACK_COHERENCE:
        print('QUALITY GATE: chain of %d pairs, mean coherence proxy %.2f; nothing written'
              % (len(chain), np.mean(chain_coherence) if chain else 0))
        return 2
    origin = (window[0], window[2])
    frame = stack.frame_mask([crops[i][1] for i in index], [crops[i][2] for i in index])
    reference = None
    if cfg.get('reference'):
        ref = cfg['reference']
        reference = window_around(geo, ref['lon'], ref['lat'], ref.get('radius_px', 4), origin)
    cube, usable, _ = stack.cumulative([crops[i][:2] for i in index], frame, cfg.get('deramp_order', 2), reference)
    dates = [chain[0]['ref']] + [r['sec'] for r in chain]
    span_days = gps.ordinal(dates[-1]) - gps.ordinal(dates[0])
    print('step 3: chain of %d pairs, %s to %s (%d days); coherence proxy mean %.2f, min %.2f; usable %.0f%% of window'
          % (len(chain), dates[0], dates[-1], span_days, np.mean(chain_coherence), min(chain_coherence), 100 * usable.mean()))

    # ---- 4 locate: regrid for the web map
    west, south, east, north = cfg['bbox']
    step_deg = geo.degrees_per_pixel()[0]
    lons, lats = georef.web_grid(west, south, east, north, step_deg)
    web = np.stack([export.regrid(layer, geo, origin, lons, lats) for layer in cube])
    px_km = geo.pixel_km((south + north) / 2)
    print('step 4: pixel %.0f x %.0f m; output grid %d x %d; image-to-footprint misfit median %.2f px, worst %.1f px'
          % (px_km[0] * 1000, px_km[1] * 1000, len(lons), len(lats), misfit_px, worst_px))

    # ---- 5 check against GPS
    cos_inc = cfg.get('cos_incidence_assumed', 0.77)
    epochs = [gps.ordinal(d) for d in dates]
    stations = []
    for sta in cfg.get('gps', []):
        try:
            days, up = gps.read_tenv3(gps.fetch_tenv3(sta['id'], gnss_dir, ctx, args.offline))
        except Exception as err:                 # noqa: BLE001 - a missing station must not stop the refresh
            print('  GPS %s unavailable: %s' % (sta['id'], err))
            continue
        up_at = gps.at_epochs(days, up, epochs)
        up_at = up_at - up_at[np.isfinite(up_at)][0] if np.isfinite(up_at).any() else up_at
        win = window_around(geo, sta['lon'], sta['lat'], sta.get('radius_px', 1), origin)
        radar = np.array([np.nanmedian(layer[win]) if np.isfinite(layer[win]).any() else np.nan for layer in cube])
        stats = gps.compare(radar, up_at * cos_inc)
        print('step 5: GPS %s: r = %s, RMS = %s cm over %d dates; GPS up %.1f cm, radar LOS %.1f cm at the last common date'
              % (sta['id'], stats['r'], stats['rms_cm'], stats['n'], np.nan_to_num(up_at[np.isfinite(up_at)][-1] if np.isfinite(up_at).any() else np.nan), radar[-1]))
        stations.append({'id': sta['id'], 'lat': sta['lat'], 'lon': sta['lon'],
                         'gps_cm': export.rounded(up_at * cos_inc), 'gps_up_cm': export.rounded(up_at),
                         'radar_cm': export.rounded(radar), **stats,
                         'gps_label': 'GPS up x %.2f (projected to line of sight)' % cos_inc,
                         'radar_label': 'Radar, line of sight'})

    # spread of the final map inside areas assumed stable = a floor for the noise
    stable = []
    for area in cfg.get('stable_areas', []):
        values = cube[-1][box_window(geo, area['bbox'], origin)]
        if np.isfinite(values).sum() > 20:
            stable.append({'name': area['name'], 'std_cm': round(float(np.nanstd(values)), 2), 'mean_cm': round(float(np.nanmean(values)), 2)})
    noise_cm = max([s['std_cm'] for s in stable], default=None)

    # named places: median and spread within a radius
    yy, xx = np.mgrid[:cube.shape[1], :cube.shape[2]]
    places = []
    for place in cfg.get('places', []):
        x, y = geo.to_pixel(place['lon'], place['lat'])
        near = np.hypot((xx - (x - origin[0])) * px_km[0], (yy - (y - origin[1])) * px_km[1]) <= place['radius_km']
        final = cube[-1][near]
        if np.isfinite(final).sum() < 5:
            continue
        places.append({'name': place['name'], 'lat': place['lat'], 'lon': place['lon'], 'radius_km': place['radius_km'],
                       'median_cm': round(float(np.nanmedian(final)), 1), 'p05_cm': round(float(np.nanpercentile(final, 5)), 1),
                       'p95_cm': round(float(np.nanpercentile(final, 95)), 1),
                       'series_cm': export.rounded([np.nanmedian(layer[near]) for layer in cube])})

    # fastest-sinking spot of the final map (3x3 median, so one noisy cell cannot win)
    final = web[-1]
    med = np.where(np.isfinite(final), ndi.median_filter(np.nan_to_num(final), 3), np.nan)
    iy, ix = np.unravel_index(np.nanargmin(med), med.shape)
    extreme = {'min_cm': round(float(med[iy, ix]), 1), 'lat': round(float(lats[iy]), 4), 'lon': round(float(lons[ix]), 4)}

    # ---- 6 publish
    vmax = cfg['vmax_cm']
    files = []
    for date, layer in zip(dates, web):
        name = 'los_%s.png' % date
        export.save_overlay(os.path.join(image_dir, name), layer, vmax)
        files.append(image_url + name)
    stale = set(os.listdir(image_dir)) - {os.path.basename(f) for f in files}
    for name in stale:
        if name.startswith('los_') and name.endswith('.png'):
            os.remove(os.path.join(image_dir, name))
    payload = {
        'schema': 1, 'id': args.site, 'name': cfg['name'], 'role': cfg.get('role', ''),
        'quantity': {'key': 'los', 'label': 'Line-of-sight change', 'short': 'line of sight',
                     'note': 'Motion toward (+) or away from (-) the satellite. Vertical is roughly this divided by %.2f (assumed viewing angle).' % cos_inc},
        'dates': dates, 'span_days': span_days,
        'view': {'center': [(south + north) / 2, (west + east) / 2], 'zoom': cfg.get('zoom', 11 if east - west < 1.2 else 8)},
        'overlay': {'bounds': [[south, west], [north, east]], 'files': files, 'vmax_cm': vmax},
        'noise': {'value_cm': noise_cm, 'label': 'spread inside areas assumed stable', 'areas': stable or None},
        'grid': export.value_grid(web, step_cm=0.4),
        'search_point': cfg['search_point'],
        'tracks': [{'path': track['path'], 'frame': track['frame'], 'direction': track.get('direction', ''),
                    'pairs': len(chain), 'first': dates[0], 'last': dates[-1]}],
        'reference': cfg.get('reference'),
        'gps': stations, 'places': places, 'alignments': [], 'reaches': [], 'extreme': extreme,
        'provenance': {
            'generated_utc': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'built_by': 'pipeline/refresh.py',
            'source': 'NISAR L2 GUNW preview images (NASA/JPL, via ASF DAAC), public, no login',
            'method': 'per-pair 5x5 phasor smoothing, unwrap, robust order-%d surface removed, re-wrap about the smooth field, summed' % cfg.get('deramp_order', 2),
            'pixel_m': [round(px_km[0] * 1000), round(px_km[1] * 1000)],
            'coherence_proxy': {'mean': round(float(np.mean(chain_coherence)), 3), 'min': round(float(min(chain_coherence)), 3)},
            'dropped_noise_only_pairs': [[r['ref'], r['sec']] for r in noise_only],
            'georeference_misfit_px': {'median': round(misfit_px, 2), 'worst': round(worst_px, 1)},
            'collections': sorted({r['collection'] for r in chain}),
            'newest_processed': max(r['processed'] for r in chain),
            'granules': [r['granule'] for r in chain], 'candidates': candidate_names,
        },
    }
    export.write_site_js(data_js, args.site, payload)
    print('step 6: wrote %s (%d kB) and %d overlays; final map p1 %.1f, p50 %.1f, p99 %.1f cm; noise floor %s cm'
          % (os.path.relpath(data_js, HERE), os.path.getsize(data_js) // 1024, len(files),
             *np.nanpercentile(cube[-1], [1, 50, 99]), noise_cm))
    for p in places:
        print('  %-22s median %+.1f cm (5th..95th percentile %+.1f..%+.1f within %.0f km)' % (p['name'], p['median_cm'], p['p05_cm'], p['p95_cm'], p['radius_km']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
