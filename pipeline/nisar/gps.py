"""Step 5: independent check against continuous GPS (Nevada Geodetic Laboratory daily solutions).

The radar measures motion along its slanted line of sight (LOS). GPS 'up' is projected to LOS with an
ASSUMED cosine of the viewing angle (default 0.77, about 40 degrees); horizontal motion is neglected.
"""
import datetime as dt
import os

import numpy as np

from .search import http_get

TENV3_URL = 'https://geodesy.unr.edu/gps_timeseries/IGS20/tenv3/IGS20/{sta}.tenv3'
MONTHS = {m: i + 1 for i, m in enumerate('JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split())}


def fetch_tenv3(station, cache_dir, ctx, offline=False):
    dst = os.path.join(cache_dir, station + '.tenv3')
    if os.path.exists(dst) and (offline or os.path.getmtime(dst) > dt.datetime.now().timestamp() - 20 * 3600):
        return dst
    if offline:
        raise FileNotFoundError('not in cache and --offline given: ' + dst)
    data = http_get(TENV3_URL.format(sta=station), ctx)
    with open(dst + '.part', 'wb') as fh:
        fh.write(data)
    os.replace(dst + '.part', dst)
    return dst


def read_tenv3(path):
    """Return (day ordinals, up in cm). Columns 12 and 13 of a tenv3 line are integer and fractional up (m)."""
    days, up = [], []
    with open(path, encoding='latin-1') as fh:
        for line in fh:
            p = line.split()
            try:
                day = dt.date(2000 + int(p[1][:2]), MONTHS[p[1][2:5]], int(p[1][5:]))
                value = (float(p[11]) + float(p[12])) * 100.0
            except (IndexError, KeyError, ValueError):
                continue                          # header or malformed line
            days.append(day.toordinal())
            up.append(value)
    return np.array(days), np.array(up)


def at_epochs(days, up, epochs, half_window=4, min_samples=3):
    """Median GPS height within +-half_window days of each radar date; NaN where too few samples."""
    out = np.full(len(epochs), np.nan)
    for i, epoch in enumerate(epochs):
        near = np.abs(days - epoch) <= half_window
        if near.sum() >= min_samples:
            out[i] = np.median(up[near])
    return out


def compare(radar_cm, gps_los_cm):
    """Correlation and RMS difference of two series that both start at zero. NaN epochs are skipped."""
    radar, gps = np.asarray(radar_cm, float), np.asarray(gps_los_cm, float)
    ok = np.isfinite(radar) & np.isfinite(gps)
    if ok.sum() < 4:
        return {'n': int(ok.sum()), 'r': None, 'rms_cm': None}
    diff = radar[ok] - gps[ok]
    return {'n': int(ok.sum()), 'r': round(float(np.corrcoef(radar[ok], gps[ok])[0, 1]), 3),
            'rms_cm': round(float(np.sqrt(np.mean(diff ** 2))), 2)}


def ordinal(yyyymmdd):
    return dt.datetime.strptime(yyyymmdd, '%Y%m%d').date().toordinal()
