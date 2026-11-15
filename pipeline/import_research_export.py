"""Convert the team's San Joaquin Valley research export into the site's data format.

    python import_research_export.py <canal_app.json> <rasters folder>

Why this exists: the San Joaquin layer shown in version 1 was produced by the team's exploratory scripts
(per-pair stacking of two tracks, a GPS tie validated with held-out stations, sampling along canals, roads
and rail). Those steps are not yet part of refresh.py. This script changes no values: it renames fields,
re-rows the overlay images for Web Mercator, and derives the headline numbers printed on the page from
the export so that the page and the data cannot disagree.
"""
import datetime as dt
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from nisar import export, georef  # noqa: E402

SITE_DIR = os.path.join(HERE, '..', 'site')
KINDS = {'Friant-Kern Canal': 'canal', 'California Aqueduct': 'canal', 'Delta-Mendota Canal': 'canal',
         'California High-Speed Rail (under construction)': 'rail', 'State Route 99': 'road',
         'State Route 43': 'road', 'Interstate 5': 'road', 'State Route 198': 'road'}


def nice_date(yyyymmdd):
    return dt.datetime.strptime(yyyymmdd, '%Y%m%d').strftime('%d %b %Y').lstrip('0')


def remap_for_web(src_path, dst_path, bounds, source_step):
    """Nearest-neighbour copy of a lon/lat image onto rows evenly spaced in Web Mercator (colours untouched).

    The export kept every second cell of a 0.0025-degree grid, so source cell (i, j) is centred at
    north - 0.00125 - i*0.005, west + 0.00125 + j*0.005.
    """
    rgba = np.asarray(Image.open(src_path).convert('RGBA'))
    west, south, east, north = bounds
    lons, lats = georef.web_grid(west, south, east, north, source_step)
    cols = np.clip(np.round((lons - (west + source_step / 4)) / source_step).astype(int), 0, rgba.shape[1] - 1)
    rows = np.clip(np.round(((north - source_step / 4) - lats) / source_step).astype(int), 0, rgba.shape[0] - 1)
    out = rgba[rows][:, cols]
    opaque = out[..., 3] > 127
    packed = (out[..., 0].astype(np.int32) << 16) | (out[..., 1].astype(np.int32) << 8) | out[..., 2]
    colours, inverse = np.unique(packed[opaque], return_inverse=True)
    if len(colours) <= 255 and out[..., 3][opaque].min() == 255:
        index = np.zeros(packed.shape, np.uint8)
        index[opaque] = inverse + 1
        palette = np.stack([(colours >> 16) & 255, (colours >> 8) & 255, colours & 255], 1)
        export.save_indexed(dst_path, index, palette)
    else:                                              # semi-transparent or many colours: keep RGBA
        Image.fromarray(out, 'RGBA').save(dst_path, optimize=True)
    return out


def colours_to_cm(rgba, vmax_cm):
    """Read values back from the export's red-blue colouring. Returns (cm, clipped mask); NaN where transparent.

    The export drew each map with 256 colour steps between -vmax and +vmax and kept no numeric copy, so
    this is the only way to get numbers for click-to-read and the 3D view. It is done here, in Python:
    a browser may not read pixels of local images. Resolution is one colour step (2 * vmax / 256 cm) and
    anything beyond +-vmax comes back as +-vmax (the returned mask marks those cells).
    """
    ramp = export.diverging_rgb(np.linspace(-vmax_cm, vmax_cm, 256), vmax_cm).astype(np.int32)
    opaque = rgba[..., 3] > 127
    packed = (rgba[..., 0].astype(np.int32) << 16) | (rgba[..., 1].astype(np.int32) << 8) | rgba[..., 2]
    colours, inverse = np.unique(packed[opaque], return_inverse=True)
    rgb = np.stack([(colours >> 16) & 255, (colours >> 8) & 255, colours & 255], 1)
    distance = ((rgb[:, None, :] - ramp[None, :, :]) ** 2).sum(-1)          # every colour present vs every ramp step
    step = distance.argmin(1)
    if distance.min(1).max() > 12:
        raise ValueError('overlay colours do not match the red-blue ramp; cannot read values back')
    index = np.full(packed.shape, -1)
    index[opaque] = step[inverse]
    cm = np.where(opaque, (index + 0.5) / 256 * 2 * vmax_cm - vmax_cm, np.nan).astype(np.float32)
    return cm, opaque & ((index == 0) | (index == 255))


def rms(values):
    values = np.asarray(values, float)
    values = values[np.isfinite(values)]
    return float(np.sqrt(np.mean(values ** 2))) if len(values) else None


