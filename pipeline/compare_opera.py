"""Compare a Groundline NISAR map with NASA's OPERA DISP-S1 (Sentinel-1) over the same dates.

    python pipeline/compare_opera.py mexico_city [--direction DESCENDING] [--spacing-km 2.5]
    python pipeline/compare_opera.py sjv
    python pipeline/compare_opera.py celaya

What it does
------------
1. Reads our map from site/data/<id>.js (value grid per date, Web Mercator rows, north first).
2. Samples OPERA DISP-S1 v1 on a regular lon/lat grid of points through the ASF Displacement
   Portal's public time-series service (no login). Each call returns the whole chained series
   of one 30 m pixel. Responses are cached in pipeline/cache/opera/ so re-runs are offline.
3. That service only serves OPERA's ``short_wavelength_displacement`` layer: the displacement
   minus a Gaussian low-pass with a 30 km cutoff (OPERA ATBD D-108765 sec. 2.17; disp-s1
   ``spatial_wavelength_cutoff = 30000``; dolphin ``filter_long_wavelength`` with the response
   0.5 at 1/30 km, i.e. sigma = 30 km * sqrt(ln 2) / (sqrt(2) * pi) = 5.62 km). Features wider
   than about 20-30 km are damped or removed. To compare like with like we apply the SAME
   high-pass to our map (nearest-neighbour fill of no-data, Gaussian low-pass, subtract).
4. Converts both to vertical-equivalent: OPERA LOS / cos(incidence), incidence interpolated
   linearly 30.9-45.9 deg across the frame footprint (Sentinel-1 IW swath); ours with the
   project's own assumption (LOS / 0.77) unless the layer is already vertical-equivalent.
5. Cumulative change over the overlapping window (closest dates, <= 6 days apart), constant
   removed by re-referencing both to the same stable area (or to the median of all points).
6. Writes metrics, a difference map and a scatter plot to pipeline/out_opera/, and updates
   site/data/opera_check.js (window.OPERA_CHECK[id]).

With full DISP-S1 NetCDF access (needs the ASF EULA accepted on the Earthdata account) the
unfiltered ``displacement`` layer could be compared directly; this script does not do that yet.

Needs: numpy, scipy, requests, matplotlib (installed in pipeline/.venv).
"""
import argparse
import base64
import concurrent.futures as cf
import datetime as dt
import io
import json
import math
import os
import re
import sys
import time

import numpy as np
import requests
from scipy import ndimage, stats

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API = "https://d2qmcvu7qty7vn.cloudfront.net/timeseries"
CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
CUTOFF_M = 30000.0
SIGMA_M = CUTOFF_M * math.sqrt(math.log(2)) / (math.sqrt(2) * math.pi)   # 5622 m
INC_NEAR, INC_FAR = 30.9, 45.9
MAX_DATE_GAP = 6

CITATION = ("OPERA Surface Displacement from Sentinel-1 (DISP-S1) v1, NASA JPL OPERA project, distributed by "
            "ASF DAAC, doi:10.5067/SNWG/OPERA_L3_DISP-S1_V1. Validation: Staniewicz et al. (2025), "
            "arXiv:2511.12051: mean velocity difference to GPS under 4 mm/yr at length scales under 50 km; "
            "requirement met at over 96% of validation sites.")
URL = "https://www.earthdata.nasa.gov/data/catalog/asf-opera-l3-disp-s1-v1-1"

# Per-site choices. Directions: the OPERA geometry with the latest data at the site (checked 2026-11-14).
SITES = {
    "mexico_city": {"direction": "DESCENDING", "spacing_km": 2.5},
    "sjv": {"direction": "ASCENDING", "spacing_km": 6.0},
    "celaya": {"direction": "ASCENDING", "spacing_km": 1.25},
}


# ----------------------------------------------------------------------------- our data
def load_site(site_id):
    path = os.path.join(ROOT, "site", "data", f"{site_id}.js")
    txt = open(path, encoding="utf-8").read()
    m = re.search(r'window\.SITE_DATA\[\s*"%s"\s*\]\s*=\s*' % re.escape(site_id), txt)
    obj, _ = json.JSONDecoder().raw_decode(txt[m.end():])
    g = obj["grid"]
    cube = []
    for b in g["frames_b64"]:
        a = np.frombuffer(base64.b64decode(b), dtype=np.int8).reshape(g["height"], g["width"]).astype(float)
        a[a == g["nodata"]] = np.nan
        cube.append(a * g["step_cm"])
    return obj, np.array(cube)


def merc_y(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def inv_merc_y(y):
    return math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2)


class Grid:
    def __init__(self, obj):
        (s, w), (n, e) = obj["overlay"]["bounds"]
        self.s, self.w, self.n, self.e = s, w, n, e
        self.W, self.H = obj["grid"]["width"], obj["grid"]["height"]
        self.yn, self.ys = merc_y(n), merc_y(s)
        lat0 = math.radians((s + n) / 2)
        self.dx_m = (e - w) / self.W * 111320 * math.cos(lat0)
        self.dy_m = (self.yn - self.ys) / self.H * 6378137 * math.cos(lat0)

    def rc(self, lon, lat):
        """Fractional (row, col) of a point, cell centres at integers."""
        col = (lon - self.w) / (self.e - self.w) * self.W - 0.5
        row = (self.yn - merc_y(lat)) / (self.yn - self.ys) * self.H - 0.5
        return row, col

    def lonlat(self, row, col):
        lon = self.w + (col + 0.5) * (self.e - self.w) / self.W
        lat = inv_merc_y(self.yn - (row + 0.5) * (self.yn - self.ys) / self.H)
        return lon, lat


def highpass(field, grid, sigma_m=SIGMA_M):
    """OPERA's short-wavelength filter: fill no-data by nearest neighbour, subtract a Gaussian low-pass."""
    bad = ~np.isfinite(field)
    if bad.all():
        return field
    idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
    filled = field[tuple(idx)]
    low = ndimage.gaussian_filter(filled, sigma=(sigma_m / grid.dy_m, sigma_m / grid.dx_m), mode="reflect")
    out = filled - low
    out[bad] = np.nan
    return out


def sample(field, grid, lon, lat):
    r, c = grid.rc(lon, lat)
    return ndimage.map_coordinates(field, [[r], [c]], order=1, mode="nearest", cval=np.nan)[0] \
        if np.isfinite(field[int(round(min(max(r, 0), grid.H - 1))), int(round(min(max(c, 0), grid.W - 1)))]) else np.nan


# ----------------------------------------------------------------------------- OPERA access
def opera_point(lon, lat, direction, session):
    body = {"wkt": f"POINT({lon:.5f} {lat:.5f})", "bucket": "asf-cumulus-prod-opera-products",
            "polarization": "VV", "flightDirection": direction}
    for attempt in range(4):
        try:
            r = session.post(API, json=body, timeout=300)
            if r.status_code == 200:
                j = r.json()
                rows = []
                for k, v in j.items():
                    if not (isinstance(v, dict) and v.get("secondary_datetime")) or v["secondary_datetime"] < "2025-06":
                        continue
                    rows.append((v["secondary_datetime"][:10].replace("-", ""), v["short_wavelength_displacement"],
                                 bool(v["is_masked"]), k.split("_")[4], k[:-3] if k.endswith(".nc") else k))
                rows.sort()
                return {"dates": [x[0] for x in rows], "disp_m": [x[1] for x in rows], "masked": [x[2] for x in rows],
                        "frame": rows[-1][3] if rows else None, "granules": [x[4] for x in rows]}
            if r.status_code in (400, 404, 422) or (r.status_code == 500 and "No" in r.text[:200]):
                return {"dates": [], "disp_m": [], "masked": [], "frame": None, "granules": [], "error": r.text[:200]}
        except (requests.RequestException, ValueError):
            pass
        time.sleep(3 * (attempt + 1))
    return None   # not cached, retried next run


