// Which data files the page loads, in order (read by site/loader.js). The data pipeline updates this file; nothing
// else needs to change when a site is added.
//   sites:  site ids; loads data/<id>.js (window.SITE_DATA[id]). Order = order of the site tabs.
//   impact: site ids that also have data/<id>_impact.js (window.IMPACT[id]).
//   layers: other data files by name, loaded before the sites: data/<name>.js.
window.GROUNDLINE_MANIFEST = {
  sites: ['sjv', 'mexico_city', 'tehran', 'mashhad', 'rafsanjan', 'konya', 'celaya', 'savojbolagh_nazarabad', 'neyshabur', 'kashmar', 'kerman', 'marvdasht', 'kucuk_menderes_odemis_bayindir_turkey', 'ghazni_afghanistan', 'arak_plain_iran', 'damghan', 'karapinar_turkey', 'salar_de_olaroz_ar', 'salmas_plain_iran', 'mehsana'],
  impact: ['sjv', 'mexico_city', 'tehran', 'mashhad', 'rafsanjan', 'konya', 'celaya', 'savojbolagh_nazarabad', 'neyshabur', 'kashmar', 'kerman', 'marvdasht', 'kucuk_menderes_odemis_bayindir_turkey', 'ghazni_afghanistan', 'arak_plain_iran', 'damghan', 'karapinar_turkey', 'salar_de_olaroz_ar', 'salmas_plain_iran', 'mehsana'],
  layers: ['observatory', 'coverage_services', 'global_layer', 'global_layer_tiles', 'hotspots_catalog', 'opera_check', 'sjv_trust']
};
