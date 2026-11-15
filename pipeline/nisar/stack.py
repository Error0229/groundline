"""Step 3: from wrapped phase of consecutive pairs to cumulative displacement.

Each 12-day pair is processed on its own, because the motion inside one pair is far below one colour
cycle (11.9 cm of line-of-sight motion) and therefore easy to unwrap:
  1. smooth the phase as a unit vector (5x5) and estimate a coherence proxy from the vector length;
  2. unwrap where the proxy is high;
  3. remove a smooth surface (orbit and long-wavelength atmosphere) with a robust fit;
  4. re-wrap the full-resolution phase about the smooth unwrapped field, so unwrapping errors cannot spread;
  5. reference to a stable area if one is configured, then add to the running total.
The sign (negative = away from the satellite = sinking) was fixed empirically against GPS.
"""
import numpy as np
from scipy import ndimage as ndi
from skimage.restoration import unwrap_phase

WAVELENGTH_CM = 23.84                      # NISAR L-band
RAD_TO_CM = WAVELENGTH_CM / (4 * np.pi)    # one full colour cycle = 11.92 cm along the line of sight
NOISE_ONLY_COHERENCE = 0.5                 # a pair below this is noise, not signal


def smooth_phasor(phase, valid, size=5):
    """Return (smoothed phase, coherence proxy 0..1, fraction of valid neighbours)."""
    z = np.where(valid, np.exp(1j * phase), 0)
    weight = ndi.uniform_filter(valid.astype(np.float32), size)
    real = ndi.uniform_filter(z.real.astype(np.float32), size)
    imag = ndi.uniform_filter(z.imag.astype(np.float32), size)
    return np.arctan2(imag, real), np.hypot(real, imag) / np.maximum(weight, 1e-3), weight


def pair_coherence(phase, valid):
    """One number per pair: the median coherence proxy over valid pixels."""
    _, coherence, weight = smooth_phasor(phase, valid)
    use = valid & (weight > 0.7)
    return float(np.median(coherence[use])) if use.sum() > 100 else 0.0


def surface_terms(shape, order):
    yy, xx = np.mgrid[:shape[0], :shape[1]].astype(np.float32)
    x, y = (xx - shape[1] / 2) / 700.0, (yy - shape[0] / 2) / 700.0
    terms = [np.ones_like(x), x, y]
    if order >= 2:
        terms += [x * x, x * y, y * y]
    return terms


def robust_surface(values, mask, terms, iterations=6):
    """Fit a low-order surface with Cauchy weights so the sinking area does not drag the fit."""
    sample = np.zeros_like(mask)
    sample[::3, ::3] = True
    sample &= mask & np.isfinite(values)
    design = np.stack([t[sample] for t in terms], 1)
    target = values[sample]
    weight = np.ones(len(target))
    for _ in range(iterations):
        coef, *_ = np.linalg.lstsq(design * weight[:, None], target * weight, rcond=None)
        resid = target - design @ coef
        scale = 1.4826 * np.median(np.abs(resid - np.median(resid))) + 1e-6
        weight = 1 / (1 + (resid / (2 * scale)) ** 2)
    return sum(t * c for t, c in zip(terms, coef)) + np.median(resid)


def masked_gaussian(values, mask, sigma):
    num = ndi.gaussian_filter(np.where(mask, values, 0).astype(np.float32), sigma)
    den = ndi.gaussian_filter(mask.astype(np.float32), sigma)
    return np.where(den > 0.15, num / np.maximum(den, 1e-3), np.nan)


def frame_mask(valids, zero_colours):
    """Pixels that carry data in most pairs. The zero-phase colour in most pairs means fill, not data."""
    n = len(valids)
    frame = (sum(z.astype(np.int16) for z in zero_colours) < 0.6 * n) & (sum(v.astype(np.int16) for v in valids) > 0.8 * n)
    frame = ndi.binary_opening(frame, iterations=2, border_value=1)
    return ndi.binary_erosion(frame, iterations=4, border_value=1)


def process_pair(phase, valid, frame, terms):
    """One pair -> (displacement phase in radians, bad-pixel mask, coherence proxy map)."""
    smoothed, coherence, weight = smooth_phasor(phase, valid)
    good = frame & valid & (weight > 0.7) & (coherence > 0.7)
    unwrapped = unwrap_phase(np.ma.array(smoothed, mask=~good)).filled(np.nan).astype(np.float32)
    ramp = robust_surface(unwrapped, good, terms)
    resid = unwrapped - ramp
    spread = 1.4826 * np.nanmedian(np.abs(resid[good]))
    smooth = masked_gaussian(np.clip(np.nan_to_num(resid), -4 * spread, 4 * spread), good, 12)
    result = smooth + np.angle(np.exp(1j * (smoothed - ramp - smooth)))
    bad = ~(frame & valid & (weight > 0.7) & (coherence > 0.5)) | (np.abs(result - smooth) > 1.0) | ~np.isfinite(result)
    return np.where(bad, smooth, result), bad, coherence


def cumulative(pairs, frame, order=2, reference=None):
    """Sum the pairs.

    pairs: list of (phase, valid) arrays already cropped to the processing window.
    reference: optional (row slice, column slice) of a stable area; its median is subtracted from every pair.
    Returns (cube [n_dates, H, W] in cm, NaN outside the usable area; usable mask; mean coherence map).
    """
    shape = frame.shape
    terms = surface_terms(shape, order)
    cube = np.zeros((len(pairs) + 1,) + shape, np.float32)
    n_bad = np.zeros(shape, np.int16)
    coherence_sum = np.zeros(shape, np.float32)
    for k, (phase, valid) in enumerate(pairs):
        step, bad, coherence = process_pair(phase, valid, frame, terms)
        if reference is not None:
            ref_value = np.nanmedian(step[reference])
            if np.isfinite(ref_value):
                step = step - ref_value
        cube[k + 1] = cube[k] + step * RAD_TO_CM
        n_bad += bad
        coherence_sum += coherence
    usable = frame & (n_bad < 0.3 * len(pairs)) & np.isfinite(cube[-1])
    cube[:, ~usable] = np.nan
    return cube, usable, coherence_sum / max(len(pairs), 1)