def main():
    src_json, src_rasters = sys.argv[1:3]
    with open(src_json, encoding='utf-8') as fh:
        src = json.load(fh)
    meta, unc = src['meta'], src['uncertainty']
    b = meta['raster_bounds']
    bounds = (b['west'], b['south'], b['east'], b['north'])
    image_dir = os.path.join(SITE_DIR, 'img', 'sjv')
    os.makedirs(image_dir, exist_ok=True)

    vmax = meta['raster_scale']['vmax_cm']
    files, layers = [], []
    for raster in meta['rasters']:
        name = 'vertical_%s.png' % raster['date']
        web = remap_for_web(os.path.join(src_rasters, os.path.basename(raster['file'])), os.path.join(image_dir, name), bounds, 0.005)
        files.append('img/sjv/' + name)
        layers.append(colours_to_cm(web, vmax))
    size = (web.shape[1], web.shape[0])
    # numeric copy of the maps for click-to-read and the 3D view: every second cell, 0.1 cm steps
    grid = export.value_grid(np.stack([cm for cm, _ in layers]), step_cm=0.1, stride=2)
    clipped_last = layers[-1][1][::2, ::2]
    grid['clipped_at_cm'] = vmax
    grid['clipped_fraction_last'] = round(float(clipped_last.sum() / np.isfinite(layers[-1][0][::2, ::2]).sum()), 3)
    grid['source'] = 'read back from the colours of the exported maps (256 steps); values beyond the scale are clipped'
    remap_for_web(os.path.join(src_rasters, 'sinking_zone.png'), os.path.join(image_dir, 'sinking_zone.png'), bounds, 0.005)
    remap_for_web(os.path.join(src_rasters, 'sigma.png'), os.path.join(image_dir, 'sigma.png'), bounds, 0.005)

    dates = meta['dates']
    stations = []
    for g in src['gps']:
        radar, smooth = np.array(g['radar_heldout_vertical_cm'], float), np.array(g['gps_up_smoothed_cm'], float)
        stations.append({
            'id': g['sta'], 'lat': g['lat'], 'lon': g['lon'], 'valley_floor': g['valley'],
            'gps_cm': g['gps_up_smoothed_cm'], 'gps_raw_cm': g['gps_up_cm'], 'radar_cm': g['radar_heldout_vertical_cm'],
            'radar_map_cm': g['radar_map_vertical_cm'],
            'r': round(g['r_series'], 3), 'rms_cm': round(rms(radar - smooth), 2), 'n': len(dates),
            'gps_label': 'GPS up, smoothed (18-day kernel)',
            'radar_label': 'Radar, vertical-equivalent, this station held out of the GPS tie',
        })

    alignments = []
    for name, a in src['alignments'].items():
        alignments.append({'name': name, 'kind': KINDS.get(name, 'road'),
                           **{k: a[k] for k in ('lat', 'lon', 'dist_km', 'total_cm', 'sigma_cm', 'asc_cm', 'desc_cm', 'in_zone', 'series_cm')}})
    keep = ('alignment', 'km_from', 'km_to', 'lat', 'lon', 'near', 'near_km', 'mean_cm', 'sigma_cm', 'exceeds_noise',
            'asc_summer_cm', 'desc_summer_cm', 'summer_mean_cm', 'summer_sigma_cm', 'summer_two_track_confirmed')
    reaches = [{k: r[k] for k in keep} for r in src['reaches']]

    # ---- headline numbers, all derived from the export
    ad = unc['asc_desc']
    summer = '%s to %s' % (nice_date(ad['window_asc'][0]), nice_date(ad['window_asc'][1]))
    canal = [r for r in reaches if r['alignment'] == 'Friant-Kern Canal']
    canal_over = [r for r in canal if r['exceeds_noise']]
    canal_strong = sorted([r for r in canal_over if r['summer_two_track_confirmed']], key=lambda r: r['km_from'])

    def worst(name, count=3):
        rows = sorted([r for r in reaches if r['alignment'] == name and r['exceeds_noise']], key=lambda r: r['mean_cm'])[:count]
        return rows

    def span(rows):
        values = sorted(r['mean_cm'] for r in rows)
        return '%.0f to %.0f cm' % (values[-1], values[0]) if rows else 'none beyond noise'

    sr99, sr43 = worst('State Route 99', 5), worst('State Route 43', 5)
    rail = worst('California High-Speed Rail (under construction)', 5)
    gps_by_id = {s['id']: s for s in stations}
    named = [gps_by_id[k] for k in ('TLBN', 'QCAP', 'HANF', 'P056') if k in gps_by_id]
    dwr = src['dwr_baseline']['comparison']['20251201_20260701']
    headline = {
        'validation': {'r': round(unc['gps_validation_asc']['cv_r_valley'], 2),
                       'rms_los_cm': round(unc['gps_validation_asc']['cv_final_valley_smoothed'], 1),
                       'sigma_vertical_cm': unc['sigma_heldout_gps_vertical_cm'],
                       'text': 'Stations held out of the fit (5-fold), valley floor, ascending track, final date.'},
        'series': {'r_min': round(min(s['r'] for s in named), 2), 'r_max': round(max(s['r'] for s in named), 2),
                   'stations': [s['id'] for s in named]},
        'canal': {'reaches_total': len(canal), 'reaches_over_noise': len(canal_over),
                  'km_over_noise': sum(r['km_to'] - r['km_from'] for r in canal_over),
                  'near': sorted({r['near'] for r in canal_over}),
                  'full_period': [{'km': '%d-%d' % (r['km_from'], r['km_to']), 'near': r['near'], 'mean_cm': r['mean_cm'], 'sigma_cm': r['sigma_cm']} for r in canal_over],
                  'summer_window': summer,
                  'summer': [{'km': '%d-%d' % (r['km_from'], r['km_to']), 'near': r['near'], 'mean_cm': r['summer_mean_cm'], 'sigma_cm': r['summer_sigma_cm']} for r in canal_strong]},
        'worst': {'State Route 99': span(sr99), 'State Route 43': span(sr43), 'High-speed rail alignment': span(rail)},
        'two_tracks': {'r': round(ad['r'], 2), 'mean_sigma_cm': round(ad['mean_sigma'], 1), 'window': summer},
        'state_product': {'slope': round(dwr['slope_nisar_on_dwr'], 1), 'r': round(dwr['r'], 2), 'window': '1 Dec 2025 to 1 Jul 2026'},
    }

    towns = [{'name': t['name'], 'lat': round(t['lat'], 4), 'lon': round(t['lon'], 4), 'radius_km': meta['buffer_km'],
              'median_cm': t['total_cm'], 'in_zone': t['in_zone']} for t in src['towns'][:12]]
    span_days = (dt.datetime.strptime(dates[-1], '%Y%m%d') - dt.datetime.strptime(dates[0], '%Y%m%d')).days
    payload = {
        'schema': 1, 'id': 'sjv', 'name': 'San Joaquin Valley, California', 'role': 'The decision case',
        'quantity': {'key': 'vertical', 'label': 'Vertical-equivalent change', 'short': 'vertical-equivalent',
                     'note': 'Line-of-sight change divided by the cosine of an assumed viewing angle (33 to 47 degrees across the swath); horizontal motion neglected. Tied to GPS at every date.'},
        'dates': dates, 'span_days': span_days,
        'view': {'center': [36.25, -119.55], 'zoom': 8},
        'overlay': {'bounds': [[b['south'], b['west']], [b['north'], b['east']]], 'files': files, 'vmax_cm': meta['raster_scale']['vmax_cm']},
        'extra_overlays': [
            {'id': 'zone', 'label': 'Confirmed sinking zone', 'file': 'img/sjv/sinking_zone.png',
             'note': 'Total below %.1f cm (2 sigma) and, where both tracks exist, both negative.' % unc['zone_threshold_cm']},
            {'id': 'sigma', 'label': 'Uncertainty map', 'file': 'img/sjv/sigma.png', 'note': '1 sigma, 0 (dark) to 6 cm (yellow).'}],
        'noise': {'value_cm': unc['sigma_heldout_gps_vertical_cm'], 'label': '1 sigma from GPS stations held out of the fit'},
        'grid': grid,
        'search_point': [-119.6, 36.2],
        'tracks': [{'path': 34, 'frame': 20, 'direction': 'ascending', 'pairs': len(dates) - 1, 'first': dates[0], 'last': dates[-1]},
                   {'path': 114, 'frame': 70, 'direction': 'descending', 'pairs': len(meta['desc_dates']) - 1, 'first': meta['desc_dates'][0], 'last': meta['desc_dates'][-1]}],
        'combined_from': meta['combined_from'],
        'gps': stations, 'places': towns, 'alignments': alignments, 'reaches': reaches, 'headline': headline,
        'buffer_km': meta['buffer_km'],
        'state_product': {'name': 'California DWR InSAR (Sentinel-1, TRE ALTAMIRA)', 'final_to': src['dwr_baseline']['latest_final'][:10],
                          'provisional_to': src['dwr_baseline']['latest_provisional'][:10], 'cadence': 'quarterly',
                          'url': 'https://catalog.data.gov/dataset/tre-altamira-insar-subsidence-data'},
        'provenance': {
            'generated_utc': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'built_by': 'team research export, converted by pipeline/import_research_export.py',
            'source': meta['source'], 'method': meta['method'], 'assumptions': meta['assumptions'],
            'overlay_px': list(size), 'pixel_m': [round(0.005 * 111320 * float(np.cos(np.radians(36.5)))), round(0.005 * 110950)],
        },
    }
    out = os.path.join(SITE_DIR, 'data', 'sjv.js')
    export.write_site_js(out, 'sjv', payload)
    print('wrote', os.path.relpath(out, HERE), os.path.getsize(out) // 1024, 'kB;', len(files), 'overlays', size)
    print('value grid %d x %d x %d dates, %.1f cm steps; %.1f%% of cells at the scale limit on the last date'
          % (grid['width'], grid['height'], len(files), grid['step_cm'], 100 * grid['clipped_fraction_last']))
    print(json.dumps(headline, indent=1))


if __name__ == '__main__':
    main()
