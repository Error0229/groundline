// Written by pipeline/compare_opera.py. Agreement of Groundline NISAR maps with NASA OPERA DISP-S1.
window.OPERA_CHECK = {
 "celaya": {
  "r": 0.347,
  "rms_cm": 1.41,
  "slope": 0.24,
  "n_cells": 246,
  "period": [
   "2025-10-30",
   "2026-02-27"
  ],
  "quantity": "vertical-equivalent cumulative change, both maps high-passed with OPERA's 30 km short-wavelength filter",
  "reference": "constant removed (median of all compared points); too few sample points in the stable areas",
  "notes": "OPERA DISP-S1 frames F20689 (ascending, path 78, 2025-10-31 to 2026-02-22) vs NISAR 2025-10-30 to 2026-02-27. Only OPERA's short-wavelength layer is openly served (30 km Gaussian high-pass); the same filter was applied to our map, so bowls wider than about 20-30 km are suppressed in both. Without the filter on our side r = 0.397. Incidence 34.5-35.9 deg (OPERA, from frame footprint); ours LOS/0.77.",
  "opera_granules": [
   "OPERA_L3_DISP-S1_IW_F20689_VV_20250814T004906Z_20251031T004804Z_v1.0_20260310T111552Z",
   "OPERA_L3_DISP-S1_IW_F20689_VV_20251112T004803Z_20260222T004858Z_v1.0_20260817T215955Z"
  ],
  "peak_offset_km": 1.3,
  "citation": "OPERA Surface Displacement from Sentinel-1 (DISP-S1) v1, NASA JPL OPERA project, distributed by ASF DAAC, doi:10.5067/SNWG/OPERA_L3_DISP-S1_V1. Validation: Staniewicz et al. (2025), arXiv:2511.12051: mean velocity difference to GPS under 4 mm/yr at length scales under 50 km; requirement met at over 96% of validation sites.",
  "url": "https://www.earthdata.nasa.gov/data/catalog/asf-opera-l3-disp-s1-v1-1",
  "unfiltered": {
   "r": 0.341,
   "rms_cm": 2.99,
   "slope": 0.16,
   "slope_ci": [
    0.13,
    0.19
   ],
   "mean_diff_cm": -2.32,
   "n_cells": 4147,
   "peak_ours_cm": -6.2,
   "peak_opera_cm": -6.6,
   "peak_ours": {
    "lon": -100.8,
    "lat": 20.5744,
    "cm": -6.2,
    "opera_there_cm": -6.2
   },
   "peak_opera": {
    "lon": -100.7954,
    "lat": 20.5744,
    "cm": -6.6,
    "ours_there_cm": -6.0
   },
   "peak_offset_km": 0.5,
   "period": [
    "2025-10-30",
    "2026-02-27"
   ],
   "quantity": "vertical-equivalent cumulative change, OPERA full displacement layer (no filter)",
   "reference": "F20689: stable areas (49 cells); ours: stable areas (49 cells)",
   "opera_granules": [
    "OPERA_L3_DISP-S1_IW_F20689_VV_20250814T004906Z_20251031T004804Z_v1.0_20260310T111552Z",
    "OPERA_L3_DISP-S1_IW_F20689_VV_20250814T004906Z_20251112T004803Z_v1.0_20260310T111552Z",
    "OPERA_L3_DISP-S1_IW_F20689_VV_20251112T004803Z_20260222T004858Z_v1.0_20260817T215955Z"
   ],
   "notes": "OPERA DISP-S1 'displacement' layer (unfiltered), 30 m pixels averaged into our cells; ministacks chained; no OPERA corrections (ionosphere, solid-earth tide) applied.",
   "ramp_removed": {
    "n_cells": 4147,
    "r": 0.593,
    "rms_cm": 1.62,
    "mean_diff_cm": -0.07,
    "slope": 0.52,
    "slope_ci": [
     0.49,
     0.55
    ],
    "plane_span_cm": 4.5,
    "note": "best-fit plane of (ours - OPERA) over cells outside the bowls (both > -2 cm), 3-sigma clipped, removed from ours"
   },
   "bowl": {
    "n_cells": 83,
    "r": -0.308,
    "rms_cm": 3.6,
    "mean_diff_cm": 0.92,
    "slope": -0.22,
    "slope_ci": [
     -0.41,
     0.04
    ],
    "note": "cells where either map is below -3 cm (after ramp removal); depth check",
    "median_ours_cm": -2.16,
    "median_opera_cm": -3.35,
    "ratio_of_sums": 0.71
   },
   "gps": []
  }
 },
 "mexico_city": {
  "r": 0.789,
  "rms_cm": 0.83,
  "slope": 0.88,
  "n_cells": 526,
  "period": [
   "2025-10-30",
   "2026-02-27"
  ],
  "quantity": "vertical-equivalent cumulative change, both maps high-passed with OPERA's 30 km short-wavelength filter",
  "reference": "median of points in stable areas: Pedregal / UNAM, Chapultepec hills, Sierra de Guadalupe",
  "notes": "OPERA DISP-S1 frames F10860 (descending, path 41, 2025-10-28 to 2026-02-25), F38246 (descending, path 143, 2025-10-29 to 2026-02-26) vs NISAR 2025-10-30 to 2026-02-27. Only OPERA's short-wavelength layer is openly served (30 km Gaussian high-pass); the same filter was applied to our map, so bowls wider than about 20-30 km are suppressed in both. Without the filter on our side r = 0.65. Incidence 31.0-43.4 deg (OPERA, from frame footprint); ours LOS/0.77. GPS: MMX1: filtered series r = 0.958, RMS 0.36 cm.",
  "opera_granules": [
   "OPERA_L3_DISP-S1_IW_F10860_VV_20250910T123315Z_20251028T123315Z_v1.0_20260307T100528Z",
   "OPERA_L3_DISP-S1_IW_F10860_VV_20251209T123416Z_20260225T123311Z_v1.0_20260817T212042Z",
   "OPERA_L3_DISP-S1_IW_F38246_VV_20250830T122602Z_20251029T122603Z_v1.0_20260307T115404Z",
   "OPERA_L3_DISP-S1_IW_F38246_VV_20251128T122459Z_20260226T122554Z_v1.0_20260817T212320Z"
  ],
  "peak_offset_km": 0.0,
  "citation": "OPERA Surface Displacement from Sentinel-1 (DISP-S1) v1, NASA JPL OPERA project, distributed by ASF DAAC, doi:10.5067/SNWG/OPERA_L3_DISP-S1_V1. Validation: Staniewicz et al. (2025), arXiv:2511.12051: mean velocity difference to GPS under 4 mm/yr at length scales under 50 km; requirement met at over 96% of validation sites.",
  "url": "https://www.earthdata.nasa.gov/data/catalog/asf-opera-l3-disp-s1-v1-1",
  "unfiltered": {
   "r": 0.706,
   "rms_cm": 2.19,
   "slope": 0.4,
   "slope_ci": [
    0.36,
    0.44
   ],
   "mean_diff_cm": 1.46,
   "n_cells": 21661,
   "peak_ours_cm": -15.3,
   "peak_opera_cm": -12.2,
   "peak_ours": {
    "lon": -99.0498,
    "lat": 19.2672,
    "cm": -15.3,
    "opera_there_cm": -9.0
   },
   "peak_opera": {
    "lon": -98.972,
    "lat": 19.2846,
    "cm": -12.2,
    "ours_there_cm": -8.3
   },
   "peak_offset_km": 8.4,
   "period": [
    "2025-10-30",
    "2026-02-27"
   ],
   "quantity": "vertical-equivalent cumulative change, OPERA full displacement layer (no filter)",
   "reference": "F10860: stable areas (239 cells); F38246: stable areas (250 cells); ours: stable areas (252 cells)",
   "opera_granules": [
    "OPERA_L3_DISP-S1_IW_F10860_VV_20250910T123315Z_20251028T123315Z_v1.0_20260307T100528Z",
    "OPERA_L3_DISP-S1_IW_F10860_VV_20250910T123315Z_20251209T123416Z_v1.0_20260307T100528Z",
    "OPERA_L3_DISP-S1_IW_F10860_VV_20251209T123416Z_20260225T123311Z_v1.0_20260817T212042Z",
    "OPERA_L3_DISP-S1_IW_F38246_VV_20250830T122602Z_20251029T122603Z_v1.0_20260307T115404Z",
    "OPERA_L3_DISP-S1_IW_F38246_VV_20250830T122602Z_20251128T122459Z_v1.0_20260307T115404Z",
    "OPERA_L3_DISP-S1_IW_F38246_VV_20251128T122459Z_20260226T122554Z_v1.0_20260817T212320Z"
   ],
   "notes": "OPERA DISP-S1 'displacement' layer (unfiltered), 30 m pixels averaged into our cells; ministacks chained; no OPERA corrections (ionosphere, solid-earth tide) applied.",
   "ramp_removed": {
    "n_cells": 21661,
    "r": 0.793,
    "rms_cm": 1.42,
    "mean_diff_cm": 0.24,
    "slope": 0.79,
    "slope_ci": [
     0.77,
     0.82
    ],
    "plane_span_cm": 3.9,
    "note": "best-fit plane of (ours - OPERA) over cells outside the bowls (both > -2 cm), 3-sigma clipped, removed from ours"
   },
   "bowl": {
    "n_cells": 5815,
    "r": 0.769,
    "rms_cm": 1.75,
    "mean_diff_cm": 0.26,
    "slope": 0.68,
    "slope_ci": [
     0.65,
     0.71
    ],
    "note": "cells where either map is below -3 cm (after ramp removal); depth check",
    "median_ours_cm": -3.57,
    "median_opera_cm": -3.52,
    "ratio_of_sums": 0.94
   },
   "gps": [
    {
     "id": "MMX1",
     "gps_up_change_cm": -8.91,
     "gps_to": "20260227",
     "opera_cm": -9.09,
     "ours_cm": -8.31
    }
   ]
  }
 },
 "sjv": {
  "r": 0.265,
  "rms_cm": 0.86,
  "slope": 0.24,
  "n_cells": 878,
  "period": [
   "2025-11-24",
   "2026-02-16"
  ],
  "quantity": "vertical-equivalent cumulative change, both maps high-passed with OPERA's 30 km short-wavelength filter",
  "reference": "constant removed (median of all compared points); no stable area defined",
  "notes": "OPERA DISP-S1 frames F36543 (ascending, path 137, 2025-11-22 to 2026-02-14), F36542 (ascending, path 137, 2025-11-22 to 2026-02-14), F16942 (ascending, path 64, 2025-11-23 to 2026-02-15), F36541 (ascending, path 137, 2025-11-22 to 2026-02-14) vs NISAR 2025-11-24 to 2026-02-16. Only OPERA's short-wavelength layer is openly served (30 km Gaussian high-pass); the same filter was applied to our map, so bowls wider than about 20-30 km are suppressed in both. Without the filter on our side r = 0.193. Incidence 30.9-43.7 deg (OPERA, from frame footprint); ours LOS/1.0. GPS: TLBN: filtered series r = -0.149, RMS 0.93 cm; QCAP: filtered series r = 0.403, RMS 0.42 cm; HANF: filtered series r = -0.98, RMS 1.35 cm; P056: filtered series r = 0.016, RMS 0.47 cm; P307: filtered series r = 0.105, RMS 0.22 cm; Q164: filtered series r = 0.043, RMS 0.25 cm; P564: filtered series r = -0.216, RMS 0.28 cm; P304: filtered series r = -0.524, RMS 0.76 cm; P566: filtered series r = 0.011, RMS 0.26 cm; P544: filtered series r = -0.062, RMS 0.45 cm; LNDC: filtered series r = -0.42, RMS 0.31 cm; P300: filtered series r = 0.428, RMS 0.34 cm; P302: filtered series r = -0.202, RMS 0.23 cm; P303: filtered series r = -0.865, RMS 0.21 cm; P305: filtered series r = -0.307, RMS 0.51 cm; P565: filtered series r = 0.704, RMS 0.13 cm; Q102: filtered series r = 0.422, RMS 0.42 cm; Q143: filtered series r = 0.575, RMS 0.32 cm; Q174: filtered series r = 0.681, RMS 0.23 cm; Q189: filtered series r = -0.325, RMS 0.23 cm; Q198: filtered series r = 0.471, RMS 0.79 cm; Q204: filtered series r = 0.438, RMS 0.27 cm; Q208: filtered series r = 0.105, RMS 0.45 cm; Q213: filtered series r = 0.051, RMS 0.79 cm.",
  "opera_granules": [
   "OPERA_L3_DISP-S1_IW_F36543_VV_20250905T015840Z_20251122T015943Z_v1.0_20260310T184402Z",
   "OPERA_L3_DISP-S1_IW_F36543_VV_20251204T015942Z_20260214T015936Z_v1.0_20260817T225352Z",
   "OPERA_L3_DISP-S1_IW_F36542_VV_20250917T015819Z_20251122T015921Z_v1.0_20260904T104638Z",
   "OPERA_L3_DISP-S1_IW_F36542_VV_20251216T015919Z_20260214T015914Z_v1.0_20260904T194011Z",
   "OPERA_L3_DISP-S1_IW_F16942_VV_20250831T015001Z_20251123T015001Z_v1.0_20260307T130553Z",
   "OPERA_L3_DISP-S1_IW_F16942_VV_20251205T015000Z_20260215T014957Z_v1.0_20260817T212120Z",
   "OPERA_L3_DISP-S1_IW_F36541_VV_20251110T015900Z_20251122T015859Z_v1.0_20260904T111630Z",
   "OPERA_L3_DISP-S1_IW_F36541_VV_20251110T015900Z_20260214T015852Z_v1.0_20260904T111630Z"
  ],
  "peak_offset_km": 157.8,
  "citation": "OPERA Surface Displacement from Sentinel-1 (DISP-S1) v1, NASA JPL OPERA project, distributed by ASF DAAC, doi:10.5067/SNWG/OPERA_L3_DISP-S1_V1. Validation: Staniewicz et al. (2025), arXiv:2511.12051: mean velocity difference to GPS under 4 mm/yr at length scales under 50 km; requirement met at over 96% of validation sites.",
  "url": "https://www.earthdata.nasa.gov/data/catalog/asf-opera-l3-disp-s1-v1-1",
  "unfiltered": {
   "r": 0.053,
   "rms_cm": 2.82,
   "slope": 0.03,
   "slope_ci": [
    0.0,
    0.05
   ],
   "mean_diff_cm": 0.41,
   "n_cells": 51957,
   "peak_ours_cm": -8.3,
   "peak_opera_cm": -7.7,
   "peak_ours": {
    "lon": -120.325,
    "lat": 36.6968,
    "cm": -8.3,
    "opera_there_cm": 1.5
   },
   "peak_opera": {
    "lon": -119.585,
    "lat": 37.5248,
    "cm": -7.7,
    "ours_there_cm": -0.2
   },
   "peak_offset_km": 113.5,
   "period": [
    "2025-11-24",
    "2026-02-16"
   ],
   "quantity": "vertical-equivalent cumulative change, OPERA full displacement layer (no filter)",
   "reference": "F36542: constant matched to ours (median); F16942: tied to F36542 on 7044 overlapping cells; F36541: tied to F36542 on 9415 overlapping cells; F36543: tied to F36542 on 3222 overlapping cells; ours: constant removed against OPERA (median difference)",
   "opera_granules": [
    "OPERA_L3_DISP-S1_IW_F16942_VV_20250831T015001Z_20251123T015001Z_v1.0_20260307T130553Z",
    "OPERA_L3_DISP-S1_IW_F16942_VV_20250831T015001Z_20251205T015000Z_v1.0_20260307T130553Z",
    "OPERA_L3_DISP-S1_IW_F16942_VV_20251205T015000Z_20260215T014957Z_v1.0_20260817T212120Z",
    "OPERA_L3_DISP-S1_IW_F36541_VV_20251110T015900Z_20251122T015859Z_v1.0_20260904T111630Z",
    "OPERA_L3_DISP-S1_IW_F36541_VV_20251110T015900Z_20260214T015852Z_v1.0_20260904T111630Z",
    "OPERA_L3_DISP-S1_IW_F36542_VV_20250917T015819Z_20251122T015921Z_v1.0_20260904T104638Z",
    "OPERA_L3_DISP-S1_IW_F36542_VV_20250917T015819Z_20251216T015919Z_v1.0_20260904T104638Z",
    "OPERA_L3_DISP-S1_IW_F36542_VV_20251216T015919Z_20260214T015914Z_v1.0_20260904T194011Z",
    "OPERA_L3_DISP-S1_IW_F36543_VV_20250905T015840Z_20251122T015943Z_v1.0_20260310T184402Z",
    "OPERA_L3_DISP-S1_IW_F36543_VV_20250905T015840Z_20251204T015942Z_v1.0_20260310T184402Z",
    "OPERA_L3_DISP-S1_IW_F36543_VV_20251204T015942Z_20260214T015936Z_v1.0_20260817T225352Z"
   ],
   "notes": "OPERA DISP-S1 'displacement' layer (unfiltered), 30 m pixels averaged into our cells; ministacks chained; no OPERA corrections (ionosphere, solid-earth tide) applied.",
   "ramp_removed": {
    "n_cells": 51957,
    "r": 0.567,
    "rms_cm": 2.14,
    "mean_diff_cm": 0.43,
    "slope": 0.46,
    "slope_ci": [
     0.44,
     0.49
    ],
    "plane_span_cm": 6.2,
    "note": "best-fit plane of (ours - OPERA) over cells outside the bowls (both > -2 cm), 3-sigma clipped, removed from ours"
   },
   "bowl": {
    "n_cells": 8120,
    "r": 0.017,
    "rms_cm": 2.93,
    "mean_diff_cm": 1.78,
    "slope": 0.1,
    "slope_ci": [
     0.05,
     0.16
    ],
    "note": "cells where either map is below -3 cm (after ramp removal); depth check",
    "median_ours_cm": -2.31,
    "median_opera_cm": -3.81,
    "ratio_of_sums": 0.54
   },
   "gps": [
    {
     "id": "TLBN",
     "gps_up_change_cm": 1.28,
     "gps_to": "20260216",
     "opera_cm": 4.02,
     "ours_cm": -0.22
    },
    {
     "id": "QCAP",
     "gps_up_change_cm": 0.73,
     "gps_to": "20260216",
     "opera_cm": 1.82,
     "ours_cm": 1.48
    },
    {
     "id": "HANF",
     "gps_up_change_cm": 1.69,
     "gps_to": "20260216",
     "opera_cm": 2.77,
     "ours_cm": 0.68
    },
    {
     "id": "P056",
     "gps_up_change_cm": 0.24,
     "gps_to": "20260216",
     "opera_cm": 1.27,
     "ours_cm": 2.18
    },
    {
     "id": "P307",
     "gps_up_change_cm": -1.19,
     "gps_to": "20260216",
     "opera_cm": -1.62,
     "ours_cm": -1.92
    },
    {
     "id": "Q164",
     "gps_up_change_cm": 0.28,
     "gps_to": "20260216",
     "opera_cm": 1.38,
     "ours_cm": 1.48
    },
    {
     "id": "P564",
     "gps_up_change_cm": -0.11,
     "gps_to": "20260216",
     "opera_cm": 3.6,
     "ours_cm": -0.62
    },
    {
     "id": "P304",
     "gps_up_change_cm": -0.19,
     "gps_to": "20260216",
     "opera_cm": 1.65,
     "ours_cm": -0.52
    },
    {
     "id": "P566",
     "gps_up_change_cm": -0.64,
     "gps_to": "20260216",
     "opera_cm": 1.6,
     "ours_cm": 1.68
    },
    {
     "id": "P544",
     "gps_up_change_cm": -0.48,
     "gps_to": "20260216",
     "opera_cm": 2.99,
     "ours_cm": -0.52
    },
    {
     "id": "LNDC",
     "gps_up_change_cm": -0.45,
     "gps_to": "20260216",
     "opera_cm": 0.54,
     "ours_cm": 1.88
    },
    {
     "id": "P300",
     "gps_up_change_cm": -0.36,
     "gps_to": "20260216",
     "opera_cm": 1.64,
     "ours_cm": -0.52
    },
    {
     "id": "P302",
     "gps_up_change_cm": -0.28,
     "gps_to": "20260216",
     "opera_cm": -0.05,
     "ours_cm": -0.92
    },
    {
     "id": "P303",
     "gps_up_change_cm": -0.83,
     "gps_to": "20260216",
     "opera_cm": -2.47,
     "ours_cm": 2.08
    },
    {
     "id": "P305",
     "gps_up_change_cm": -0.24,
     "gps_to": "20260216",
     "opera_cm": -2.18,
     "ours_cm": 0.88
    },
    {
     "id": "P565",
     "gps_up_change_cm": 0.34,
     "gps_to": "20260216",
     "opera_cm": 0.93,
     "ours_cm": 0.28
    },
    {
     "id": "Q102",
     "gps_up_change_cm": -0.38,
     "gps_to": "20260216",
     "opera_cm": 0.2,
     "ours_cm": -1.12
    },
    {
     "id": "Q143",
     "gps_up_change_cm": 0.48,
     "gps_to": "20260216",
     "opera_cm": 2.99,
     "ours_cm": 0.68
    },
    {
     "id": "Q174",
     "gps_up_change_cm": -0.37,
     "gps_to": "20260216",
     "opera_cm": 0.55,
     "ours_cm": 0.28
    },
    {
     "id": "Q189",
     "gps_up_change_cm": -0.36,
     "gps_to": "20260216",
     "opera_cm": 3.43,
     "ours_cm": 0.48
    },
    {
     "id": "Q198",
     "gps_up_change_cm": -0.88,
     "gps_to": "20260216",
     "opera_cm": 2.51,
     "ours_cm": -1.32
    },
    {
     "id": "Q204",
     "gps_up_change_cm": -0.7,
     "gps_to": "20260216",
     "opera_cm": 2.16,
     "ours_cm": -2.52
    },
    {
     "id": "Q208",
     "gps_up_change_cm": -0.76,
     "gps_to": "20260216",
     "opera_cm": 2.45,
     "ours_cm": -2.62
    },
    {
     "id": "Q213",
     "gps_up_change_cm": -0.54,
     "gps_to": "20260216",
     "opera_cm": 2.96,
     "ours_cm": -0.12
    }
   ]
  }
 }
};