def fetch_points(points, direction, cache_path, workers, offline):
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    todo = [p for p in points if f"{p[0]:.5f},{p[1]:.5f}" not in cache]
    print(f"OPERA points: {len(points)} needed, {len(todo)} to fetch ({direction})", flush=True)
    if todo and offline:
        sys.exit("offline and points missing from cache")
    session = requests.Session()
    done = 0
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(opera_point, p[0], p[1], direction, session): p for p in todo}
        for f in cf.as_completed(futs):
            p = futs[f]
            res = f.result()
            if res is not None:
                cache[f"{p[0]:.5f},{p[1]:.5f}"] = res
            done += 1
            if done % 25 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)}", flush=True)
                json.dump(cache, open(cache_path, "w"))
    json.dump(cache, open(cache_path, "w"))
    return cache


def frame_footprint(frame, cache_dir):
    path = os.path.join(cache_dir, f"frame_{frame}.json")
    if os.path.exists(path):
        return json.load(open(path))
    r = requests.get(CMR, params={"short_name": "OPERA_L3_DISP-S1_V1", "page_size": 1,
                                  "readable_granule_name": f"OPERA_L3_DISP-S1_IW_{frame}_*",
                                  "options[readable_granule_name][pattern]": "true"}, timeout=60)
    umm = r.json()["items"][0]["umm"]
    attrs = {a["Name"]: a["Values"][0] for a in umm.get("AdditionalAttributes", [])}
    poly = umm["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"]["GPolygons"][0]["Boundary"]["Points"]
    out = {"direction": attrs.get("ASCENDING_DESCENDING"), "path": attrs.get("PATH_NUMBER"),
           "polygon": [[p["Longitude"], p["Latitude"]] for p in poly]}
    json.dump(out, open(path, "w"))
    return out


def incidence_deg(lon, lat, fp):
    """Sentinel-1 IW incidence, linear across the frame footprint (near range on the side opposite the look)."""
    pts = np.array(fp["polygon"])
    lat0 = math.radians(pts[:, 1].mean())
    x, y = pts[:, 0] * math.cos(lat0), pts[:, 1]
    look_az = math.radians(80.0 if fp["direction"] == "ASCENDING" else 280.0)   # right-looking
    s = x * math.sin(look_az) + y * math.cos(look_az)
    sp = lon * math.cos(lat0) * math.sin(look_az) + lat * math.cos(look_az)
    f = min(max((sp - s.min()) / (s.max() - s.min()), 0), 1)
    return INC_NEAR + f * (INC_FAR - INC_NEAR)


# ----------------------------------------------------------------------------- helpers
def d8(s):
    return dt.date(int(s[:4]), int(s[4:6]), int(s[6:]))


def closest(target, options):
    return min(options, key=lambda o: abs((d8(o) - d8(target)).days))


def choose_window(nisar_dates, opera_dates):
    """Longest window whose ends are matched within MAX_DATE_GAP days."""
    pairs = []
    for n in nisar_dates:
        o = closest(n, opera_dates)
        if abs((d8(o) - d8(n)).days) <= MAX_DATE_GAP:
            pairs.append((n, o))
    if len(pairs) < 2:
        return None
    return pairs[0], pairs[-1]


def robust_peak(values2d, lons2d, lats2d):
    sm = ndimage.generic_filter(values2d, np.nanmedian, size=3, mode="constant", cval=np.nan)
    if not np.isfinite(sm).any():
        return None
    i = np.nanargmin(sm)
    return {"lon": round(float(lons2d.flat[i]), 4), "lat": round(float(lats2d.flat[i]), 4),
            "cm": round(float(sm.flat[i]), 1)}


def metrics(ours, opera):
    ok = np.isfinite(ours) & np.isfinite(opera)
    a, b = ours[ok], opera[ok]
    if ok.sum() < 10:
        return None
    r = stats.pearsonr(a, b)[0]
    ts = stats.theilslopes(a, b)   # ours = slope * opera + c
    return {"n": int(ok.sum()), "r": round(float(r), 3), "rms_cm": round(float(np.sqrt(np.mean((a - b) ** 2))), 2),
            "slope": round(float(ts[0]), 2), "slope_ci": [round(float(ts[2]), 2), round(float(ts[3]), 2)],
            "std_ours_cm": round(float(a.std()), 2), "std_opera_cm": round(float(b.std()), 2)}


# ----------------------------------------------------------------------------- full (unfiltered) products
# Needs an Earthdata login in ~/.netrc whose account has accepted the ASF EULA. The token session from
# earthaccess is used; the plain netrc redirect route can keep failing with "agree to the EULA" after
# the EULA is accepted. Credentials are never printed or stored by this script.
_SESSION = None


def earthdata_session():
    global _SESSION
    if _SESSION is None:
        import earthaccess
        earthaccess.login(strategy="netrc")
        _SESSION = earthaccess.get_requests_https_session()
    return _SESSION


class RangeFile(io.RawIOBase):
    """Read-only file object over HTTP byte ranges, with a block cache (for h5py)."""

    def __init__(self, url, block=2 << 20):
        self.url, self.block, self.pos, self.blocks, self.nbytes = url, block, 0, {}, 0
        r = self._get(0, 0)
        self.size = int(r.headers["Content-Range"].split("/")[1])

    def _get(self, a, b):
        for attempt in range(5):
            try:
                r = earthdata_session().get(self.url, headers={"Range": f"bytes={a}-{b}"}, timeout=120)
                if r.status_code == 206:
                    return r
                if r.status_code in (401, 403):
                    sys.exit(f"OPERA download refused (HTTP {r.status_code}); has the account accepted the ASF EULA?")
            except requests.RequestException:
                pass
            time.sleep(2 * (attempt + 1))
        raise IOError(f"range read failed: {self.url} {a}-{b}")

    def readable(self):
        return True

    def seekable(self):
        return True

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos

    def tell(self):
        return self.pos

    def readinto(self, buf):
        n = max(0, min(len(buf), self.size - self.pos))
        out = bytearray()
        while len(out) < n:
            p = self.pos + len(out)
            i, off = divmod(p, self.block)
            if i not in self.blocks:
                a = i * self.block
                data = self._get(a, min(a + self.block, self.size) - 1).content
                self.nbytes += len(data)
                self.blocks[i] = data
            out += self.blocks[i][off:off + n - len(out)]
        buf[:n] = out
        self.pos += n
        return n


