"""Read the site subset of one NISAR L2 GUNW product (HDF5) and multilook it.

Product layout (product spec 1.5.0, product version 1.0.11, PROVISIONAL collection, checked 2026-11-14):

  science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/          80 m UTM grid (EPSG in ./projection)
      HH/unwrappedPhase                 float32 rad   ionosphere NOT removed (screen given separately)
      HH/coherenceMagnitude             float32 0..1
      HH/connectedComponents            uint16        0 = not unwrapped / unreliable, 1..N = components
      HH/ionospherePhaseScreen          float32 rad   split-spectrum estimate, arbitrary constant offset
      HH/ionospherePhaseScreenUncertainty float32 rad
      mask                              uint32        low byte decimal digits: hundreds = water (1),
                                                      tens = reference subswath, units = secondary subswath
                                                      (0 = invalid sample); bits 8-23 = RSLC anomaly flags;
                                                      bit 24 = ionosphere screen was interpolated here
      xCoordinates, yCoordinates        pixel-centre UTM metres
  science/LSAR/GUNW/metadata/radarGrid/                               ~500 m x 20 heights metadata cube
      incidenceAngle, losUnitVectorX/Y (ground-to-satellite, east/north), heightAboveEllipsoid,
      wetTroposphericPhaseScreen, hydrostaticTroposphericPhaseScreen (RAiDER / ECMWF HRES), ...

Only the 512 x 512 chunks that overlap the site are transferred (HTTP byte ranges, see remote.py).
"""
import numpy as np
from rasterio.crs import CRS
from rasterio.warp import transform as warp_transform

from remote import read_region

G = 'science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/'
R = 'science/LSAR/GUNW/metadata/radarGrid/'
I = 'science/LSAR/identification/'


def utm_window(x, y, epsg, bbox, margin_m=2000.0):
    """Row/column slices of the product grid covering a lon/lat bbox (edges sampled densely)."""
    west, south, east, north = bbox
    t = np.linspace(0, 1, 41)
    lons = np.r_[west + (east - west) * t, np.full(41, east), east - (east - west) * t, np.full(41, west)]
    lats = np.r_[np.full(41, south), south + (north - south) * t, np.full(41, north), north - (north - south) * t]
    ux, uy = warp_transform(CRS.from_epsg(4326), CRS.from_epsg(epsg), lons, lats)
    x0, x1, y0, y1 = min(ux) - margin_m, max(ux) + margin_m, min(uy) - margin_m, max(uy) + margin_m
    cols = np.where((x >= x0) & (x <= x1))[0]
    rows = np.where((y >= y0) & (y <= y1))[0]          # y decreases with row
    if len(cols) == 0 or len(rows) == 0:
        return None
    return slice(int(rows[0]), int(rows[-1]) + 1), slice(int(cols[0]), int(cols[-1]) + 1)


