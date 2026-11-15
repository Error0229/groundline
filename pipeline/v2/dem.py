"""Terrain heights for the phase-elevation fit: Copernicus GLO-90 (public AWS open-data bucket, no login).

Tiles are 1 x 1 degree Cloud-Optimised GeoTIFFs named after their south-west corner. Heights are
orthometric (EGM2008). The phase-elevation fit only needs relative height inside one site, so the geoid
offset (nearly constant over a site) does not matter; for the troposphere cube (ellipsoidal heights) a
10-30 m offset is negligible at the cube's 500 m vertical spacing.
Missing tiles (open sea) are filled with 0 m.
"""
import math
import os
import urllib.request

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform as warp_transform
from scipy import ndimage as ndi

URL = ('https://copernicus-dem-90m.s3.amazonaws.com/Copernicus_DSM_COG_30_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/'
       'Copernicus_DSM_COG_30_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif')


def tile_name(lat, lon):
    return dict(ns='N' if lat >= 0 else 'S', lat=abs(lat), ew='E' if lon >= 0 else 'W', lon=abs(lon))


def fetch_tile(lat, lon, cache_dir):
    os.makedirs(cache_dir, exist_ok=True)
    url = URL.format(**tile_name(lat, lon))
    dst = os.path.join(cache_dir, url.rsplit('/', 1)[-1])
    if os.path.exists(dst):
        return dst
    if os.path.exists(dst + '.missing'):
        return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'groundline-subsidence/2.0'})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
    except urllib.error.HTTPError as err:
        if err.code in (403, 404):                 # no tile: ocean
            open(dst + '.missing', 'w').close()
            return None
        raise
    with open(dst + '.part', 'wb') as fh:
        fh.write(data)
    os.replace(dst + '.part', dst)
    return dst


def heights_lonlat(lons, lats, cache_dir):
    """Bilinear DEM height (m) at arrays of lon/lat."""
    lons, lats = np.asarray(lons, float), np.asarray(lats, float)
    out = np.zeros(lons.shape, np.float32)
    for la in range(math.floor(lats.min()), math.floor(lats.max()) + 1):
        for lo in range(math.floor(lons.min()), math.floor(lons.max()) + 1):
            sel = (np.floor(lats) == la) & (np.floor(lons) == lo)
            if not sel.any():
                continue
            path = fetch_tile(la, lo, cache_dir)
            if path is None:
                continue
            with rasterio.open(path) as src:
                z = src.read(1).astype(np.float32)
                inv = ~src.transform
                col, row = inv * (lons[sel], lats[sel])
            z[~np.isfinite(z)] = 0
            out[sel] = ndi.map_coordinates(z, [row - 0.5, col - 0.5], order=1, mode='nearest')
    return out


def heights_utm(x, y, epsg, cache_dir, smooth_px=0):
    """DEM on a UTM grid given by cell-centre vectors x (columns) and y (rows)."""
    xx, yy = np.meshgrid(x, y)
    lon, lat = warp_transform(CRS.from_epsg(epsg), CRS.from_epsg(4326), xx.ravel(), yy.ravel())
    h = heights_lonlat(np.array(lon), np.array(lat), cache_dir).reshape(xx.shape)
    return ndi.uniform_filter(h, smooth_px) if smooth_px else h