def frame_products(frame, cache_dir, refresh=False):
    """{(ref, sec): (granule, https url)} for one frame, newest production of each pair (CMR, cached)."""
    path = os.path.join(cache_dir, f"products_{frame}.json")
    if os.path.exists(path) and not refresh:
        return {tuple(k.split("_")): tuple(v) for k, v in json.load(open(path)).items()}
    items, hdr = [], {}
    while True:
        r = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json",
                         params={"short_name": "OPERA_L3_DISP-S1_V1", "page_size": 2000,
                                 "readable_granule_name": f"OPERA_L3_DISP-S1_IW_{frame}_*",
                                 "options[readable_granule_name][pattern]": "true",
                                 "temporal": "2025-01-01T00:00:00Z,2027-12-31T00:00:00Z"}, headers=hdr, timeout=120)
        e = r.json()["feed"]["entry"]
        items += e
        sa = r.headers.get("CMR-Search-After")
        if not sa or not e:
            break
        hdr = {"CMR-Search-After": sa}
    best = {}
    for it in items:
        t = it["title"].split("_")
        key = (t[6][:8], t[7][:8])
        url = next(l["href"] for l in it["links"] if l["href"].startswith("https") and l["href"].endswith(".nc"))
        if key not in best or t[9] > best[key][0].split("_")[9]:
            best[key] = (it["title"], url)
    json.dump({"_".join(k): v for k, v in best.items()}, open(path, "w"))
    return best


def chain_terms(products, d0, d1):
    """Products and signs whose sum is the cumulative displacement change d0 -> d1 (ministacks chained)."""
    def cum(t):
        """Terms from the root of the chain to t, and the root date."""
        terms = {}
        while True:
            refs = [r for (r, sec) in products if sec == t and r < t]
            if not refs:
                return terms, t
            r = max(refs)
            terms[(r, t)] = 1
            t = r

    (c0, root0), (c1, root1) = cum(d0), cum(d1)
    if root0 != root1 or not c1:
        return None
    out = dict(c1)
    for k, v in c0.items():
        out[k] = out.get(k, 0) - v
    return {k: v for k, v in out.items() if v}


def read_product_subset(granule, url, bounds_lonlat, cache_dir, tag):
    """Displacement (m, LOS) and recommended mask over a lon/lat box, read by byte range and cached."""
    path = os.path.join(cache_dir, "full", f"{granule}_{tag}.npz")
    if os.path.exists(path):
        z = np.load(path, allow_pickle=False)
        return {k: z[k] for k in z.files}
    import h5py
    from rasterio.crs import CRS
    from rasterio.warp import transform as warp
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = RangeFile(url)
    with h5py.File(io.BufferedReader(raw, 1 << 20), "r") as h:
        crs = CRS.from_wkt(h["spatial_ref"].attrs["crs_wkt"])
        x, y = h["x"][()], h["y"][()]
        w, s, e, n = bounds_lonlat
        lons = np.r_[np.linspace(w, e, 9), np.full(9, e), np.linspace(e, w, 9), np.full(9, w)]
        lats = np.r_[np.full(9, s), np.linspace(s, n, 9), np.full(9, n), np.linspace(n, s, 9)]
        xs, ys = warp("EPSG:4326", crs, lons.tolist(), lats.tolist())
        c0, c1 = np.searchsorted(x, min(xs)), np.searchsorted(x, max(xs))
        yd = y[::-1]   # y decreasing in file
        r1 = len(y) - np.searchsorted(yd, min(ys))
        r0 = len(y) - np.searchsorted(yd, max(ys))
        r0, r1, c0, c1 = max(r0, 0), min(r1, len(y)), max(c0, 0), min(c1, len(x))
        disp = h["displacement"][r0:r1, c0:c1].astype(np.float32)
        mask = h["recommended_mask"][r0:r1, c0:c1].astype(np.uint8)
        ref = h["corrections/reference_point"].attrs
        out = {"disp": disp, "mask": mask, "x": x[c0:c1], "y": y[r0:r1], "epsg": np.array(crs.to_epsg()),
               "near_inc": np.array(float(h["identification/near_range_incidence_angle"][()])),
               "far_inc": np.array(float(h["identification/far_range_incidence_angle"][()])),
               "ref_lonlat": np.array([float(str(ref["longitudes"]).strip("[]")), float(str(ref["latitudes"]).strip("[]"))])}
    np.savez_compressed(path, **out)
    print(f"  read {granule[20:75]} subset {disp.shape}, {raw.nbytes / 1e6:.0f} MB transferred", flush=True)
    return out


def opera_full_change(frame, d0, d1, bounds, cache_dir, tag):
    prods = frame_products(frame, cache_dir)
    terms = chain_terms(prods, d0, d1)
    if terms is None:
        prods = frame_products(frame, cache_dir, refresh=True)
        terms = chain_terms(prods, d0, d1)
    if terms is None:
        return None
    total, valid, sub, used = None, None, None, []
    for key, coef in sorted(terms.items()):
        g, url = prods[key]
        sub = read_product_subset(g, url, bounds, cache_dir, tag)
        d = sub["disp"].astype(np.float64)
        ok = np.isfinite(d) & (sub["mask"] == 1)
        total = coef * d if total is None else total + coef * d
        valid = ok if valid is None else valid & ok
        used.append(g)
    total[~valid] = np.nan
    return {"change_cm": total * 100.0, "x": sub["x"], "y": sub["y"], "epsg": int(sub["epsg"]),
            "near_inc": float(sub["near_inc"]), "far_inc": float(sub["far_inc"]), "granules": used,
            "terms": {f"{k[0]}_{k[1]}": v for k, v in terms.items()}}


def to_grid(change_cm, x, y, epsg, grid, inc_fn, min_frac=0.3):
    """Vertical-equivalent mean of the 30 m OPERA pixels inside each of our grid cells."""
    from rasterio.warp import transform as warp
    X, Y = np.meshgrid(x, y)
    lon, lat = warp(f"EPSG:{epsg}", "EPSG:4326", X.ravel().tolist(), Y.ravel().tolist())
    lon, lat = np.array(lon), np.array(lat)
    v = change_cm.ravel()
    inc = inc_fn(lon, lat)
    v = v / np.cos(np.radians(inc))
    col = np.floor((lon - grid.w) / (grid.e - grid.w) * grid.W).astype(int)
    my = np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
    row = np.floor((grid.yn - my) / (grid.yn - grid.ys) * grid.H).astype(int)
    inside = (col >= 0) & (col < grid.W) & (row >= 0) & (row < grid.H)
    idx = row[inside] * grid.W + col[inside]
    vv = v[inside]
    good = np.isfinite(vv)
    tot = np.bincount(idx, minlength=grid.W * grid.H).astype(float)
    cnt = np.bincount(idx[good], minlength=grid.W * grid.H).astype(float)
    s = np.bincount(idx[good], weights=vv[good], minlength=grid.W * grid.H)
    out = np.full(grid.W * grid.H, np.nan)
    keep = (tot > 0) & (cnt >= min_frac * tot) & (cnt >= 3)
    out[keep] = s[keep] / cnt[keep]
    return out.reshape(grid.H, grid.W)


def stable_mask(grid, stable):
    m = np.zeros((grid.H, grid.W), bool)
    rows = np.arange(grid.H)
    cols = np.arange(grid.W)
    lons = grid.w + (cols + 0.5) * (grid.e - grid.w) / grid.W
    lats = np.array([inv_merc_y(grid.yn - (r + 0.5) * (grid.yn - grid.ys) / grid.H) for r in rows])
    LO, LA = np.meshgrid(lons, lats)
    for sa in stable:
        w, s, e, n = sa["bbox"]
        m |= (LO >= w) & (LO <= e) & (LA >= s) & (LA <= n)
    return m