def decode_mask(mask):
    """-> (valid sample in both RSLCs and no anomaly, water). Some products store the mask as uint8
    (subswath digits only, fill 255); later ones as uint32 with anomaly and ionosphere bits."""
    fill = mask == 255
    mask = mask.astype(np.uint32)
    low = (mask & 0xFF).astype(np.int32)
    water = (low // 100) == 1
    ref_sw, sec_sw = (low // 10) % 10, low % 10
    anomaly = (mask >> 8) & 0xFFFF
    valid = (ref_sw > 0) & (sec_sw > 0) & (anomaly == 0) & ~fill
    return valid, water


def block_mean(values, weight, looks):
    """Weighted mean over looks x looks blocks (trailing partial blocks dropped). -> (mean, weight sum)."""
    h, w = (values.shape[0] // looks) * looks, (values.shape[1] // looks) * looks
    v = np.where(weight > 0, values, 0)[:h, :w].astype(np.float64)
    wt = weight[:h, :w].astype(np.float64)
    num = (v * wt).reshape(h // looks, looks, w // looks, looks).sum((1, 3))
    den = wt.reshape(h // looks, looks, w // looks, looks).sum((1, 3))
    with np.errstate(invalid='ignore', divide='ignore'):
        return (num / den).astype(np.float32), den.astype(np.float32)


def read_subset(h5, rf, bbox, looks=3, margin_m=2000.0, with_tropo=False):
    """Site subset of one product, multilooked looks x looks (80 m -> 240 m for looks=3).

    Connected components: only the component holding most of the site's pixels is kept as phase; smaller
    components may be offset by whole cycles (they are unwrapped independently), so their phase is not
    trusted. Their extent is still recorded so that the quality gate can count it.
    Returns a dict of float32 arrays on the multilooked grid plus metadata, or None if the product does
    not cover the site.
    """
    epsg = int(h5[G + 'projection'][()])
    x, y = h5[G + 'xCoordinates'][:], h5[G + 'yCoordinates'][:]
    win = utm_window(x, y, epsg, bbox, margin_m)
    if win is None:
        return None
    rs, cs = win
    unw = read_region(rf, h5[G + 'HH/unwrappedPhase'], rs, cs)
    coh = read_region(rf, h5[G + 'HH/coherenceMagnitude'], rs, cs)
    cc = read_region(rf, h5[G + 'HH/connectedComponents'], rs, cs)
    iono = read_region(rf, h5[G + 'HH/ionospherePhaseScreen'], rs, cs)
    iono_sig = read_region(rf, h5[G + 'HH/ionospherePhaseScreenUncertainty'], rs, cs)
    valid, water = decode_mask(read_region(rf, h5[G + 'mask'], rs, cs))

    land = valid & ~water & np.isfinite(unw) & np.isfinite(coh)
    labels, counts = np.unique(cc[land & (cc > 0) & (cc != 65535)], return_counts=True)
    main = int(labels[np.argmax(counts)]) if len(labels) else -1
    good = land & (cc == main)

    out = {}
    out['unw'], n_good = block_mean(unw, good, looks)
    out['iono'], _ = block_mean(np.nan_to_num(iono), good & np.isfinite(iono), looks)
    out['iono_sigma'], _ = block_mean(np.nan_to_num(iono_sig), good & np.isfinite(iono_sig), looks)
    # complex multilook of the ionosphere-corrected phase over ALL land cells (any connected component):
    # lets process.py recover the phase where the product's unwrapper gave up (component 0), by re-wrapping
    # it about a smooth field. Its magnitude (0..1) says how consistent the 80 m cells are.
    corr = np.where(np.isfinite(iono), unw - iono, unw)
    lw = land & np.isfinite(corr)
    out['ph_re'], _ = block_mean(np.cos(np.nan_to_num(corr)), lw, looks)
    out['ph_im'], _ = block_mean(np.sin(np.nan_to_num(corr)), lw, looks)
    out['ph_re_raw'], _ = block_mean(np.cos(np.nan_to_num(unw)), lw, looks)
    out['ph_im_raw'], _ = block_mean(np.sin(np.nan_to_num(unw)), lw, looks)
    out['coh'], n_land = block_mean(np.nan_to_num(coh), land, looks)
    _, n_valid = block_mean(np.ones_like(coh), valid, looks)
    _, n_water = block_mean(np.ones_like(coh), valid & water, looks)
    out['good_frac'] = n_good / looks ** 2          # fraction of the block in the main component
    out['land_frac'] = n_land / looks ** 2
    out['water_frac'] = n_water / np.maximum(n_valid, 1)
    out['in_frame'] = n_valid / looks ** 2
    h, w = out['unw'].shape
    xs, ys = x[cs][:w * looks], y[rs][:h * looks]
    out['x'] = xs.reshape(w, looks).mean(1)
    out['y'] = ys.reshape(h, looks).mean(1)
    out['epsg'] = epsg
    out['n_components'] = int(len(labels))
    out['main_component_frac'] = float(counts.max() / counts.sum()) if len(labels) else 0.0
    out['cc0_frac'] = float((land & (cc == 0)).sum() / max(land.sum(), 1))

    # metadata cube: incidence, LOS unit vector and troposphere screens at the subset's cell centres
    cx, cy, hz = h5[R + 'xCoordinates'][:], h5[R + 'yCoordinates'][:], h5[R + 'heightAboveEllipsoid'][:]
    ci = np.where((cx >= out['x'].min() - 1500) & (cx <= out['x'].max() + 1500))[0]
    ri = np.where((cy >= out['y'].min() - 1500) & (cy <= out['y'].max() + 1500))[0]
    crs_, ccs = slice(ri[0], ri[-1] + 1), slice(ci[0], ci[-1] + 1)
    cube = {'x': cx[ccs], 'y': cy[crs_], 'z': hz}
    # heights up to 6 km only (no site is higher); the RAiDER troposphere screens are read only on request,
    # because in the calibration they made the series noisier than the empirical phase-elevation fit
    levels = np.where(hz <= 6000)[0]
    cube['z'] = hz[levels]
    names = ['incidenceAngle', 'losUnitVectorX', 'losUnitVectorY'] + (
        ['wetTroposphericPhaseScreen', 'hydrostaticTroposphericPhaseScreen'] if with_tropo else [])
    for name in names:
        cube[name] = read_region(rf, h5[R + name], crs_, ccs, lead=[int(L) for L in levels]).astype(np.float32)
    out['cube'] = cube
    ident = {}
    for k in ('productVersion', 'productSpecificationVersion', 'compositeReleaseId', 'orbitPassDirection',
              'trackNumber', 'frameNumber', 'processingDateTime'):
        v = h5[I + k][()]
        ident[k] = v.decode() if isinstance(v, bytes) else (int(v) if np.ndim(v) == 0 else str(v))
    out['ident'] = ident
    return out


def save_npz(path, sub):
    flat = {k: v for k, v in sub.items() if k not in ('cube', 'ident')}
    for k, v in sub['cube'].items():
        flat['cube_' + k] = v
    flat['ident_json'] = np.array(__import__('json').dumps(sub['ident']))
    np.savez_compressed(path, **flat)


def load_npz(path):
    import json
    with np.load(path, allow_pickle=False) as z:
        out = {k: z[k] for k in z.files if not k.startswith('cube_') and k != 'ident_json'}
        out['cube'] = {k[5:]: z[k] for k in z.files if k.startswith('cube_')}
        out['ident'] = json.loads(str(z['ident_json']))
    for k in ('epsg', 'n_components'):
        out[k] = int(out[k])
    for k in ('main_component_frac', 'cc0_frac'):
        out[k] = float(out[k])
    return out
