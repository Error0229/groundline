"""Step 4: pixel <-> longitude/latitude.

The preview is a north-up lon/lat picture of a tilted radar frame on a transparent canvas. The pair's
footprint polygon (from the search listing) corresponds to the NON-TRANSPARENT part of the picture, so the
bounding box of the opaque pixels is tied to the bounding box of the polygon. Mapping the whole canvas
instead shifts everything by about 2.3 km, which halved our correlation with GPS.
"""
import numpy as np


class Georef:
    """Linear map between canvas pixels and degrees: lon = lon0 + x_edge * dlon, lat = lat0 + y_edge * dlat."""

    def __init__(self, lon0, dlon, lat0, dlat):
        self.lon0, self.dlon, self.lat0, self.dlat = lon0, dlon, lat0, dlat      # dlat is negative (north-up)

    def to_pixel(self, lon, lat):
        """Fractional (x, y) pixel-centre coordinates of a lon/lat position."""
        return ((np.asarray(lon, float) - self.lon0) / self.dlon - 0.5,
                (np.asarray(lat, float) - self.lat0) / self.dlat - 0.5)

    def degrees_per_pixel(self):
        return self.dlon, -self.dlat

    def pixel_km(self, lat):
        return self.dlon * 111.32 * np.cos(np.radians(lat)), -self.dlat * 110.95


def opaque_bbox(opaque):
    """Pixel edges (x0, x1, y0, y1) of the non-transparent part: columns [x0, x1), rows [y0, y1)."""
    ys, xs = np.where(opaque)
    return int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1


def robust_line(x, y):
    """Straight line through (x, y) ignoring gross outliers. Returns (intercept, slope, residuals)."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    keep = np.ones(len(x), bool)
    for _ in range(3):
        slope, intercept = np.polyfit(x[keep], y[keep], 1)
        resid = y - (intercept + slope * x)
        scale = 1.4826 * np.median(np.abs(resid[keep] - np.median(resid[keep]))) + 1e-9
        keep = np.abs(resid) < 4 * scale + 1e-6
    return intercept, slope, resid


def from_footprints(opaque_boxes, footprints):
    """One canvas mapping for a whole track/frame, fitted over every pair.

    All previews of a track/frame share one canvas, but each pair covers a slightly different part of it
    (two acquisitions never start and stop at exactly the same place). So each pair gives four tie points:
    left/right opaque edge <-> west/east of its footprint, top/bottom edge <-> north/south.
    Returns (Georef, median misfit in pixels, worst misfit in pixels).
    """
    boxes = np.array(opaque_boxes, float)        # x0, x1, y0, y1
    feet = np.array(footprints, float)           # west, south, east, north
    lon0, dlon, res_x = robust_line(np.r_[boxes[:, 0], boxes[:, 1]], np.r_[feet[:, 0], feet[:, 2]])
    lat0, dlat, res_y = robust_line(np.r_[boxes[:, 2], boxes[:, 3]], np.r_[feet[:, 3], feet[:, 1]])
    res_px = np.r_[np.abs(res_x) / abs(dlon), np.abs(res_y) / abs(dlat)]
    return Georef(lon0, dlon, lat0, dlat), float(np.median(res_px)), float(res_px.max())


def mercator_y(lat):
    return np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))


def inverse_mercator_y(y):
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def web_grid(west, south, east, north, step_deg):
    """Cell-centre lon/lat of an output grid whose rows are evenly spaced in Web Mercator.

    Web maps stretch an image linearly in Mercator between its corners; rows evenly spaced in latitude
    would be misplaced by up to about 1 km in the middle of a 2-degree-tall image.
    """
    width = int(round((east - west) / step_deg))
    height = int(round((mercator_y(north) - mercator_y(south)) / np.radians(step_deg)))
    lons = west + (np.arange(width) + 0.5) * (east - west) / width
    ys = mercator_y(north) - (np.arange(height) + 0.5) * (mercator_y(north) - mercator_y(south)) / height
    return lons, inverse_mercator_y(ys)