def unfiltered_comparison(site, obj, cube, grid, use, fwin, fps, frames, n0, n1, cos_ours, stable, cache_dir):
    """Full OPERA displacement vs our unfiltered map on our grid. Same window, frames, geometry, reference."""
    (s, w), (n, e) = obj["overlay"]["bounds"]
    bounds = (w, s, e, n)
    i0, i1 = obj["dates"].index(n0), obj["dates"].index(n1)
    ours = (cube[i1] - cube[i0]) / cos_ours
    smask = stable_mask(grid, stable)
    grids, info = {}, {}
    for f in sorted(use, key=lambda f: -frames[f]):
        ch = opera_full_change(f, fwin[f][0], fwin[f][1], bounds, cache_dir, site)
        if ch is None:
            print(f"  {f}: could not chain products for {fwin[f]}")
            continue
        fp = dict(fps[f])

        def inc_fn(lon, lat, fp=fp, ch=ch):
            pts = np.array(fp["polygon"])
            lat0 = math.radians(pts[:, 1].mean())
            az = math.radians(80.0 if fp["direction"] == "ASCENDING" else 280.0)
            sv = pts[:, 0] * math.cos(lat0) * math.sin(az) + pts[:, 1] * math.cos(az)
            sp = lon * math.cos(lat0) * math.sin(az) + lat * math.cos(az)
            frac = np.clip((sp - sv.min()) / (sv.max() - sv.min()), 0, 1)
            return ch["near_inc"] + frac * (ch["far_inc"] - ch["near_inc"])
        grids[f] = to_grid(ch["change_cm"], ch["x"], ch["y"], ch["epsg"], grid, inc_fn)
        info[f] = {"opera": list(fwin[f]), "granules": ch["granules"], "chain": ch["terms"],
                   "incidence_deg": [ch["near_inc"], ch["far_inc"]]}
    if not grids:
        return None
    # reference: main frame to the stable areas (or the median of the cells shared with ours);
    # other frames: to the stable areas if they contain enough of them, else to the main frame on the overlap
    order = list(grids)
    both = np.isfinite(ours)
    ref_txt = []
    merged = np.full(ours.shape, np.nan)
    for k, f in enumerate(order):
        g = grids[f]
        st = smask & np.isfinite(g) & both
        if st.sum() >= 10:
            g = g - np.nanmedian(g[st])
            ref_txt.append(f"{f}: stable areas ({int(st.sum())} cells)")
        elif k > 0 and (np.isfinite(merged) & np.isfinite(g)).sum() >= 20:
            ov = np.isfinite(merged) & np.isfinite(g)
            g = g - np.nanmedian(g[ov] - merged[ov])
            ref_txt.append(f"{f}: tied to {order[0]} on {int(ov.sum())} overlapping cells")
        else:
            okc = np.isfinite(g) & both
            g = g - np.nanmedian(g[okc]) + np.nanmedian(ours[okc])
            ref_txt.append(f"{f}: constant matched to ours (median)")
        fill = ~np.isfinite(merged) & np.isfinite(g)
        merged[fill] = g[fill]
    st = smask & np.isfinite(ours) & np.isfinite(merged)
    if st.sum() >= 10:
        ours_r = ours - np.nanmedian(ours[st])
        ref_ours = f"ours: stable areas ({int(st.sum())} cells)"
    else:
        okc = np.isfinite(ours) & np.isfinite(merged)
        ours_r = ours - np.nanmedian(ours[okc] - merged[okc])
        ref_ours = "ours: constant removed against OPERA (median difference)"
    ok = np.isfinite(ours_r) & np.isfinite(merged)
    a, b = ours_r[ok], merged[ok]
    rng = np.random.default_rng(0)
    sel = rng.choice(len(a), size=min(len(a), 3000), replace=False)
    ts = stats.theilslopes(a[sel], b[sel])
    # peaks: deepest point after 3x3 median, and each map's value at the other's peak
    def peak(field):
        sm = ndimage.generic_filter(np.where(ok, field, np.nan), np.nanmedian, size=3, mode="constant", cval=np.nan)
        if not np.isfinite(sm).any():
            return None, None
        k = np.unravel_index(np.nanargmin(sm), sm.shape)
        return k, sm
    k1, sm1 = peak(ours_r)
    k2, sm2 = peak(merged)
    lo1, la1 = grid.lonlat(*k1)
    lo2, la2 = grid.lonlat(*k2)
    lat0 = math.radians((s + n) / 2)
    res = {
        "n_cells": int(ok.sum()), "r": round(float(stats.pearsonr(a, b)[0]), 3),
        "rms_cm": round(float(np.sqrt(np.mean((a - b) ** 2))), 2),
        "mean_diff_cm": round(float(np.mean(a - b)), 2),
        "slope": round(float(ts[0]), 2), "slope_ci": [round(float(ts[2]), 2), round(float(ts[3]), 2)],
        "slope_note": "Theil-Sen, ours = slope * OPERA + c, 3000 random cells",
        "peak_ours": {"lon": round(lo1, 4), "lat": round(la1, 4), "cm": round(float(sm1[k1]), 1),
                      "opera_there_cm": round(float(sm2[k1]), 1) if np.isfinite(sm2[k1]) else None},
        "peak_opera": {"lon": round(lo2, 4), "lat": round(la2, 4), "cm": round(float(sm2[k2]), 1),
                       "ours_there_cm": round(float(sm1[k2]), 1) if np.isfinite(sm1[k2]) else None},
        "peak_offset_km": round(math.hypot((lo1 - lo2) * 111.32 * math.cos(lat0), (la1 - la2) * 111.32), 1),
        "p01_ours_cm": round(float(np.percentile(a, 1)), 1), "p01_opera_cm": round(float(np.percentile(b, 1)), 1),
        "reference": "; ".join(ref_txt + [ref_ours]),
        "frames": info,
    }

    def basic(x, y, sel_mask):
        x, y = x[sel_mask], y[sel_mask]
        if len(x) < 30:
            return None
        k = rng.choice(len(x), size=min(len(x), 3000), replace=False)
        t = stats.theilslopes(x[k], y[k])
        return {"n_cells": int(len(x)), "r": round(float(stats.pearsonr(x, y)[0]), 3),
                "rms_cm": round(float(np.sqrt(np.mean((x - y) ** 2))), 2),
                "mean_diff_cm": round(float(np.mean(x - y)), 2),
                "slope": round(float(t[0]), 2), "slope_ci": [round(float(t[2]), 2), round(float(t[3]), 2)]}

    # (a) long-wavelength difference (no tropospheric correction in either product, no ionospheric in OPERA):
    #     fit a plane to ours - OPERA outside the bowls (both > -2 cm), with 3-sigma clipping, remove it from ours
    LON2, LAT2 = np.meshgrid(grid.w + (np.arange(grid.W) + 0.5) * (grid.e - grid.w) / grid.W,
                             [inv_merc_y(grid.yn - (r + 0.5) * (grid.yn - grid.ys) / grid.H) for r in range(grid.H)])
    quiet = ok & (ours_r > -2) & (merged > -2)
    diff = ours_r - merged
    G = np.c_[np.ones(quiet.sum()), LON2[quiet] - LON2[quiet].mean(), LAT2[quiet] - LAT2[quiet].mean()]
    yv, keep = diff[quiet], np.ones(quiet.sum(), bool)
    for _ in range(5):
        coef, *_ = np.linalg.lstsq(G[keep], yv[keep], rcond=None)
        resid = yv - G @ coef
        keep = np.abs(resid) < 3 * np.std(resid[keep])
    plane = coef[0] + coef[1] * (LON2 - LON2[quiet].mean()) + coef[2] * (LAT2 - LAT2[quiet].mean())
    ours_p = ours_r - plane
    span = np.nanmax(np.where(ok, plane, np.nan)) - np.nanmin(np.where(ok, plane, np.nan))
    res["ramp_removed"] = basic(ours_p, merged, ok)
    res["ramp_removed"]["plane_span_cm"] = round(float(span), 1)
    res["ramp_removed"]["note"] = ("best-fit plane of (ours - OPERA) over cells outside the bowls (both > -2 cm), "
                                   "3-sigma clipped, removed from ours")
    # (b) depth inside the bowls: cells where either map is below -3 cm
    bowl = ok & ((ours_p < -3) | (merged < -3))
    res["bowl"] = basic(ours_p, merged, bowl)
    if res["bowl"]:
        res["bowl"]["note"] = "cells where either map is below -3 cm (after ramp removal); depth check"
        res["bowl"]["median_ours_cm"] = round(float(np.median(ours_p[bowl])), 2)
        res["bowl"]["median_opera_cm"] = round(float(np.median(merged[bowl])), 2)
        res["bowl"]["ratio_of_sums"] = round(float(ours_p[bowl].sum() / merged[bowl].sum()), 2)
    return res, ours_r, ours_p, merged, ok


