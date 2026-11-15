"""Step 1-2 of v2: list the GUNW pairs of a site's track/frame and cache the site subset of each.

Each pair becomes cache/v2/<site>/<granule>.npz (a few MB). The 2.3 GB product itself is never stored:
the subset is read over HTTPS byte ranges. If that fails, the product is downloaded to a temporary
file, subset and deleted immediately (--allow-download).
"""
import concurrent.futures
import json
import os
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.dirname(HERE)
sys.path.insert(0, PIPE)
sys.path.insert(0, HERE)

from nisar import search  # noqa: E402

import gunw  # noqa: E402
import remote  # noqa: E402

SEARCH_URL = search.SEARCH_URL


def listing(site_id, cfg, cache_root, max_age_h=20):
    """Saved ASF listing for the site's search point (refreshed when older than max_age_h)."""
    path = os.path.join(cache_root, 'listing_%s.geojson' % site_id)
    if not (os.path.exists(path) and os.path.getmtime(path) > time.time() - max_age_h * 3600):
        lon, lat = cfg['search_point']
        req = urllib.request.Request(SEARCH_URL.format(lon=lon, lat=lat), headers=search.USER_AGENT)
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        with open(path + '.part', 'wb') as fh:
            fh.write(data)
        os.replace(path + '.part', path)
    with open(path, encoding='utf-8') as fh:
        geo = json.load(fh)
    h5_url = {f['properties']['sceneName']: f['properties'].get('url') for f in geo['features']}
    recs = search.parse_listing(geo)            # PROVISIONAL beats BETA, urgent-response copies skipped
    for r in recs:
        r['h5'] = h5_url.get(r['granule'])
    return recs


def candidates(site_id, cfg, cache_root):
    track = cfg['track']
    recs = [r for r in listing(site_id, cfg, cache_root) if r.get('h5', '').endswith('.h5')]
    return sorted(search.pairs_for_track(recs, track['path'], track['frame']), key=lambda r: (r['ref'], r['sec']))


def choose_looks(bbox):
    """240 m cells for city-sized sites, 400 m for valley-sized ones (keeps arrays and outputs small)."""
    west, south, east, north = bbox
    return 5 if (east - west) * (north - south) > 1.5 else 3


def fetch_one(rec, bbox, looks, out_dir, allow_download=False):
    dst = os.path.join(out_dir, rec['granule'] + '.npz')
    if os.path.exists(dst):
        import numpy as _np
        with _np.load(dst) as z:
            if 'ph_re' in z.files:            # cache format of the current reader
                return dst, 0, 'cached'
    rf = None
    try:
        h5, rf = remote.open_h5(rec['h5'])
        with h5:
            sub = gunw.read_subset(h5, rf, bbox, looks)
        how, nbytes = 'byte-range', rf.bytes
    except Exception as err:                    # noqa: BLE001
        if not allow_download:
            raise
        print('  byte-range read failed (%s); downloading %s' % (err, rec['granule']))
        sub, how = download_and_subset(rec, bbox, looks), 'download'
        nbytes = (rf.bytes if rf else 0) + sub.pop('_downloaded', 0) if sub else 0
    if sub is None:
        return None, nbytes, 'no overlap'
    gunw.save_npz(dst + '.part.npz', sub)
    os.replace(dst + '.part.npz', dst)
    return dst, nbytes, how


def download_and_subset(rec, bbox, looks):
    """Fallback: stream the whole product to a temporary file, subset it, delete it at once."""
    import h5py
    sess = remote.session()
    tmp_dir = tempfile.mkdtemp(prefix='gunw_')
    path = os.path.join(tmp_dir, 'product.h5')
    try:
        with sess.get(rec['h5'], stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(path, 'wb') as fh:
                for block in r.iter_content(8 << 20):
                    fh.write(block)
                    remote.STATS.add(len(block))
        with h5py.File(path, 'r') as h5:
            sub = gunw.read_subset(h5, None, bbox, looks)       # rf=None: plain local slicing
        if sub is not None:
            sub['_downloaded'] = os.path.getsize(path)
        return sub
    finally:
        if os.path.exists(path):
            os.remove(path)
        os.rmdir(tmp_dir)


def fetch_site(site_id, cfg, cache_root, workers=3, allow_download=False, log=print):
    cands = candidates(site_id, cfg, cache_root)
    looks = cfg.get('v2_looks') or choose_looks(cfg['bbox'])
    out_dir = os.path.join(cache_root, site_id)
    os.makedirs(out_dir, exist_ok=True)
    log('fetch: %d pairs on track %d frame %d; looks %d' % (len(cands), cfg['track']['path'], cfg['track']['frame'], looks))
    t0, total = time.time(), 0
    results = []

    def job(rec):
        return rec, fetch_one(rec, cfg['bbox'], looks, out_dir, allow_download)

    with concurrent.futures.ThreadPoolExecutor(workers) as pool:
        for rec, (path, nbytes, how) in pool.map(job, cands):
            total += nbytes
            if path:
                results.append((rec, path))
            if how != 'cached':
                log('  %s-%s %-10s %6.1f MB' % (rec['ref'], rec['sec'], how, nbytes / 1e6))
    log('fetch: %d subsets, %.0f MB transferred in %.0f s' % (len(results), total / 1e6, time.time() - t0))
    return results, {'bytes': total, 'seconds': round(time.time() - t0, 1), 'looks': looks, 'candidates': len(cands)}


if __name__ == '__main__':
    import run
    sites = run.load_sites()
    sid = sys.argv[1]
    fetch_site(sid, sites[sid], os.path.join(PIPE, 'cache', 'v2'), allow_download='--allow-download' in sys.argv)
