/* Loads the data files listed in data/manifest.js, then the 3D view and the app, in that order. Scripts added this
   way with async = false run in the order they are added, on file:// and on a web server alike. */
(function () {
  'use strict';
  var M = window.GROUNDLINE_MANIFEST || { sites: [], impact: [], layers: [] };
  var files = [];
  (M.layers || []).forEach(function (n) { files.push('data/' + n + '.js'); });
  (M.sites || []).forEach(function (id) { files.push('data/' + id + '.js'); });
  (M.impact || []).forEach(function (id) { files.push('data/' + id + '_impact.js'); });
  files.push('view3d.js', 'app.js');
  files.forEach(function (src) {
    var s = document.createElement('script');
    s.src = src; s.async = false;
    s.onerror = function () { if (window.console) console.warn('Groundline: could not load ' + src); };
    document.body.appendChild(s);
  });
})();
