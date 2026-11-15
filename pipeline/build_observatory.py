"""Write site/data/observatory.js: one entry per subsidence hotspot, with an honest status.

    python pipeline/build_observatory.py

Statuses (since pipeline v2, decided by code, not by hand)
  validated      pipeline v2 quality gate passed AND the map agrees with GPS: over the NGL stations that moved
                 >= 3 cm along the line of sight during the record (configured ones plus every NGL station
                 inside the box), median r >= 0.7 and median RMS <= max(1.5 cm, 0.35 x the median GPS range).
                 sjv keeps the research export's GPS tie as its validation; v2 numbers are added.
  measured       v2 gate passed, and no GPS station moved enough to test against (or none exists)
  unconfirmed    would be measured/validated by the rules above, but a person checked the map against the
                 published studies and could not confirm it (sinking area not where they describe it, strongest
                 signal at an edge, water margin or reference, or GPS that cannot test the map). Driven ONLY by
                 an explicit "unconfirmed_reason" in the site's pipeline/sites.json entry (plain English, shown
                 to users); refusals by the gate or GPS always win over it. Our numbers are not shown:
                 peak_change_cm / peak_sigma_cm / peak_location / peak_rate_cm_yr / gps are null, the raw values
                 sit under diagnostics{} (not for display), has_site_data is false, gate{} and pipeline{} stay.
  refused        we do not trust the result. `refused_by`:
                   "quality_gate" = v2 gate failed (coherent fraction, usable area, epoch noise, reference,
                                    or no motion above 3 sigma); `gate` holds every number and threshold
                   "gps"          = gate passed but GPS disagreed (numbers in gps{})
                   "manual_review"= only for sites not yet rerun with v2 (v1 preview judgement)
                 `v1_judgement` keeps the earlier preview-based status and reason for comparison
  no_coverage    ASF lists no NISAR GUNW pairs over the place
  not_processed  a known hotspot we have not run; only the literature value is shown

Gate and GPS numbers are read from pipeline/out_v2/<id>/report.json (written by pipeline/v2/run.py).
Sites of the gap-region catalogue (pipeline/hotspots_candidates.json) are added once they have a report.
role: "calibration" (mexico_city, sjv, celaya: prove the method), "covered" (inside OPERA DISP-S1 or EGMS,
covered_by names the service), else "gap_region" (where this observatory adds something new).

Numbers from OUR pipeline: peak_rate_cm_yr, peak_change_cm, gps, dates, track, pipeline{}.
Numbers from the LITERATURE: literature{} only. The two are never mixed.

peak_change_cm is the deepest 3x3-median value of the final map (positive = sinking, along the radar line
of sight unless peak_quantity says otherwise) over span_days. peak_rate_cm_yr is that change divided by the
span in years, and is written ONLY for records of at least MIN_RATE_DAYS (300) days; for ~120-day records
(June to October 2026, the dry/irrigation season in most of these basins) an annualised number would be
inflated by seasonal pumping, so it is null and only the change over the record is given.

Entries for processed-but-unpublished sites hold the numbers of the 2026-11-14 run, because their
outputs go to pipeline/out/ (not committed). Re-run refresh.py <id> to reproduce them.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'site', 'data')


def lit(rate, quantity, period, citation, url, note=''):
    out = {'rate_cm_yr': rate, 'quantity': quantity, 'period': period, 'citation': citation, 'url': url}
    if note:
        out['note'] = note
    return out


def read_site(site_id):
    path = os.path.join(DATA, site_id + '.js')
    if not os.path.exists(path):
        return None
    text = open(path, encoding='utf-8').read()
    return json.loads(text[text.index('= {') + 2:].rstrip().rstrip(';'))


OUT_V2 = os.path.join(HERE, 'out_v2')
CANDIDATES = os.path.join(HERE, 'hotspots_candidates.json')
MIN_RATE_DAYS = 300          # shorter records are never annualised
GPS_MOVING_CM = 3.0          # GPS LOS range over the record; below this r measures noise, not agreement
GPS_MIN_N = 10               # common dates needed for a station to count
GPS_AGREE_R = 0.7
GPS_AGREE_RMS = (1.5, 0.35)  # median RMS <= max(1.5 cm, 0.35 x median GPS range)
CALIBRATION = {'mexico_city', 'sjv', 'celaya'}   # inside existing free services: they prove the method
# Free ground-motion services we do not try to replace (coarse, country-level test; Canada counts only within
# ~200 km of the US border, which is where all its hotspots are): NASA OPERA DISP-S1 and the European EGMS.
OPERA_COUNTRIES = {'United States', 'Mexico', 'Canada', 'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua',
                   'Costa Rica', 'Panama'}


def annual(change_cm, span_days):
    """Yearly rate from a change over span_days, or None for records too short to annualise honestly."""
    if change_cm is None or not span_days or span_days < MIN_RATE_DAYS:
        return None
    return round(change_cm * 365 / span_days, 1)


def coverage(e):
    countries = {c.strip() for c in (e.get('country') or '').replace('/', ',').split(',')}
    if countries & OPERA_COUNTRIES:
        return 'OPERA DISP-S1'
    if e.get('continent') == 'Europe':
        return 'EGMS'
    return None


def v2_report(site_id):
    path = os.path.join(OUT_V2, site_id, 'report.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as fh:
        rep = json.load(fh)
    return rep if rep.get('gate') else None


def gps_block(rep):
    st = [dict(s, kind='configured') for s in rep.get('gps', [])] + [dict(s, kind='ngl_auto') for s in rep.get('gps_extra', [])]
    st = [s for s in st if s.get('r') is not None]
    if not st:
        return None, []
    moving = [s for s in st if (s.get('gps_range_cm') or 0) >= GPS_MOVING_CM and s.get('n', 0) >= GPS_MIN_N]
    keep = ('id', 'r', 'rms_cm', 'n', 'gps_range_cm', 'kind')
    return {'stations': [{k: s.get(k) for k in keep} for s in st],
            'basis': 'radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)',
            'moving_threshold_cm': GPS_MOVING_CM}, moving


def apply_v2(e, rep):
    """Status and pipeline numbers from a v2 report (gate + GPS). Keeps the old judgement for comparison."""
    if e.get('status') and e['status'] != 'not_processed':
        e['v1_judgement'] = {k: e[k] for k in ('status', 'refused_by', 'reason') if e.get(k)}
    for k in ('refused_by', 'reason', 'gps', 'pipeline', 'peak_rate_cm_yr', 'peak_change_cm', 'peak_quantity', 'peak_location'):
        e.pop(k, None)
    e['reason'] = None
    gate = rep['gate']
    checks = {k: {'value': c['value'], 'threshold': c['threshold'], 'ok': c['ok']} for k, c in gate['checks'].items()}
    e['gate'] = {'passed': gate['passed'], 'failed': gate.get('failed', []), 'checks': checks}
    pairs = rep.get('pairs', {})
    e['pipeline'] = {'version': 'v2 (GUNW HDF5)', 'pairs': pairs.get('chain'), 'noise_cm': rep.get('noise_cm'),
                     'coherence_mean': (rep.get('coherence') or {}).get('mean'),
                     'coherent_fraction': (rep.get('coherence') or {}).get('coherent_fraction'),
                     'uncertainty_median_cm': (rep.get('uncertainty') or {}).get('final_median_cm'),
                     'runtime_s': rep.get('runtime_s'),
                     'transferred_mb': round((rep.get('fetch') or {}).get('bytes', 0) / 1e6)}
    if rep.get('dates'):
        e.update(dates=rep['dates'], span_days=rep['span_days'])
    block, moving = gps_block(rep)
    e['gps'] = block
    if not gate['passed']:
        e['status'], e['refused_by'] = 'refused', 'quality_gate'
        e['reason'] = 'Automatic quality gate: ' + '; '.join(
            '%s %s (needs %s %s)' % (k, checks[k]['value'], '<=' if k == 'temporal_noise_cm' else '>=', checks[k]['threshold'])
            for k in gate.get('failed', [])) + '.'
        return e
    ex = rep.get('extreme') or {}
    if ex.get('min_cm') is not None and rep.get('span_days'):
        e.update(peak_change_cm=round(-ex['min_cm'], 1), peak_rate_cm_yr=annual(-ex['min_cm'], rep['span_days']),
                 peak_quantity='los', peak_location=[ex['lon'], ex['lat']], peak_sigma_cm=ex.get('sigma_cm'))
    if moving:
        mid = len(moving) // 2
        r = sorted(s['r'] for s in moving)[mid]
        rms = sorted(s['rms_cm'] for s in moving)[mid]
        rng = sorted(s['gps_range_cm'] for s in moving)[mid]
        ok = r >= GPS_AGREE_R and rms <= max(GPS_AGREE_RMS[0], GPS_AGREE_RMS[1] * rng)
        block['test'] = {'stations': len(moving), 'median_r': r, 'median_rms_cm': rms, 'median_gps_range_cm': rng, 'agrees': ok}
        if ok:
            e['status'] = 'validated'
        else:
            e['status'], e['refused_by'] = 'refused', 'gps'
            e['reason'] = 'Quality gate passed, but GPS disagrees: median r %.2f, RMS %.1f cm over %d stations that moved >= %g cm.' % (
                r, rms, len(moving), GPS_MOVING_CM)
    else:
        # no station moved enough to test r; quiet stations still test the map: where GPS stays put, the radar
        # must too (median RMS <= 1.5 cm over >= 2 stations with >= 10 common dates)
        quiet = [s for s in (block or {}).get('stations', []) if s.get('n', 0) >= GPS_MIN_N and s.get('rms_cm') is not None]
        e['status'] = 'measured'
        if len(quiet) >= 2:
            rms = sorted(s['rms_cm'] for s in quiet)[len(quiet) // 2]
            ok = rms <= GPS_AGREE_RMS[0]
            block['test'] = {'stations': len(quiet), 'median_rms_cm': rms, 'kind': 'quiet stations (< %g cm motion)' % GPS_MOVING_CM, 'agrees': ok}
            if not ok:
                e['status'], e['refused_by'] = 'refused', 'gps'
                e['reason'] = ('Quality gate passed, but %d GPS stations that barely moved (< %g cm) differ from the radar by a median '
                               'RMS of %.1f cm: the map shows motion the ground did not make.' % (len(quiet), GPS_MOVING_CM, rms))
    return e


HIDDEN_WHEN_UNCONFIRMED = ('peak_change_cm', 'peak_sigma_cm', 'peak_location', 'peak_rate_cm_yr', 'peak_quantity', 'gps',
                           'location_check')


def apply_unconfirmed(e, reason):
    """Status "unconfirmed": keep the gate, hide our numbers (raw values only under diagnostics{})."""
    e['diagnostics'] = {'note': 'NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only',
                        'status_by_rules': e['status'],
                        **{k + '_raw': e.get(k) for k in HIDDEN_WHEN_UNCONFIRMED}}
    for k in HIDDEN_WHEN_UNCONFIRMED:
        e[k] = None
    e.update(status='unconfirmed', unconfirmed_reason=reason, has_site_data=False, reason=None)
    e.pop('refused_by', None)
    return e


def catalogue_entries(known):
    """Gap-region catalogue sites that have a v2 report (the others stay in the catalogue file only)."""
    if not os.path.exists(CANDIDATES):
        return []
    with open(CANDIDATES, encoding='utf-8') as fh:
        cands = json.load(fh)
    out = []
    for k, v in cands.items():
        if k.startswith('_') or k in known or not isinstance(v, dict) or not v2_report(k):
            continue
        lt = v.get('literature') or {}
        out.append({'id': k, 'name': v.get('name', k), 'country': v.get('country'), 'continent': v.get('continent'),
                    'lon': v['search_point'][0],
                    'lat': v['search_point'][1], 'from_catalogue': True,
                    'literature': lit(lt.get('rate_cm_yr'), lt.get('quantity'), lt.get('period'), lt.get('citation'),
                                      lt.get('url'), lt.get('note', ''))})
    return out


def from_site(entry):
    """Fill pipeline numbers from a published site/data/<id>.js written by refresh.py."""
    s = read_site(entry['id'])
    if s is None:
        raise SystemExit('missing site/data/%s.js' % entry['id'])
    t = s['tracks'][0]
    entry.update(has_site_data=True, dates=[s['dates'][0], s['dates'][-1]], span_days=s['span_days'],
                 track='%d/%d %s' % (t['path'], t['frame'], t['direction']))
    if s.get('extreme'):
        e = s['extreme']
        entry.update(peak_change_cm=round(-e['min_cm'], 1), peak_rate_cm_yr=annual(-e['min_cm'], s['span_days']),
                     peak_quantity=s['quantity']['key'], peak_location=[e['lon'], e['lat']])
    entry.setdefault('pipeline', {})
    entry['pipeline'].update(pairs=t['pairs'], noise_cm=s['noise'].get('value_cm'),
                             coherence_proxy=(s.get('provenance', {}).get('coherence_proxy') or {}).get('mean'))
    gps = [{'id': g['id'], 'r': g['r'], 'rms_cm': g['rms_cm'], 'n': g['n']} for g in s.get('gps', []) if g.get('r') is not None]
    entry['gps'] = {'stations': gps, 'basis': 'radar LOS vs GPS up x cos(incidence), per date'} if gps else None
    return entry


ENTRIES = [
    # ---------------------------------------------------------------- validated
    {'id': 'mexico_city', 'name': 'Mexico City', 'country': 'Mexico', 'lat': 19.43, 'lon': -99.07, 'status': 'validated',
     'literature': lit(39.1, 'vertical', '2014-2020', 'Cigna & Tapete 2021, Remote Sensing of Environment 253:112161 (Iztapalapa; ~50 per Chaussard et al. 2021)',
                       'https://doi.org/10.1016/j.rse.2020.112161'),
     'location_check': 'Peak east of the airport / Nezahualcoyotl, the bowl documented in the literature.'},
    {'id': 'sjv', 'name': 'San Joaquin Valley', 'country': 'United States', 'lat': 36.06, 'lon': -119.31, 'status': 'validated',
     'literature': lit(34.5, 'vertical', 'water year 2016 (drought peak)', 'Neely et al. 2021, Water Resources Research', 'https://doi.org/10.1029/2020WR028451',
                       'Drought-year peak near Corcoran; rates vary strongly with drought.'),
     'location_check': 'Fastest towns Tipton, Teviston, Pixley (Tule subbasin), consistent with DWR/TRE ALTAMIRA maps.'},
    # ---------------------------------------------------------------- measured (published, no GPS)
    {'id': 'tehran', 'name': 'Tehran plain', 'country': 'Iran', 'lat': 35.63, 'lon': 51.17, 'status': 'measured',
     'literature': lit(25, 'vertical', '2003-2017', 'Haghshenas Haghighi & Motagh 2019, Remote Sensing of Environment', 'https://doi.org/10.1016/j.rse.2018.11.003',
                       '>25 cm/yr in the western plain (Shahriar-Eslamshahr); Varamin ~22.'),
     'location_check': 'Bowl between Shahriar and Mehrabad airport, west of the city, as in the literature. Northern city outside the frame.'},
    {'id': 'mashhad', 'name': 'Mashhad plain', 'country': 'Iran', 'lat': 36.42, 'lon': 59.54, 'status': 'measured',
     'literature': lit(19.1, 'vertical', 'Oct 2014 - Feb 2017', 'Abrishami & Perissin 2020, Scientific Reports (14.6 cm/yr LOS)', 'https://doi.org/10.1038/s41598-020-67989-1'),
     'location_check': 'Elongated NW-SE bowl along the plain north-west of the city, as in the literature.'},
    {'id': 'rafsanjan', 'name': 'Rafsanjan plain', 'country': 'Iran', 'lat': 30.53, 'lon': 55.79, 'status': 'measured',
     'literature': lit(35, 'vertical', '2014-2020', 'Haghshenas Haghighi & Motagh 2024, Science Advances (locally >35; Motagh et al. 2017 give 20-30)',
                       'https://doi.org/10.1126/sciadv.adk3039'),
     'location_check': 'Bowl north-west of Rafsanjan city (Bahreman / Nough plain direction), as in the literature. Reference is the city core, which may itself sink slowly, so our numbers are a lower bound. No stable-area noise estimate.'},
    {'id': 'konya', 'name': 'Konya', 'country': 'Turkey', 'lat': 37.77, 'lon': 32.61, 'status': 'measured',
     'literature': lit(9.0, 'line of sight?', '2014-2022', 'Orhan et al. 2024, Geosciences 14(1):5', 'https://doi.org/10.3390/geosciences14010005',
                       'Subsidence concentrated in the Konya urban area.'),
     'location_check': 'Compact bowl on the southern side of the urban area. Our 120-day annualised rate is ~3x the literature: irrigation-season pumping, treat with caution.'},
    {'id': 'celaya', 'name': 'Celaya', 'country': 'Mexico', 'lat': 20.59, 'lon': -100.78, 'status': 'measured',
     'literature': lit(8.5, 'vertical', '2007-2011 (ALOS)', 'Chaussard et al. 2014, Remote Sensing of Environment', 'https://doi.org/10.1016/j.rse.2013.08.038'),
     'location_check': 'Bowl north-east of the centre with sinking across the city; the literature puts the fastest area south and east of the centre. Our rate is higher than the 2007-2011 value. A full year on the same track as Mexico City.'},
    # ---------------------------------------------------------------- refused (ran, not trusted)
    {'id': 'houston', 'name': 'Houston', 'country': 'United States', 'lat': 29.95, 'lon': -95.6, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'Radar moves opposite to GPS: correlation -0.78 (AULT) and -0.73 (ROD1). Sinking of 1-3 cm/yr is below what the preview images can resolve in humid air.',
     'dates': ['20251102', '20261016'], 'span_days': 348, 'track': '62/17 ascending',
     'gps': {'stations': [{'id': 'AULT', 'r': -0.775, 'rms_cm': 1.21, 'n': 28}, {'id': 'ROD1', 'r': -0.734, 'rms_cm': 1.07, 'n': 28}],
             'basis': 'radar LOS vs GPS up x 0.77, per date'},
     'pipeline': {'pairs': 27, 'coherence_proxy': 0.988, 'usable_fraction': 0.56},
     'literature': lit(3.4, 'vertical', 'Dec 2015 - Aug 2017', 'Miller & Shirzaei 2019, Remote Sensing of Environment', 'https://doi.org/10.1016/j.rse.2019.03.022')},
    {'id': 'jakarta', 'name': 'Jakarta', 'country': 'Indonesia', 'lat': -6.12, 'lon': 106.8, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'No bowl over North Jakarta (Muara Baru +0.4 cm in 108 days); the map is noise. Humid air and a short wet-season record.',
     'dates': ['20260627', '20261013'], 'span_days': 108, 'track': '18/92 descending', 'gps': None,
     'pipeline': {'pairs': 8, 'coherence_proxy': 0.965, 'georef_worst_px': 12.2},
     'literature': lit(22, 'vertical', '2007-2009 (ALOS)', 'Chaussard et al. 2013, Remote Sensing of Environment', 'https://doi.org/10.1016/j.rse.2012.10.015',
                       'Sentinel-era peaks are lower, ~5-8 cm/yr (Wu et al. 2022, GRL).')},
    {'id': 'bangkok', 'name': 'Bangkok', 'country': 'Thailand', 'lat': 13.6, 'lon': 100.6, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'No GPS agreement (CUSV r = 0.05); expected motion of 2-3 cm/yr is below the method\'s noise in a monsoon season.',
     'dates': ['20260621', '20261019'], 'span_days': 120, 'track': '112/8 ascending',
     'gps': {'stations': [{'id': 'CUSV', 'r': 0.049, 'rms_cm': 1.22, 'n': 9}], 'basis': 'radar LOS vs GPS up x 0.77, per date'},
     'pipeline': {'pairs': 8, 'coherence_proxy': 0.982},
     'literature': lit(3, 'line of sight?', '2005-2010', 'Aobpaet et al. 2013, International Journal of Remote Sensing', 'https://doi.org/10.1080/01431161.2012.756596',
                       'Low confidence in this figure.')},
    {'id': 'hcmc', 'name': 'Ho Chi Minh City', 'country': 'Vietnam', 'lat': 10.76, 'lon': 106.6, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'Broad, patchy pattern with holes; 9 cm in one rainy season would be ~5x the published rate, so it is most likely atmosphere, not ground motion.',
     'dates': ['20260617', '20261015'], 'span_days': 120, 'track': '47/83 descending', 'gps': None,
     'pipeline': {'pairs': 9, 'coherence_proxy': 0.949},
     'literature': lit(5.3, 'line of sight?', '2015-2018', 'Duffy et al. 2020, Remote Sensing', 'https://doi.org/10.3390/rs12244130')},
    {'id': 'eloy', 'name': 'Eloy basin, Arizona', 'country': 'United States', 'lat': 32.8, 'lon': -111.55, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'Nothing above the noise: the four GPS stations moved less than 0.5 cm in these 120 days and the radar shows only +-2 cm noise (r between -0.80 and 0.22).',
     'dates': ['20260619', '20261017'], 'span_days': 120, 'track': '77/18 ascending',
     'gps': {'stations': [{'id': 'AZAZ', 'r': 0.223, 'rms_cm': 0.99, 'n': 10}, {'id': 'AZCG', 'r': -0.8, 'rms_cm': 1.13, 'n': 10},
                          {'id': 'AZMA', 'r': -0.228, 'rms_cm': 1.55, 'n': 10}, {'id': 'AZCD', 'r': -0.149, 'rms_cm': 1.22, 'n': 10}],
             'basis': 'radar LOS vs GPS up x 0.77, per date'},
     'pipeline': {'pairs': 9, 'coherence_proxy': 0.994, 'noise_cm': 0.99},
     'literature': lit(None, None, None, 'Conway 2016, Hydrogeology Journal (Arizona InSAR overview; no single peak rate taken)', 'https://doi.org/10.1007/s10040-015-1329-z')},
    {'id': 'aguascalientes', 'name': 'Aguascalientes', 'country': 'Mexico', 'lat': 21.88, 'lon': -102.3, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'No bowl along the city graben (centre +0.4 cm in 120 days) although ~4 cm was expected; GPS overlaps only 3 dates (UAGU, INEG data end Jul-Aug 2026).',
     'dates': ['20260622', '20261020'], 'span_days': 120, 'track': '120/13 ascending', 'gps': None,
     'pipeline': {'pairs': 8, 'coherence_proxy': 0.993},
     'literature': lit(12, 'vertical', '2015-2020', 'Cigna & Tapete 2021, Remote Sensing of Environment 254:112254', 'https://doi.org/10.1016/j.rse.2020.112254')},
    {'id': 'beijing', 'name': 'Beijing plain', 'country': 'China', 'lat': 39.92, 'lon': 116.6, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'The deepest point is near the known Chaoyang-Tongzhou bowl, but the whole eastern half tilts and the rate is ~2.6x recent studies; in the rainy season we cannot separate it from atmosphere.',
     'dates': ['20260617', '20261015'], 'span_days': 120, 'track': '47/68 descending', 'gps': None,
     'pipeline': {'pairs': 9, 'coherence_proxy': 0.986, 'noise_cm': 0.48},
     'literature': lit(5.7, 'line of sight?', '~2017-2021', 'Sheng et al. 2023, Remote Sensing', 'https://doi.org/10.3390/rs15051199', 'Pre-2015 peaks were 10-14 cm/yr.')},
    {'id': 'delhi', 'name': 'Delhi NCR', 'country': 'India', 'lat': 28.53, 'lon': 77.08, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'Broad sinking across the western half instead of a compact bowl at Kapashera (only -2.7 cm in 9 months there); cannot tell motion from a leftover tilt.',
     'dates': ['20251121', '20260824'], 'span_days': 276, 'track': '156/16 ascending', 'gps': None,
     'pipeline': {'pairs': 19, 'coherence_proxy': 0.987, 'noise_cm': 0.67},
     'literature': lit(11, 'line of sight?', '2014-2020', 'Garg et al. 2022, Scientific Reports', 'https://doi.org/10.1038/s41598-021-04193-9', 'Kapashera >11; Faridabad ~3.')},
    {'id': 'quetta', 'name': 'Quetta valley', 'country': 'Pakistan', 'lat': 30.2, 'lon': 67.0, 'status': 'refused', 'refused_by': 'manual_review',
     'reason': 'A sinking patch shows in the city, but the strongest signal (-5.5 cm) is only ~3x the 1.9 cm noise of the mountain reference, which itself drifts; not trusted.',
     'dates': ['20260617', '20261015'], 'span_days': 120, 'track': '41/17 ascending', 'gps': None,
     'pipeline': {'pairs': 9, 'coherence_proxy': 0.989, 'noise_cm': 1.87},
     'literature': lit(16, 'line of sight?', 'Dec 2015 - Dec 2022', 'Kakar et al. 2024, Remote Sensing (GNSS 16.6 cm/yr)', 'https://doi.org/10.3390/rs16091521')},
    # ---------------------------------------------------------------- not processed (literature only)
    {'id': 'semarang', 'name': 'Semarang', 'country': 'Indonesia', 'lat': -6.95, 'lon': 110.47,
     'literature': lit(11, 'vertical?', '2015-2022', 'Aditiya & Ito 2023, Int. J. Applied Earth Observation and Geoinformation', 'https://doi.org/10.1016/j.jag.2023.103579', '10-12 cm/yr')},
    {'id': 'bandung', 'name': 'Bandung', 'country': 'Indonesia', 'lat': -6.97, 'lon': 107.65,
     'literature': lit(18.7, 'line of sight?', '~2014-2020', 'Rygus et al. 2023, Remote Sensing', 'https://doi.org/10.3390/rs15153776')},
    {'id': 'tianjin', 'name': 'Tianjin', 'country': 'China', 'lat': 39.13, 'lon': 116.95,
     'literature': lit(12.2, 'vertical?', '2015-2020', 'Shi et al. 2022, International Journal of Digital Earth', 'https://doi.org/10.1080/17538947.2022.2122610')},
    {'id': 'kathmandu', 'name': 'Kathmandu', 'country': 'Nepal', 'lat': 27.70, 'lon': 85.32,
     'literature': lit(20, 'line of sight', '~2015-2021', 'Huang et al. 2024, International Journal of Remote Sensing', 'https://doi.org/10.1080/01431161.2023.2283902')},
    {'id': 'lagos', 'name': 'Lagos', 'country': 'Nigeria', 'lat': 6.44, 'lon': 3.47,
     'literature': lit(8.7, 'line of sight?', '2015-2019', 'Ikuemonisan & Ozebo 2020, Geodesy and Geodynamics', 'https://doi.org/10.1016/j.geog.2019.12.006')},
    {'id': 'morelia', 'name': 'Morelia', 'country': 'Mexico', 'lat': 19.73, 'lon': -101.20,
     'literature': lit(9.0, 'vertical', '2014-2021', 'Cigna & Tapete 2022, Science of the Total Environment', 'https://doi.org/10.1016/j.scitotenv.2021.152211')},
    {'id': 'queretaro', 'name': 'Queretaro', 'country': 'Mexico', 'lat': 20.62, 'lon': -100.42,
     'literature': lit(5, 'vertical', '2007-2011 (ALOS)', 'Chaussard et al. 2014, Remote Sensing of Environment', 'https://doi.org/10.1016/j.rse.2013.08.038', 'More recent studies suggest ~1.5 cm/yr.')},
    {'id': 'yunlin', 'name': 'Yunlin', 'country': 'Taiwan', 'lat': 23.68, 'lon': 120.39,
     'literature': lit(6.5, 'vertical?', '2015-2021', 'Sentinel-1 study of central Taiwan, Remote Sensing 2019', 'https://doi.org/10.3390/rs11232817', 'Low confidence in this figure (6-7 cm/yr).')},
    {'id': 'isfahan', 'name': 'Isfahan', 'country': 'Iran', 'lat': 32.75, 'lon': 51.60,
     'literature': lit(6, 'line of sight?', '2014-2023', 'Shirani & Pasandi 2025, Iranian Journal of Watershed Management Science and Engineering', 'https://doi.org/10.22092/ijwmse.2025.367922.2091', 'Low confidence in this figure.')},
]


def main():
    out = []
    entries = ENTRIES + catalogue_entries({e['id'] for e in ENTRIES})
    with open(os.path.join(HERE, 'sites.json'), encoding='utf-8') as fh:
        configured = json.load(fh)
    for e in entries:
        e = dict(e)
        cfg = configured.get(e['id']) or {}
        # hand checks written next to the site's config (bowl position against the literature, choice of reference)
        if cfg.get('location_check'):
            e['location_check'] = cfg['location_check']
            e['location_match'] = cfg.get('location_match')
        if (cfg.get('reference') or {}).get('reason'):
            e['reference'] = {k: cfg['reference'][k] for k in ('name', 'lon', 'lat', 'reason') if k in cfg['reference']}
        e.setdefault('status', 'not_processed')
        e.setdefault('has_site_data', False)
        for key in ('peak_rate_cm_yr', 'gps', 'track', 'reason'):
            e.setdefault(key, None)
        e.setdefault('dates', None)
        e['covered_by'] = coverage(e)
        e['role'] = 'calibration' if e['id'] in CALIBRATION else ('covered' if e['covered_by'] else 'gap_region')
        rep = v2_report(e['id'])
        if e['id'] == 'sjv':
            # research export: grid clipped at 12 cm, no 'extreme' field; use the fastest named town instead
            from_site(e)
            s = read_site('sjv')
            worst = min(s['places'], key=lambda p: p['median_cm'])
            e.update(peak_change_cm=round(-worst['median_cm'], 1), peak_rate_cm_yr=annual(-worst['median_cm'], s['span_days']),
                     peak_quantity='vertical', peak_location=[worst['lon'], worst['lat']],
                     peak_note='Median within %.1f km of %s; the map grid is clipped at 12 cm, so the true peak is higher.' % (worst['radius_km'], worst['name']))
            h = s['headline']
            e['gps']['held_out'] = {'r': h['validation']['r'], 'rms_los_cm': h['validation']['rms_los_cm'], 'note': h['validation']['text']}
            if rep:
                e['pipeline_v2'] = {'gate_passed': rep['gate']['passed'],
                                    'gps': [{k: g.get(k) for k in ('id', 'r', 'rms_cm', 'n', 'gps_range_cm')} for g in rep.get('gps', [])],
                                    'note': 'v2 on one track (34/20 ascending), not tied to GPS; the site layer stays the research export'}
        elif rep:
            apply_v2(e, rep)
            site = read_site(e['id'])
            e['has_site_data'] = bool(site and site.get('source') == 'GUNW-HDF5')
            if e['has_site_data']:
                t = site['tracks'][0]
                e['track'] = '%d/%d %s' % (t['path'], t['frame'], t['direction'])
        elif e['status'] in ('validated', 'measured'):
            from_site(e)
        if cfg.get('unconfirmed_reason') and e['status'] in ('validated', 'measured'):
            apply_unconfirmed(e, cfg['unconfirmed_reason'])
        out.append(e)
    path = os.path.join(DATA, 'observatory.js')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Written by pipeline/build_observatory.py. Pipeline numbers and literature numbers are kept apart:\n')
        fh.write('// peak_rate_cm_yr / gps / dates come from our NISAR pipeline; literature{} is published work.\n')
        fh.write('window.OBSERVATORY = ' + json.dumps(out, indent=1, ensure_ascii=False) + ';\n')
    counts = {}
    for e in out:
        counts[e['status']] = counts.get(e['status'], 0) + 1
    print('wrote %s: %d entries %s' % (os.path.relpath(path), len(out), counts))
    for e in out:
        print('  %-15s %-13s peak %s cm in %s days %s' % (e['id'], e['status'], e.get('peak_change_cm'), e.get('span_days'), e.get('peak_quantity', '')))


if __name__ == '__main__':
    main()
