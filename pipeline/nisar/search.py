"""Step 1: list NISAR L2 GUNW products over a point and pick a chain of consecutive pairs.

Uses the public ASF search API (no login). Rules learned the hard way:
  * the preview URL is taken from the listing, never built from a template
    (NASA moved new products from /BROWSE/NISAR_L2_GUNW_PROVISIONAL_V1/ to /BROWSE/L2_L_GUNW/ on 2026-11-12);
  * when the same pair exists in several collections, PROVISIONAL beats BETA;
  * urgent-response copies (/NISAR-UR/) are skipped.
"""
import json
import re
import ssl
import time
import urllib.request

SEARCH_URL = ('https://api.daac.asf.alaska.edu/services/search/param?dataset=NISAR&processingLevel=GUNW'
              '&intersectsWith=POINT({lon}%20{lat})&output=geojson&maxResults=1000')
USER_AGENT = {'User-Agent': 'nisar-preview-subsidence/1.0 (open-source hackathon project)'}


def tls_context(cafile=None):
    return ssl.create_default_context(cafile=cafile)


def http_get(url, ctx, tries=3, timeout=120):
    """GET with simple retry. Returns bytes."""
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=USER_AGENT)
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                return resp.read()
        except Exception:                       # noqa: BLE001 - any network error is retried
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))


def collection_rank(name, url):
    """Higher is better. Works for the old and the new collection/URL naming."""
    text = f'{name or ""} {url}'.upper()
    if 'BETA' in text:
        return 1
    if 'PROVISIONAL' in text:
        return 2
    return 3                                    # anything newer than provisional


def parse_listing(geojson):
    """ASF geojson -> list of pair records, one per (path, frame, mode, reference date, secondary date)."""
    best = {}
    for feature in geojson.get('features', []):
        prop = feature['properties']
        name = prop['sceneName']
        dates = re.findall(r'(20\d{6})T\d{6}', name)
        previews = [u for u in (prop.get('browse') or []) if u.endswith('_LATLON.png')]
        if len(dates) < 4 or not previews:
            continue
        url = previews[0]
        if '/NISAR-UR/' in url or '_UR_' in name:
            continue
        ring = feature['geometry']['coordinates'][0]
        lons, lats = [p[0] for p in ring], [p[1] for p in ring]
        rec = {
            'granule': name, 'ref': dates[0], 'sec': dates[2], 'url': url,
            'path': int(prop['pathNumber']), 'frame': int(prop['frameNumber']),
            'mode': name.split('_')[9],         # range-bandwidth code; never mix modes in one stack
            'direction': prop.get('flightDirection'), 'processed': prop.get('processingDate') or '',
            'collection': prop.get('collectionName') or '',
            'footprint': [min(lons), min(lats), max(lons), max(lats)],     # west, south, east, north
        }
        rec['rank'] = (collection_rank(rec['collection'], url), prop.get('crid') or '', rec['processed'])
        key = (rec['path'], rec['frame'], rec['mode'], rec['ref'], rec['sec'])
        if key not in best or rec['rank'] > best[key]['rank']:
            best[key] = rec
    return list(best.values())


def fetch_listing(lon, lat, ctx):
    return parse_listing(json.loads(http_get(SEARCH_URL.format(lon=lon, lat=lat), ctx)))


def longest_chain(pairs):
    """Longest run in which the secondary date of one pair is the reference date of the next."""
    best = {}
    for rec in sorted(pairs, key=lambda r: (r['sec'], r['ref'])):
        before = best.get(rec['ref'], [])
        if len(before) + 1 > len(best.get(rec['sec'], [])):
            best[rec['sec']] = before + [rec]
    if not best:
        return []
    return max(best.values(), key=lambda chain: (len(chain), chain[-1]['sec']))


def pairs_for_track(pairs, path, frame):
    """All pairs of one track/frame, restricted to the mode with the most pairs."""
    modes = {}
    for rec in pairs:
        if rec['path'] == path and rec['frame'] == frame:
            modes.setdefault(rec['mode'], []).append(rec)
    return max(modes.values(), key=len) if modes else []