def plot_unfiltered(name, obj, grid, ours_r, merged, ok, res, out_dir, period):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    a, b = ours_r[ok], merged[ok]
    fig, ax = plt.subplots(figsize=(5.2, 5.0), dpi=130)
    lo, hi = np.percentile(np.r_[a, b], [0.2, 99.8])
    pad = (hi - lo) * 0.05
    lo, hi = lo - pad, hi + pad
    ax.plot([lo, hi], [lo, hi], color="#999", lw=1, ls="--", label="1:1")
    ax.hexbin(b, a, gridsize=70, extent=(lo, hi, lo, hi), mincnt=1, cmap="Blues", bins="log")
    xs = np.array([lo, hi])
    c = np.median(a - res["slope"] * b)
    ax.plot(xs, res["slope"] * xs + c, color="#c0392b", lw=1.4, label=f"Theil-Sen slope {res['slope']}")
    ax.set_xlim(lo, hi); ax.set_ylim(lo, hi); ax.set_aspect("equal")
    ax.set_xlabel("OPERA DISP-S1 displacement, vertical-equiv. (cm)")
    ax.set_ylabel("Groundline NISAR, vertical-equiv. (cm)")
    ax.set_title(f"{obj['name']} unfiltered {period[0]}-{period[1]}\nr = {res['r']}, RMS = {res['rms_cm']} cm, "
                 f"n = {res['n_cells']} cells", fontsize=9)
    ax.legend(loc="upper left", fontsize=8, frameon=False)
    ax.grid(alpha=0.25)
    fig.tight_layout(); fig.savefig(os.path.join(out_dir, f"{name}_unfiltered_scatter.png")); plt.close(fig)

    fig, axs = plt.subplots(1, 3, figsize=(12, 4.6), dpi=120)
    v = np.nanpercentile(np.abs(np.r_[a, b]), 99)
    d = np.where(ok, ours_r - merged, np.nan)
    dv = np.nanpercentile(np.abs(d), 98)
    ext = [grid.w, grid.e, grid.s, grid.n]
    asp = 1 / math.cos(math.radians((grid.s + grid.n) / 2))
    for ax, data, t, vv in [(axs[0], np.where(ok, ours_r, np.nan), "Groundline NISAR", v),
                            (axs[1], np.where(ok, merged, np.nan), "OPERA DISP-S1 (full displacement)", v),
                            (axs[2], d, f"Difference NISAR - OPERA (scale +/-{dv:.1f})", dv)]:
        im = ax.imshow(data, extent=ext, cmap="RdBu", vmin=-vv, vmax=vv, aspect=asp, interpolation="nearest")
        ax.set_title(t, fontsize=9)
        fig.colorbar(im, ax=ax, shrink=0.7, label="cm")
        for st in obj.get("gps", []):
            if grid.w <= st["lon"] <= grid.e and grid.s <= st["lat"] <= grid.n:
                ax.plot(st["lon"], st["lat"], "k^", ms=4)
    fig.suptitle(f"{obj['name']}: vertical-equivalent change {period[0]} to {period[1]}, unfiltered", fontsize=10)
    fig.savefig(os.path.join(out_dir, f"{name}_unfiltered_diffmap.png"), bbox_inches="tight"); plt.close(fig)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site")
    ap.add_argument("--direction", choices=["ASCENDING", "DESCENDING"])
    ap.add_argument("--spacing-km", type=float)
    ap.add_argument("--margin-km", type=float, default=SIGMA_M / 1000, help="edge band excluded (filter edge effects)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--frames", choices=["all", "main"], default="all",
                    help="combine every OPERA frame over the site (default) or only the frame with most points")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--full", action="store_true",
                    help="also compare OPERA's full (unfiltered) displacement layer, read by byte range (needs Earthdata login + ASF EULA)")
    ap.add_argument("--tag", help="cross-check run: write pipeline/out_opera/<site>_<tag>.* and leave opera_check.js alone")
    args = ap.parse_args()
    cfg = dict(SITES.get(args.site, {"direction": "DESCENDING", "spacing_km": 3.0}))
    if args.direction:
        cfg["direction"] = args.direction
    if args.spacing_km:
        cfg["spacing_km"] = args.spacing_km
    direction = cfg["direction"]

    obj, cube = load_site(args.site)
    grid = Grid(obj)
    sites_cfg = json.load(open(os.path.join(HERE, "sites.json"))).get(args.site, {})
    is_vertical = obj["quantity"]["key"] == "vertical"
    cos_ours = 1.0 if is_vertical else sites_cfg.get("cos_incidence_assumed", 0.77)

    cache_dir = os.path.join(HERE, "cache", "opera")
    out_dir = os.path.join(HERE, "out_opera")
    os.makedirs(cache_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    # sample grid (interior only, where our last frame has data)
    lat0 = (grid.s + grid.n) / 2
    dlat = cfg["spacing_km"] / 111.32
    dlon = cfg["spacing_km"] / (111.32 * math.cos(math.radians(lat0)))
    mlat = args.margin_km / 111.32
    mlon = args.margin_km / (111.32 * math.cos(math.radians(lat0)))
    lats = np.arange(grid.n - mlat, grid.s + mlat, -dlat)
    lons = np.arange(grid.w + mlon, grid.e - mlon, dlon)
    LON, LAT = np.meshgrid(lons, lats)
    valid_any = np.isfinite(cube).any(axis=0)
    points = []
    for lo, la in zip(LON.ravel(), LAT.ravel()):
        r, c = grid.rc(lo, la)
        ri, ci = int(round(r)), int(round(c))
        if 0 <= ri < grid.H and 0 <= ci < grid.W and valid_any[ri, ci]:
            points.append((round(float(lo), 5), round(float(la), 5)))
    gps_pts = [(round(s["lon"], 5), round(s["lat"], 5)) for s in obj.get("gps", [])
               if grid.w <= s["lon"] <= grid.e and grid.s <= s["lat"] <= grid.n]
    cache = fetch_points(points + gps_pts, direction, os.path.join(cache_dir, f"{args.site}_{direction}.json"),
                         args.workers, args.offline)

    # OPERA frames over the site. Each point keeps its own frame; the short-wavelength layer has a
    # virtual reference (zero-mean high-pass), so frames can be combined without a common reference point.
    frames = {}
    for p in points:
        f = cache.get(f"{p[0]:.5f},{p[1]:.5f}", {}).get("frame")
        if f:
            frames[f] = frames.get(f, 0) + 1
    if not frames:
        result = {"status": "no_data", "notes": f"OPERA DISP-S1 ({direction}) returned no data over this site."}
        if not args.tag:
            write_outputs(args.site, result, out_dir)
        return
    frame_dates = {}
    for f, nf in frames.items():
        cnt = {}
        for p in points:
            e = cache.get(f"{p[0]:.5f},{p[1]:.5f}", {})
            if e.get("frame") == f:
                for d in e["dates"]:
                    cnt[d] = cnt.get(d, 0) + 1
        frame_dates[f] = sorted(d for d, c in cnt.items() if c >= 0.9 * nf)

    def match(n, f):
        o = closest(n, frame_dates[f]) if frame_dates[f] else None
        return o if o and abs((d8(o) - d8(n)).days) <= MAX_DATE_GAP else None

    frame = max(frames, key=frames.get)
    if args.frames == "main":
        use = [frame]
    else:   # every frame with >= 5% of the points that also spans the NISAR start
        use = [f for f in frames if frames[f] >= 0.05 * len(points) and frame_dates[f]
               and frame_dates[f][-1] >= obj["dates"][1]]
        use = use or [frame]
    common = [n for n in obj["dates"] if all(match(n, f) for f in use)]
    if len(common) < 2:
        result = {"status": "no_overlap", "notes": f"No overlapping dates between NISAR and OPERA frames {use}."}
        if not args.tag:
            write_outputs(args.site, result, out_dir)
        return
    n0, n1 = common[0], common[-1]
    fwin = {f: (match(n0, f), match(n1, f)) for f in use}
    o0, o1 = fwin[frame] if frame in fwin else fwin[use[0]]
    i0, i1 = obj["dates"].index(n0), obj["dates"].index(n1)
    fps = {f: frame_footprint(f, cache_dir) for f in set(use) | {frame}}
    fp = fps[frame]
    desc = ", ".join("%s (%s, path %s, OPERA %s->%s, %d pts)" % (f, fps[f]["direction"], fps[f]["path"], fwin[f][0], fwin[f][1], frames[f]) for f in use)
    print(f"frames {desc}; NISAR {n0}->{n1}")

    def opera_change(e, d0, d1, want_frame=None):
        if e.get("frame") != (want_frame or frame) or d0 not in e["dates"] or d1 not in e["dates"]:
            return np.nan
        j0, j1 = e["dates"].index(d0), e["dates"].index(d1)
        if e["masked"][j0] or e["masked"][j1] or e["disp_m"][j0] is None or e["disp_m"][j1] is None:
            return np.nan
        return (e["disp_m"][j1] - e["disp_m"][j0]) * 100.0

    # our change, filtered the same way, vertical-equivalent
    ours_full = (cube[i1] - cube[i0]) / cos_ours
    ours_hp = highpass(ours_full, grid)
    ours_hp_alt = highpass(ours_full, grid, SIGMA_M / math.sqrt(2))   # pre-2025 dolphin sigma formula

    rows = []
    for lo, la in points:
        e = cache.get(f"{lo:.5f},{la:.5f}", {})
        f = e.get("frame")
        if f in fwin:
            inc = incidence_deg(lo, la, fps[f])
            op = opera_change(e, fwin[f][0], fwin[f][1], f) / math.cos(math.radians(inc))
        else:
            inc, op = np.nan, np.nan
        rows.append((lo, la, sample(ours_hp, grid, lo, la), op, sample(ours_full, grid, lo, la),
                     sample(ours_hp_alt, grid, lo, la), inc))
    A = np.array(rows, dtype=float)
    lon_a, lat_a, ours_a, opera_a, full_a, alt_a, inc_a = A.T

    # reference: stable areas if any (median of points inside), else the median of all compared points
    stable = sites_cfg.get("stable_areas") or []
    in_stable = np.zeros(len(A), bool)
    for sa in stable:
        w, s, e_, n = sa["bbox"]
        in_stable |= (lon_a >= w) & (lon_a <= e_) & (lat_a >= s) & (lat_a <= n)
    ok = np.isfinite(ours_a) & np.isfinite(opera_a)
    if (in_stable & ok).sum() >= 3:
        ref_mask = in_stable & ok
        reference = "median of points in stable areas: " + ", ".join(sa["name"] for sa in stable)
    else:
        ref_mask = ok
        reference = "constant removed (median of all compared points); " + (
            "too few sample points in the stable areas" if stable else "no stable area defined")
    for arr in (ours_a, opera_a, alt_a):
        arr -= np.nanmedian(arr[ref_mask])

    m = metrics(ours_a, opera_a)
    m_alt = metrics(alt_a, opera_a)
    # OPERA vs our UNFILTERED map: shows how much the 30 km filter matters
    full_ref = full_a - np.nanmedian(full_a[ref_mask])
    m_full = metrics(full_ref, opera_a)

    # peaks on the sample lattice
    shape = LAT.shape
    lut = {(round(float(lo), 5), round(float(la), 5)): k for k, (lo, la) in enumerate(zip(lon_a, lat_a))}

    def lattice(vals):
        g = np.full(shape, np.nan)
        for (ii, jj), lo in np.ndenumerate(LON):
            k = lut.get((round(float(lo), 5), round(float(LAT[ii, jj]), 5)))
            if k is not None and ok[k]:
                g[ii, jj] = vals[k]
        return g
    G_ours, G_opera = lattice(ours_a), lattice(opera_a)
    peaks = {"ours_filtered": robust_peak(G_ours, LON, LAT), "opera_filtered": robust_peak(G_opera, LON, LAT)}
    peaks["ours_unfiltered"] = robust_peak(lattice(full_ref), LON, LAT)   # same points, no filter
    if peaks["ours_filtered"] and peaks["opera_filtered"]:
        p1, p2 = peaks["ours_filtered"], peaks["opera_filtered"]
        peaks["offset_km"] = round(math.hypot((p1["lon"] - p2["lon"]) * 111.32 * math.cos(math.radians(lat0)),
                                              (p1["lat"] - p2["lat"]) * 111.32), 1)

    # GPS stations: filtered-vs-filtered series at the station, plus our published GPS fit
    gps_out = []
    hp_cube = None
    for st in obj.get("gps", []):
        key = f"{round(st['lon'], 5):.5f},{round(st['lat'], 5):.5f}"
        e = cache.get(key)
        if e is None:
            continue
        if hp_cube is None:
            hp_cube = np.array([highpass((cube[i] - cube[i0]) / cos_ours, grid) for i in range(len(obj["dates"]))])
        st_frame = e.get("frame")
        if not st_frame or not e["dates"]:
            continue
        st_fp = frame_footprint(st_frame, cache_dir)
        st_dates = e["dates"]
        so0 = closest(n0, st_dates)
        if abs((d8(so0) - d8(n0)).days) > MAX_DATE_GAP:
            continue
        inc = incidence_deg(st["lon"], st["lat"], st_fp)
        o_ser, n_ser, g_ser, dates = [], [], [], []
        gps = st.get("gps_up_cm") or (st.get("gps_cm") if is_vertical else None)
        for i in range(i0, i1 + 1):
            n = obj["dates"][i]
            o = closest(n, st_dates)
            if abs((d8(o) - d8(n)).days) > MAX_DATE_GAP:
                continue
            ov = opera_change(e, so0, o, st_frame) / math.cos(math.radians(inc))
            nv = sample(hp_cube[i], grid, st["lon"], st["lat"])
            gv = (gps[i] - gps[i0]) if gps and gps[i] is not None and gps[i0] is not None else np.nan
            o_ser.append(ov); n_ser.append(nv); g_ser.append(gv); dates.append(n)
        o_ser, n_ser, g_ser = map(np.array, (o_ser, n_ser, g_ser))
        okk = np.isfinite(o_ser) & np.isfinite(n_ser)
        rec = {"id": st["id"], "frame": st_frame, "n": int(okk.sum()), "dates": dates,
               "opera_filtered_cm": [None if not np.isfinite(v) else round(float(v), 2) for v in o_ser],
               "ours_filtered_cm": [None if not np.isfinite(v) else round(float(v), 2) for v in n_ser],
               "gps_up_cm": [None if not np.isfinite(v) else round(float(v), 2) for v in g_ser],
               "ours_vs_gps_published": {"r": st.get("r"), "rms_cm": st.get("rms_cm")}}
        if okk.sum() >= 4:
            rec["r_filtered"] = round(float(np.corrcoef(o_ser[okk], n_ser[okk])[0, 1]), 3)
            rec["rms_filtered_cm"] = round(float(np.sqrt(np.mean((o_ser[okk] - n_ser[okk]) ** 2))), 2)
            both = np.where(okk & np.isfinite(g_ser))[0]
            last = both[-1] if len(both) else np.where(okk)[0][-1]
            rec["change_date"] = dates[last]
            rec["change_opera_filtered_cm"] = round(float(o_ser[last]), 2)
            rec["change_ours_filtered_cm"] = round(float(n_ser[last]), 2)
            if np.isfinite(g_ser[last]):
                rec["change_gps_cm"] = round(float(g_ser[last]), 2)
                il = obj["dates"].index(dates[last])
                rec["change_ours_unfiltered_cm"] = round(float(sample((cube[il] - cube[i0]) / cos_ours, grid, st["lon"], st["lat"])), 2)
        gps_out.append(rec)

    granules = []
    for f in use:
        for p in points:
            e = cache.get(f"{p[0]:.5f},{p[1]:.5f}", {})
            a, b = fwin[f]
            if e.get("frame") == f and a in e["dates"] and b in e["dates"]:
                granules += [e["granules"][e["dates"].index(a)], e["granules"][e["dates"].index(b)]]
                break
    result = {
        "status": "ok", "frame": frame, "direction": fp["direction"], "path": fp["path"],
        "window": {"nisar": [n0, n1], "opera": [o0, o1]},
        "frames": {f: {"direction": fps[f]["direction"], "path": fps[f]["path"], "opera": list(fwin[f]),
                       "points": frames[f]} for f in use},
        "quantity": "vertical-equivalent cumulative change, both maps high-passed with OPERA's 30 km short-wavelength filter",
        "reference": reference, "metrics": m, "metrics_alt_sigma": m_alt, "metrics_vs_unfiltered_ours": m_full,
        "peaks": peaks, "gps": gps_out, "granules": granules, "n_points_sampled": len(points),
        "incidence_deg": [round(float(np.nanmin(inc_a)), 1), round(float(np.nanmax(inc_a)), 1)],
        "cos_ours": cos_ours, "sigma_km": round(SIGMA_M / 1000, 2), "spacing_km": cfg["spacing_km"],
        "margin_km": round(args.margin_km, 2),
    }
    name = f"{args.site}_{args.tag}" if args.tag else args.site
    result["site_data_generated_utc"] = obj.get("provenance", {}).get("generated_utc")
    result["site_data_built_by"] = obj.get("provenance", {}).get("built_by")
    if args.full:
        out = unfiltered_comparison(args.site, obj, cube, grid, use, fwin, fps, frames, n0, n1, cos_ours,
                                    stable, cache_dir)
        if out:
            ures, ours_r, ours_p, merged, okg = out
            ures["period"] = [n0, n1]
            ures["quantity"] = "vertical-equivalent cumulative change, OPERA full displacement layer (no filter)"
            gps_u = []
            is_vert = obj["quantity"]["key"] == "vertical"
            for st in obj.get("gps", []):
                r_, c_ = grid.rc(st["lon"], st["lat"])
                ri, ci = int(round(r_)), int(round(c_))
                if not (1 <= ri < grid.H - 1 and 1 <= ci < grid.W - 1):
                    continue
                gser = st.get("gps_up_cm") or (st.get("gps_cm") if is_vert else None)
                gv = None
                if gser:
                    k1 = [k for k in range(i0, i1 + 1) if gser[k] is not None]
                    if gser[i0] is not None and k1:
                        gv = (round(gser[k1[-1]] - gser[i0], 2), obj["dates"][k1[-1]])
                ow = merged[ri - 1:ri + 2, ci - 1:ci + 2]
                nw = ours_r[ri - 1:ri + 2, ci - 1:ci + 2]
                gps_u.append({"id": st["id"], "gps_up_change_cm": gv[0] if gv else None, "gps_to": gv[1] if gv else None,
                              "opera_cm": round(float(np.nanmedian(ow)), 2) if np.isfinite(ow).any() else None,
                              "ours_cm": round(float(np.nanmedian(nw)), 2) if np.isfinite(nw).any() else None})
            ures["gps"] = gps_u
            result["unfiltered"] = ures
            plot_unfiltered(name, obj, grid, ours_r, merged, okg, ures, out_dir, [n0, n1])
            print("UNFILTERED", json.dumps({k: v for k, v in ures.items() if k != "frames"}, indent=1))
    elif not args.tag:
        prev = os.path.join(out_dir, f"{name}.json")
        if os.path.exists(prev):   # keep an earlier unfiltered result when re-running the filtered part only
            old = json.load(open(prev))
            if "unfiltered" in old:
                result["unfiltered"] = old["unfiltered"]
    json.dump(result, open(os.path.join(out_dir, f"{name}.json"), "w"), indent=1)
    plots(name, obj, A, ok, ref_mask, G_ours, G_opera, LON, LAT, result, out_dir)
    if not args.tag:
        write_outputs(args.site, result, out_dir)
    print(json.dumps({k: result[k] for k in ("window", "metrics", "metrics_alt_sigma", "metrics_vs_unfiltered_ours", "peaks", "reference")}, indent=1))
    for g in gps_out:
        print({k: v for k, v in g.items() if not isinstance(v, list)})


def plots(site, obj, A, ok, ref_mask, G_ours, G_opera, LON, LAT, res, out_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    lon_a, lat_a, ours_a, opera_a = A[:, 0], A[:, 1], A[:, 2], A[:, 3]
    m = res["metrics"]
    title = f"{obj['name']}: NISAR {res['window']['nisar'][0]}-{res['window']['nisar'][1]} vs OPERA {'+'.join(res['frames'])}"
    # scatter
    fig, ax = plt.subplots(figsize=(5.2, 5.0), dpi=130)
    lim = np.nanpercentile(np.abs(np.r_[ours_a[ok], opera_a[ok]]), 99.5) * 1.1
    ax.plot([-lim, lim], [-lim, lim], color="#999", lw=1, ls="--", label="1:1")
    ax.scatter(opera_a[ok], ours_a[ok], s=9, alpha=0.55, color="#2a6fb0", edgecolors="none")
    if m:
        xs = np.array([-lim, lim])
        c = np.nanmedian(ours_a[ok] - m["slope"] * opera_a[ok])
        ax.plot(xs, m["slope"] * xs + c, color="#c0392b", lw=1.4, label=f"Theil-Sen slope {m['slope']}")
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_aspect("equal")
    ax.set_xlabel("OPERA DISP-S1, vertical-equiv., filtered (cm)")
    ax.set_ylabel("Groundline NISAR, vertical-equiv., filtered (cm)")
    if m:
        ax.set_title(f"{obj['name']}  r = {m['r']}, RMS = {m['rms_cm']} cm, n = {m['n']}", fontsize=9)
    ax.legend(loc="upper left", fontsize=8, frameon=False)
    ax.grid(alpha=0.25)
    fig.tight_layout(); fig.savefig(os.path.join(out_dir, f"{site}_scatter.png")); plt.close(fig)
    # maps
    fig, axs = plt.subplots(1, 3, figsize=(12, 4.4), dpi=120, sharex=True, sharey=True)
    v = np.nanpercentile(np.abs(np.r_[G_ours[np.isfinite(G_ours)], G_opera[np.isfinite(G_opera)]]), 98)
    ext = [LON.min(), LON.max(), LAT.min(), LAT.max()]
    for ax, data, t, vv in [(axs[0], G_ours, "Groundline NISAR (filtered)", v), (axs[1], G_opera, "OPERA DISP-S1 (filtered)", v),
                            (axs[2], G_ours - G_opera, "Difference NISAR - OPERA", v)]:
        im = ax.imshow(data, extent=ext, origin="upper", cmap="RdBu", vmin=-vv, vmax=vv, aspect=1 / math.cos(math.radians(LAT.mean())),
                       interpolation="nearest")
        ax.set_title(t, fontsize=9)
        for st in obj.get("gps", []):
            if ext[0] <= st["lon"] <= ext[1] and ext[2] <= st["lat"] <= ext[3]:
                ax.plot(st["lon"], st["lat"], "k^", ms=4)
    cb = fig.colorbar(im, ax=axs, shrink=0.8, label="cm, vertical-equivalent")
    fig.suptitle(title + "  (both high-passed, 30 km)", fontsize=10)
    fig.savefig(os.path.join(out_dir, f"{site}_diffmap.png"), bbox_inches="tight"); plt.close(fig)


def write_outputs(site, result, out_dir):
    path = os.path.join(ROOT, "site", "data", "opera_check.js")
    data = {}
    if os.path.exists(path):
        txt = open(path, encoding="utf-8").read()
        mm = re.search(r"window\.OPERA_CHECK\s*=\s*", txt)
        if mm:
            data, _ = json.JSONDecoder().raw_decode(txt[mm.end():])
    if result.get("status") != "ok":
        data[site] = {"r": None, "rms_cm": None, "slope": None, "n_cells": 0, "period": None,
                      "quantity": None, "reference": None, "notes": result["notes"], "opera_granules": [],
                      "citation": CITATION, "url": URL}
    else:
        m = result["metrics"] or {}
        w = result["window"]
        fmt = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:]}"
        gps_txt = "; ".join(
            f"{g['id']}: filtered series r = {g.get('r_filtered')}, RMS {g.get('rms_filtered_cm')} cm"
            for g in result["gps"] if g.get("r_filtered") is not None)
        fr_txt = ", ".join(f"{f} ({v['direction'].lower()}, path {v['path']}, {fmt(v['opera'][0])} to {fmt(v['opera'][1])})"
                           for f, v in result["frames"].items())
        notes = (f"OPERA DISP-S1 frames {fr_txt} vs NISAR {fmt(w['nisar'][0])} to {fmt(w['nisar'][1])}. "
                 "Only OPERA's short-wavelength layer is openly served (30 km Gaussian high-pass); the same filter was "
                 "applied to our map, so bowls wider than about 20-30 km are suppressed in both. "
                 f"Without the filter on our side r = {(result.get('metrics_vs_unfiltered_ours') or {}).get('r')}. "
                 f"Incidence {result['incidence_deg'][0]}-{result['incidence_deg'][1]} deg (OPERA, from frame footprint); "
                 f"ours LOS/{result['cos_ours']}." + (f" GPS: {gps_txt}." if gps_txt else ""))
        data[site] = {"r": m.get("r"), "rms_cm": m.get("rms_cm"), "slope": m.get("slope"), "n_cells": m.get("n", 0),
                      "period": [fmt(w["nisar"][0]), fmt(w["nisar"][1])], "quantity": result["quantity"],
                      "reference": result["reference"], "notes": notes, "opera_granules": result["granules"],
                      "peak_offset_km": result["peaks"].get("offset_km"),
                      "citation": CITATION, "url": URL}
        u = result.get("unfiltered")
        if u:
            data[site]["unfiltered"] = {
                "r": u["r"], "rms_cm": u["rms_cm"], "slope": u["slope"], "slope_ci": u["slope_ci"],
                "mean_diff_cm": u["mean_diff_cm"], "n_cells": u["n_cells"],
                "peak_ours_cm": u["peak_ours"]["cm"], "peak_opera_cm": u["peak_opera"]["cm"],
                "peak_ours": u["peak_ours"], "peak_opera": u["peak_opera"], "peak_offset_km": u["peak_offset_km"],
                "period": [fmt(u["period"][0]), fmt(u["period"][1])], "quantity": u["quantity"],
                "reference": u["reference"],
                "opera_granules": sorted({g for f in u["frames"].values() for g in f["granules"]}),
                "notes": u.get("notes", "OPERA DISP-S1 'displacement' layer (unfiltered), 30 m pixels averaged into our cells; "
                                        "ministacks chained; no OPERA corrections (ionosphere, solid-earth tide) applied."),
            }
            for k in ("ramp_removed", "bowl", "gps"):        # full-depth checks shown on the page (depth ratio, GPS three-way)
                if u.get(k) is not None:
                    data[site]["unfiltered"][k] = u[k]
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Written by pipeline/compare_opera.py. Agreement of Groundline NISAR maps with NASA OPERA DISP-S1.\n")
        f.write("window.OPERA_CHECK = " + json.dumps(data, indent=1) + ";\n")
    print("wrote", path)


if __name__ == "__main__":
    main()
