// Global background layer: modelled LIKELIHOOD of land subsidence, not a measurement.
// Source raster: Hasan et al. 2023 (Nature Communications 14:6180), "Final_subsidence_proba_greater_1cm_2013_2019.tif"
// from HydroShare doi:10.4211/hs.dc7c5bfb3a86479b889d3b30ab0e4ef7 (CC BY 4.0), 0.02 deg, EPSG:4326, values 0-1 =
// model probability that groundwater-driven subsidence exceeded 1 cm/yr in 2013-2019.
// Converted to Web Mercator XYZ PNG tiles z0-6 (624 tiles, ~0.4 MB) by the research agent on 2026-11-14:
// nearest-neighbour reprojection, max-pooling at low zooms so small hotspots stay visible, binned into the 5 classes
// below; pixels with probability < 0.4, no data, or outside the model domain are transparent and empty tiles are not
// written (expect 404s for those; Leaflet shows nothing). Use maxNativeZoom 6 and let Leaflet upscale beyond that.
window.GLOBAL_LAYER = {
  type: 'xyz',
  tiles: 'img/global/tiles/{z}/{x}/{y}.png',
  minZoom: 0,
  maxNativeZoom: 6,
  bounds: [[-56.0, -180.0], [60.0, 180.0]],          // [[south, west], [north, east]]; model domain ~56S-60N
  opacity: 1.0,                                       // alpha is baked into the PNG classes
  attribution: 'Subsidence likelihood: Hasan et al. 2023, Nat. Commun. (CC BY 4.0)',
  title: 'Where subsidence is likely (model)',
  quantity: 'Modelled probability that land subsidence exceeded 1 cm/yr (2013-2019)',
  legend: [
    { min: 0.40, max: 0.50, color: 'rgba(206,194,236,0.24)', swatch: '#cec2ec', label: '40-50 %' },
    { min: 0.50, max: 0.60, color: 'rgba(180,156,222,0.37)', swatch: '#b49cde', label: '50-60 %' },
    { min: 0.60, max: 0.75, color: 'rgba(200,160,205,0.49)', swatch: '#c8a0cd', label: '60-75 %' },
    { min: 0.75, max: 0.90, color: 'rgba(232,198,140,0.61)', swatch: '#e8c68c', label: '75-90 %' },
    { min: 0.90, max: 1.00, color: 'rgba(246,220,80,0.73)',  swatch: '#f6dc50', label: '90-100 %' }
  ],
  citation: 'Hasan, M.F., Smith, R., Vajedian, S., Pommerenke, R., Majumdar, S. (2023). Global land subsidence mapping reveals widespread loss of aquifer storage capacity. Nature Communications 14, 6180. doi:10.1038/s41467-023-41933-z. Data: HydroShare doi:10.4211/hs.dc7c5bfb3a86479b889d3b30ab0e4ef7',
  url: 'https://doi.org/10.1038/s41467-023-41933-z',
  data_url: 'https://www.hydroshare.org/resource/dc7c5bfb3a86479b889d3b30ab0e4ef7/',
  licence: 'CC BY 4.0 (attribution required); tiles are a derived, re-coloured version',
  caveat: 'modelled likelihood, not a measurement',
  caveat_long: 'A machine-learning model (~2 km) trained on published InSAR subsidence maps and predictors such as groundwater stress, climate, sediment and irrigation. It covers groundwater-driven subsidence only; it does not cover mining, oil, gas or geothermal subsidence, deltaic compaction or sinkholes. Some known fast basins score only moderately (e.g. Rafsanjan ~0.44). Probabilities below 0.4 are hidden because they are common across dry interiors and do not discriminate. No data north of ~60N, south of ~56S, or in New Zealand.',
  not_used: 'Herrera-Garcia et al. 2021 (Science, doi:10.1126/science.abb8549) global susceptibility map: its raster is not in a public repository we could reach (the Science supplement is XLSX/PDF only and blocked automated download; UNESCO LaSII shows maps without a download).'
};
