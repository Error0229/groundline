// Written by pipeline/build_observatory.py. Pipeline numbers and literature numbers are kept apart:
// peak_rate_cm_yr / gps / dates come from our NISAR pipeline; literature{} is published work.
window.OBSERVATORY = [
 {
  "id": "mexico_city",
  "name": "Mexico City",
  "country": "Mexico",
  "lat": 19.43,
  "lon": -99.07,
  "status": "validated",
  "literature": {
   "rate_cm_yr": 39.1,
   "quantity": "vertical",
   "period": "2014-2020",
   "citation": "Cigna & Tapete 2021, Remote Sensing of Environment 253:112161 (Iztapalapa; ~50 per Chaussard et al. 2021)",
   "url": "https://doi.org/10.1016/j.rse.2020.112161"
  },
  "location_check": "Peak east of the airport / Nezahualcoyotl, the bowl documented in the literature.",
  "has_site_data": true,
  "track": "19/11 ascending",
  "dates": [
   "20251030",
   "20261013"
  ],
  "covered_by": "OPERA DISP-S1",
  "role": "calibration",
  "v1_judgement": {
   "status": "validated"
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 28,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.937,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.997,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.45,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 27.7,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 28,
   "noise_cm": 2.8,
   "coherence_mean": 0.615,
   "coherent_fraction": 0.937,
   "uncertainty_median_cm": 1.1,
   "runtime_s": 15,
   "transferred_mb": 0
  },
  "span_days": 348,
  "gps": {
   "stations": [
    {
     "id": "MMX1",
     "r": 0.998,
     "rms_cm": 0.55,
     "n": 26,
     "gps_range_cm": 20.34,
     "kind": "configured"
    }
   ],
   "basis": "radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)",
   "moving_threshold_cm": 3.0,
   "test": {
    "stations": 1,
    "median_r": 0.998,
    "median_rms_cm": 0.55,
    "median_gps_range_cm": 20.34,
    "agrees": true
   }
  },
  "peak_change_cm": 42.0,
  "peak_rate_cm_yr": 44.1,
  "peak_quantity": "los",
  "peak_location": [
   -99.036,
   19.4462
  ],
  "peak_sigma_cm": 1.63
 },
 {
  "id": "sjv",
  "name": "San Joaquin Valley",
  "country": "United States",
  "lat": 36.06,
  "lon": -119.31,
  "status": "validated",
  "literature": {
   "rate_cm_yr": 34.5,
   "quantity": "vertical",
   "period": "water year 2016 (drought peak)",
   "citation": "Neely et al. 2021, Water Resources Research",
   "url": "https://doi.org/10.1029/2020WR028451",
   "note": "Drought-year peak near Corcoran; rates vary strongly with drought."
  },
  "location_check": "Fastest towns Tipton, Teviston, Pixley (Tule subbasin), consistent with DWR/TRE ALTAMIRA maps.",
  "has_site_data": true,
  "peak_rate_cm_yr": 15.4,
  "gps": {
   "stations": [
    {
     "id": "TLBN",
     "r": 0.983,
     "rms_cm": 2.33,
     "n": 26
    },
    {
     "id": "QCAP",
     "r": 0.964,
     "rms_cm": 1.64,
     "n": 26
    },
    {
     "id": "HANF",
     "r": 0.963,
     "rms_cm": 1.67,
     "n": 26
    },
    {
     "id": "P056",
     "r": 0.935,
     "rms_cm": 1.03,
     "n": 26
    },
    {
     "id": "P307",
     "r": 0.766,
     "rms_cm": 1.28,
     "n": 26
    },
    {
     "id": "Q164",
     "r": 0.853,
     "rms_cm": 2.32,
     "n": 26
    },
    {
     "id": "P564",
     "r": 0.958,
     "rms_cm": 4.72,
     "n": 26
    },
    {
     "id": "P304",
     "r": 0.875,
     "rms_cm": 1.11,
     "n": 26
    },
    {
     "id": "P566",
     "r": 0.586,
     "rms_cm": 1.67,
     "n": 26
    },
    {
     "id": "P544",
     "r": 0.599,
     "rms_cm": 0.59,
     "n": 26
    },
    {
     "id": "LNDC",
     "r": -0.4,
     "rms_cm": 1.83,
     "n": 26
    },
    {
     "id": "P300",
     "r": 0.705,
     "rms_cm": 1.14,
     "n": 26
    },
    {
     "id": "P302",
     "r": 0.686,
     "rms_cm": 1.42,
     "n": 26
    },
    {
     "id": "P303",
     "r": 0.399,
     "rms_cm": 3.35,
     "n": 26
    },
    {
     "id": "P305",
     "r": 0.721,
     "rms_cm": 3.22,
     "n": 26
    },
    {
     "id": "P565",
     "r": 0.897,
     "rms_cm": 1.22,
     "n": 26
    },
    {
     "id": "Q102",
     "r": 0.082,
     "rms_cm": 3.58,
     "n": 26
    },
    {
     "id": "Q143",
     "r": 0.95,
     "rms_cm": 2.01,
     "n": 26
    },
    {
     "id": "Q174",
     "r": 0.367,
     "rms_cm": 2.6,
     "n": 26
    },
    {
     "id": "Q189",
     "r": -0.75,
     "rms_cm": 1.14,
     "n": 26
    },
    {
     "id": "Q198",
     "r": 0.612,
     "rms_cm": 0.97,
     "n": 26
    },
    {
     "id": "Q204",
     "r": 0.623,
     "rms_cm": 1.33,
     "n": 26
    },
    {
     "id": "Q208",
     "r": 0.894,
     "rms_cm": 2.34,
     "n": 26
    },
    {
     "id": "Q213",
     "r": 0.068,
     "rms_cm": 4.24,
     "n": 26
    }
   ],
   "basis": "radar LOS vs GPS up x cos(incidence), per date",
   "held_out": {
    "r": 0.81,
    "rms_los_cm": 1.9,
    "note": "Stations held out of the fit (5-fold), valley floor, ascending track, final date."
   }
  },
  "track": "34/20 ascending",
  "reason": null,
  "dates": [
   "20251124",
   "20261014"
  ],
  "covered_by": "OPERA DISP-S1",
  "role": "calibration",
  "span_days": 324,
  "pipeline": {
   "pairs": 25,
   "noise_cm": 2.52,
   "coherence_proxy": null
  },
  "peak_change_cm": 13.7,
  "peak_quantity": "vertical",
  "peak_location": [
   -119.3104,
   36.0601
  ],
  "peak_note": "Median within 3.2 km of Tipton; the map grid is clipped at 12 cm, so the true peak is higher.",
  "pipeline_v2": {
   "gate_passed": true,
   "gps": [
    {
     "id": "TLBN",
     "r": 0.886,
     "rms_cm": 1.91,
     "n": 26,
     "gps_range_cm": 9.84
    },
    {
     "id": "QCAP",
     "r": 0.712,
     "rms_cm": 3.03,
     "n": 26,
     "gps_range_cm": 7.73
    },
    {
     "id": "HANF",
     "r": 0.701,
     "rms_cm": 2.2,
     "n": 26,
     "gps_range_cm": 7.51
    },
    {
     "id": "P056",
     "r": 0.424,
     "rms_cm": 1.93,
     "n": 26,
     "gps_range_cm": 4.16
    }
   ],
   "note": "v2 on one track (34/20 ascending), not tied to GPS; the site layer stays the research export"
  }
 },
 {
  "id": "tehran",
  "name": "Tehran plain",
  "country": "Iran",
  "lat": 35.63,
  "lon": 51.17,
  "status": "measured",
  "literature": {
   "rate_cm_yr": 25,
   "quantity": "vertical",
   "period": "2003-2017",
   "citation": "Haghshenas Haghighi & Motagh 2019, Remote Sensing of Environment",
   "url": "https://doi.org/10.1016/j.rse.2018.11.003",
   "note": ">25 cm/yr in the western plain (Shahriar-Eslamshahr); Varamin ~22."
  },
  "location_check": "Bowl between Shahriar and Mehrabad airport, west of the city, as in the literature. Northern city outside the frame.",
  "has_site_data": true,
  "track": "136/71 descending",
  "dates": [
   "20260623",
   "20261021"
  ],
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "measured"
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.862,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.93,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.92,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 12.0,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 1.25,
   "coherence_mean": 0.522,
   "coherent_fraction": 0.862,
   "uncertainty_median_cm": 1.53,
   "runtime_s": 4,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 13.3,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   51.1745,
   35.6308
  ],
  "peak_sigma_cm": 3.65
 },
 {
  "id": "mashhad",
  "name": "Mashhad plain",
  "country": "Iran",
  "lat": 36.42,
  "lon": 59.54,
  "status": "measured",
  "literature": {
   "rate_cm_yr": 19.1,
   "quantity": "vertical",
   "period": "Oct 2014 - Feb 2017",
   "citation": "Abrishami & Perissin 2020, Scientific Reports (14.6 cm/yr LOS)",
   "url": "https://doi.org/10.1038/s41598-020-67989-1"
  },
  "location_check": "Elongated NW-SE bowl along the plain north-west of the city, as in the literature.",
  "has_site_data": true,
  "track": "78/70 descending",
  "dates": [
   "20260619",
   "20261017"
  ],
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "measured"
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.926,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 1.0,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.42,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 17.6,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.49,
   "coherence_mean": 0.594,
   "coherent_fraction": 0.926,
   "uncertainty_median_cm": 0.8,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 7.6,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   59.5496,
   36.4136
  ],
  "peak_sigma_cm": 2.5
 },
 {
  "id": "rafsanjan",
  "name": "Rafsanjan plain",
  "country": "Iran",
  "lat": 30.53,
  "lon": 55.79,
  "status": "measured",
  "literature": {
   "rate_cm_yr": 35,
   "quantity": "vertical",
   "period": "2014-2020",
   "citation": "Haghshenas Haghighi & Motagh 2024, Science Advances (locally >35; Motagh et al. 2017 give 20-30)",
   "url": "https://doi.org/10.1126/sciadv.adk3039"
  },
  "location_check": "Bowl north-west of Rafsanjan city (Bahreman / Nough plain direction), as in the literature. Reference is the city core, which may itself sink slowly, so our numbers are a lower bound. No stable-area noise estimate.",
  "has_site_data": true,
  "track": "128/17 ascending",
  "dates": [
   "20260623",
   "20261021"
  ],
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "measured"
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.963,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 1.0,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.35,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 12.1,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": null,
   "coherence_mean": 0.615,
   "coherent_fraction": 0.963,
   "uncertainty_median_cm": 0.71,
   "runtime_s": 4,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 5.5,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   55.7582,
   30.5677
  ],
  "peak_sigma_cm": 0.68
 },
 {
  "id": "konya",
  "name": "Konya",
  "country": "Turkey",
  "lat": 37.77,
  "lon": 32.61,
  "status": "measured",
  "literature": {
   "rate_cm_yr": 9.0,
   "quantity": "line of sight?",
   "period": "2014-2022",
   "citation": "Orhan et al. 2024, Geosciences 14(1):5",
   "url": "https://doi.org/10.3390/geosciences14010005",
   "note": "Subsidence concentrated in the Konya urban area."
  },
  "location_check": "Compact bowl on the southern side of the urban area. Our 120-day annualised rate is ~3x the literature: irrigation-season pumping, treat with caution.",
  "has_site_data": true,
  "track": "108/69 descending",
  "dates": [
   "20260621",
   "20261019"
  ],
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "measured"
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.532,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.809,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.5,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 16.9,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.42,
   "coherence_mean": 0.369,
   "coherent_fraction": 0.532,
   "uncertainty_median_cm": 1.26,
   "runtime_s": 4,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 19.9,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   32.6129,
   37.7743
  ],
  "peak_sigma_cm": 5.33
 },
 {
  "id": "celaya",
  "name": "Celaya",
  "country": "Mexico",
  "lat": 20.59,
  "lon": -100.78,
  "status": "measured",
  "literature": {
   "rate_cm_yr": 8.5,
   "quantity": "vertical",
   "period": "2007-2011 (ALOS)",
   "citation": "Chaussard et al. 2014, Remote Sensing of Environment",
   "url": "https://doi.org/10.1016/j.rse.2013.08.038"
  },
  "location_check": "Bowl north-east of the centre with sinking across the city; the literature puts the fastest area south and east of the centre. Our rate is higher than the 2007-2011 value. A full year on the same track as Mexico City.",
  "has_site_data": true,
  "track": "19/12 ascending",
  "dates": [
   "20251030",
   "20261013"
  ],
  "covered_by": "OPERA DISP-S1",
  "role": "calibration",
  "v1_judgement": {
   "status": "measured"
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 28,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.92,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 1.0,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.41,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 6.9,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 28,
   "noise_cm": 0.9,
   "coherence_mean": 0.568,
   "coherent_fraction": 0.92,
   "uncertainty_median_cm": 1.06,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 348,
  "gps": null,
  "peak_change_cm": 10.5,
  "peak_rate_cm_yr": 11.0,
  "peak_quantity": "los",
  "peak_location": [
   -100.7953,
   20.5799
  ],
  "peak_sigma_cm": 1.66
 },
 {
  "id": "houston",
  "name": "Houston",
  "country": "United States",
  "lat": 29.95,
  "lon": -95.6,
  "status": "refused",
  "dates": [
   "20251102",
   "20261016"
  ],
  "span_days": 348,
  "track": "62/17 ascending",
  "literature": {
   "rate_cm_yr": 3.4,
   "quantity": "vertical",
   "period": "Dec 2015 - Aug 2017",
   "citation": "Miller & Shirzaei 2019, Remote Sensing of Environment",
   "url": "https://doi.org/10.1016/j.rse.2019.03.022"
  },
  "has_site_data": false,
  "covered_by": "OPERA DISP-S1",
  "role": "covered",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "Radar moves opposite to GPS: correlation -0.78 (AULT) and -0.73 (ROD1). Sinking of 1-3 cm/yr is below what the preview images can resolve in humid air."
  },
  "reason": "Quality gate passed, but 7 GPS stations that barely moved (< 3 cm) differ from the radar by a median RMS of 1.9 cm: the map shows motion the ground did not make.",
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 27,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.938,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.735,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.5,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": null,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 10.1,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 27,
   "noise_cm": null,
   "coherence_mean": 0.578,
   "coherent_fraction": 0.938,
   "uncertainty_median_cm": 1.17,
   "runtime_s": 7,
   "transferred_mb": 0
  },
  "gps": {
   "stations": [
    {
     "id": "AULT",
     "r": -0.738,
     "rms_cm": 1.97,
     "n": 28,
     "gps_range_cm": 2.47,
     "kind": "configured"
    },
    {
     "id": "ROD1",
     "r": -0.843,
     "rms_cm": 1.96,
     "n": 28,
     "gps_range_cm": 1.84,
     "kind": "configured"
    },
    {
     "id": "CFJV",
     "r": -0.067,
     "rms_cm": 1.92,
     "n": 27,
     "gps_range_cm": 1.0,
     "kind": "ngl_auto"
    },
    {
     "id": "SESG",
     "r": -0.589,
     "rms_cm": 1.95,
     "n": 28,
     "gps_range_cm": 1.84,
     "kind": "ngl_auto"
    },
    {
     "id": "SHSG",
     "r": -0.318,
     "rms_cm": 1.18,
     "n": 28,
     "gps_range_cm": 1.84,
     "kind": "ngl_auto"
    },
    {
     "id": "TXCY",
     "r": -0.604,
     "rms_cm": 1.8,
     "n": 27,
     "gps_range_cm": 1.93,
     "kind": "ngl_auto"
    },
    {
     "id": "ZHU1",
     "r": 0.174,
     "rms_cm": 1.37,
     "n": 26,
     "gps_range_cm": 1.64,
     "kind": "ngl_auto"
    }
   ],
   "basis": "radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)",
   "moving_threshold_cm": 3.0,
   "test": {
    "stations": 7,
    "median_rms_cm": 1.92,
    "kind": "quiet stations (< 3 cm motion)",
    "agrees": false
   }
  },
  "peak_change_cm": 17.9,
  "peak_rate_cm_yr": 18.8,
  "peak_quantity": "los",
  "peak_location": [
   -95.3834,
   29.9898
  ],
  "peak_sigma_cm": 1.5,
  "refused_by": "gps"
 },
 {
  "id": "jakarta",
  "name": "Jakarta",
  "country": "Indonesia",
  "lat": -6.12,
  "lon": 106.8,
  "status": "refused",
  "dates": [
   "20260627",
   "20261013"
  ],
  "span_days": 108,
  "track": "18/92 descending",
  "literature": {
   "rate_cm_yr": 22,
   "quantity": "vertical",
   "period": "2007-2009 (ALOS)",
   "citation": "Chaussard et al. 2013, Remote Sensing of Environment",
   "url": "https://doi.org/10.1016/j.rse.2012.10.015",
   "note": "Sentinel-era peaks are lower, ~5-8 cm/yr (Wu et al. 2022, GRL)."
  },
  "has_site_data": false,
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "No bowl over North Jakarta (Muara Baru +0.4 cm in 108 days); the map is noise. Humid air and a short wet-season record."
  },
  "reason": "Automatic quality gate: temporal_noise_cm 1.25 (needs <= 1.0).",
  "gate": {
   "passed": false,
   "failed": [
    "temporal_noise_cm"
   ],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.966,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.989,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 1.25,
     "threshold": 1.0,
     "ok": false
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 6.2,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": null,
   "coherence_mean": 0.678,
   "coherent_fraction": 0.966,
   "uncertainty_median_cm": 1.8,
   "runtime_s": 1,
   "transferred_mb": 0
  },
  "gps": null,
  "refused_by": "quality_gate"
 },
 {
  "id": "bangkok",
  "name": "Bangkok",
  "country": "Thailand",
  "lat": 13.6,
  "lon": 100.6,
  "status": "unconfirmed",
  "dates": [
   "20260621",
   "20261019"
  ],
  "span_days": 120,
  "track": "112/8 ascending",
  "literature": {
   "rate_cm_yr": 3,
   "quantity": "line of sight?",
   "period": "2005-2010",
   "citation": "Aobpaet et al. 2013, International Journal of Remote Sensing",
   "url": "https://doi.org/10.1080/01431161.2012.756596",
   "note": "Low confidence in this figure."
  },
  "location_check": null,
  "location_match": null,
  "has_site_data": false,
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "No GPS agreement (CUSV r = 0.05); expected motion of 2-3 cm/yr is below the method's noise in a monsoon season."
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.748,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.955,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.58,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 4.9,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": null,
   "coherence_mean": 0.49,
   "coherent_fraction": 0.748,
   "uncertainty_median_cm": 1.04,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 6.9,
   "peak_sigma_cm_raw": 2.75,
   "peak_location_raw": [
    100.4598,
    13.6221
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": {
    "stations": [
     {
      "id": "CUSV",
      "r": 0.882,
      "rms_cm": 0.51,
      "n": 9,
      "gps_range_cm": 1.38,
      "kind": "configured"
     }
    ],
    "basis": "radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)",
    "moving_threshold_cm": 3.0
   },
   "location_check_raw": "Not published. The gate passed and CUSV agrees (r 0.88, 9 dates), but CUSV sits inside the reference disk, so the radar there is pinned near zero and the comparison does not test the map; the deepest area (-6.9 +- 2.8 cm in 120 monsoon days, SW Bangkok) is 5-10x the published 1-3 cm/yr."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but the only GPS station we could compare with sits inside our reference area, so it cannot confirm the map, and our strongest signal is 5 to 10 times faster than published rates, so we don't report a number."
 },
 {
  "id": "hcmc",
  "name": "Ho Chi Minh City",
  "country": "Vietnam",
  "lat": 10.76,
  "lon": 106.6,
  "status": "refused",
  "dates": [
   "20260617",
   "20261015"
  ],
  "span_days": 120,
  "track": "47/83 descending",
  "literature": {
   "rate_cm_yr": 5.3,
   "quantity": "line of sight?",
   "period": "2015-2018",
   "citation": "Duffy et al. 2020, Remote Sensing",
   "url": "https://doi.org/10.3390/rs12244130"
  },
  "has_site_data": false,
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "Broad, patchy pattern with holes; 9 cm in one rainy season would be ~5x the published rate, so it is most likely atmosphere, not ground motion."
  },
  "reason": "Automatic quality gate: temporal_noise_cm 1.41 (needs <= 1.0).",
  "gate": {
   "passed": false,
   "failed": [
    "temporal_noise_cm"
   ],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.72,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.994,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 1.41,
     "threshold": 1.0,
     "ok": false
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 6.9,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": null,
   "coherence_mean": 0.454,
   "coherent_fraction": 0.72,
   "uncertainty_median_cm": 2.4,
   "runtime_s": 1,
   "transferred_mb": 0
  },
  "gps": null,
  "refused_by": "quality_gate"
 },
 {
  "id": "eloy",
  "name": "Eloy basin, Arizona",
  "country": "United States",
  "lat": 32.8,
  "lon": -111.55,
  "status": "refused",
  "dates": [
   "20260619",
   "20261017"
  ],
  "span_days": 120,
  "track": "77/18 ascending",
  "literature": {
   "rate_cm_yr": null,
   "quantity": null,
   "period": null,
   "citation": "Conway 2016, Hydrogeology Journal (Arizona InSAR overview; no single peak rate taken)",
   "url": "https://doi.org/10.1007/s10040-015-1329-z"
  },
  "has_site_data": false,
  "covered_by": "OPERA DISP-S1",
  "role": "covered",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "Nothing above the noise: the four GPS stations moved less than 0.5 cm in these 120 days and the radar shows only +-2 cm noise (r between -0.80 and 0.22)."
  },
  "reason": "Automatic quality gate: temporal_noise_cm 1.51 (needs <= 1.0); signal_snr 2.8 (needs >= 3.0).",
  "gate": {
   "passed": false,
   "failed": [
    "temporal_noise_cm",
    "signal_snr"
   ],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.916,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.999,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 1.51,
     "threshold": 1.0,
     "ok": false
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 2.8,
     "threshold": 3.0,
     "ok": false
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 1.0,
   "coherence_mean": 0.539,
   "coherent_fraction": 0.916,
   "uncertainty_median_cm": 2.28,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "gps": {
   "stations": [
    {
     "id": "AZAZ",
     "r": -0.329,
     "rms_cm": 3.18,
     "n": 10,
     "gps_range_cm": 0.49,
     "kind": "configured"
    },
    {
     "id": "AZCG",
     "r": -0.163,
     "rms_cm": 3.06,
     "n": 10,
     "gps_range_cm": 0.84,
     "kind": "configured"
    },
    {
     "id": "AZMA",
     "r": 0.079,
     "rms_cm": 3.72,
     "n": 10,
     "gps_range_cm": 0.62,
     "kind": "configured"
    },
    {
     "id": "AZCD",
     "r": 0.094,
     "rms_cm": 3.95,
     "n": 10,
     "gps_range_cm": 0.63,
     "kind": "configured"
    }
   ],
   "basis": "radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)",
   "moving_threshold_cm": 3.0
  },
  "refused_by": "quality_gate"
 },
 {
  "id": "aguascalientes",
  "name": "Aguascalientes",
  "country": "Mexico",
  "lat": 21.88,
  "lon": -102.3,
  "status": "measured",
  "dates": [
   "20260622",
   "20261020"
  ],
  "span_days": 120,
  "track": "120/13 ascending",
  "literature": {
   "rate_cm_yr": 12,
   "quantity": "vertical",
   "period": "2015-2020",
   "citation": "Cigna & Tapete 2021, Remote Sensing of Environment 254:112254",
   "url": "https://doi.org/10.1016/j.rse.2020.112254"
  },
  "has_site_data": false,
  "covered_by": "OPERA DISP-S1",
  "role": "covered",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "No bowl along the city graben (centre +0.4 cm in 120 days) although ~4 cm was expected; GPS overlaps only 3 dates (UAGU, INEG data end Jul-Aug 2026)."
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.937,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.944,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.44,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 5.5,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": null,
   "coherence_mean": 0.556,
   "coherent_fraction": 0.937,
   "uncertainty_median_cm": 0.81,
   "runtime_s": 1,
   "transferred_mb": 0
  },
  "gps": null,
  "peak_change_cm": 6.2,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   -102.2626,
   22.0166
  ],
  "peak_sigma_cm": 1.4
 },
 {
  "id": "beijing",
  "name": "Beijing plain",
  "country": "China",
  "lat": 39.92,
  "lon": 116.6,
  "status": "refused",
  "dates": [
   "20260617",
   "20261015"
  ],
  "span_days": 120,
  "track": "47/68 descending",
  "literature": {
   "rate_cm_yr": 5.7,
   "quantity": "line of sight?",
   "period": "~2017-2021",
   "citation": "Sheng et al. 2023, Remote Sensing",
   "url": "https://doi.org/10.3390/rs15051199",
   "note": "Pre-2015 peaks were 10-14 cm/yr."
  },
  "has_site_data": false,
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "The deepest point is near the known Chaoyang-Tongzhou bowl, but the whole eastern half tilts and the rate is ~2.6x recent studies; in the rainy season we cannot separate it from atmosphere."
  },
  "reason": "Automatic quality gate: temporal_noise_cm 1.01 (needs <= 1.0).",
  "gate": {
   "passed": false,
   "failed": [
    "temporal_noise_cm"
   ],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.958,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.987,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 1.01,
     "threshold": 1.0,
     "ok": false
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 3.0,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.53,
   "coherence_mean": 0.568,
   "coherent_fraction": 0.958,
   "uncertainty_median_cm": 1.55,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "gps": null,
  "refused_by": "quality_gate"
 },
 {
  "id": "delhi",
  "name": "Delhi NCR",
  "country": "India",
  "lat": 28.53,
  "lon": 77.08,
  "status": "unconfirmed",
  "dates": [
   "20251121",
   "20260824"
  ],
  "span_days": 276,
  "track": "156/16 ascending",
  "literature": {
   "rate_cm_yr": 11,
   "quantity": "line of sight?",
   "period": "2014-2020",
   "citation": "Garg et al. 2022, Scientific Reports",
   "url": "https://doi.org/10.1038/s41598-021-04193-9",
   "note": "Kapashera >11; Faridabad ~3."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Southern Aravalli ridge (Bandhwari, Gurugram-Faridabad hills)",
   "lon": 77.168,
   "lat": 28.39,
   "reason": "Delhi Supergroup quartzite hills, 79 m above the plain; coherent in 19 of 19 pairs. The first choice, the Central Ridge (77.17, 28.62), lies in a strip that is incoherent or outside the frame in about half the pairs (reference coherent in 53 % of pairs, gate refused)."
  },
  "has_site_data": false,
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "Broad sinking across the western half instead of a compact bowl at Kapashera (only -2.7 cm in 9 months there); cannot tell motion from a leftover tilt."
  },
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 19,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.874,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.674,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.5,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 11.9,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 19,
   "noise_cm": 1.14,
   "coherence_mean": 0.501,
   "coherent_fraction": 0.874,
   "uncertainty_median_cm": 1.42,
   "runtime_s": 6,
   "transferred_mb": 0
  },
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 17.7,
   "peak_sigma_cm_raw": 3.1,
   "peak_location_raw": [
    76.8816,
    28.4867
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: the literature maximum is Kapashera near IGI airport (>11 cm/yr 2014-2020, Garg et al. 2022); our map reads -1.4 +- 1.1 cm there over 276 days. Our deepest area is ~20 km further W, beyond Gurugram (76.88E 28.49N), not described in that paper. Reference moved to the southern Aravalli ridge after the Central Ridge failed the reference check."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is about 20 km west of the area they describe (Kapashera, near the airport), so we don't report a number."
 },
 {
  "id": "quetta",
  "name": "Quetta valley",
  "country": "Pakistan",
  "lat": 30.2,
  "lon": 67.0,
  "status": "refused",
  "dates": [
   "20260617",
   "20261015"
  ],
  "span_days": 120,
  "track": "41/17 ascending",
  "literature": {
   "rate_cm_yr": 16,
   "quantity": "line of sight?",
   "period": "Dec 2015 - Dec 2022",
   "citation": "Kakar et al. 2024, Remote Sensing (GNSS 16.6 cm/yr)",
   "url": "https://doi.org/10.3390/rs16091521"
  },
  "has_site_data": false,
  "covered_by": null,
  "role": "gap_region",
  "v1_judgement": {
   "status": "refused",
   "refused_by": "manual_review",
   "reason": "A sinking patch shows in the city, but the strongest signal (-5.5 cm) is only ~3x the 1.9 cm noise of the mountain reference, which itself drifts; not trusted."
  },
  "reason": "Automatic quality gate: signal_snr 2.3 (needs >= 3.0).",
  "gate": {
   "passed": false,
   "failed": [
    "signal_snr"
   ],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.932,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 1.0,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.86,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 2.3,
     "threshold": 3.0,
     "ok": false
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.42,
   "coherence_mean": 0.611,
   "coherent_fraction": 0.932,
   "uncertainty_median_cm": 1.31,
   "runtime_s": 1,
   "transferred_mb": 0
  },
  "gps": null,
  "refused_by": "quality_gate"
 },
 {
  "id": "semarang",
  "name": "Semarang",
  "country": "Indonesia",
  "lat": -6.95,
  "lon": 110.47,
  "literature": {
   "rate_cm_yr": 11,
   "quantity": "vertical?",
   "period": "2015-2022",
   "citation": "Aditiya & Ito 2023, Int. J. Applied Earth Observation and Geoinformation",
   "url": "https://doi.org/10.1016/j.jag.2023.103579",
   "note": "10-12 cm/yr"
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": null,
  "role": "gap_region"
 },
 {
  "id": "bandung",
  "name": "Bandung",
  "country": "Indonesia",
  "lat": -6.97,
  "lon": 107.65,
  "literature": {
   "rate_cm_yr": 18.7,
   "quantity": "line of sight?",
   "period": "~2014-2020",
   "citation": "Rygus et al. 2023, Remote Sensing",
   "url": "https://doi.org/10.3390/rs15153776"
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": null,
  "role": "gap_region"
 },
 {
  "id": "tianjin",
  "name": "Tianjin",
  "country": "China",
  "lat": 39.13,
  "lon": 116.95,
  "literature": {
   "rate_cm_yr": 12.2,
   "quantity": "vertical?",
   "period": "2015-2020",
   "citation": "Shi et al. 2022, International Journal of Digital Earth",
   "url": "https://doi.org/10.1080/17538947.2022.2122610"
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": null,
  "role": "gap_region"
 },
 {
  "id": "kathmandu",
  "name": "Kathmandu",
  "country": "Nepal",
  "lat": 27.7,
  "lon": 85.32,
  "literature": {
   "rate_cm_yr": 20,
   "quantity": "line of sight",
   "period": "~2015-2021",
   "citation": "Huang et al. 2024, International Journal of Remote Sensing",
   "url": "https://doi.org/10.1080/01431161.2023.2283902"
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": null,
  "role": "gap_region"
 },
 {
  "id": "lagos",
  "name": "Lagos",
  "country": "Nigeria",
  "lat": 6.44,
  "lon": 3.47,
  "literature": {
   "rate_cm_yr": 8.7,
   "quantity": "line of sight?",
   "period": "2015-2019",
   "citation": "Ikuemonisan & Ozebo 2020, Geodesy and Geodynamics",
   "url": "https://doi.org/10.1016/j.geog.2019.12.006"
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": null,
  "role": "gap_region"
 },
 {
  "id": "morelia",
  "name": "Morelia",
  "country": "Mexico",
  "lat": 19.73,
  "lon": -101.2,
  "literature": {
   "rate_cm_yr": 9.0,
   "quantity": "vertical",
   "period": "2014-2021",
   "citation": "Cigna & Tapete 2022, Science of the Total Environment",
   "url": "https://doi.org/10.1016/j.scitotenv.2021.152211"
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": "OPERA DISP-S1",
  "role": "covered"
 },
 {
  "id": "queretaro",
  "name": "Queretaro",
  "country": "Mexico",
  "lat": 20.62,
  "lon": -100.42,
  "literature": {
   "rate_cm_yr": 5,
   "quantity": "vertical",
   "period": "2007-2011 (ALOS)",
   "citation": "Chaussard et al. 2014, Remote Sensing of Environment",
   "url": "https://doi.org/10.1016/j.rse.2013.08.038",
   "note": "More recent studies suggest ~1.5 cm/yr."
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": "OPERA DISP-S1",
  "role": "covered"
 },
 {
  "id": "yunlin",
  "name": "Yunlin",
  "country": "Taiwan",
  "lat": 23.68,
  "lon": 120.39,
  "literature": {
   "rate_cm_yr": 6.5,
   "quantity": "vertical?",
   "period": "2015-2021",
   "citation": "Sentinel-1 study of central Taiwan, Remote Sensing 2019",
   "url": "https://doi.org/10.3390/rs11232817",
   "note": "Low confidence in this figure (6-7 cm/yr)."
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": null,
  "role": "gap_region"
 },
 {
  "id": "isfahan",
  "name": "Isfahan",
  "country": "Iran",
  "lat": 32.75,
  "lon": 51.6,
  "literature": {
   "rate_cm_yr": 6,
   "quantity": "line of sight?",
   "period": "2014-2023",
   "citation": "Shirani & Pasandi 2025, Iranian Journal of Watershed Management Science and Engineering",
   "url": "https://doi.org/10.22092/ijwmse.2025.367922.2091",
   "note": "Low confidence in this figure."
  },
  "status": "not_processed",
  "has_site_data": false,
  "peak_rate_cm_yr": null,
  "gps": null,
  "track": null,
  "reason": null,
  "dates": null,
  "covered_by": null,
  "role": "gap_region"
 },
 {
  "id": "savojbolagh_nazarabad",
  "name": "Savojbolagh-Nazarabad plain (Alborz)",
  "country": "Iran",
  "continent": "Asia",
  "lon": 50.55,
  "lat": 35.85,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 29,
   "quantity": "vertical (LOS projected), as stated per county",
   "period": "2014-2020",
   "citation": "Haghshenas Haghighi & Motagh 2024, Science Advances 10, eadk3039",
   "url": "https://doi.org/10.1126/sciadv.adk3039",
   "note": "Stated in paper: 'Savojbolagh and Nazarabad counties exhibit substantial land subsidence, with maximum rates of 29 and 27 cm/year'. Lat/lon is our approximate county centre and needs checking against the raster. This may overlap a Tehran/Karaj entry if one exists elsewhere."
  },
  "location_check": "Consistent at county level: sinking in the Savojbolagh plain W of Hashtgerd; the paper gives county maxima, not coordinates. The frame on this track misses the NE of the box (Nazarabad and Hashtgerd towns have no data).",
  "location_match": "yes",
  "reference": {
   "name": "Bedrock ridge between the Savojbolagh and Nazarabad plains",
   "lon": 50.566,
   "lat": 35.786,
   "reason": "Catalogue had no reference. Ridge rising 86 m above the plain with 26 m local relief (GLO-90), coherent in 8 of 8 pairs, 7 km from the search point; outside the alluvial fill."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "157/19 ascending",
  "dates": [
   "20260625",
   "20261011"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.818,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.949,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.38,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 7.7,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": 0.92,
   "coherence_mean": 0.482,
   "coherent_fraction": 0.818,
   "uncertainty_median_cm": 0.84,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 108,
  "gps": null,
  "peak_change_cm": 7.3,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   50.53,
   35.9228
  ],
  "peak_sigma_cm": 1.18
 },
 {
  "id": "kerman",
  "name": "Kerman plain",
  "country": "Iran",
  "continent": "Asia",
  "lon": 57.05,
  "lat": 30.25,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 24.9,
   "quantity": "vertical (LOS projected to vertical), max pixel in box from published raster",
   "period": "2014-2020",
   "citation": "Haghshenas Haghighi, M. & Motagh, M. (2024). Uncovering the impacts of depleting aquifers: A remote sensing analysis of land subsidence in Iran. Science Advances 10, eadk3039. Dataset: doi:10.5281/zenodo.10815578",
   "url": "https://doi.org/10.1126/sciadv.adk3039",
   "note": "The Sci. Adv. 2024 paper (verified) names only Rafsanjan (37 cm/yr) and Arzuiyeh (34 cm/yr) in Kerman province, and Savojbolagh/Nazarabad (29/27 cm/yr) in Alborz. It also says Kerman, Marvdasht and Neishabur counties each have >1000 km2 subsiding. It gives no per-plain rate for this site. rate_cm_yr here is the MAXIMUM pixel of the published Zenodo raster (Sentinel-1 descending SBAS 2014-2020, LOS projected to vertical, cm/yr) inside the draft box (centre +/- half-size). We computed it from the published data; the paper does not print it. Box p99 = 13.2, p90 = 8.3 cm/yr. The max pixel is at 30.16N 57.05E, S of Kerman city. The paper names Kerman county among those with >1000 km2 subsiding. Persian-language city studies report about 9-10.6 cm/yr (2010-2017; not DOI-checked). The centre was moved slightly east (subsiding centroid 30.22N 57.06E). A well-documented neighbour is Rafsanjan: 37 cm/yr stated in the paper; Motagh et al. 2017 Eng. Geol. 218:134-151. Reference: needs review: the ranges E/SE of Kerman city (~57.15E 30.25N) are probably bedrock; verify"
  },
  "location_check": "Matches: our deepest point (57.05E 30.17N) is where the published 2014-2020 raster has its maximum (57.05E 30.16N), S of Kerman city.",
  "location_match": "yes",
  "reference": {
   "name": "Hills NE of Kerman city",
   "lon": 57.149,
   "lat": 30.32,
   "reason": "Catalogue had no reference. Hills 98 m above the plain with 55 m local relief (GLO-90) NE of the city, coherent in 9 of 9 pairs."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "78/73 descending",
  "dates": [
   "20260619",
   "20261017"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.997,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 1.0,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.54,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 9.2,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.23,
   "coherence_mean": 0.751,
   "coherent_fraction": 0.997,
   "uncertainty_median_cm": 0.83,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 5.9,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   57.0512,
   30.1695
  ],
  "peak_sigma_cm": 0.67
 },
 {
  "id": "neyshabur",
  "name": "Neyshabur plain",
  "country": "Iran",
  "continent": "Asia",
  "lon": 58.8,
  "lat": 36.2,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 21,
   "quantity": "vertical? (abstract: 'maximum LS rate 21 +/- 2 cm per year', Sentinel-1)",
   "period": "2014-2020",
   "citation": "Sorkhabi, O.M. (2025). Fusion of multi-source data and artificial intelligence for land subsidence evaluation. Environment, Development and Sustainability.",
   "url": "https://doi.org/10.1007/s10668-025-06518-4",
   "note": "Same paper: GPS trend -8 cm/yr, levelling max -15 cm/yr. Cross-check against the national raster (Haghshenas Haghighi & Motagh 2024, Sentinel-1 2014-2020, vertical): max 15.7 cm/yr and p99 12.1 cm/yr in the draft box. Older Envisat InSAR gave up to 19 cm/yr. A realistic range is 15-21 cm/yr, so the draft's 20 is plausible. The centre is correct (centroid of subsiding pixels: 36.15N 58.76E)."
  },
  "location_check": "Partly: the frame on this track covers only the W of the plain; the literature centroid (58.76E 36.15N) reads -1.6 cm and Neyshabur city is outside the frame. Our deepest area is in the SW plain (58.61E 36.00N).",
  "location_match": "partial",
  "reference": {
   "name": "Binalud foothills NW of Neyshabur",
   "lon": 58.702,
   "lat": 36.356,
   "reason": "Proposed point (58.80, 36.40) lies outside the radar frame on this track (coherent in 0 of 9 pairs). Moved 11 km WSW to Binalud range-front bedrock 225 m above the plain (69 m local relief), coherent in 9 of 9 pairs."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "99/20 ascending",
  "dates": [
   "20260621",
   "20261019"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.952,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.963,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.41,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 6.5,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.25,
   "coherence_mean": 0.554,
   "coherent_fraction": 0.952,
   "uncertainty_median_cm": 0.8,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 4.6,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   58.6086,
   36.0028
  ],
  "peak_sigma_cm": 0.78
 },
 {
  "id": "marvdasht",
  "name": "Marvdasht plain (Shiraz)",
  "country": "Iran",
  "continent": "Asia",
  "lon": 52.8,
  "lat": 29.9,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 19.6,
   "quantity": "vertical (LOS projected to vertical), max pixel in box from published raster",
   "period": "2014-2020",
   "citation": "Haghshenas Haghighi, M. & Motagh, M. (2024). Uncovering the impacts of depleting aquifers: A remote sensing analysis of land subsidence in Iran. Science Advances 10, eadk3039. Dataset: doi:10.5281/zenodo.10815578",
   "url": "https://doi.org/10.1126/sciadv.adk3039",
   "note": "The Sci. Adv. 2024 paper (verified) names only Rafsanjan (37 cm/yr) and Arzuiyeh (34 cm/yr) in Kerman province, and Savojbolagh/Nazarabad (29/27 cm/yr) in Alborz. It also says Kerman, Marvdasht and Neishabur counties each have >1000 km2 subsiding. It gives no per-plain rate for this site. rate_cm_yr here is the MAXIMUM pixel of the published Zenodo raster (Sentinel-1 descending SBAS 2014-2020, LOS projected to vertical, cm/yr) inside the draft box (centre +/- half-size). We computed it from the published data; the paper does not print it. Box p99 = 15.8, p90 = 11.9 cm/yr; max pixel at 29.85N 52.88E. The paper lists Marvdasht county among those with >1000 km2 subsiding. A Persian-language LiCSBAS study (Water & Soil Science 2024, Marvdasht-Kharameh, 2015-2022) reports 11.6 cm/yr (not DOI-checked). The draft's 10 cm/yr is low. The centre is correct."
  },
  "location_check": "Partly: sinking across the Marvdasht plain as published; at the raster maximum (52.88E 29.85N, at the frame edge) we read -4.8 cm. Our deepest area is ~40 km NW (52.63E 30.19N, towards Ramjerd), which the cited sources do not single out.",
  "location_match": "partial",
  "reference": {
   "name": "Kuh-e Rahmat (Persepolis)",
   "lon": 52.9,
   "lat": 29.94,
   "reason": "Proposed limestone range E of the plain kept: 180 m above the plain, coherent in 9 of 9 pairs, cumulative change +0.8 cm relative to the scene's non-moving cells."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "107/73 descending",
  "dates": [
   "20260621",
   "20261019"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.963,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.947,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.52,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 18.3,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.65,
   "coherence_mean": 0.691,
   "coherent_fraction": 0.963,
   "uncertainty_median_cm": 0.86,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 20.5,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   52.627,
   30.1903
  ],
  "peak_sigma_cm": 1.09
 },
 {
  "id": "kashmar",
  "name": "Kashmar plain",
  "country": "Iran",
  "continent": "Asia",
  "lon": 58.43,
  "lat": 35.2,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 19.3,
   "quantity": "vertical (LOS projected to vertical), max pixel in box from published raster",
   "period": "2014-2020",
   "citation": "Haghshenas Haghighi, M. & Motagh, M. (2024). Uncovering the impacts of depleting aquifers: A remote sensing analysis of land subsidence in Iran. Science Advances 10, eadk3039. Dataset: doi:10.5281/zenodo.10815578",
   "url": "https://doi.org/10.1126/sciadv.adk3039",
   "note": "The Sci. Adv. 2024 paper (verified) names only Rafsanjan (37 cm/yr) and Arzuiyeh (34 cm/yr) in Kerman province, and Savojbolagh/Nazarabad (29/27 cm/yr) in Alborz. It also says Kerman, Marvdasht and Neishabur counties each have >1000 km2 subsiding. It gives no per-plain rate for this site. rate_cm_yr here is the MAXIMUM pixel of the published Zenodo raster (Sentinel-1 descending SBAS 2014-2020, LOS projected to vertical, cm/yr) inside the draft box (centre +/- half-size). We computed it from the published data; the paper does not print it. Box p99 = 15.6, p90 = 11.8 cm/yr. Older plain-specific peer-reviewed source: Anderssohn et al. 2008, GJI 174:287-294, doi 10.1111/j.1365-246x.2008.03805.x (verified): 'Geodetically determined subsidence rates in the Kashmar Valley exceed 15-30 cm yr-1' (Envisat InSAR + levelling). A Persian-language Sentinel-1 study (Kohbanani et al. 2019, Desert Management) gives max 17 cm/yr for 2014-2018 (not DOI-checked). Reference: needs review: the mountain front N of Kashmar (~58.45E 35.38N) is likely bedrock; verify on a DEM or geology map"
  },
  "location_check": "Consistent: an E-W band of sinking along the Kashmar-Bardaskan valley, as in Anderssohn et al. 2008; deepest at the W end of the box (58.09E 35.28N, towards Bardaskan), so the maximum may lie outside it.",
  "location_match": "yes",
  "reference": {
   "name": "Hills S of the Kashmar plain",
   "lon": 58.475,
   "lat": 35.13,
   "reason": "Catalogue had no reference. Nearest bedrock-like cell to the search point: 231 m above the plain with local relief, coherent in 9 of 9 pairs, 9 km from the search point."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "99/19 ascending",
  "dates": [
   "20260621",
   "20261019"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.94,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 1.0,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.28,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 12.0,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.19,
   "coherence_mean": 0.629,
   "coherent_fraction": 0.94,
   "uncertainty_median_cm": 0.6,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 6.6,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   58.0934,
   35.2814
  ],
  "peak_sigma_cm": 0.64
 },
 {
  "id": "yazd_ardakan_iran",
  "name": "Yazd-Ardakan plain",
  "country": "Iran",
  "continent": "Asia",
  "lon": 54.2,
  "lat": 32.0,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 15.0,
   "quantity": "vertical? (InSAR time series; abstract: 'rates up to 15 cm/yr')",
   "period": "2003-2020",
   "citation": "Mirzadeh, S.M.J., Jin, S., Parizi, E., Chaussard, E., Burgmann, R., Delgado Blasco, J.M., Amani, M., Bao, H., Mirzadeh, S.H. (2021). Characterization of Irreversible Land Subsidence in the Yazd-Ardakan Plain, Iran From 2003 to 2020 InSAR Time Series. Journal of Geophysical Research: Solid Earth 126(11), e2021JB022258. https://doi.org/10.1029/2021JB022258",
   "url": "https://doi.org/10.1029/2021JB022258",
   "note": "NW-SE elongated 234 km2 subsidence zone threatening Yazd international airport, railway and roads; inelastic compaction dominates; 18 m groundwater drop 1974-2018. Desert climate, excellent coherence expected. Centre approximate between Yazd and Ardakan; refine from paper maps."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Shirkuh massif northern foothills",
   "lon": 54.1,
   "lat": 31.75,
   "reason": "Proposed granitic foothills kept: 1170 m above the plain, coherent in 7 of 7 chain pairs; on the southern edge of the box (inside the processed subset)."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260717",
   "20261021"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 7,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.797,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 1.0,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.27,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 6.1,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 7,
   "noise_cm": 0.2,
   "coherence_mean": 0.489,
   "coherent_fraction": 0.797,
   "uncertainty_median_cm": 0.73,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 96,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 3.9,
   "peak_sigma_cm_raw": 1.17,
   "peak_location_raw": [
    54.0385,
    31.764
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: the documented NW-SE zone near Yazd airport (Mirzadeh et al. 2021) reads about 0 cm in these 96 days. The deepest value is a single cell at the S edge of the box, 6 km from the reference; treat it as noise."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is a single spot at the edge of the map, next to our reference area, so we don't report a number."
 },
 {
  "id": "kucuk_menderes_odemis_bayindir_turkey",
  "name": "Kucuk Menderes graben (Odemis-Bayindir)",
  "country": "Turkey",
  "continent": "Asia",
  "lon": 27.8,
  "lat": 38.22,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 16.5,
   "quantity": "vertical? (InSAR-SBAS with GNSS campaigns used for LOS-to-vertical conversion; stated 'up to -165 mm/year')",
   "period": "2017-2022",
   "citation": "Yalvac, S., Alemdag, S., Zeybek, H.I., Yalvac, M. (2023). Excessive groundwater withdrawal and resultant land subsidence in the Kucuk Menderes River Basin, Turkey as estimated from InSAR-SBAS and GNSS measurements. Advances in Space Research 72(10), 4282-4297. https://doi.org/10.1016/j.asr.2023.08.001",
   "url": "https://doi.org/10.1016/j.asr.2023.08.001",
   "note": "Max subsidence at Bayindir and Odemis district centres; historical groundwater level drops up to 150 m. Climate is Mediterranean (Csa) with dry summers, borderline semi-arid; irrigated crops may reduce summer coherence. Abstract read via institutional repository only (paywalled). Imamoglu et al. 2022 reported up to 29 cm/yr at Odemis (2015-2018)."
  },
  "location_check": "Matches: two bowls, one ~5 km SW of Bayindir (27.60E 38.18N, deepest) and one W of Odemis (27.9E 38.2N), the two district centres named in the literature.",
  "location_match": "yes",
  "reference": {
   "name": "Bozdag horst (Menderes Massif metamorphics)",
   "lon": 27.85,
   "lat": 38.32,
   "reason": "Proposed crystalline-basement horst N of the graben kept: 674 m above the plain, 124 m local relief, coherent in 9 of 9 pairs, cumulative change 0.0 cm relative to the scene's non-moving cells."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "129/21 ascending",
  "dates": [
   "20260623",
   "20261021"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.976,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.999,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.49,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 11.2,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.88,
   "coherence_mean": 0.685,
   "coherent_fraction": 0.976,
   "uncertainty_median_cm": 0.79,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 12.6,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   27.5958,
   38.1762
  ],
  "peak_sigma_cm": 2.75
 },
 {
  "id": "hengshui",
  "name": "Hengshui (North China Plain)",
  "country": "China",
  "continent": "Asia",
  "lon": 115.7,
  "lat": 37.73,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 14.1,
   "quantity": "vertical? (TS-InSAR Sentinel-1A; not stated)",
   "period": "2017-2024",
   "citation": "An, Y., Shen, Q., Shum, C.K., Gao, F., Zhang, X., Jiang, L., Wang, H. (2025). TS-InSAR assessment of groundwater overexploitation-land subsidence linkage: Hengshui case study. Journal of Hydrology: Regional Studies 60, 102489.",
   "url": "https://doi.org/10.1016/j.ejrh.2025.102489",
   "note": "Abstract: rates up to 141 mm/year (2017-2024). Consistent with Li et al. 2023, Land 12, 1684 (doi:10.3390/land12091684, verified): RADARSAT-2 2011-2022, max >11 cm/yr after 2017, rates increased after 2019. Draft 8 cm/yr is too low. Reference: needs review: no bedrock nearby (North China Plain)"
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Plain W of Hengshui (no bedrock in the box)",
   "lon": 115.53,
   "lat": 37.74,
   "reason": "North China Plain: no bedrock within reach. Chosen by rule: coherent in 9 of 9 pairs, change within 0.5 cm of the scene's non-moving cells, epoch noise below the scene median, >= 5 km from any cell sinking > 2 cm and >= 15 km from the literature funnel centre (Hengshui city). The plain itself may sink slowly, so values are relative to it."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260617",
   "20261015"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.879,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.979,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.73,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 4.5,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 1.36,
   "coherence_mean": 0.512,
   "coherent_fraction": 0.879,
   "uncertainty_median_cm": 1.41,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 7.3,
   "peak_sigma_cm_raw": 2.01,
   "peak_location_raw": [
    115.5787,
    37.6302
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: Hengshui city, the literature funnel, reads +1.2 cm; the deepest value is on the shore of Hengshui Lake (115.58E 37.63N), likely water-margin noise."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is on the shore of Hengshui Lake, where water makes radar readings unreliable, so we don't report a number."
 },
 {
  "id": "xian",
  "name": "Xi'an",
  "country": "China",
  "continent": "Asia",
  "lon": 108.95,
  "lat": 34.3,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 14.6,
   "quantity": "vertical (asc/desc decomposition)",
   "period": "2015-2019",
   "citation": "Qu, F., Zhang, Q., Niu, Y., Lu, Z., Wang, S., Zhao, C., Zhu, W., Qu, W., Yang, C. (2022). Mapping the Recent Vertical Crustal Deformation of the Weihe Basin (China) Using Sentinel-1 and ALOS-2 ScanSAR Imagery. Remote Sensing 14(13), 3182.",
   "url": "https://doi.org/10.3390/rs14133182",
   "note": "Abstract: subsidence and uplift maxima over Xi'an of about -146 and +20 mm/y. This is a local maximum; much of central Xi'an is rebounding (Wang et al. 2019, Remote Sensing 11, 2854: City Wall uplift up to 12 mm/yr 2015-2019). Typical subsidence is much lower than the max."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Qinling range front S of Xi'an",
   "lon": 108.95,
   "lat": 34.05,
   "reason": "Proposed point kept (catalogue already moved it ~3 km S of the range-front fault): 127 m above the plain, coherent in 9 of 9 pairs, change -0.2 cm; on the southern box edge, inside the processed subset. Epoch noise there (0.71 cm) is higher than on the loess tableland, which we did not use because loess is not bedrock."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260620",
   "20261018"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.964,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.998,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.81,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 4.0,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.84,
   "coherence_mean": 0.586,
   "coherent_fraction": 0.964,
   "uncertainty_median_cm": 1.26,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 4.7,
   "peak_sigma_cm_raw": 1.52,
   "peak_location_raw": [
    109.2308,
    34.2583
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: no bowl. Known areas (e.g. 108.85E 34.20N) read within +-0.5 cm; the deepest value is a single cell E of the city. The gate passed on signal_snr 4.0, close to its threshold."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; we see no clear sinking area at all, so we don't report a number."
 },
 {
  "id": "ghazni_afghanistan",
  "name": "Ghazni agricultural plain",
  "country": "Afghanistan",
  "continent": "Asia",
  "lon": 68.42,
  "lat": 33.5,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 11.1,
   "quantity": "vertical? (derived: 7-year total of 77.8 +/- 0.5 cm divided by 7 yr; abstract also says >~5 cm/yr and accelerating since 2018)",
   "period": "2015-2022",
   "citation": "Kakar, N., Metzger, S., Schone, T., Motagh, M., Waizy, H., Nasrat, N.A., et al. (2025). Interferometric Radar Satellite and In-Situ Well Time-Series Reveal Groundwater Extraction Rate Changes in Urban and Rural Afghanistan. Water Resources Research 61, e2023WR036626. https://doi.org/10.1029/2023WR036626",
   "url": "https://doi.org/10.1029/2023WR036626",
   "note": "11.1 cm/yr is our average from the stated 7-yr cumulative total, not a rate stated by the authors; recent rate is higher (acceleration since 2018, electric/solar pumping, km-long desiccation cracks). Kabul already catalogued. Lat/lon approximate: locate the bowl in GFZ dataset doi:10.5880/GFZ.1.2.2024.001. Same paper flags Helmand, Farah, Baghlan, Kunduz >5 cm/yr. Reference point: null, needs review."
  },
  "location_check": "Plausible, not confirmed: clear bowls in the irrigated plain SE of Ghazni city (68.52E 33.38N); the literature location is approximate (Kakar et al. 2025 dataset not checked).",
  "location_match": "plausible",
  "reference": {
   "name": "Hills W of Ghazni",
   "lon": 68.358,
   "lat": 33.517,
   "reason": "Catalogue had no reference. Nearest bedrock-like cell to the search point: 137 m above the plain with local relief, coherent in 7 of 7 pairs."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "113/18 ascending",
  "dates": [
   "20260622",
   "20261020"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 7,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.929,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.97,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.58,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 9.7,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 7,
   "noise_cm": 0.32,
   "coherence_mean": 0.559,
   "coherent_fraction": 0.929,
   "uncertainty_median_cm": 1.0,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": 10.6,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   68.5196,
   33.3828
  ],
  "peak_sigma_cm": 1.2
 },
 {
  "id": "lahore_pakistan",
  "name": "Lahore city centre",
  "country": "Pakistan",
  "continent": "Asia",
  "lon": 74.34,
  "lat": 31.55,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 10.6,
   "quantity": "line of sight (annual mean subsidence rising from -2.7 to -10.6 cm/yr; period average -2.0 cm/yr; Sentinel-1 ascending PS-InSAR)",
   "period": "2017-2020",
   "citation": "Sajjad, M.M., Wang, J., Afzal, Z., Hussain, S., Siddique, A., Khan, R., Ali, M., Iqbal, J. (2023). Assessing the Impacts of Groundwater Depletion and Aquifer Degradation on Land Subsidence in Lahore, Pakistan: A PS-InSAR Approach for Sustainable Urban Development. Remote Sensing 15(22), 5418. https://doi.org/10.3390/rs15225418",
   "url": "https://doi.org/10.3390/rs15225418",
   "note": "Groundwater level decline ~0.49 m/yr (2003-2020); max in the city centre. 10.6 cm/yr is the end-of-period annual figure, not a multi-year mean. Monsoon (Jul-Sep) humid, otherwise semi-arid (BSh). Reference point: null, needs review."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Plain NW of Lahore (no bedrock in the box)",
   "lon": 74.241,
   "lat": 31.656,
   "reason": "Indus plain: no bedrock. Every cell of the box is coherent in at most 4 of the 5 pairs (one monsoon pair), so no reference can reach more than 80 %. Chosen by the flat-plain rule, >= 15 km from the city centre where the literature puts the maximum."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260810",
   "20261009"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 5,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.804,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.804,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.87,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 0.8,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 9.8,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 5,
   "noise_cm": 1.72,
   "coherence_mean": 0.497,
   "coherent_fraction": 0.804,
   "uncertainty_median_cm": 1.33,
   "runtime_s": 1,
   "transferred_mb": 0
  },
  "span_days": 60,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 7.6,
   "peak_sigma_cm_raw": 1.21,
   "peak_location_raw": [
    74.4928,
    31.3011
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: 60-day record, reference coherent in exactly 4 of 5 pairs. The city centre, where the literature puts the maximum, reads +0.8 cm; the deepest value is on the S edge of the box."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; the record is only 60 days long and our strongest signal is at the edge of the map, so we don't report a number."
 },
 {
  "id": "arak_plain_iran",
  "name": "Arak plain (Mighan Playa margin)",
  "country": "Iran",
  "continent": "Asia",
  "lon": 49.8,
  "lat": 34.12,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 9.0,
   "quantity": "line of sight? (Sentinel-1 DInSAR; highest annual subsidence 9 cm/yr in 2020; ~5.5 cm/yr over most of the plain in 2021)",
   "period": "2016-2021 (9 cm/yr refers to 2020)",
   "citation": "Shahkarami, N. (2024). Temporal Analysis of Land Subsidence and Groundwater Depletion Using the DInSAR and Kriging Methods: A Case Study and Insights. Journal of Hydrologic Engineering 29(3), 04024011. https://doi.org/10.1061/JHYEFF.HEENG-6130",
   "url": "https://doi.org/10.1061/JHYEFF.HEENG-6130",
   "note": "Max subsidence S/SW of Mighan Playa. Single-author conventional DInSAR study (SNAP); per-year snapshots rather than a time-series velocity. Centre approximate."
  },
  "location_check": "Consistent: deepest area just N of Arak city, SW of the Mighan playa (49.68E 34.15N), where Shahkarami 2024 puts the maximum.",
  "location_match": "yes",
  "reference": {
   "name": "Hills S of Arak city",
   "lon": 49.7,
   "lat": 34.03,
   "reason": "Proposed bedrock ridge kept: 593 m above the plain, 115 m local relief, coherent in 8 of 8 pairs, change +0.3 cm."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "157/19 ascending",
  "dates": [
   "20260625",
   "20261011"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.834,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.998,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.28,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 8.0,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": 0.83,
   "coherence_mean": 0.507,
   "coherent_fraction": 0.834,
   "uncertainty_median_cm": 0.74,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 108,
  "gps": null,
  "peak_change_cm": 7.6,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   49.6789,
   34.1516
  ],
  "peak_sigma_cm": 2.0
 },
 {
  "id": "damghan",
  "name": "Damghan plain",
  "country": "Iran",
  "continent": "Asia",
  "lon": 54.45,
  "lat": 36.15,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 9.0,
   "quantity": "vertical (LOS projected to vertical), max pixel in box from published raster",
   "period": "2014-2020",
   "citation": "Haghshenas Haghighi, M. & Motagh, M. (2024). Uncovering the impacts of depleting aquifers: A remote sensing analysis of land subsidence in Iran. Science Advances 10, eadk3039. Dataset: doi:10.5281/zenodo.10815578",
   "url": "https://doi.org/10.1126/sciadv.adk3039",
   "note": "The Sci. Adv. 2024 paper (verified) names only Rafsanjan (37 cm/yr) and Arzuiyeh (34 cm/yr) in Kerman province, and Savojbolagh/Nazarabad (29/27 cm/yr) in Alborz. It also says Kerman, Marvdasht and Neishabur counties each have >1000 km2 subsiding. It gives no per-plain rate for this site. rate_cm_yr here is the MAXIMUM pixel of the published Zenodo raster (Sentinel-1 descending SBAS 2014-2020, LOS projected to vertical, cm/yr) inside the draft box (centre +/- half-size). We computed it from the published data; the paper does not print it. Box p99 = 6.8, p90 = 4.7 cm/yr; max pixel at 36.22N 54.58E. The subsiding centroid is 36.16N 54.46E, so the centre was shifted east. A 2026 Persian/English J. Eng. Geol. paper (Ghadami et al.) reports subsidence of up to 32 cm (cumulative; wording ambiguous; not verified). Reference: needs review: the Alborz foothills N of Damghan (~54.35E 36.30N) are probably bedrock; verify"
  },
  "location_check": "Matches: our deepest point (54.56E 36.21N) is where the published 2014-2020 raster has its maximum (54.58E 36.22N).",
  "location_match": "yes",
  "reference": {
   "name": "Alborz foothills N of the Damghan plain",
   "lon": 54.417,
   "lat": 36.248,
   "reason": "Catalogue had no reference. Nearest bedrock-like cell to the search point: 141 m above the plain, coherent in 7 of 7 chain pairs."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "128/20 ascending",
  "dates": [
   "20260717",
   "20261021"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 7,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.971,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.956,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.52,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 7.0,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 7,
   "noise_cm": 0.25,
   "coherence_mean": 0.619,
   "coherent_fraction": 0.971,
   "uncertainty_median_cm": 0.87,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 96,
  "gps": null,
  "peak_change_cm": 3.5,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   54.5567,
   36.2056
  ],
  "peak_sigma_cm": 0.51
 },
 {
  "id": "karapinar_turkey",
  "name": "Karapinar basin (Konya Closed Basin)",
  "country": "Turkey",
  "continent": "Asia",
  "lon": 33.55,
  "lat": 37.72,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 7.0,
   "quantity": "vertical? (InSAR subsidence velocity; abstract says 'rates exceeding 70 mm/yr', continuous GNSS station agrees)",
   "period": "2014-2018 (Sentinel-1); 2016-2017 (COSMO-SkyMed)",
   "citation": "Orhan, O., Oliver-Cabrera, T., Wdowinski, S., Yalvac, S., Yakar, M. (2021). Land Subsidence and Its Relations with Sinkhole Activity in Karapinar Region, Turkey: A Multi-Sensor InSAR Time Series Study. Sensors 21(3), 774. https://doi.org/10.3390/s21030774",
   "url": "https://doi.org/10.3390/s21030774",
   "note": "Agricultural groundwater overdraft since early 2000s; sinkholes occur in slower-subsiding areas. Distinct from Konya city (already catalogued), ~95 km ESE. Rate is a lower bound ('exceeding'). Centre placed on Karapinar town/plain; refine to the subsidence bowl from the paper figures. Reference point: null, needs review."
  },
  "location_check": "Partly: 60-day record; sinking in the farmed plain ~18 km SW of Karapinar town (33.39E 37.61N); the town reads -1.2 cm. The paper places subsidence on the agricultural plain without coordinates we could check.",
  "location_match": "partial",
  "reference": {
   "name": "Karapinar volcanic hills",
   "lon": 33.549,
   "lat": 37.697,
   "reason": "Catalogue had no reference. Nearest elevated cell with relief (Karapinar volcanic field), 51 m above the plain, coherent in all chain pairs, 3 km from the search point."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "7/69 descending",
  "dates": [
   "20260813",
   "20261012"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 5,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.479,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.882,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.51,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 7.8,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 5,
   "noise_cm": 0.56,
   "coherence_mean": 0.347,
   "coherent_fraction": 0.479,
   "uncertainty_median_cm": 1.27,
   "runtime_s": 1,
   "transferred_mb": 0
  },
  "span_days": 60,
  "gps": null,
  "peak_change_cm": 8.4,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   33.3934,
   37.6115
  ],
  "peak_sigma_cm": 1.29
 },
 {
  "id": "karachi",
  "name": "Karachi",
  "country": "Pakistan",
  "continent": "Asia",
  "lon": 67.1,
  "lat": 24.9,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 6.8,
   "quantity": "vertical (LOS decomposed; extreme pixel range)",
   "period": "Nov 2019 - Dec 2020",
   "citation": "Hussain, M.A., Chen, Z., Shoaib, M., Shah, S.U., Khan, J., Ying, Z. (2022). Sentinel-1A for monitoring land subsidence of coastal city of Pakistan using Persistent Scatterers In-SAR technique. Scientific Reports 12, 5294.",
   "url": "https://doi.org/10.1038/s41598-022-09359-7",
   "note": "Abstract: LOS -68.91 to 76.06 mm/yr; vertical -67.66 to 74.68 mm/yr; highest in city centre. Only ~13 months of data and symmetric +/- extremes suggest noise; treat 6.8 cm/yr as an upper bound. Longer record: Kanwal, Ding, Zhang (2018) IGARSS 'Measurement of Vertical Deformation in Karachi Using Multi-Temporal InSAR' doi:10.1109/IGARSS.2018.8518223 (DOI verified) reports up to ~15 mm/yr (2004-2016, per search snippet). A typical value ~1.5 cm/yr is more defensible."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Manghopir / Orangi hills",
   "lon": 67.0,
   "lat": 25.0,
   "reason": "Proposed point kept: coherent in 8 of 8 pairs, change +0.2 cm, 48 m above the coastal plain but only 5 m local relief at 90 m DEM resolution; the hills proper are further NW."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260624",
   "20261010"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.869,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.939,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.52,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 7.7,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": 0.54,
   "coherence_mean": 0.558,
   "coherent_fraction": 0.869,
   "uncertainty_median_cm": 0.94,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 108,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 5.8,
   "peak_sigma_cm_raw": 0.93,
   "peak_location_raw": [
    67.0298,
    25.0306
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: the literature reports the highest rates in the city centre (which reads -0.8 cm) and treats them as near noise; our deepest value is a single cell 4 km from the reference."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is a single spot next to our reference area, so we don't report a number."
 },
 {
  "id": "qazvin_plain_iran",
  "name": "Qazvin plain (Takestan-Buin Zahra)",
  "country": "Iran",
  "continent": "Asia",
  "lon": 49.95,
  "lat": 35.95,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 6.5,
   "quantity": "line of sight (average rate, Sentinel-1 ascending+descending; ENVISAT 2003-2006 gave 4.0 cm/yr average, 5.0 cm/yr max LOS)",
   "period": "2014-2016",
   "citation": "Babaee, S., Mousavi, Z., Masoumi, Z., Malekshah, A.H., Roostaei, M., Aflaki, M. (2020). Land subsidence from interferometric SAR and groundwater patterns in the Qazvin plain, Iran. International Journal of Remote Sensing 41(12), 4780-4798. https://doi.org/10.1080/01431161.2020.1724345",
   "url": "https://doi.org/10.1080/01431161.2020.1724345",
   "note": "~17 m groundwater decline 2001-2011; growing NW-SE subsidence pattern inside the plain. Later Persian-language studies cite up to 14 cm/yr vertical. Centre approximate (between Takestan and Buin Zahra)."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Hills on the SW rim of the Qazvin plain",
   "lon": 49.776,
   "lat": 35.736,
   "reason": "Proposed Alborz point (50.05, 36.35) lies 15 km N of the box, outside the processed subset. Nearest coherent bedrock-like cells inside: 324 m above the plain, coherent in 8 of 8 pairs, change -0.2 cm; 28 km from the search point."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260625",
   "20261011"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.888,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.932,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.44,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 6.3,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": 0.97,
   "coherence_mean": 0.492,
   "coherent_fraction": 0.888,
   "uncertainty_median_cm": 0.91,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 108,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 7.6,
   "peak_sigma_cm_raw": 2.27,
   "peak_location_raw": [
    49.6557,
    35.7162
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: the published NW-SE zone between Takestan and Buin Zahra reads -0.4 to +4 cm (Takestan +4 cm). The deepest value is one jump in the first pair near the SW rim, 11 km from the reference."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is a single sudden jump at the edge of the plain, so we don't report a number."
 },
 {
  "id": "dead_sea",
  "name": "Dead Sea shoreline (sinkholes)",
  "country": "Jordan / Israel",
  "continent": "Asia",
  "lon": 35.45,
  "lat": 31.3,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 50,
   "quantity": "line of sight? (COSMO-SkyMed X-band; localised sinkhole sites)",
   "period": "2012-2015",
   "citation": "Shviro, M., Haviv, I., Baer, G. (2017). High-resolution InSAR constraints on flood-related subsidence and evaporite dissolution along the Dead Sea shores: Interplay between hydrology and rheology. Geomorphology 293, 53-68.",
   "url": "https://doi.org/10.1016/j.geomorph.2017.04.033",
   "note": "From indexed abstract text: 'maximum rates of ~2.5 mm/day, accumulating in specific sites to 500 mm/year' (21 sinkhole sites on the Israeli shore). These are very local peaks, at about 100 m scale. Broader shoreline rates from ERS (Baer et al. 2002, GSA Bull.) were 0-20 mm/yr, with two regions above 60 mm/yr. A 100 m NISAR product will show much lower values; consider also recording a typical 1-2 cm/yr."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Moab escarpment (Jordan side)",
   "lon": 35.62,
   "lat": 31.28,
   "reason": "Proposed bedrock escarpment kept: 875 m above the shoreline, 103 m local relief, coherent in 8 of 8 pairs, change +0.5 cm."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260626",
   "20261012"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.974,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.981,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.79,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 8.6,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": 0.47,
   "coherence_mean": 0.72,
   "coherent_fraction": 0.974,
   "uncertainty_median_cm": 1.18,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 108,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 11.8,
   "peak_sigma_cm_raw": 1.82,
   "peak_location_raw": [
    35.4992,
    31.0833
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": {
    "stations": [
     {
      "id": "TMAR",
      "r": -0.112,
      "rms_cm": 2.41,
      "n": 7,
      "gps_range_cm": 0.45,
      "kind": "configured"
     }
    ],
    "basis": "radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)",
    "moving_threshold_cm": 3.0
   },
   "location_check_raw": "Does not match: the literature peaks are 100 m sinkhole sites on the Israeli shore; our deepest area is in the southern evaporation ponds (35.50E 31.08N), a water margin. GPS TMAR (7 common dates) moved 0.45 cm while the radar differs from it by 2.4 cm RMS."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is in the salt evaporation ponds, where water makes radar readings unreliable, so we don't report a number."
 },
 {
  "id": "salar_de_olaroz_ar",
  "name": "Salar de Olaroz lithium brine well fields (Puna de Jujuy)",
  "country": "Argentina",
  "continent": "South America",
  "lon": -66.74,
  "lat": -23.47,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 5.0,
   "quantity": "vertical (Sentinel-1 SBAS via ASF HyP3/Vertex; max annual rate -5 cm/yr, cumulative -17 cm)",
   "period": "2018-2020",
   "citation": "Lenardón, M., Farías, C. A., Seppi, S. A., Carignano, C. A. (2023). Terrain Subsidence in the Salar de Olaroz (Jujuy, Argentina) Caused by Lithiferous Brine Extraction, Detected by Multi-Temporal SAR Interferometry. 2023 XX Workshop on Information Processing and Control (RPIC), pp. 1-6.",
   "url": "https://doi.org/10.1109/RPIC59053.2023.10530767",
   "note": "Hyper-arid high-altitude salar, so L-band coherence should be very good. The abstract gives cumulative change of +12 to -17 cm and an annual rate of +4 to -5 cm/yr. The maximum subsidence always coincides with the borehole fields. Results were checked against a control point on the salar and an IGN geodetic point, both showing zero change. This is an IEEE conference paper, not a journal article. The centre is approximate (pumping fields on the salar near the Olaroz lithium plant) and should be checked against the paper's map. The pumped fluid is brine, not freshwater, and growing salt crust can cause natural uplift."
  },
  "location_check": "Partly: the literature ties the maximum to the brine borehole fields; the Olaroz centre is masked on the salar crust; our deepest area is on the S salar (66.74W 23.66S, towards the Cauchari well fields). Record Nov 2025 - Jun 2026.",
  "location_match": "partial",
  "reference": {
   "name": "Bedrock hills W of the Olaroz salar",
   "lon": -66.811,
   "lat": -23.508,
   "reason": "Catalogue had no reference. Hills 454 m above the salar floor with 65 m local relief, coherent in all chain pairs, change +0.7 cm, 8 km from the search point."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "169/100 descending",
  "dates": [
   "20251109",
   "20260613"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 17,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.908,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.963,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.68,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 8.6,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 17,
   "noise_cm": 0.67,
   "coherence_mean": 0.602,
   "coherent_fraction": 0.908,
   "uncertainty_median_cm": 1.17,
   "runtime_s": 4,
   "transferred_mb": 0
  },
  "span_days": 216,
  "gps": null,
  "peak_change_cm": 10.4,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   -66.7365,
   -23.6587
  ],
  "peak_sigma_cm": 1.53
 },
 {
  "id": "manila",
  "name": "Manila Bay north (CAMANAVA / Bulacan)",
  "country": "Philippines",
  "continent": "Asia",
  "lon": 120.85,
  "lat": 14.78,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 10.9,
   "quantity": "line of sight? (LiCSAR/LiCSBAS; not stated)",
   "period": "2014-2020",
   "citation": "Sulapas, J.J.S., Ybanez, A.A.B., Marasigan, K.M.M., Grageda, J.M.B.M., Lagmay, A.M.F.A. (2024). Ground subsidence in major Philippine metropolitan cities from 2014 to 2020. International Journal of Applied Earth Observation and Geoinformation 133, 104107.",
   "url": "https://doi.org/10.1016/j.jag.2024.104107",
   "note": "Abstract (via search): maximum 109 mm/yr in Bulacan Province, Greater Manila. Tay et al. 2022 give Manila (admin boundary) 95th-pct only -17 mm/yr, so the draft citation of Tay for 10 cm/yr was mis-attributed. ISPRS 2025 (Maclang et al.) reports up to -124.5 mm/yr at Hagonoy/Calumpit. Max zone ~120.75E 14.82N; centre nudged west."
  },
  "location_check": "Not published: refused by GPS (PIMO and PLU1 barely moved, radar differs by a median 2.0 cm RMS). Deepest value N of the bay (120.83E 14.99N, Bulacan), where the literature puts the maximum.",
  "location_match": null,
  "reference": {
   "name": "Guadalupe Plateau (Diliman, Quezon City)",
   "lon": 121.05,
   "lat": 14.65,
   "reason": "Proposed Pleistocene tuff plateau kept (the usual stable reference for Metro Manila): coherent in 9 of 9 pairs; it reads -1.9 cm relative to the scene's non-moving cells, so a slow drift of the reference cannot be excluded. Only alternative bedrock-like cells are ~29 km away in the Sierra Madre foothills."
  },
  "status": "refused",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260623",
   "20261021"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": "Quality gate passed, but 2 GPS stations that barely moved (< 3 cm) differ from the radar by a median RMS of 2.0 cm: the map shows motion the ground did not make.",
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.75,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.896,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.87,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 4.0,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.89,
   "coherence_mean": 0.474,
   "coherent_fraction": 0.75,
   "uncertainty_median_cm": 1.56,
   "runtime_s": 4,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": {
   "stations": [
    {
     "id": "PIMO",
     "r": -0.028,
     "rms_cm": 1.43,
     "n": 10,
     "gps_range_cm": 1.54,
     "kind": "configured"
    },
    {
     "id": "PLU1",
     "r": -0.35,
     "rms_cm": 2.02,
     "n": 10,
     "gps_range_cm": 1.97,
     "kind": "configured"
    },
    {
     "id": "PTAG",
     "r": -0.47,
     "rms_cm": 2.78,
     "n": 9,
     "gps_range_cm": 2.63,
     "kind": "configured"
    },
    {
     "id": "PTGG",
     "r": -0.684,
     "rms_cm": 1.37,
     "n": 7,
     "gps_range_cm": 1.07,
     "kind": "configured"
    }
   ],
   "basis": "radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)",
   "moving_threshold_cm": 3.0,
   "test": {
    "stations": 2,
    "median_rms_cm": 2.02,
    "kind": "quiet stations (< 3 cm motion)",
    "agrees": false
   }
  },
  "peak_change_cm": 5.4,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   120.8266,
   14.988
  ],
  "peak_sigma_cm": 3.18,
  "refused_by": "gps"
 },
 {
  "id": "addis_ababa_et",
  "name": "Addis Ababa (recent alluvial sectors)",
  "country": "Ethiopia",
  "continent": "Africa",
  "lon": 38.78,
  "lat": 8.95,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 2.1,
   "quantity": "vertical (Sentinel-1 PS-InSAR; maximum; max cumulative about 13.5 cm)",
   "period": "Oct 2014 - Jan 2021",
   "citation": "Alemu, E., Floris, M. (2025). Monitoring Fast-Growing Megacities in Emerging Countries Through the PS-InSAR Technique: The Case of Addis Ababa, Ethiopia. Land, 14(5), 1020.",
   "url": "https://doi.org/10.3390/land14051020",
   "note": "Subsidence is on recent alluvial deposits under heavy new construction and groundwater exploitation. Results were checked against second-order geodetic control points. The climate is subtropical highland with a long dry season, so the semi-arid label is a simplification and 'humid' could also fit. A 2019 Addis Ababa University MSc thesis reported up to -36.8 mm/yr; it was not used. The centre is approximate (southern/eastern alluvial plain toward Akaki) and needs review against the paper's velocity map."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Entoto ridge",
   "lon": 38.76,
   "lat": 9.09,
   "reason": "Proposed Tertiary volcanic ridge kept: 894 m above the city floor, coherent in 6 of 6 pairs, change 0.0 cm."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260628",
   "20261002"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 6,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.918,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.998,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.53,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 6.7,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 6,
   "noise_cm": 0.78,
   "coherence_mean": 0.54,
   "coherent_fraction": 0.918,
   "uncertainty_median_cm": 0.94,
   "runtime_s": 3,
   "transferred_mb": 0
  },
  "span_days": 96,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 4.2,
   "peak_sigma_cm_raw": 0.83,
   "peak_location_raw": [
    39.021,
    9.018
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": {
    "stations": [
     {
      "id": "ADIS",
      "r": -0.61,
      "rms_cm": 1.38,
      "n": 7,
      "gps_range_cm": 1.5,
      "kind": "configured"
     }
    ],
    "basis": "radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)",
    "moving_threshold_cm": 3.0
   },
   "location_check_raw": "Does not match: the alluvial plain toward Akaki reads +1.2 cm; the deepest area is at the E edge of the box (39.02E 9.02N). GPS ADIS (7 common dates) differs by 1.4 cm RMS, too few dates for the test."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is at the edge of the map, away from the city, so we don't report a number."
 },
 {
  "id": "sanaa",
  "name": "Sanaa basin",
  "country": "Yemen",
  "continent": "Asia",
  "lon": 44.2,
  "lat": 15.4,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 14,
   "quantity": "line of sight (stated)",
   "period": "2003-2008 (study Nov 2003 - Feb 2011; ALOS + Envisat)",
   "citation": "Abdullin, A., Xu, W., Kosmicki, M., Jonsson, S. (2015). Rapid groundwater-related land subsidence in Yemen observed by multi-temporal InSAR. Geophysical Research Abstracts 17, EGU2015-13844 (conference abstract).",
   "url": "https://meetingorganizer.copernicus.org/EGU2015/EGU2015-13844.pdf",
   "note": "Stated: 'maximum subsidence rate exceeded 14 cm/year in the radar line-of-sight (LOS) direction between 2003 and 2008 in an agricultural area just north of Sana'a city'. The urban rate is about 1 cm/yr. In the nearby Mabar basin the rate 'exceeded 30 cm/year' (2007-2011). This is a conference abstract only (no DOI); no peer-reviewed Sentinel-1 paper was found. The draft's 5 cm/yr is too low for the maximum."
  },
  "location_check": "Refused by the quality gate (epoch noise 1.03 cm > 1.0).",
  "location_match": null,
  "reference": {
   "name": "Hills W of Sana'a",
   "lon": 44.169,
   "lat": 15.36,
   "reason": "Proposed Jabal Nuqum is coherent but its epoch noise is 2.6 cm (steep relief, likely stratified atmosphere). Moved to lower volcanic hills W of the basin: 59 m above the plain, coherent in 9 of 9 pairs, epoch noise 0.7 cm, change -0.9 cm."
  },
  "status": "refused",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260623",
   "20261021"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": "Automatic quality gate: temporal_noise_cm 1.03 (needs <= 1.0).",
  "gate": {
   "passed": false,
   "failed": [
    "temporal_noise_cm"
   ],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.997,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 1.0,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 1.03,
     "threshold": 1.0,
     "ok": false
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 4.5,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.87,
   "coherence_mean": 0.762,
   "coherent_fraction": 0.997,
   "uncertainty_median_cm": 1.49,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "refused_by": "quality_gate"
 },
 {
  "id": "mehsana",
  "name": "Mehsana, Gujarat",
  "country": "India",
  "continent": "Asia",
  "lon": 72.4,
  "lat": 23.6,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 2.9,
   "quantity": "line of sight? (PSInSAR/DInSAR differential rates; LOS vs vertical not stated in abstract)",
   "period": "2004-2019 (core-urban -2.6 to -2.9 cm/yr in the latest sub-period)",
   "citation": "Chatterjee, R.S., Singha, S., Aggarwal, A., Sharma, V., et al. (2023). Reconnaissance to characterisation of land subsidence due to groundwater overdraft and oil extraction in and around Mehsana City, Gujarat, India by long-term hybrid differential interferometric SAR technique. Journal of Hydrology 627, 130441.",
   "url": "https://doi.org/10.1016/j.jhydrol.2023.130441",
   "note": "Abstract: rates from <=-1 to >=-3 cm/yr; core urban area -1.7 to -2.1 (2004-06), -1.6 to -1.7 (2007-11), -2.6 to -2.9 cm/yr later. Drivers: groundwater overdraft, secondarily oil extraction (SE). Not a Sentinel-1-only figure. Draft 5 cm/yr is too high."
  },
  "location_check": "Partly: the core urban area reads +0.4 cm (literature -2.6 to -2.9 cm/yr); broad sinking of ~4 cm lies SE of the town, where the literature notes oil extraction. The deepest value is one cell at the W edge.",
  "location_match": "partial",
  "reference": {
   "name": "Plain SW of Mehsana (no bedrock in the frame)",
   "lon": 72.314,
   "lat": 23.49,
   "reason": "Proposed Aravalli foothills (73.00, 23.85) lie outside the radar frame. No bedrock inside: chosen by the flat-plain rule (coherent in all chain pairs, change within 0.5 cm of the scene's non-moving cells, low epoch noise, >= 5 km from cells sinking > 2 cm, >= 15 km from the search point)."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "113/13 ascending",
  "dates": [
   "20251118",
   "20260704"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 17,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.949,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.979,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.5,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 7.2,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 17,
   "noise_cm": 0.97,
   "coherence_mean": 0.484,
   "coherent_fraction": 0.949,
   "uncertainty_median_cm": 1.21,
   "runtime_s": 6,
   "transferred_mb": 0
  },
  "span_days": 228,
  "gps": null,
  "peak_change_cm": 8.7,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   72.1001,
   23.6036
  ],
  "peak_sigma_cm": 2.76
 },
 {
  "id": "salmas_plain_iran",
  "name": "Salmas plain (NW of Lake Urmia)",
  "country": "Iran",
  "continent": "Asia",
  "lon": 44.85,
  "lat": 38.18,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 6.0,
   "quantity": "line of sight (average ~60 +/- 3 mm/yr)",
   "period": "2014-2018",
   "citation": "Shahbazi, S., Mousavi, Z., Rezaei, A. (2022). Constraints on the hydrogeological properties and land subsidence through GNSS and InSAR measurements and well data in Salmas plain, northwest of Urmia Lake, Iran. Hydrogeology Journal 30(2), 533-555. https://doi.org/10.1007/s10040-021-02416-x",
   "url": "https://doi.org/10.1007/s10040-021-02416-x",
   "note": "Confined aquifer overextraction plus drought; strong seasonal elastic signal (~60 mm) superimposed. Lake Urmia basin. Rate read from the abstract (springerprofessional.de page). Winter snow may affect coherence."
  },
  "location_check": "Plausible: a compact bowl in the irrigated plain E of Salmas toward Lake Urmia (44.96E 38.21N); the cited abstract gives no location.",
  "location_match": "plausible",
  "reference": {
   "name": "Mountains W of Salmas",
   "lon": 44.62,
   "lat": 38.2,
   "reason": "Proposed bedrock range kept: 346 m above the plain, coherent in 8 of 8 pairs, change +0.2 cm."
  },
  "status": "measured",
  "has_site_data": true,
  "track": "13/21 ascending",
  "dates": [
   "20260627",
   "20261013"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.956,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.999,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.37,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 10.4,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": 0.39,
   "coherence_mean": 0.608,
   "coherent_fraction": 0.956,
   "uncertainty_median_cm": 0.71,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 108,
  "gps": null,
  "peak_change_cm": 8.6,
  "peak_rate_cm_yr": null,
  "peak_quantity": "los",
  "peak_location": [
   44.9638,
   38.2074
  ],
  "peak_sigma_cm": 1.06
 },
 {
  "id": "santiago_basin_cl",
  "name": "Santiago basin, local subsidence hotspots (NW industrial/agricultural sectors)",
  "country": "Chile",
  "continent": "South America",
  "lon": -70.75,
  "lat": -33.38,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 1.5,
   "quantity": "line of sight? (multi-temporal DInSAR; 'anomalous local subsistence (rates < -15 mm/year)'; lower bound)",
   "period": "2018-2021",
   "citation": "Orellana, F., Moreno, M., Yáñez, G. (2022). High-Resolution Deformation Monitoring from DInSAR: Implications for Geohazards and Ground Stability in the Metropolitan Area of Santiago, Chile. Remote Sensing, 14(23), 6115.",
   "url": "https://doi.org/10.3390/rs14236115",
   "note": "Slower than the 3-5 cm/yr target, but this semi-arid Mediterranean basin should have good coherence. Hotspots sit on fine sediments with a falling shallow water table, and in cropland with excess water withdrawal. GNSS shows about 10 mm/yr of regional tectonic uplift, so relative rates are what matter. Olea et al. 2020 (ISPRS Archives XLII-3/W12, doi 10.5194/isprs-archives-XLII-3-W12-2020-1-2020; DOI not checked on Crossref) report up to 28 mm/yr (LOS velocity) in a NW Santiago industrial area for 2017-2018, interpreted as groundwater exploitation. The centre is approximate (NW Santiago, Pudahuel/Quilicura) and needs review against the published maps."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Cerro Renca",
   "lon": -70.709,
   "lat": -33.385,
   "reason": "Proposed Cerro San Cristobal is coherent but reads -2.8 cm relative to the scene's non-moving cells (likely a topography-correlated atmospheric residual on a steep hill). Moved to Cerro Renca, another bedrock hill inside the basin: 168 m above the plain, coherent in 9 of 9 pairs, change -0.6 cm."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260619",
   "20261017"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.966,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.997,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.56,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 4.6,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 0.69,
   "coherence_mean": 0.664,
   "coherent_fraction": 0.966,
   "uncertainty_median_cm": 0.91,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 4.0,
   "peak_sigma_cm_raw": 0.71,
   "peak_location_raw": [
    -70.8724,
    -33.5279
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": {
    "stations": [
     {
      "id": "USCL",
      "r": 0.004,
      "rms_cm": 0.7,
      "n": 10,
      "gps_range_cm": 0.96,
      "kind": "configured"
     },
     {
      "id": "DGF1",
      "r": -0.264,
      "rms_cm": 1.98,
      "n": 9,
      "gps_range_cm": 1.99,
      "kind": "configured"
     },
     {
      "id": "CCSN",
      "r": 0.214,
      "rms_cm": 0.66,
      "n": 9,
      "gps_range_cm": 1.1,
      "kind": "configured"
     },
     {
      "id": "CAL9",
      "r": -0.26,
      "rms_cm": 0.76,
      "n": 9,
      "gps_range_cm": 0.72,
      "kind": "configured"
     },
     {
      "id": "CHEN",
      "r": -0.311,
      "rms_cm": 1.41,
      "n": 9,
      "gps_range_cm": 2.23,
      "kind": "configured"
     },
     {
      "id": "SMA3",
      "r": -0.624,
      "rms_cm": 0.87,
      "n": 8,
      "gps_range_cm": 0.6,
      "kind": "configured"
     },
     {
      "id": "QSTP",
      "r": -0.515,
      "rms_cm": 1.37,
      "n": 9,
      "gps_range_cm": 1.04,
      "kind": "ngl_auto"
     },
     {
      "id": "SANT",
      "r": -0.287,
      "rms_cm": 1.43,
      "n": 10,
      "gps_range_cm": 1.04,
      "kind": "ngl_auto"
     },
     {
      "id": "UAIB",
      "r": -0.193,
      "rms_cm": 0.67,
      "n": 9,
      "gps_range_cm": 0.7,
      "kind": "ngl_auto"
     },
     {
      "id": "VZCH",
      "r": -0.221,
      "rms_cm": 0.78,
      "n": 9,
      "gps_range_cm": 1.34,
      "kind": "ngl_auto"
     }
    ],
    "basis": "radar LOS vs GPS east/north/up projected on the product LOS, per date (pipeline v2)",
    "moving_threshold_cm": 3.0,
    "test": {
     "stations": 2,
     "median_rms_cm": 1.43,
     "kind": "quiet stations (< 3 cm motion)",
     "agrees": true
    }
   },
   "location_check_raw": "Does not match: NW Santiago, the literature hotspot, reads +0.4 cm; the deepest value is in the SW cropland. Two quiet GPS stations (USCL, SANT) agree with the radar within 1.43 cm RMS."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is in farmland south-west of the city, not in the north-west where studies find it, so we don't report a number."
 },
 {
  "id": "kabul",
  "name": "Kabul basin",
  "country": "Afghanistan",
  "continent": "Asia",
  "lon": 69.17,
  "lat": 34.53,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 5.3,
   "quantity": "vertical? (2D decomposition from Sentinel-1 asc+desc; abstract gives -5.3 cm/yr)",
   "period": "2014-2019",
   "citation": "Meldebekova, G., Yu, C., Li, Z., Song, C. (2020). Quantifying Ground Subsidence Associated with Aquifer Overexploitation Using Space-Borne Radar Interferometry in Kabul, Afghanistan. Remote Sensing 12(15), 2461.",
   "url": "https://doi.org/10.3390/rs12152461",
   "note": "Stated: 'maximum value of -5.3 cm/year observed in the Upper Kabul aquifer basin'. A newer EGU25 abstract (Kakar et al., 2015-2022) reports 31.2 cm cumulative over about 6 years in the city centre (about 5 cm/yr), which is consistent. The draft's 10 cm/yr is too high. The centre is correct."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Sher Darwaza / Asmai ridge",
   "lon": 69.168,
   "lat": 34.52,
   "reason": "Proposed coordinates (69.15, 34.51) fall on the valley floor (6 m below the plain's 20th percentile). Moved 2 km to the ridge itself: 73 m above the plain, 69 m local relief, coherent in 8 of 8 pairs, change -0.1 cm."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260627",
   "20261013"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 8,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.961,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.968,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.68,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 3.8,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 8,
   "noise_cm": 0.42,
   "coherence_mean": 0.62,
   "coherent_fraction": 0.961,
   "uncertainty_median_cm": 1.08,
   "runtime_s": 2,
   "transferred_mb": 0
  },
  "span_days": 108,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 5.0,
   "peak_sigma_cm_raw": 2.02,
   "peak_location_raw": [
    69.1844,
    34.4128
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: the city centre, where the literature puts the maximum, reads 0.0 cm; the deepest value is one cell S of the city with a jump in the first pair."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is a single spot south of the city with a sudden jump, so we don't report a number."
 },
 {
  "id": "pekalongan",
  "name": "Pekalongan",
  "country": "Indonesia",
  "continent": "Asia",
  "lon": 109.67,
  "lat": -6.89,
  "from_catalogue": true,
  "literature": {
   "rate_cm_yr": 11.0,
   "quantity": "line of sight? (SBAS; abstract does not say)",
   "period": "2017-2023",
   "citation": "Sidiq, T.P., Gumilar, I., Abidin, H.Z., Meilano, I., Purwarianti, A., Lestari, R. (2025). Spatial Distribution and Monitoring of Land Subsidence Using Sentinel-1 SAR Data in Java, Indonesia. Applied Sciences 15(7), 3732.",
   "url": "https://doi.org/10.3390/app15073732",
   "note": "Abstract: 'Pekalongan (up to 110 mm/year)'. Local studies give 2.7-7 cm/yr means (e.g. IOP Conf. Ser. EES 873, 012078, 2021: up to 7 cm/yr 2016-2020; DOI not checked). Draft 15 cm/yr is too high."
  },
  "location_check": null,
  "location_match": "no",
  "reference": {
   "name": "Southern uplands of Pekalongan Regency (Kajen)",
   "lon": 109.6,
   "lat": -7.03,
   "reason": "Proposed Tertiary/volcanic uplands kept: 67 m above the coastal plain, coherent in 9 of 9 pairs, change -0.5 cm."
  },
  "status": "unconfirmed",
  "has_site_data": false,
  "track": null,
  "dates": [
   "20260620",
   "20261018"
  ],
  "covered_by": null,
  "role": "gap_region",
  "reason": null,
  "gate": {
   "passed": true,
   "failed": [],
   "checks": {
    "min_pairs": {
     "value": 9,
     "threshold": 3,
     "ok": true
    },
    "coherent_frac": {
     "value": 0.972,
     "threshold": 0.4,
     "ok": true
    },
    "usable_frac": {
     "value": 0.958,
     "threshold": 0.3,
     "ok": true
    },
    "temporal_noise_cm": {
     "value": 0.91,
     "threshold": 1.0,
     "ok": true
    },
    "reference_ok_frac": {
     "value": 1.0,
     "threshold": 0.8,
     "ok": true
    },
    "signal_snr": {
     "value": 15.5,
     "threshold": 3.0,
     "ok": true
    }
   }
  },
  "pipeline": {
   "version": "v2 (GUNW HDF5)",
   "pairs": 9,
   "noise_cm": 1.43,
   "coherence_mean": 0.617,
   "coherent_fraction": 0.972,
   "uncertainty_median_cm": 1.37,
   "runtime_s": 1,
   "transferred_mb": 0
  },
  "span_days": 120,
  "gps": null,
  "peak_change_cm": null,
  "peak_rate_cm_yr": null,
  "peak_quantity": null,
  "peak_location": null,
  "peak_sigma_cm": null,
  "diagnostics": {
   "note": "NOT FOR DISPLAY: raw pipeline values of an unconfirmed site, kept for review only",
   "status_by_rules": "measured",
   "peak_change_cm_raw": 30.7,
   "peak_sigma_cm_raw": 2.48,
   "peak_location_raw": [
    109.5983,
    -6.862
   ],
   "peak_rate_cm_yr_raw": null,
   "peak_quantity_raw": "los",
   "gps_raw": null,
   "location_check_raw": "Does not match: the city reads -1.2 cm; the deepest value is on the coastline W of the city (109.60E 6.86S) and falls 13 cm in the first 24 days, which looks like a water-margin or unwrapping artefact, not ground motion."
  },
  "unconfirmed_reason": "Passed our automatic quality checks, but we don't see the sinking area described in published studies; our strongest signal is at the coastline and drops suddenly, which looks like an error rather than ground motion, so we don't report a number."
 }
];
