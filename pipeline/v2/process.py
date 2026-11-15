"""v2 processing of one site's GUNW subsets: corrections, masking, fits, chain sum, uncertainty, gate.

Sign convention
  NISAR GUNW unwrappedPhase is the phase of reference x conj(secondary) (ISCE3). Range increase between
  the two dates (ground moving away from the satellite, e.g. subsidence) gives POSITIVE phase. We publish
  line-of-sight displacement positive TOWARD the satellite, so
        d_los [cm] = PHASE_SIGN * (lambda / 4 pi) * phase,   PHASE_SIGN = -1,  lambda = 23.84 cm
  (one cycle = 11.92 cm). Verified against GPS station MMX1 (Mexico City sinks ~20 cm/yr there).

All distances are in the product's UTM grid; cells are multilooked to 240 m (or 400 m for valley-sized
sites) in gunw.read_subset.
"""
import datetime as dt

import numpy as np
from rasterio.crs import CRS
from rasterio.warp import transform as warp_transform
from scipy import ndimage as ndi
from scipy.interpolate import RegularGridInterpolator

WAVELENGTH_CM = 23.84                    # c / 1257.5 MHz (NISAR L-band centre frequency)
RAD_TO_CM = WAVELENGTH_CM / (4 * np.pi)
PHASE_SIGN = -1.0
LOOKS_80M = 16.0                         # assumed independent looks inside one 80 m product cell (conservative)


class Options:
    """Processing switches. Defaults are the v2 method; the others exist for the calibration ablation."""

    def __init__(self, **kw):
        self.iono = True                 # subtract the split-spectrum ionosphere screen
        self.tropo = False               # subtract the RAiDER/ECMWF wet+hydrostatic screens (ablation only)
        self.elevation = True            # phase-elevation term in the per-pair fit
        self.coh_min = 0.30              # multilooked coherence below this is masked
        self.component_min = 0.5         # >= half of the 80 m cells of a 240 m cell in the main component
        self.jump_cm = 3.0               # a cell this far from its 5x5 median in ONE pair = unwrapping error
        self.max_filled = 0.3            # a cell gap-filled in more than 30 % of the pairs is dropped
        self.smooth_days = 18.0          # Gaussian kernel of the local-linear smoother (consistency test)
        self.recover = True              # recover low-coherence / component-0 cells by re-wrapping (see pair_cm)
        self.phasor_min = 0.5
        self.__dict__.update(kw)


# ---------------------------------------------------------------- geometry helpers

def lonlat_grid(x, y, epsg):
    xx, yy = np.meshgrid(x, y)
    lon, lat = warp_transform(CRS.from_epsg(epsg), CRS.from_epsg(4326), xx.ravel(), yy.ravel())
    return np.array(lon).reshape(xx.shape), np.array(lat).reshape(xx.shape)


def utm_of(lon, lat, epsg):
    x, y = warp_transform(CRS.from_epsg(4326), CRS.from_epsg(epsg), np.atleast_1d(lon).astype(float), np.atleast_1d(lat).astype(float))
    return np.array(x), np.array(y)


def cube_at(cube, name, x, y, h):
    """Trilinear interpolation of a metadata-cube layer at cell centres (x: columns, y: rows) and height h."""
    vals = cube[name]
    cy, cx, cz = cube['y'], cube['x'], cube['z']
    if cy[0] > cy[-1]:
        cy, vals = cy[::-1], vals[:, ::-1, :]
    f = RegularGridInterpolator((cz, cy, cx), vals, bounds_error=False, fill_value=None)
    yy, xx = np.meshgrid(y, x, indexing='ij')
    return f(np.stack([np.clip(h, cz[0], cz[-1]), yy, xx], -1)).astype(np.float32)


def disk(shape, x, y, x0, y0, radius_m):
    yy, xx = np.meshgrid(y, x, indexing='ij')
    return np.hypot(xx - x0, yy - y0) <= radius_m


# ---------------------------------------------------------------- fits

def robust_fit(values, mask, terms, iterations=8):
    """Low-order model by iteratively reweighted least squares with Cauchy weights. -> (model, coef, scale)."""
    sel = mask & np.isfinite(values)
    if sel.sum() < 50:
        return np.zeros_like(values), None, np.nan
    step = max(1, int(np.sqrt(sel.sum() / 40000)))       # subsample big sites
    sub = np.zeros_like(sel)
    sub[::step, ::step] = True
    sel &= sub
    A = np.stack([t[sel] for t in terms], 1).astype(np.float64)
    b = values[sel].astype(np.float64)
    w = np.ones(len(b))
    for _ in range(iterations):
        coef, *_ = np.linalg.lstsq(A * w[:, None], b * w, rcond=None)
        r = b - A @ coef
        scale = 1.4826 * np.median(np.abs(r - np.median(r))) + 1e-6
        w = 1 / (1 + (r / (2.5 * scale)) ** 2)
    model = sum(t * c for t, c in zip(terms, coef))
    return model.astype(np.float32), coef, scale


def masked_gaussian(values, mask, sigma):
    num = ndi.gaussian_filter(np.where(mask, values, 0).astype(np.float32), sigma)
    den = ndi.gaussian_filter(mask.astype(np.float32), sigma)
    return np.where(den > 0.05, num / np.maximum(den, 1e-6), np.nan)


def masked_median5(values, mask):
    v = np.where(mask, values, np.nan)
    return ndi.generic_filter(v, np.nanmedian, size=5, mode='nearest') if v.size < 4e5 else _fast_median5(v)


def _fast_median5(v):
    from numpy.lib.stride_tricks import sliding_window_view
    p = np.pad(v, 2, mode='edge')
    with np.errstate(all='ignore'):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', RuntimeWarning)
            return np.nanmedian(sliding_window_view(p, (5, 5)), axis=(-1, -2))


# ---------------------------------------------------------------- the stack

def ordinal(yyyymmdd):
    return dt.datetime.strptime(yyyymmdd, '%Y%m%d').date().toordinal()


def local_linear_hat(days, sigma_days):
    """Hat matrix of a Gaussian-kernel local-linear smoother over the epochs."""
    t = np.asarray(days, float)
    H = np.zeros((len(t), len(t)))
    for i, ti in enumerate(t):
        w = np.exp(-0.5 * ((t - ti) / sigma_days) ** 2)
        X = np.stack([np.ones_like(t), t - ti], 1)
        XtW = X.T * w
        H[i] = np.linalg.solve(XtW @ X + 1e-9 * np.eye(2), XtW)[0]
    return H


class Stack:
    """Everything about one site's chain, on the v2 cell grid."""

    def __init__(self, subs, recs, cfg, heights, opts):
        self.subs, self.recs, self.cfg, self.opts = subs, recs, cfg, opts
        s0 = subs[0]
        self.x, self.y, self.epsg = s0['x'], s0['y'], s0['epsg']
        self.shape = s0['unw'].shape
        self.h = heights
        self.lon, self.lat = lonlat_grid(self.x, self.y, self.epsg)
        west, south, east, north = cfg['bbox']
        self.in_bbox = (self.lon >= west) & (self.lon <= east) & (self.lat >= south) & (self.lat <= north)
        self.cell_m = float(abs(self.x[1] - self.x[0]))
        self.dates = [recs[0]['ref']] + [r['sec'] for r in recs]
        self.days = np.array([ordinal(d) for d in self.dates])
        # geometry at terrain height (cube of the first pair; it changes by << 0.1 deg between pairs)
        c = s0['cube']
        self.incidence = cube_at(c, 'incidenceAngle', self.x, self.y, self.h)
        lx = cube_at(c, 'losUnitVectorX', self.x, self.y, self.h)
        ly = cube_at(c, 'losUnitVectorY', self.x, self.y, self.h)
        self.los_enu = np.stack([lx, ly, np.sqrt(np.clip(1 - lx ** 2 - ly ** 2, 0, 1))])
        xs = (self.x - self.x.mean()) / 50000.0
        ys = (self.y - self.y.mean()) / 50000.0
        self.X, self.Y = np.meshgrid(xs, ys)
        self.reference = None
        ref = cfg.get('reference')
        if ref:
            rx, ry = utm_of(ref['lon'], ref['lat'], self.epsg)
            radius = max(ref.get('radius_px', 3) * 240.0, 1.5 * self.cell_m)
            self.reference = disk(self.shape, self.x, self.y, rx[0], ry[0], radius)

    # ---- one pair
    def pair_cm(self, s):
        o = self.opts
        phase = s['unw'].astype(np.float64)
        if o.iono:
            phase = phase - np.where(np.isfinite(s['iono']), s['iono'], 0)
        if o.tropo:
            wet = cube_at(s['cube'], 'wetTroposphericPhaseScreen', self.x, self.y, self.h)
            hyd = cube_at(s['cube'], 'hydrostaticTroposphericPhaseScreen', self.x, self.y, self.h)
            phase = phase - o.tropo * (wet + hyd)
        d = (PHASE_SIGN * RAD_TO_CM * phase).astype(np.float32)
        land = (s['land_frac'] >= 0.5) & (s['water_frac'] < 0.5)
        valid = land & (s['good_frac'] >= o.component_min) & (s['coh'] >= o.coh_min) & np.isfinite(d)
        self.last_recovered = np.zeros_like(valid)
        if o.recover and 'ph_re' in s and valid.sum() > 50:
            # Cells outside the main connected component (or below the coherence threshold): take the
            # complex-multilooked phase and re-wrap it about a smooth field interpolated from the reliable
            # cells. Valid while the true phase stays within half a cycle (6 cm LOS in 12 days) of that
            # field, which holds for subsidence. Accepted only where the 80 m cells agree (|phasor| >= 0.5;
            # pure noise over 9 cells gives ~0.33).
            re, im = (s['ph_re'], s['ph_im']) if o.iono else (s['ph_re_raw'], s['ph_im_raw'])
            mag = np.hypot(re, im)
            cand = land & ~valid & np.isfinite(mag) & (mag >= o.phasor_min)
            if cand.any():
                smooth = masked_gaussian(d, valid, 4)
                wide = masked_gaussian(d, valid, 12)
                smooth = np.where(np.isfinite(smooth), smooth, wide)
                cand &= np.isfinite(smooth)
                phi_s = smooth / (PHASE_SIGN * RAD_TO_CM)
                phi = phi_s + np.angle((re + 1j * im) * np.exp(-1j * phi_s))
                d = np.where(cand, (PHASE_SIGN * RAD_TO_CM * phi).astype(np.float32), d)
                valid = valid | cand
                self.last_recovered = cand
        return d, valid, land

    def terms(self, use_h):
        t = [np.ones(self.shape, np.float32), self.X, self.Y]
        # v2 fits a plane by default, NOT the v1 'deramp_order': on sjv a quadratic (v1's setting) lowered r at
        # the four moving GPS stations from 0.70-0.77 to 0.49-0.64, because it absorbs a valley-wide bowl.
        if self.cfg.get('v2_deramp_order', 1) >= 2:
            t += [self.X * self.X, self.X * self.Y, self.Y * self.Y]
        if use_h:
            t.append(((self.h - np.median(self.h)) / 1000.0).astype(np.float32))
        return t

    def run(self, quiet=None):
        """Chain sum. quiet: cells assumed not to move (used for the fits); None = all valid cells."""
        o, n = self.opts, len(self.subs)
        h_spread = np.std(self.h[self.in_bbox]) if self.in_bbox.any() else 0
        use_h = o.elevation and h_spread > 20.0
        terms = self.terms(use_h)
        steps = np.zeros((n,) + self.shape, np.float32)
        valids = np.zeros((n,) + self.shape, bool)
        var_decor = np.zeros((n + 1,) + self.shape, np.float32)
        self.pair_info = []
        for k, s in enumerate(self.subs):
            d, valid, land = self.pair_cm(s)
            recovered = self.last_recovered
            reliable = valid & ~recovered
            fit_mask = reliable & (quiet if quiet is not None else True)     # fits use reliable cells only
            model, coef, scale = robust_fit(d, fit_mask, terms)
            resid = d - model
            # unwrapping-error screen: isolated jumps against the local median
            med = _fast_median5(np.where(valid, resid, np.nan))
            jumps = valid & (np.abs(resid - med) > o.jump_cm)
            valid &= ~jumps
            ref_ok = True
            if self.reference is not None:
                rv = resid[self.reference & valid & ~recovered]
                ref_ok = len(rv) >= 5
                ref_value = np.median(rv) if ref_ok else np.median(resid[fit_mask & valid])
            else:
                ref_value = np.median(resid[fit_mask & valid]) if (fit_mask & valid).any() else 0.0
            resid = resid - ref_value
            steps[k], valids[k] = np.where(valid, resid, 0), valid
            # decorrelation noise (Cramer-Rao bound with N independent looks)
            gamma = np.clip(s['coh'], 0.05, 0.99)
            looks = LOOKS_80M * np.maximum(s['good_frac'], 0.1) * (self.cell_m / 80.0) ** 2
            sig = RAD_TO_CM * np.sqrt((1 - gamma ** 2) / (2 * looks * gamma ** 2))
            var_decor[k + 1] = var_decor[k] + np.where(valid, sig ** 2, np.nanmedian(sig[valid]) ** 2 if valid.any() else 1)
            box = self.in_bbox & land
            self.pair_info.append({
                'ref': self.recs[k]['ref'], 'sec': self.recs[k]['sec'],
                'coherent_frac': float((reliable & box).sum() / max(box.sum(), 1)),
                'mean_coherence': float(np.nanmean(s['coh'][box])) if box.any() else 0.0,
                'jump_frac': float((jumps & box).sum() / max(box.sum(), 1)),
                'recovered_frac': float((recovered & valid & box).sum() / max(box.sum(), 1)),
                'reference_ok': bool(ref_ok),
                'fit_scale_cm': float(scale), 'elevation_cm_per_km': float(coef[-1]) if (coef is not None and use_h) else None,
                'iono_sigma_rad_median': float(np.nanmedian(s['iono_sigma'][box])) if box.any() else None,
                'product_version': s['ident'].get('productVersion'), 'crid': s['ident'].get('compositeReleaseId'),
            })
        # gaps: a cell missing from one pair gets its own mean velocity (from its valid pairs) x that pair's
        # time span. Spatial filling would assume no motion inside masked patches, which under-reads sinking.
        dt_days = np.diff(self.days).astype(np.float32)[:, None, None]
        n_valid_days = (valids * dt_days).sum(0)
        velocity = np.where(n_valid_days > 0, steps.sum(0) / np.maximum(n_valid_days, 1), np.nan)
        steps = np.where(valids, steps, velocity[None] * dt_days)
        cube = np.zeros((n + 1,) + self.shape, np.float32)
        cube[1:] = np.cumsum(steps, 0)
        filled = (~valids).sum(0)
        self.used_elevation = bool(use_h)
        frac_filled = filled / max(n, 1)
        usable = (frac_filled <= o.max_filled) & np.isfinite(cube[-1])
        # frame edges: cells inside the radar frame in most pairs, eroded by ~1 km (edge cells are unreliable:
        # partial looks, sub-swath seams, filter edge effects); v1 eroded its frame mask the same way
        in_frame = np.mean([sub['in_frame'] >= 0.9 for sub in self.subs], 0) >= 1 - o.max_filled   # same rule as gap filling
        usable &= ndi.binary_erosion(in_frame, iterations=max(1, int(round(1000 / self.cell_m))), border_value=1)
        cube[:, ~usable] = np.nan
        self.cube, self.usable, self.var_decor, self.frac_filled = cube, usable, var_decor, frac_filled
        return cube

    def quiet_mask(self):
        """Cells whose cumulative change stays small (2.5 robust sigma, at least 2 cm), dilated by ~1 km."""
        final = self.cube[-1]
        ok = self.usable & self.in_bbox
        v = final[ok]
        sig = 1.4826 * np.median(np.abs(v - np.median(v)))
        moving = ok & (np.abs(final - np.median(v)) > max(2.5 * sig, 2.0))
        moving = ndi.binary_dilation(moving, iterations=max(1, int(1000 / self.cell_m)))
        return ~moving

    # ---- consistency and uncertainty
    def temporal_noise(self):
        """Per-cell noise of one epoch about a smooth trajectory (local-linear, Gaussian kernel).

        sigma^2 = sum(r^2) / trace((I-H)^T (I-H)) is unbiased for white epoch noise. Without triplets of
        pairs (NISAR rarely publishes the 24-day pair that would close a 12+12-day triplet), this is our
        closure proxy: atmosphere and unwrapping errors make the series jump; ground motion does not.
        """
        H = local_linear_hat(self.days, self.opts.smooth_days)
        R = np.eye(len(self.days)) - H
        dof = np.trace(R.T @ R)
        c = self.cube.reshape(len(self.days), -1)
        r = R @ np.nan_to_num(c)
        sig = np.sqrt((r ** 2).sum(0) / dof).reshape(self.shape)
        sig[~self.usable] = np.nan
        return sig

    def uncertainty(self, sigma_t):
        """1-sigma of every cumulative value: sqrt(2 sigma_t^2 + accumulated decorrelation + gap fill)."""
        smooth_t = np.where(self.usable, ndi.median_filter(np.nan_to_num(sigma_t), 5), np.nan)
        fill_var = (self.frac_filled * 0.5) ** 2                      # gap-filled steps: +0.5 cm each (scaled)
        n = np.arange(len(self.days))[:, None, None] / max(len(self.days) - 1, 1)
        sigma = np.sqrt(2 * smooth_t[None] ** 2 * (n > 0) + self.var_decor + fill_var[None] * n * (len(self.days) - 1))
        sigma[:, ~self.usable] = np.nan
        return sigma

    def closures(self, extra):
        """Misclosure of pairs that span two chain dates but are not in the chain (rare). -> list."""
        out = []
        index = {d: i for i, d in enumerate(self.dates)}
        for rec, sub in extra:
            if rec['ref'] not in index or rec['sec'] not in index:
                continue
            d, valid, _ = self.pair_cm(sub)
            chain = self.cube[index[rec['sec']]] - self.cube[index[rec['ref']]]
            diff = np.where(valid & self.usable, d - chain, np.nan)
            model, _, _ = robust_fit(diff, np.isfinite(diff), self.terms(False))  # constant + plane are free
            r = diff - model
            if np.isfinite(r).sum() > 100:
                out.append({'ref': rec['ref'], 'sec': rec['sec'],
                            'misclosure_cm_mad': round(float(1.4826 * np.nanmedian(np.abs(r - np.nanmedian(r)))), 2),
                            'cycle_slips_frac': round(float((np.abs(r) > WAVELENGTH_CM / 4).sum() / np.isfinite(r).sum()), 4)})
        return out
