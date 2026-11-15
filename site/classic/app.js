/* Groundline: one engine, any number of case studies.
   Every number on the page is read from window.SITE_DATA (site/data/*.js) or is a cited fact in index.html. */
(function () {
  'use strict';

  var DATA = window.SITE_DATA || {};
  var ORDER = ['sjv', 'mexico_city'].filter(function (k) { return DATA[k]; });
  Object.keys(DATA).forEach(function (k) { if (ORDER.indexOf(k) < 0) ORDER.push(k); });

  var BLURB = {
    sjv: 'Groundwater pumping is sinking parts of California\'s Central Valley, and with it the canals, roads and rail lines that cross it. This case asks a practical question: which stretches of infrastructure are moving right now, and by more than the noise?',
    mexico_city: 'A large, fast and well-documented signal, with a GPS station in the middle of it. Here our NISAR map can be checked twice: against that GPS station, and against the OPERA map NASA makes from a different satellite.'
  };
  // ColorBrewer RdBu, 11 classes: red = sinking, near-white = no change, blue = rising.
  var RDBU = [[103, 0, 31], [178, 24, 43], [214, 96, 77], [244, 165, 130], [253, 219, 199], [247, 247, 247],
    [209, 229, 240], [146, 197, 222], [67, 147, 195], [33, 102, 172], [5, 48, 97]];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ASF = 'https://api.daac.asf.alaska.edu/services/search/param?dataset=NISAR&processingLevel=GUNW&intersectsWith=POINT({lon}%20{lat})&output=jsonlite&maxResults=250';

  // Base maps: Esri World Imagery (default) or Esri Light/Dark Gray Canvas. Keyless, served with CORS to pages opened
  // from disk, which send no Referer header (the reason the OpenStreetMap tile servers answered "403 Access blocked").
  // CARTO's keyless tiles were tried too, but now come back as an "API key required" watermark.
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var TILES = {
    sat: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}',
    light: ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    dark: ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
  };
  // Elevation: AWS Terrain Tiles (Terrarium PNG), keyless and served with CORS, so pages opened from disk can read them.
  var DEM = { url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    credit: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (Mapzen, AWS Open Data): <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">SRTM, GMTED2010, ETOPO1, USGS 3DEP, INEGI and others</a>' };
  var SAT_CREDIT = 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community';
  var TILE_CREDIT = 'Base map &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS user community';
  // Plain words for what the map measures (the data files keep the technical description).
  var PLAIN = { vertical: 'up or down', los: 'toward or away from the satellite' };
  function plainQ(s) { return PLAIN[s.quantity.key] || s.quantity.short; }

  var state = { site: null, i: 0, timer: null, sel: null, opacity: 0.9, view: '2d', plain: false, base: 'sat', mode3d: 'terrain' };
  try { if (localStorage.getItem('groundline-base') === 'map') state.base = 'map'; } catch (e) { /* not remembered */ }
  var map = null, tiles = null, overlay = null, overlayCache = {}, vectors = null, extras = {}, shapes = {}, gridCache = {}, liveCache = {}, view3d = null, view3dSite = null;

  // ---------- small helpers
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toDate(s) { return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))); }
  function fmtDate(s) { var d = typeof s === 'string' ? toDate(s) : s; return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function days(a, b) { return Math.round((toDate(b) - toDate(a)) / 864e5); }
  function cm(v, digits) { return v == null || !isFinite(v) ? 'n/a' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(digits == null ? 1 : digits); }
  function fmtR(r) { return r == null ? 'n/a' : r >= 0.995 ? r.toFixed(3) : r.toFixed(2); }
  function last(a) { for (var i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; }
  function colourFor(v, vmax) {
    var t = Math.max(0, Math.min(1, (v / vmax + 1) / 2)) * (RDBU.length - 1), i = Math.min(Math.floor(t), RDBU.length - 2), f = t - i;
    return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(RDBU[i][k] * (1 - f) + RDBU[i + 1][k] * f); }).join(',') + ')';
  }
  function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
  function niceStep(range, target) {
    var raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }

  // ---------- theme
  function initTheme() {
    var btn = $('themeBtn');
    function label() { btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'Light' : 'Dark'; }
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('groundline-theme', next); } catch (e) { /* private mode: not remembered */ }
      label();
      setBasemap();
      if (view3d) view3d.restyle();
    });
    label();
  }

  // ---------- site switch, hero, stats
  // Two featured cases as tabs; every other measured place in one menu grouped by region (the list grows as the
  // pipeline adds places, so it must not become a wall of buttons).
  var FEATURED = ['sjv', 'mexico_city'];
  var moreSel = null, moreCell = null;
  function buildSwitch() {
    var box = $('siteSwitch'), feat = ORDER.filter(function (id) { return FEATURED.indexOf(id) >= 0; }), rest = ORDER.filter(function (id) { return feat.indexOf(id) < 0; });
    function go(id) { document.documentElement.setAttribute('data-mode', 'site'); selectSite(id); }
    (rest.length > 2 ? feat : ORDER).forEach(function (id) {
      var s = DATA[id], b = h('button', { type: 'button', role: 'tab', 'data-site': id, 'aria-selected': 'false' },
        '<span class="role">' + esc(s.role || '') + '</span><span class="name">' + esc(s.name) + '</span>');
      b.addEventListener('click', function () { go(id); });
      box.appendChild(b);
    });
    if (rest.length <= 2) return;
    box.classList.add('grouped');
    var g = {};
    rest.forEach(function (id) { var e = obsEntry(id) || DATA[id]; (g[continentOf(e)] = g[continentOf(e)] || []).push(id); });
    var opts = Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; }).map(function (k) {
      return '<optgroup label="' + esc(k) + '">' + g[k].map(function (id) {
        var e = obsEntry(id) || {};
        return '<option value="' + esc(id) + '">' + esc(DATA[id].name) + (e.country ? ', ' + esc(e.country) : '') + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    var cell = h('label', { 'class': 'more', 'for': 'moreSites' }, '<span class="role">' + rest.length + ' more measured places</span>' +
      '<select id="moreSites"><option value="">Choose a place…</option>' + opts + '</select>');
    box.appendChild(cell);
    moreCell = cell; moreSel = cell.querySelector ? cell.querySelector('select') : null;
    if (moreSel) moreSel.addEventListener('change', function (ev) { var v = ((ev && ev.target) || moreSel).value; if (v) go(v); });
  }

  function statTiles(s) {
    var t = [], H = s.headline, q = s.quantity.short, span = fmtDate(s.dates[0]) + ' to ' + fmtDate(s.dates[s.dates.length - 1]);
    if (H) {
      t.push(['r = ' + fmtR(H.validation.r), 'agreement with GPS stations held out of the fit', 'RMS ' + H.validation.rms_los_cm.toFixed(1) + ' cm along the line of sight']);
      t.push(['±' + s.noise.value_cm.toFixed(1) + ' cm', 'noise level, ' + q, s.noise.label]);
      t.push([H.canal.reaches_over_noise + ' of ' + H.canal.reaches_total, '10-km reaches of the Friant-Kern Canal moved more than twice the noise', 'near ' + H.canal.near.join(', ')]);
      var worst = s.reaches.slice().sort(function (a, b) { return a.mean_cm - b.mean_cm; })[0];
      t.push([cm(worst.mean_cm) + ' cm', 'fastest 10-km reach: ' + worst.alignment + ' near ' + worst.near, span + ', ' + q]);
    } else {
      var g = s.gps[0], p = s.places[0];
      if (g) t.push(['r = ' + fmtR(g.r), 'radar against GPS station ' + g.id, 'RMS ' + g.rms_cm.toFixed(1) + ' cm over ' + g.n + ' dates']);
      if (p) t.push([cm(p.median_cm) + ' cm', p.name + ', median within ' + p.radius_km + ' km', 'in ' + s.span_days + ' days, ' + q]);
      if (s.extreme) t.push([cm(s.extreme.min_cm) + pm(s.extreme.sigma_cm) + ' cm', 'fastest spot on the map, in ' + s.span_days + ' days', Math.abs(s.extreme.lat).toFixed(3) + '°' + (s.extreme.lat < 0 ? 'S' : 'N') + ', ' + Math.abs(s.extreme.lon).toFixed(3) + '°' + (s.extreme.lon < 0 ? 'W' : 'E')]);
      if (s.noise.value_cm != null) t.push(['±' + s.noise.value_cm.toFixed(1) + ' cm', 'noise floor, ' + q, s.noise.label]);
    }
    $('stats').innerHTML = t.map(function (x) {
      return '<div class="stat"><div class="v">' + esc(x[0]) + '</div><div class="l">' + esc(x[1]) + '</div><div class="d">' + esc(x[2]) + '</div></div>';
    }).join('');
  }

  function results(s) {
    var out = [], H = s.headline, P = s.provenance;
    if (H) {
      out.push(['r = ' + fmtR(H.validation.r) + ' · RMS ' + H.validation.rms_los_cm.toFixed(1) + ' cm',
        'Radar against GPS stations held out of the fit (line of sight, valley floor, ascending track, final date). As vertical-equivalent noise that is ±' + H.validation.sigma_vertical_cm.toFixed(1) + ' cm (1σ).']);
      out.push(['r = ' + H.series.r_min.toFixed(2) + ' to ' + H.series.r_max.toFixed(2),
        'Whole time series at stations ' + H.series.stations.join(', ') + ', each held out of the fit.']);
      out.push([H.canal.km_over_noise.toFixed(0) + ' km of the canal',
        'Friant-Kern Canal: ' + H.canal.reaches_over_noise + ' of ' + H.canal.reaches_total + ' reaches (near ' + H.canal.near.join(', ') + ') moved more than twice the noise over the full period. Where two independent tracks agree (' + H.canal.summer_window + '): ' +
        H.canal.summer.map(function (r) { return cm(r.mean_cm) + ' ± ' + r.sigma_cm.toFixed(1) + ' cm (km ' + r.km + ', ' + r.near + ')'; }).join('; ') + '.']);
      out.push([H.worst['State Route 99'],
        'State Route 99, its five most-negative 10-km reaches. State Route 43: ' + H.worst['State Route 43'] + '. High-speed rail alignment: ' + H.worst['High-speed rail alignment'] + '. The strongest sinking is west of the canal.']);
      out.push(['r = ' + H.two_tracks.r.toFixed(2) + ' between tracks',
        'Ascending and descending passes, processed separately, over ' + H.two_tracks.window + '. Half their difference is ±' + H.two_tracks.mean_sigma_cm.toFixed(1) + ' cm.']);
    } else {
      s.gps.forEach(function (g) {
        out.push(['r = ' + fmtR(g.r) + ' · RMS ' + g.rms_cm.toFixed(1) + ' cm', 'Radar against GPS station ' + g.id + ' over ' + g.n + ' dates (' + g.gps_label + ').']);
      });
      s.places.slice(0, 1).forEach(function (p) {
        out.push([cm(p.median_cm) + ' cm in ' + s.span_days + ' days', p.name + ': median within ' + p.radius_km + ' km (5th to 95th percentile ' + cm(p.p05_cm) + ' to ' + cm(p.p95_cm) + ' cm), ' + s.quantity.short + '.']);
      });
      if (s.extreme) out.push([cm(s.extreme.min_cm) + pm(s.extreme.sigma_cm) + ' cm', 'Fastest spot on the map (3×3-cell median) at ' + Math.abs(s.extreme.lat).toFixed(3) + '°' + (s.extreme.lat < 0 ? 'S' : 'N') + ', ' + Math.abs(s.extreme.lon).toFixed(3) + '°' + (s.extreme.lon < 0 ? 'W' : 'E') + (s.extreme.sigma_cm != null ? ' (± is one standard deviation).' : '.')]);
      if (s.noise.areas && s.noise.value_cm != null) out.push(['±' + s.noise.value_cm.toFixed(1) + ' cm', 'Largest spread inside areas assumed stable: ' + s.noise.areas.map(function (a) { return a.name + ' ' + a.std_cm.toFixed(1); }).join(', ') + ' cm.']);
      if (P.coherence_proxy) out.push([P.coherence_proxy.mean.toFixed(2) + ' coherence proxy', 'Mean over ' + s.tracks[0].pairs + ' pairs (lowest ' + P.coherence_proxy.min.toFixed(2) + '); ' + P.dropped_noise_only_pairs.length + ' pairs dropped as noise-only.']);
    }
    $('results').innerHTML = out.map(function (x) { return '<li><b>' + esc(x[0]) + '</b>' + esc(x[1]) + '</li>'; }).join('');
    $('resultsNote').textContent = provenanceText(P.built_by) + ' Method: ' + P.method + '. Source: ' + P.source + '.';
    var hasContext = s.id === 'sjv';
    $('contextPanel').style.display = hasContext ? '' : 'none';
    $('context').classList.toggle('single', !hasContext);
    $('resultsNum').textContent = hasContext ? '05' : '04';
  }

  // Where a site's map came from, in plain words, keyed on provenance.built_by.
  function provenanceText(by) {
    by = String(by || '');
    if (by === 'pipeline/v2/run.py') return 'Processed from full NISAR radar products (ionosphere-corrected, coherence-masked) by pipeline/v2/run.py.';
    if (by === 'pipeline/refresh.py') return 'Built from NISAR preview images by pipeline/refresh.py.';
    if (/research export/i.test(by)) return 'This layer comes from the team\'s research export (GPS-tied, two tracks); the pipeline does not rebuild it yet.';
    return by ? 'Built by ' + by + '.' : '';
  }
  // 1-sigma uncertainty of the final map at a point, from the optional uncertainty grid (pipeline v2).
  var sigmaCache = {};
  function sigmaAt(s, lat, lon) {
    var U = s.uncertainty && s.uncertainty.grid;
    if (!U || !U.frames_b64 || !U.frames_b64.length) return null;
    var a = sigmaCache[s.id];
    if (!a) {
      var bin = atob(U.frames_b64[U.frames_b64.length - 1]);
      a = sigmaCache[s.id] = new Int8Array(bin.length);
      for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i) << 24 >> 24;
    }
    var b = s.overlay.bounds, col = Math.floor((lon - b[0][1]) / (b[1][1] - b[0][1]) * U.width);
    var row = Math.floor((mercY(b[1][0]) - mercY(lat)) / (mercY(b[1][0]) - mercY(b[0][0])) * U.height);
    if (col < 0 || row < 0 || col >= U.width || row >= U.height) return null;
    var v = a[row * U.width + col];
    return v === U.nodata || v < 0 ? null : v * U.step_cm;
  }
  function pm(sig) { return sig == null || !isFinite(sig) ? '' : ' ± ' + (+sig).toFixed(1); }

  function limits(s) {
    $('limitQuantity').textContent = s.quantity.key === 'vertical'
      ? 'This map is already converted that way and ignores horizontal motion.'
      : 'This map shows line-of-sight values as measured.';
    var ref = DATA.sjv;
    if (ref) {
      var worst = null;
      ref.gps.forEach(function (g) {
        var a = last(g.gps_cm), b = last(g.radar_cm);
        if (a == null || b == null || Math.abs(a) > 2.5) return;
        if (!worst || Math.abs(b - a) > Math.abs(worst.b - worst.a)) worst = { id: g.id, a: a, b: b };
      });
      if (worst) $('limitOverread').textContent = 'Example from San Joaquin: at station ' + worst.id + ' GPS shows ' + cm(worst.a) + ' cm while the radar, with that station held out, reads ' + cm(worst.b) + ' cm.';
      var sp = ref.headline && ref.headline.state_product;
      if (sp) $('limitState').textContent = 'For overlapping months (' + sp.window + ') the NISAR amplitude is about ' + sp.slope.toFixed(1) + ' times California\'s published product (correlation ' + sp.r.toFixed(2) + ').';
    }
  }

  // ---------- map
  function initMap() {
    if (!window.L) { $('map').innerHTML = '<div class="fallback"><div><p>The map library could not be loaded (offline?). Showing the data layer only.</p><img id="fallbackImg" alt="Displacement layer for the selected date"></div></div>'; return; }
    map = L.map('map', { zoomSnap: 0.5, scrollWheelZoom: false });
    map.attributionControl.addAttribution('Radar: NISAR previews via ASF DAAC');
    map.createPane('data'); map.getPane('data').style.zIndex = 350;
    vectors = L.layerGroup().addTo(map);
    map.on('click', onMapClick);
    map.on('focus', function () { map.scrollWheelZoom.enable(); });
    map.on('blur', function () { map.scrollWheelZoom.disable(); });
    setBasemap();
    // A tile server can answer with an error picture that still "loads" (that is what the blocked tiles were).
    // One readable request tells us; if it is refused, drop the base map instead of showing error tiles.
    if (window.fetch) {
      fetch(TILES.sat.replace('{z}/{y}/{x}', '0/0/0'))
        .then(function (r) { if (!r.ok) plainBasemap(); })
        .catch(function () { /* offline: the tile error counter below handles it */ });
    }
  }

  function setBasemap() {
    if (!map) return;
    if (tiles) { map.removeLayer(tiles); tiles = null; }
    if (state.plain) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark', loaded = 0, failed = 0, sat = state.base === 'sat';
    var layer = L.tileLayer(sat ? TILES.sat : dark ? TILES.dark : TILES.light, { maxZoom: 18, maxNativeZoom: sat ? 18 : 16, attribution: sat ? SAT_CREDIT : TILE_CREDIT });
    layer.on('tileload', function () { loaded++; });
    layer.on('tileerror', function () { failed++; if (!loaded && failed >= 6) plainBasemap(); });
    tiles = layer.addTo(map);
    var box = $('map'); if (box && box.classList) box.classList.toggle('sat', sat);
  }

  function setBase(b) {
    state.base = b;
    try { localStorage.setItem('groundline-base', b); } catch (e) { /* not remembered */ }
    setBasemap();
    if (state.site && vectors) { drawVectors(state.site); highlight(); }
    Array.prototype.forEach.call(document.querySelectorAll('[data-base]'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-base') === b ? 'true' : 'false'); });
  }

  function plainBasemap() {
    if (state.plain) return;
    state.plain = true;
    if (tiles && map) map.removeLayer(tiles);
    tiles = null;
    var note = $('mapNote');
    note.hidden = false;
    note.textContent = 'The base map could not be loaded, so the data is shown on a plain background. Place names, lines and stations still locate it.';
  }

  function lineStyle(kind) { return kind === 'canal' ? null : kind === 'rail' ? '2 7' : '9 6'; }

  function rim() { return state.base === 'sat' && !state.plain ? '#ffffff' : '#1d1b17'; }   // marker outlines that read on the base map

  function drawVectors(s) {
    vectors.clearLayers(); shapes = {};
    (s.alignments || []).forEach(function (a) {
      var pts = a.lat.map(function (la, i) { return [la, a.lon[i]]; });
      var casing = L.polyline(pts, { color: '#ffffff', weight: 6, opacity: 0.95, interactive: false });
      var line = L.polyline(pts, { color: '#1d1b17', weight: 2.5, dashArray: lineStyle(a.kind), lineCap: 'butt', interactive: false });
      var hit = L.polyline(pts, { color: '#000', weight: 18, opacity: 0 });
      hit.bindTooltip(a.name, { sticky: true });
      hit.on('click', function (e) { L.DomEvent.stopPropagation(e); select({ type: 'alignment', name: a.name }); });
      vectors.addLayer(casing); vectors.addLayer(line); vectors.addLayer(hit);
      shapes['alignment:' + a.name] = { line: line, base: { color: '#1d1b17', weight: 2.5 } };
    });
    (s.places || []).forEach(function (p) {
      var m = L.circleMarker([p.lat, p.lon], { radius: 3, color: '#1d1b17', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1 });
      m.bindTooltip(p.name, { permanent: true, direction: 'right', offset: [5, 0], className: 'place' });
      if (p.series_cm) m.on('click', function (e) { L.DomEvent.stopPropagation(e); select({ type: 'place', name: p.name }); });
      vectors.addLayer(m);
    });
    (s.gps || []).forEach(function (g) {
      var total = last(g.gps_cm);                 // same quantity as the map, so fill and surroundings are comparable
      var m = L.circleMarker([g.lat, g.lon], { radius: 8, color: rim(), weight: 2.5, fillColor: total == null ? '#999' : colourFor(total, s.overlay.vmax_cm), fillOpacity: 1 });
      m.bindTooltip('GPS ' + g.id + (total == null ? '' : ': ' + cm(total) + ' cm'), { direction: 'top', offset: [0, -8] });
      m.on('click', function (e) { L.DomEvent.stopPropagation(e); select({ type: 'gps', id: g.id }); });
      vectors.addLayer(m);
      shapes['gps:' + g.id] = { marker: m };
    });
  }

  function highlight() {
    Object.keys(shapes).forEach(function (k) {
      var sh = shapes[k], on = state.sel && (state.sel.type + ':' + (state.sel.name || state.sel.id)) === k;
      if (sh.line) sh.line.setStyle(on ? { color: '#b7791f', weight: 5 } : sh.base);
      if (sh.marker) sh.marker.setStyle(on ? { radius: 11, color: '#b7791f', weight: 4 } : { radius: 8, color: rim(), weight: 2.5 });
    });
  }

  // How strongly a change is tinted: clear inside the noise band (the ground shows through), then in proportion to the change, up to 95% at three quarters of the scale
  // as the change grows to the end of the colour scale. view3d.js uses the same rule for the 3D surface.
  function tintAlpha(v, noise, vmax) {
    var a = Math.abs(v), n = noise || 0;
    if (a <= n) return 0;
    var edge = Math.min(1, (a - n) / Math.max(0.25 * n, 0.05));
    return edge * edge * (3 - 2 * edge) * 0.95 * Math.min(1, a / (0.75 * vmax));   // pale colours (small changes) stay faint
  }

  // The 2D layer for one date, drawn in the browser from the value grid so that changes inside the noise band are
  // transparent. Falls back to the exported picture when there is no grid or no canvas.
  function overlayUrl(s, i) {
    if (!s.grid) return s.overlay.files[i];
    var key = s.id + ':' + i;
    if (overlayCache[key]) return overlayCache[key];
    var c = document.createElement('canvas'), ctx = c.getContext && c.getContext('2d');
    if (!ctx) return s.overlay.files[i];
    var g = s.grid, f = gridFrames(s)[i], vmax = s.overlay.vmax_cm, n = s.noise.value_cm;
    c.width = g.width; c.height = g.height;
    var img = ctx.createImageData(g.width, g.height), d = img.data;
    for (var k = 0; k < f.length; k++) {
      if (f[k] === g.nodata) continue;
      var v = f[k] * g.step_cm, t = Math.max(0, Math.min(1, (v / vmax + 1) / 2)) * (RDBU.length - 1), q = Math.min(Math.floor(t), RDBU.length - 2), w = t - q;
      d[4 * k] = RDBU[q][0] * (1 - w) + RDBU[q + 1][0] * w;
      d[4 * k + 1] = RDBU[q][1] * (1 - w) + RDBU[q + 1][1] * w;
      d[4 * k + 2] = RDBU[q][2] * (1 - w) + RDBU[q + 1][2] * w;
      d[4 * k + 3] = 255 * tintAlpha(v, n, vmax);
    }
    ctx.putImageData(img, 0, 0);
    try { overlayCache[key] = c.toDataURL('image/png'); } catch (e) { return s.overlay.files[i]; }
    return overlayCache[key];
  }

  function loadSiteOnMap(s) {
    if (!s.grid) s.overlay.files.forEach(function (f) { var im = new Image(); im.src = f; });   // preload for smooth playback
    if (!map) return;
    if (overlay) map.removeLayer(overlay);
    if (hlLayer) { map.removeLayer(hlLayer); hlLayer = null; }
    Object.keys(extras).forEach(function (k) { map.removeLayer(extras[k]); });
    extras = {};
    overlay = L.imageOverlay(overlayUrl(s, state.i), s.overlay.bounds, { opacity: state.opacity, className: 'disp' + (s.grid ? ' smooth' : ''), pane: 'data' }).addTo(map);
    drawVectors(s);
    map.invalidateSize(false);                     // the map may have been hidden (world view) and still think it is 0 x 0
    map.fitBounds(s.overlay.bounds, { padding: [4, 4] });
    setTimeout(function () { map.invalidateSize(false); map.fitBounds(s.overlay.bounds, { padding: [4, 4], animate: false }); }, 60);
  }

  function layerControls(s) {
    var row = $('layerRow'); row.innerHTML = '';
    if (map && !state.plain) {
      var seg = h('span', { 'class': 'seg', role: 'group', 'aria-label': 'Base map' });
      [['sat', 'Satellite'], ['map', 'Map']].forEach(function (b) {
        var x = h('button', { type: 'button', 'data-base': b[0], 'aria-pressed': state.base === b[0] ? 'true' : 'false' }, b[1]);
        x.addEventListener('click', function () { setBase(b[0]); });
        seg.appendChild(x);
      });
      row.appendChild(seg);
    }
    if (map) {
      var op = h('label', { 'class': 'chip range' }, 'Colour strength <input type="range" min="20" max="100" step="5" value="' + Math.round(state.opacity * 100) + '" aria-label="Colour strength">');
      op.querySelector('input').addEventListener('input', function (e) { state.opacity = e.target.value / 100; if (overlay) overlay.setOpacity(state.opacity); });
      row.appendChild(op);
      (s.extra_overlays || []).forEach(function (x) {
        var c = h('label', { 'class': 'chip', title: x.note || '' }, '<input type="checkbox"> ' + esc(x.label));
        c.querySelector('input').addEventListener('change', function (e) {
          if (e.target.checked) extras[x.id] = L.imageOverlay(x.file, s.overlay.bounds, { opacity: x.id === 'zone' ? 1 : 0.85, className: 'disp', pane: 'data' }).addTo(map);
          else if (extras[x.id]) { map.removeLayer(extras[x.id]); delete extras[x.id]; }
        });
        row.appendChild(c);
      });
    }
    var kinds = {};
    (s.alignments || []).forEach(function (a) { kinds[a.kind] = true; });
    var names = { canal: 'canal', road: 'highway', rail: 'rail alignment' };
    Object.keys(kinds).forEach(function (k) {
      row.appendChild(h('span', { 'class': 'key' }, '<svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="currentColor" stroke-width="2.5"' + (lineStyle(k) ? ' stroke-dasharray="' + lineStyle(k) + '"' : '') + '/></svg>' + names[k]));
    });
    if ((s.gps || []).length) row.appendChild(h('span', { 'class': 'key' }, '<svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>GPS station, coloured by what it measured'));
  }

  function legend(s) {
    var v = s.overlay.vmax_cm, n = s.noise.value_cm, stops = RDBU.map(function (c, i) { return 'rgb(' + c.join(',') + ') ' + (i * 10) + '%'; }).join(',');
    var ticks = [-v, -v / 2, 0, v / 2, v].map(function (t) { return '<span style="left:' + ((t / v + 1) * 50) + '%">' + (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t) + '</span>'; }).join('');
    var noise = n == null ? '' : '<div class="noise" style="left:' + ((-n / v + 1) * 50) + '%;right:' + ((1 - (n / v + 1) / 2) * 100) + '%"></div>';
    var months = Math.round(days(s.dates[0], s.dates[s.dates.length - 1]) / 30.4);
    $('legend').innerHTML = '<div class="cap"><span>← sinking more</span><span>cm moved ' + esc(plainQ(s)) + ' in ' + months + ' months</span><span>rising more →</span></div>' +
      '<div class="bar" style="background:linear-gradient(90deg,' + stops + ')">' + noise + '<div class="zero"></div></div><div class="ticks">' + ticks + '</div>' +
      '<div class="note">' + (n == null ? '' : '<span class="swatch-noise"></span><b>Within ±' + n.toFixed(1) + ' cm</b> the radar cannot tell motion from noise, so the map leaves those places clear. ') +
      'Change since ' + fmtDate(s.dates[0]) + '. <details class="about"><summary>What exactly is measured</summary>' + esc(s.quantity.note) + (n == null ? '' : ' Noise level: ' + esc(s.noise.label) + '.') + '</details></div>';
  }

  // ---------- time
  function setDate(i) {
    var s = state.site; state.i = i;
    $('dateSlider').value = i;
    $('dateLabel').textContent = fmtDate(s.dates[i]);
    $('dateSub').textContent = i === 0 ? 'start of the record' : 'day ' + days(s.dates[0], s.dates[i]) + ' · change since ' + fmtDate(s.dates[0]);
    if (overlay) overlay.setUrl(overlayUrl(s, i));
    if (view3d && state.view === '3d' && view3dSite === s.id) view3d.setDate(i, true);   // the surface eases to the new date
    var fb = $('fallbackImg'); if (fb) fb.src = s.overlay.files[i];
    if (state.sel) renderDetail();
  }
  function stop() { clearInterval(state.timer); state.timer = null; $('playBtn').innerHTML = '&#9654;'; $('playBtn').setAttribute('aria-label', 'Play the time series'); }
  function play() {
    var n = state.site.dates.length;
    if (state.i >= n - 1) setDate(0);
    $('playBtn').innerHTML = '&#10073;&#10073;'; $('playBtn').setAttribute('aria-label', 'Pause');
    state.timer = setInterval(function () { if (state.i >= n - 1) stop(); else setDate(state.i + 1); }, 650);
  }

  // ---------- charts (hand-written SVG)
  function chart(host, cfg) {
    host.innerHTML = '';
    var W = Math.max(300, host.clientWidth || 560), H = cfg.height || 270, m = { l: 46, r: 14, t: 14, b: 30 };
    var xs = cfg.xs, x0 = xs[0], x1 = xs[xs.length - 1], lo = 0, hi = 0;
    cfg.series.forEach(function (s) {
      [s.ys, s.band && s.band.lo, s.band && s.band.hi].forEach(function (arr) {
        if (arr) arr.forEach(function (v) { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
      });
    });
    if (cfg.noise) { lo = Math.min(lo, -cfg.noise); hi = Math.max(hi, cfg.noise); }
    var step = niceStep(hi - lo || 1, 5); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; if (hi === lo) hi = lo + step;
    function X(v) { return m.l + (v - x0) / ((x1 - x0) || 1) * (W - m.l - m.r); }
    function Y(v) { return m.t + (hi - v) / (hi - lo) * (H - m.t - m.b); }
    function path(ys) {
      var d = '', pen = false;
      ys.forEach(function (v, i) { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; });
      return d;
    }
    var g = '';
    for (var t = lo; t <= hi + 1e-9; t += step) {
      g += '<line class="' + (Math.abs(t) < 1e-9 ? 'zero' : 'grid') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>' +
        '<text x="' + (m.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(+t.toFixed(6)) + '</text>';
    }
    var every = Math.ceil(cfg.xTicks.length / Math.max(2, Math.floor((W - m.l - m.r) / 64)));
    cfg.xTicks.forEach(function (tk, i) {
      if (i % every) return;
      g += '<line class="grid" x1="' + X(tk.v) + '" x2="' + X(tk.v) + '" y1="' + (H - m.b) + '" y2="' + (H - m.b + 5) + '"/><text x="' + X(tk.v) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(tk.label) + '</text>';
    });
    g += '<text x="' + m.l + '" y="10" text-anchor="start">' + esc(cfg.yLabel) + '</text>';
    if (cfg.noise) g += '<rect x="' + m.l + '" width="' + (W - m.l - m.r) + '" y="' + Y(cfg.noise) + '" height="' + (Y(-cfg.noise) - Y(cfg.noise)) + '" style="fill:var(--band)"/>';
    cfg.series.forEach(function (s) {
      if (!s.band) return;
      var up = [], down = [];
      xs.forEach(function (x, i) { if (s.band.lo[i] != null && s.band.hi[i] != null) { up.push(X(x).toFixed(1) + ' ' + Y(s.band.hi[i]).toFixed(1)); down.unshift(X(x).toFixed(1) + ' ' + Y(s.band.lo[i]).toFixed(1)); } });
      if (up.length) g += '<path d="M' + up.concat(down).join('L') + 'Z" style="fill:var(--band)"/>';
    });
    cfg.series.forEach(function (s) {
      g += '<path d="' + path(s.ys) + '" fill="none" style="stroke:' + s.color + '" stroke-width="' + (s.width || 2) + '" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
      if (s.dots) s.ys.forEach(function (v, i) { if (v != null) g += '<circle cx="' + X(xs[i]).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2.6" style="fill:' + s.color + ';stroke:var(--surface)" stroke-width="1"/>'; });
    });
    if (cfg.cursor != null) g += '<line class="cursor" x1="' + X(cfg.cursor) + '" x2="' + X(cfg.cursor) + '" y1="' + m.t + '" y2="' + (H - m.b) + '"/>';
    g += '<line class="hover" x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '" visibility="hidden"/>';
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(cfg.label) + '">' + g +
      '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '" fill="transparent"/></svg><div class="tip" hidden></div>';
    var svg = host.querySelector('svg'), tip = host.querySelector('.tip'), hl = host.querySelector('.hover');
    function move(ev) {
      var box = svg.getBoundingClientRect(), px = (ev.clientX - box.left) * (W / box.width), best = 0, bd = Infinity;
      xs.forEach(function (x, i) { var d = Math.abs(X(x) - px); if (d < bd) { bd = d; best = i; } });
      hl.setAttribute('x1', X(xs[best])); hl.setAttribute('x2', X(xs[best])); hl.setAttribute('visibility', 'visible');
      tip.innerHTML = '<b>' + esc(cfg.xFmt(xs[best], best)) + '</b>' + cfg.series.map(function (s) {
        return '<div><i style="background:' + s.color + '"></i>' + esc(s.short || s.name) + '<span>' + cm(s.ys[best]) + ' cm</span></div>';
      }).join('');
      tip.hidden = false;
      var left = X(xs[best]) * (box.width / W);
      tip.style.left = Math.max(90, Math.min(box.width - 90, left)) + 'px'; tip.style.top = (m.t + 4) + 'px';
      tip.style.transform = 'translate(-50%, 0)';
    }
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', function () { tip.hidden = true; hl.setAttribute('visibility', 'hidden'); });
  }

  function chartLegend(series, extra) {
    return '<div class="chart-legend">' + series.map(function (s) {
      return '<span><i class="' + (s.dash ? 'dash' : '') + '" style="border-color:' + s.color + '"></i>' + esc(s.name) + '</span>';
    }).join('') + (extra || '') + '</div>';
  }
  function valueTable(head, rows) {
    return '<details class="table"><summary>Show these values as a table</summary><div class="scroll"><table><thead><tr>' + head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="num"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></details>';
  }
  function dateAxis(s) {
    var d0 = toDate(s.dates[0]), xs = s.dates.map(function (d) { return days(s.dates[0], d); }), ticks = [];
    var cur = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)), end = toDate(s.dates[s.dates.length - 1]);
    while (cur <= end) {
      ticks.push({ v: Math.round((cur - d0) / 864e5), label: MONTHS[cur.getUTCMonth()] + (cur.getUTCMonth() === 0 ? ' ' + cur.getUTCFullYear() : '') });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
    return { xs: xs, ticks: ticks, fmt: function (x, i) { return fmtDate(s.dates[i]); } };
  }

  // ---------- detail panel
  function select(sel) { state.sel = sel; var p = $('picker'); p.value = sel ? sel.type + ':' + (sel.name || sel.id || '') : ''; if (p.selectedIndex < 0) p.selectedIndex = 0; highlight(); renderDetail(); }

  function buildPicker(s) {
    var html = '<option value="">Select a station or an alignment…</option>';
    if ((s.alignments || []).length) html += '<optgroup label="Infrastructure">' + s.alignments.map(function (a) { return '<option value="alignment:' + esc(a.name) + '">' + esc(a.name) + '</option>'; }).join('') + '</optgroup>';
    if ((s.gps || []).length) html += '<optgroup label="GPS stations">' + s.gps.map(function (g) { return '<option value="gps:' + esc(g.id) + '">' + esc(g.id) + ' (r = ' + fmtR(g.r) + ')</option>'; }).join('') + '</optgroup>';
    var pl = (s.places || []).filter(function (p) { return p.series_cm; });
    if (pl.length) html += '<optgroup label="Places">' + pl.map(function (p) { return '<option value="place:' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('') + '</optgroup>';
    $('picker').innerHTML = html;
  }

  function seriesPanel(s, o) {
    var ax = dateAxis(s), box = $('detail');
    box.innerHTML = '<div class="kicker">' + esc(o.kicker) + '</div><h3 class="title">' + esc(o.title) + '</h3>' +
      (o.kpis ? '<div class="kpis">' + o.kpis.map(function (k) { return '<div class="kpi"><div class="v">' + esc(k[0]) + '</div><div class="l">' + esc(k[1]) + '</div></div>'; }).join('') + '</div>' : '') +
      chartLegend(o.series, o.noise ? '<span><i class="bandkey"></i>noise ±' + o.noise.toFixed(1) + ' cm</span>' : '') + '<div class="chart"></div>' +
      (o.flag ? '<p class="flag">' + esc(o.flag) + '</p>' : '') + '<p class="note">' + esc(o.note) + '</p>' +
      valueTable(['Date'].concat(o.series.map(function (x) { return (x.short || x.name) + ' (cm)'; })), s.dates.map(function (d, i) {
        return [fmtDate(d)].concat(o.series.map(function (x) { return cm(x.ys[i], 2); }));
      }));
    chart(box.querySelector('.chart'), { xs: ax.xs, xTicks: ax.ticks, xFmt: ax.fmt, series: o.series, yLabel: 'cm moved, ' + plainQ(s), cursor: ax.xs[state.i], noise: o.noise, label: o.title });
  }

  // The per-date value grid ships as base64 signed bytes (value = byte * step_cm, -128 = no data).
  function gridFrames(s) {
    return gridCache[s.id] || (gridCache[s.id] = s.grid.frames_b64.map(function (t) {
      var bin = atob(t), a = new Int8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i) << 24 >> 24; return a;
    }));
  }

  // ---------- 3D surface (site/view3d.js); the 2D map stays the default and the fallback
  function initView() {
    var G = window.Groundline3D, box = $('viewToggle');
    if (!G || !G.supported()) return;                          // no WebGL or no three.js: the toggle stays hidden
    [['2d', '2D map'], ['3d', '3D surface']].forEach(function (v) {
      var b = h('button', { type: 'button', 'data-view': v[0], 'aria-pressed': v[0] === '2d' ? 'true' : 'false' }, v[1]);
      b.addEventListener('click', function () { setView(v[0]); });
      box.appendChild(b);
    });
    box.hidden = false;
    $('exag').addEventListener('input', function (e) { if (view3d) { view3d.setExaggeration(+e.target.value); caption3d(); } });
    $('flatten').addEventListener('change', function (e) { if (view3d) { view3d.setFlatten(e.target.checked); caption3d(); } });
    $('reset3d').addEventListener('click', function () { if (view3d) view3d.reset(); });
    Array.prototype.forEach.call(document.querySelectorAll('#mode3d [data-mode3d]'), function (b) {
      b.addEventListener('click', function () { setMode3d(b.getAttribute('data-mode3d')); });
    });
  }

  // Two honest 3D views: real relief with the change as colour, or flat ground with height = sinking (hugely stretched).
  function setMode3d(m) {
    state.mode3d = m;
    Array.prototype.forEach.call(document.querySelectorAll('#mode3d [data-mode3d]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode3d') === m ? 'true' : 'false'); });
    $('exag').value = 1;                                   // each mode starts from its own default stretch
    if (view3d) { view3d.setExaggeration(1); view3d.setMode(m); caption3d(); }
  }

  function setView(v) {
    if (v === '3d' && !state.site.grid) v = '2d';
    if (v === '3d' && !view3d) {
      try { view3d = window.Groundline3D.create($('map3d'), $('labels3d'), pick3d); view3d.setMode(state.mode3d); }
      catch (e) { $('viewToggle').hidden = true; v = '2d'; }   // WebGL refused after all: stay in 2D
    }
    state.view = v;
    $('map').hidden = v === '3d'; $('map3d').hidden = v !== '3d'; $('controls3d').hidden = v !== '3d'; $('layerRow').hidden = v === '3d';
    Array.prototype.forEach.call($('viewToggle').children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === v ? 'true' : 'false'); });
    if (v === '3d') load3d();
    else if (map) setTimeout(function () { map.invalidateSize(); }, 30);
  }

  // A click in 3D does what the same click does on the 2D map.
  function pick3d(sel) {
    var s = state.site;
    if (sel.type === 'place') {
      var p = (s.places || []).filter(function (x) { return x.name === sel.name; })[0];
      sel = p && p.series_cm ? { type: 'place', name: p.name } : { type: 'point', lat: sel.lat, lon: sel.lon };
    }
    select(sel);
  }

  // Rising ground is given height in the filtered 3D surface only if some GPS station measured a rise beyond the noise.
  function upliftConfirmed(s) {
    var n = s.noise.value_cm || 0;
    return (s.gps || []).some(function (g) { return (g.gps_cm || []).some(function (v) { return v != null && v > n; }); });
  }

  function load3d() {
    var s = state.site;
    if (view3dSite !== s.id) {
      view3d.setSite({ grid: s.grid, frames: gridFrames(s), bounds: s.overlay.bounds, vmax: s.overlay.vmax_cm, noise: s.noise.value_cm,
        alignments: s.alignments, gps: s.gps, places: s.places, upliftConfirmed: upliftConfirmed(s),
        imagery: { url: TILES.sat, credit: SAT_CREDIT }, elevation: DEM });
      view3d.onImagery(caption3d);                                   // the caption mentions the imagery once it is there
      view3dSite = s.id;
    }
    view3d.resize();
    view3d.setDate(state.i, false);
    caption3d();
  }

  function caption3d() {
    var s = state.site, f = view3d && view3d.info(), g = s.grid;
    if (!f) return;
    var t;
    if (f.mode === 'terrain') {
      t = f.dem === 'ok'
        ? 'Real terrain: height is the real ground, stretched ' + f.terrainTimes + '× (from ' + f.lowM.toLocaleString('en-US') + ' m up to ' + (f.lowM + f.reliefM).toLocaleString('en-US') + ' m across ' + Math.round(f.widthKm) + ' km). '
        : f.dem === 'loading' ? 'Real terrain: loading elevation… '
          : 'Real terrain: elevation could not be loaded, so the ground is drawn flat. ';
      t += 'Colour shows how far the ground moved since ' + fmtDate(s.dates[0]) + (f.noise != null ? '; changes within ±' + f.noise.toFixed(1) + ' cm are left clear' : '') +
        '. Centimetres of sinking are far too small to see as height at this scale: switch to "Sinking depth" for that.' + (f.imagery ? ' Satellite imagery underneath.' : '');
      $('caption3d').textContent = t;
      return;
    }
    t = 'Sinking depth: height is how far the ground sank, stretched ' + f.times.toLocaleString('en-US') + ' times so that centimetres show across ' + Math.round(f.widthKm) + ' km; real hills and mountains are flattened. ';
    t += g.clipped_at_cm
      ? 'The colour scale and the depth stop at ' + g.clipped_at_cm + ' cm; ' + (g.clipped_fraction_last * 100).toFixed(1) + '% of the ground sank more than that, so the deepest bowls have flat floors. '
      : 'The deepest point sank ' + f.maxCm.toFixed(1) + ' cm. ';
    if (f.flatten) {
      t += 'The surface is smoothed over about ' + Math.round(f.cellKm * 5) + ' km' + (f.noise != null ? ', and changes within the ±' + f.noise.toFixed(1) + ' cm noise are drawn flat and clear' : '') + ', so radar speckle does not look like hills. ';
      if (f.upliftFlat) t += 'Rising ground is shown by colour only, without height: no GPS station here confirms a rise. ';
      t += 'The 2D map and the readings you click are not smoothed; untick "Smoothed surface" to see the raw values. ';
    } else if (f.noise != null) {
      t += 'Raw surface: bumps and dips smaller than about ' + (2 * f.noise).toFixed(0) + ' cm are mostly noise. ';
    }
    t += 'The faint grid is the ground level on ' + fmtDate(s.dates[0]) + ' (' + f.gridKm + ' km squares)' + (f.imagery ? '; satellite imagery underneath.' : '.');
    $('caption3d').textContent = t;
  }

  function gridSeries(s, lat, lon) {
    var g = s.grid, b = s.overlay.bounds, col = Math.floor((lon - b[0][1]) / (b[1][1] - b[0][1]) * g.width);
    var row = Math.floor((mercY(b[1][0]) - mercY(lat)) / (mercY(b[1][0]) - mercY(b[0][0])) * g.height);
    if (col < 0 || row < 0 || col >= g.width || row >= g.height) return null;
    var out = gridFrames(s).map(function (f) { var v = f[row * g.width + col]; return v === g.nodata ? null : +(v * g.step_cm).toFixed(1); });
    return out.some(function (v) { return v != null; }) ? out : null;
  }

  function onMapClick(e) {
    var s = state.site;
    if (s.grid) select({ type: 'point', lat: e.latlng.lat, lon: e.latlng.lng });
    else if (!state.sel) renderDetail('This case has no point lookup yet.');
  }

  function renderDetail(hint) {
    var s = state.site, sel = state.sel, box = $('detail'), q = s.quantity.short, noise = s.noise.value_cm;
    if (!sel) {
      var lines = (s.alignments || []).length > 0;
      box.innerHTML = '<div class="empty"><div><strong>' + (lines ? 'Select a station or an alignment' : 'Select a station') + (s.grid ? ', or click anywhere on the map' : '') + '</strong>' +
        (hint ? esc(hint) + ' ' : '') + (lines ? 'Lines are canals, highways and the rail alignment. ' : '') + 'Circles are GPS stations.' + (s.grid ? ' Any point on the map, 2D or 3D, returns its history.' : '') + '</div></div>';
      return;
    }
    if (sel.type === 'gps') {
      var g = s.gps.filter(function (x) { return x.id === sel.id; })[0], series = [
        { name: g.radar_label + (g.radar_sigma_cm ? ', with ±1σ band' : ''), short: 'Radar', ys: g.radar_cm, color: 'var(--radar)', width: 2.5, dots: true,
          band: g.radar_sigma_cm ? { lo: g.radar_cm.map(function (v, i) { return v == null || g.radar_sigma_cm[i] == null ? null : v - g.radar_sigma_cm[i]; }),
            hi: g.radar_cm.map(function (v, i) { return v == null || g.radar_sigma_cm[i] == null ? null : v + g.radar_sigma_cm[i]; }) } : null },
        { name: g.gps_label, short: 'GPS', ys: g.gps_cm, color: 'var(--gps)', width: 2, dots: true }];
      if (g.radar_map_cm) series.push({ name: 'Published map at this spot (median within ' + s.buffer_km + ' km)', short: 'Map', ys: g.radar_map_cm, color: 'var(--muted)', width: 1.5, dash: '5 4' });
      var a = last(g.gps_cm), b = last(g.radar_cm), over = noise != null && a != null && b != null && Math.abs(a) < noise && Math.abs(b - a) > noise;
      seriesPanel(s, {
        kicker: 'GPS station', title: g.id, series: series,
        kpis: [[fmtR(g.r), 'match with GPS (1 = perfect)'], [g.rms_cm == null ? 'n/a' : g.rms_cm.toFixed(1) + ' cm', 'typical gap between the curves'], [String(g.n), 'dates compared'], [cm(a) + ' / ' + cm(b), 'GPS / radar at the end, cm']],
        flag: over ? 'The radar over-reads here: GPS shows almost no motion, yet the radar differs from it by more than the noise level. Slowly moving ground is where this method is weakest.' : '',
        note: s.quantity.key === 'vertical'
          ? 'The radar curve was computed with this station left out of the GPS tie, so it is an independent check. RMS is computed from the two curves shown.'
          : 'Radar is measured relative to ' + (s.reference ? s.reference.name : 'the scene median') + ', assumed stable. ' +
            (g.los_unit_enu ? 'GPS east, north and up motion is projected onto the radar line of sight with the viewing geometry stored in the radar product.' : 'GPS height change is multiplied by an assumed 0.77 to project it onto the radar line of sight.')
      });
    } else if (sel.type === 'place' || sel.type === 'point') {
      var ys, title, kick, note, sig = null;
      if (sel.type === 'place') {
        var p = s.places.filter(function (x) { return x.name === sel.name; })[0];
        ys = p.series_cm; title = p.name; kick = 'Place, median within ' + p.radius_km + ' km';
        note = 'Final value ' + cm(p.median_cm) + pm(p.sigma_cm) + ' cm; 5th to 95th percentile inside the circle ' + cm(p.p05_cm) + ' to ' + cm(p.p95_cm) + ' cm.';
        var sig = p.sigma_cm;
      } else {
        ys = gridSeries(s, sel.lat, sel.lon); title = sel.lat.toFixed(3) + '°, ' + sel.lon.toFixed(3) + '°'; kick = 'Map reading';
        sig = sigmaAt(s, sel.lat, sel.lon);
        note = 'Read from a half-resolution copy of the map (cells of about ' + Math.round(s.provenance.pixel_m[0] * 2 / 10) * 10 + ' m, steps of ' + s.grid.step_cm + ' cm).';
        if (!ys) { box.innerHTML = '<div class="empty"><div><strong>No data at this point</strong>Click inside the coloured area.</div></div>'; return; }
        var lim = s.grid.clipped_at_cm;
        if (lim && ys.some(function (v) { return v != null && Math.abs(v) >= lim - s.grid.step_cm; })) note += ' This layer stops at ±' + lim + ' cm: readings at that limit mean "' + lim + ' cm or more".';
        if (s.grid.source) note += ' Values are ' + s.grid.source + '.';
      }
      seriesPanel(s, { kicker: kick, title: title, noise: noise, note: note,
        kpis: [[cm(last(ys)) + pm(sig) + ' cm', 'change by ' + fmtDate(s.dates[s.dates.length - 1]) + (sig != null ? ' (± one standard deviation)' : '')], [cm(ys[state.i]) + ' cm', 'on ' + fmtDate(s.dates[state.i])]],
        series: [{ name: 'Radar, ' + q, short: 'Radar', ys: ys, color: 'var(--radar)', width: 2.5, dots: true }] });
    } else if (sel.type === 'alignment') {
      var al = s.alignments.filter(function (x) { return x.name === sel.name; })[0], rows = s.reaches.filter(function (r) { return r.alignment === al.name; });
      var nOver = rows.filter(function (r) { return r.exceeds_noise; }).length, summer = rows.some(function (r) { return r.summer_mean_cm != null; });
      var lastDate = fmtDate(s.dates[s.dates.length - 1]), series = [
        { name: 'Total to ' + lastDate + ', with ±1σ band', short: 'Total', ys: al.total_cm, color: 'var(--ink-2)', width: 1.5,
          band: { lo: al.total_cm.map(function (v, i) { return v - al.sigma_cm[i]; }), hi: al.total_cm.map(function (v, i) { return v + al.sigma_cm[i]; }) } },
        { name: 'On ' + fmtDate(s.dates[state.i]), short: fmtDate(s.dates[state.i]), ys: al.series_cm[state.i], color: 'var(--radar)', width: 2.5 }];
      var d0 = al.dist_km[0], d1 = al.dist_km[al.dist_km.length - 1], st = niceStep(d1 - d0, 6), ticks = [];
      for (var t = Math.ceil(d0 / st) * st; t <= d1; t += st) ticks.push({ v: t, label: t + ' km' });
      box.innerHTML = '<div class="kicker">Profile along the alignment, median within ' + s.buffer_km + ' km</div><h3 class="title">' + esc(al.name) + '</h3>' +
        '<div class="kpis"><div class="kpi"><div class="v">' + nOver + ' of ' + rows.length + '</div><div class="l">10-km reaches beyond twice the noise</div></div>' +
        '<div class="kpi"><div class="v">' + cm(Math.min.apply(null, al.total_cm)) + ' cm</div><div class="l">most negative point</div></div></div>' +
        chartLegend(series) + '<div class="chart"></div>' +
        '<p class="note">Distance runs along the mapped line from its first covered point. Move the date slider to watch the profile deepen. ' + esc(s.quantity.label) + '.</p>' +
        '<div class="scroll"><table><thead><tr><th>Reach</th><th class="t">Near</th><th>Change, cm</th><th>±1σ</th><th class="t">Signal</th>' + (summer ? '<th>Two tracks, ' + esc(s.headline.canal.summer_window) + '</th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r, i) {
          return '<tr class="click' + (r.exceeds_noise ? ' over' : '') + '" data-i="' + i + '" tabindex="0"><td>km ' + r.km_from + '–' + r.km_to + '</td><td class="t">' + esc(r.near) + '</td><td class="num">' + cm(r.mean_cm) + '</td><td class="num">' + r.sigma_cm.toFixed(1) + '</td>' +
            '<td class="t"><span class="badge ' + (r.exceeds_noise ? 'yes">beyond noise' : 'no">within noise') + '</span></td>' +
            (summer ? '<td class="num">' + (r.summer_mean_cm == null ? 'one track only' : cm(r.summer_mean_cm) + ' ± ' + r.summer_sigma_cm.toFixed(1) + (r.summer_two_track_confirmed ? ' ✓' : '')) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div><p class="note">Select a row to move the map there. ✓ = both tracks negative and their mean beyond twice its uncertainty.</p>';
      chart(box.querySelector('.chart'), { xs: al.dist_km, xTicks: ticks, xFmt: function (x, i) { return 'km ' + x.toFixed(0) + ' (' + al.lat[i].toFixed(2) + '°N)'; }, series: series, yLabel: 'cm moved, ' + plainQ(s), label: 'Profile along ' + al.name });
      Array.prototype.forEach.call(box.querySelectorAll('tr.click'), function (tr) {
        function go() { var r = rows[+tr.getAttribute('data-i')]; if (map) map.flyTo([r.lat, r.lon], 11, { duration: 0.8 }); }
        tr.addEventListener('click', go); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      });
    }
  }

  // ---------- freshness
  function freshness(s) {
    var lastDate = s.dates[s.dates.length - 1];
    $('freshUsed').innerHTML = '<div class="kicker">Radar passes in this map, up to</div><div class="big">' + fmtDate(lastDate) + '</div>' +
      s.tracks.map(function (t) { return '<p>Track ' + t.path + ', ' + esc(t.direction) + ': ' + t.pairs + ' pairs, ' + fmtDate(t.first) + ' to ' + fmtDate(t.last) + '</p>'; }).join('');
    var sp = s.state_product;
    $('freshState').innerHTML = sp
      ? '<div class="kicker">State-published data, for comparison</div><div class="big">' + fmtDate(sp.final_to.replace(/-/g, '')) + '</div><p>Final to ' + fmtDate(sp.final_to.replace(/-/g, '')) + '; provisional to ' + fmtDate(sp.provisional_to.replace(/-/g, '')) + '; updated ' + esc(sp.cadence) + '.</p><p><a href="' + esc(sp.url) + '" rel="noopener">' + esc(sp.name) + '</a></p>'
      : '<div class="kicker">What the motion is measured against</div><div class="big">' + esc(s.reference ? s.reference.name : 'Scene median') + '</div><p>Assumed stable. No state-published product is compared for this case.</p>';
    // timeline: one common axis from the first radar date to today
    var t0 = toDate(s.dates[0]), now = new Date(), t1 = now > toDate(lastDate) ? now : toDate(lastDate);
    function pct(d) { return Math.max(0, Math.min(100, (d - t0) / (t1 - t0) * 100)); }
    function row(label, cls, d, text) {
      var p = pct(d), inside = p > 72 && cls !== 'prov';       // label inside the bar when there is no room after it
      return '<div class="tl-row"><div>' + esc(label) + '</div><div class="tl-track"><div class="tl-bar ' + cls + '" style="left:0;width:' + p + '%"></div>' +
        '<div class="tl-end" style="' + (inside ? 'right:' + (100 - p) + '%;padding:0 10px 0 0;color:#fff' : 'left:' + Math.min(p, 70) + '%') + '">' + esc(text) + '</div><div class="tl-today"></div></div></div>';
    }
    var html = row('This map (NISAR previews)', 'ours', toDate(lastDate), 'to ' + fmtDate(lastDate));
    if (sp) html += row('State product, provisional', 'prov', toDate(sp.provisional_to.replace(/-/g, '')), 'to ' + fmtDate(sp.provisional_to.replace(/-/g, ''))) +
      row('State product, final', '', toDate(sp.final_to.replace(/-/g, '')), 'to ' + fmtDate(sp.final_to.replace(/-/g, '')));
    $('freshTimeline').innerHTML = html + '<div class="tl-axis"><span>' + fmtDate(t0) + '</span><span>today, ' + fmtDate(now) + ' (dashed)</span></div>';
    liveCheck(s, false);
  }

  function liveCheck(s, force) {
    var box = $('freshLive');
    function show(res) {
      if (state.site !== s) return;
      var again = '<p><button class="linkbtn" type="button" id="recheck">Check again</button></p>';
      if (res.error) {
        box.innerHTML = '<div class="kicker">Passes listed in NASA\'s catalogue</div><div class="big">Not reachable</div><p class="status"><span class="dot off"></span>Offline or blocked: ' + esc(res.error) + '</p><p>Showing the last published state. Nothing on this page depends on the live check.</p>' + again;
      } else {
        var lines = res.tracks.map(function (t) {
          return '<p>Track ' + t.path + ': newest pair ' + fmtDate(t.ref) + ' → ' + fmtDate(t.sec) + (t.newer ? '; <strong>' + t.newer + ' newer pair' + (t.newer > 1 ? 's' : '') + '</strong> not yet in this map' : '; already in this map') + '</p>';
        }).join('') || '<p>No pairs listed for this track at this point.</p>';
        var behind = res.tracks.some(function (t) { return t.newer; });
        box.innerHTML = '<div class="kicker">Passes listed in NASA\'s catalogue</div><div class="big">' + (res.newest ? fmtDate(res.newest) : 'n/a') + '</div>' +
          '<p class="status"><span class="dot ' + (behind ? 'behind' : 'live') + '"></span>' + (behind ? 'Some listed pairs are not in this map' : 'This map includes every listed pair') + '</p>' + lines +
          '<p class="muted">Checked ' + new Date(res.at).toLocaleTimeString() + ' against the ASF search API.</p>' + again;
      }
      var b = $('recheck'); if (b) b.addEventListener('click', function () { liveCheck(s, true); });
    }
    if (liveCache[s.id] && !force) { show(liveCache[s.id]); return; }
    box.innerHTML = '<div class="kicker">Passes listed in NASA\'s catalogue</div><div class="big">Checking…</div><p class="status"><span class="dot wait"></span>Asking the ASF search API which pairs exist</p>';
    if (!window.fetch) { show({ error: 'this browser has no fetch()' }); return; }
    var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
    fetch(ASF.replace('{lon}', s.search_point[0]).replace('{lat}', s.search_point[1]), ctl ? { signal: ctl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var list = (j.results || []), tracks = s.tracks.map(function (t) {
          var best = null, newer = 0;
          list.forEach(function (g) {
            var name = g.granuleName || '', d = name.match(/20\d{6}(?=T\d{6})/g), urls = (g.browse || []).join(' ');
            if (!d || d.length < 4 || /_UR_/.test(name) || urls.indexOf('/NISAR-UR/') >= 0) return;       // skip urgent-response copies
            if (+g.path !== t.path || +g.frame !== t.frame) return;
            if (!best || d[2] > best.sec || (d[2] === best.sec && d[0] > best.ref)) best = { ref: d[0], sec: d[2] };
          });
          if (best) {
            var seen = {};
            list.forEach(function (g) {
              var name = g.granuleName || '', d = name.match(/20\d{6}(?=T\d{6})/g);
              if (d && d.length >= 4 && !/_UR_/.test(name) && +g.path === t.path && +g.frame === t.frame && d[2] > t.last && !seen[d[0] + d[2]]) { seen[d[0] + d[2]] = 1; newer++; }
            });
          }
          return best ? { path: t.path, ref: best.ref, sec: best.sec, newer: newer } : null;
        }).filter(Boolean);
        var newest = tracks.map(function (t) { return t.sec; }).sort().pop();
        liveCache[s.id] = { tracks: tracks, newest: newest, at: Date.now() };
        show(liveCache[s.id]);
      })
      .catch(function (err) { show({ error: err && err.name === 'AbortError' ? 'timed out' : String(err && err.message || err) }); })
      .then(function () { clearTimeout(timer); });
  }



  // ---------- who and what is on sinking ground (site/data/<id>_impact.js, window.IMPACT)
  var IMPACT = window.IMPACT || {}, hlLayer = null;
  var KIND = { road: 'road', rail: 'railway', canal: 'canal', metro: 'metro / light rail' };
  function fmtPeople(n) {
    if (n == null) return 'n/a';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million';
    if (n >= 1000) return (Math.round(n / 100) * 100).toLocaleString('en-US');
    return String(Math.round(n));
  }
  function bdi(t) { return '<bdi dir="auto">' + esc(t == null ? '' : t) + '</bdi>'; }   // OSM names may be right-to-left
  function quantityWords(key) {
    return key === 'vertical' ? 'measured as up-and-down movement'
      : 'measured toward or away from the satellite; true vertical sinking is about 1.3 times larger, so these counts are on the low side';
  }
  function impactPanel(s) {
    var box = $('impact'), I = IMPACT[s.id];
    if (!I || !I.exposure) { box.hidden = true; box.innerHTML = ''; return; }
    var E = I.exposure, P = E.people || {}, inf = E.infrastructure || {}, pc = E.population_check || {}, days = (E.period && E.period.days) || s.span_days;
    var g5 = P.ge_5cm, g10 = P.ge_10cm, bn = P.beyond_noise, html = '<h3 class="imp-h">Who and what is on sinking ground</h3>';
    html += '<div class="kpis">' +
      '<div class="kpi"><div class="v">' + fmtPeople(g5 && g5.people) + '</div><div class="l">people on ground that sank 5 cm or more</div></div>' +
      '<div class="kpi"><div class="v">' + fmtPeople(g10 && g10.people) + '</div><div class="l">on ground that sank 10 cm or more</div></div></div>';
    html += '<p class="note">In ' + days + ' days (' + esc(monthSpan(s.dates)) + '), ' + quantityWords(E.quantity && E.quantity.key) + '.</p>';
    if (pc.cells_over_50k_per_km2 > 0) html += '<p class="flag">Upper-end estimate: the population model is very dense here (' + pc.cells_over_50k_per_km2 + ' map cells above 50,000 people per km², up to ' + (pc.max_cell_people_per_km2 || 0).toLocaleString('en-US') + '), so these counts may run high.</p>';
    if (bn && bn.people != null) html += '<p class="muted small">Counting every change beyond the noise (' + Math.abs(bn.threshold_cm).toFixed(1) + ' cm or more here): ' + fmtPeople(bn.people) + ' people.' + (bn.threshold_cm > -5 ? ' The noise level is small here, so this count reaches down to small changes and runs high; it is not the headline.' : '') + '</p>';

    var segs = inf.worst_segments || [], ports = (inf.airports || []).filter(function (a) { return a.median_cm != null; });
    if (segs.length) {
      html += '<h4>Worst stretches</h4><ul class="imp-list">' + segs.slice(0, 5).map(function (g, i) {
        return '<li><button type="button" class="imp-go" data-seg="' + i + '"><span class="imp-k">' + esc(KIND[g.kind] || g.kind) + '</span> ' + bdi(g.name) +
          (g.km_from != null ? ' <span class="muted">km ' + g.km_from + '–' + g.km_to + '</span>' : '') +
          ' <b>' + cm(g.mean_cm) + ' cm</b>' + (g.near ? ' <span class="muted">near ' + bdi(g.near) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>';
    }
    if (ports.length) {
      html += '<h4>Airports</h4><ul class="imp-list">' + ports.map(function (a, i) {
        return '<li><button type="button" class="imp-go" data-port="' + i + '"><span class="imp-k">airport</span> ' + bdi(a.name) + (a.iata ? ' (' + esc(a.iata) + ')' : '') +
          ' <b>' + cm(a.median_cm) + ' cm</b> <span class="muted">median' + (a.beyond_noise ? '' : ', within noise') + '</span></button></li>';
      }).join('') + '</ul>';
    }
    var L10 = [], L5 = [];
    Object.keys(inf.lengths || {}).forEach(function (k) {
      var x = inf.lengths[k];
      if (x.ge_10cm_km > 0) L10.push(esc(KIND[k] || k) + ' ' + x.ge_10cm_km.toFixed(0) + ' km');
      else if (x.ge_5cm_km > 0) L5.push(esc(KIND[k] || k) + ' ' + x.ge_5cm_km.toFixed(0) + ' km');
    });
    if (L10.length) html += '<p class="small">On ground that sank 10 cm or more: ' + L10.join(' · ') + '.</p>';
    if (L5.length) html += '<p class="small">On ground that sank 5 cm or more: ' + L5.join(' · ') + '.</p>';
    if (I.change && I.change.verdict) {
      // shown whole: a first sentence alone can drop the qualifier ("none of them passes the robustness checks")
      html += '<p class="imp-change muted small"><b>Since the last few passes:</b> ' + esc(I.change.verdict) + '</p>';
    }
    html += '<p class="imp-credit">Population: GHS-POP R2023A (European Commission JRC, CC BY 4.0). ' +
      (inf.source === 'osm' ? 'Roads, rail, canals and airports: &copy; OpenStreetMap contributors (ODbL).' : 'Canal, road and rail lines from OpenStreetMap (&copy; contributors, ODbL).') + '</p>';
    box.innerHTML = html; box.hidden = false;
    Array.prototype.forEach.call(box.querySelectorAll ? box.querySelectorAll('.imp-go') : [], function (b) {
      b.addEventListener('click', function () {
        var si = b.getAttribute('data-seg'), pi = b.getAttribute('data-port');
        showFeature(s, si != null ? segs[+si] : null, pi != null ? ports[+pi] : null);
      });
    });
  }
  // Fly the 2D map to a segment or airport and mark it.
  function showFeature(s, seg, port) {
    if (!map) return;
    if (state.view === '3d') setView('2d');
    if (hlLayer) { map.removeLayer(hlLayer); hlLayer = null; }
    var pts = null, layers = [];
    if (seg) {
      if (seg.from && seg.to) pts = [seg.from, seg.to];
      else if (seg.km_from != null) {
        var al = (s.alignments || []).filter(function (a) { return a.name === seg.name; })[0];
        if (al) pts = al.dist_km.map(function (d, i) { return d >= seg.km_from && d <= seg.km_to ? [al.lat[i], al.lon[i]] : null; }).filter(Boolean);
      }
      if (pts && pts.length > 1) {
        layers.push(L.polyline(pts, { color: '#ffffff', weight: 13, opacity: 0.95, interactive: false }), L.polyline(pts, { color: '#f5a524', weight: 7, interactive: false }));
      } else { pts = [[seg.lat, seg.lon]]; layers.push(L.circleMarker(pts[0], { radius: 14, color: '#f5a524', weight: 5, fill: false })); }
    } else if (port) {
      pts = [[port.lat, port.lon]];
      layers.push(L.circle(pts[0], { radius: 1500, color: '#f5a524', weight: 5, fill: false }));
    }
    if (!pts) return;
    hlLayer = L.layerGroup(layers).addTo(map);
    if (pts.length > 1) map.flyToBounds(pts, { padding: [60, 60], maxZoom: 13, duration: 0.8 });
    else map.flyTo(pts[0], 12, { duration: 0.8 });
    var r = $('map').getBoundingClientRect && $('map').getBoundingClientRect();
    if (r && (r.bottom < 80 || r.top > window.innerHeight - 80) && $('map').scrollIntoView) $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // World view: people on ground that sank 5 cm or more, summed over the measured places.
  function worldImpact() {
    var box = $('worldImpact'), ids = Object.keys(IMPACT).filter(function (k) { return DATA[k] && IMPACT[k].exposure && IMPACT[k].exposure.people && IMPACT[k].exposure.people.ge_5cm; });
    if (!box) return;
    if (!ids.length) { box.hidden = true; return; }
    var total = 0, days = [], upper = [], los = 0;
    ids.forEach(function (k) {
      var E = IMPACT[k].exposure; total += E.people.ge_5cm.people || 0;
      days.push((E.period && E.period.days) || DATA[k].span_days);
      if ((E.population_check || {}).cells_over_50k_per_km2 > 0) upper.push(DATA[k].name);
      if (E.quantity && E.quantity.key === 'los') los++;
    });
    var note = 'Sum over ' + ids.length + ' measured places. The periods differ (' + Math.min.apply(null, days) + ' to ' + Math.max.apply(null, days) + ' days), so this is not a yearly figure. ' +
      los + ' of the ' + ids.length + ' maps measure movement toward or away from the satellite, which understates vertical sinking by about 1.3 times.' +
      (upper.length ? ' Counts for ' + upper.join(' and ') + ' are upper-end estimates (very dense population model).' : '') + ' Population: GHS-POP R2023A (JRC).';
    box.innerHTML = 'About <b>' + fmtPeople(Math.round(total / 1e5) * 1e5) + ' people</b> live on ground that sank 5 cm or more during the measured periods. <span class="info" tabindex="0" title="' + esc(note) + '" aria-label="' + esc(note) + '">ⓘ</span>';
    box.hidden = false;
  }


  // ---------- existing free ground-motion services, and our calibration sites inside them
  // window.COVERAGE_SERVICES (site/data/coverage_services.js) gives the real footprints. Until that file exists, the
  // two outlines below are a ROUGH PLACEHOLDER drawn by hand (labelled "approximate" on the map); delete them once the
  // data file is in place. To enable the optional files, add to index.html (before app.js) once they exist:
  //   data/coverage_services.js  (window.COVERAGE_SERVICES)   and   data/opera_check.js  (window.OPERA_CHECK)
  var PLACEHOLDER_COVERAGE = [
    { id: 'egms', name: 'EGMS', operator: 'Copernicus Land Monitoring Service', url: 'https://egms.land.copernicus.eu/', label: 'Covered by EGMS (Europe)', placeholder: true,
      geojson: { type: 'Polygon', coordinates: [[[-10, 35], [-10, 43], [-11, 51], [-14, 58], [-25, 63], [-25, 67], [-10, 71.5], [31, 71.5], [31, 69], [28, 60], [28, 56], [24, 53.5],
        [24, 50], [22.5, 48], [26.5, 48.3], [29.5, 45.3], [28.5, 43.5], [28, 42], [26, 41.7], [26.3, 40], [27.5, 36.5], [24, 34.5], [12, 35], [-6, 35.8], [-10, 35]]] } },
    { id: 'opera', name: 'NASA OPERA DISP-S1', operator: 'NASA JPL', url: 'https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/', label: 'Covered by NASA OPERA (North America)', placeholder: true,
      geojson: { type: 'Polygon', coordinates: [[[-128, 51], [-60, 51], [-60, 45], [-66, 44], [-70, 41], [-75, 35], [-80, 30], [-80, 25], [-82, 24], [-87, 21], [-87, 18], [-83, 15], [-83, 11],
        [-77, 9], [-77, 7], [-82, 7], [-84, 8], [-88, 12], [-92, 14], [-95, 16], [-103, 18], [-110, 23], [-115, 29], [-117, 32], [-125, 40], [-125, 48], [-128, 51]]] } }
  ];
  var COVER = (window.COVERAGE_SERVICES && window.COVERAGE_SERVICES.length) ? window.COVERAGE_SERVICES : PLACEHOLDER_COVERAGE;
  var OPERA = window.OPERA_CHECK || {};
  var CALIBRATION = { mexico_city: 1, sjv: 1, celaya: 1 };
  var COVER_LABEL_AT = { EGMS: [63, 14, 'Europe: EGMS'], egms: [63, 14, 'Europe: EGMS'], OPERA_DISP_S1: [47.5, -99, 'North America: NASA OPERA'], opera: [47.5, -99, 'North America: NASA OPERA'] };
  var COVER_SHORT = { EGMS: 'Covered by EGMS (Europe)', OPERA_DISP_S1: 'Covered by NASA OPERA (North America)', egms: 'Covered by EGMS (Europe)', opera: 'Covered by NASA OPERA (North America)' };
  function coverLabel(c) { return c.label || COVER_SHORT[c.id] || ('Covered by ' + c.name); }
  function isCal(e) { return !!(e && (CALIBRATION[e.id] || e.role === 'calibration')); }
  function polygonsOf(g) {                      // outer rings of any GeoJSON geometry / feature / collection, as [lon, lat] arrays
    if (!g) return [];
    if (g.type === 'FeatureCollection') return [].concat.apply([], (g.features || []).map(polygonsOf));
    if (g.type === 'Feature') return polygonsOf(g.geometry);
    if (g.type === 'Polygon') return [g.coordinates[0]];
    if (g.type === 'MultiPolygon') return g.coordinates.map(function (p) { return p[0]; });
    if (g.type === 'GeometryCollection') return [].concat.apply([], (g.geometries || []).map(polygonsOf));
    return [];
  }
  function inRing(lon, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  var coverCache = {};
  function coveredBy(e) {                       // the existing service covering this place: stated in the catalogue, else by footprint
    if (e.id in coverCache) return coverCache[e.id];
    var named = e.existing_service && COVER.filter(function (c) { return c.id === e.existing_service; })[0];
    return (coverCache[e.id] = named || COVER.filter(function (c) { return polygonsOf(c.geojson).some(function (r) { return inRing(e.lon, e.lat, r); }); })[0] || null);
  }
  function calibrationTag(id) {
    var e = obsEntry(id), checks = [];
    if (!isCal(e)) return '';
    if (!CALIBRATION[id]) return 'Planned calibration site, inside ' + (coveredBy(e) ? ({ EGMS: 'EGMS', OPERA_DISP_S1: 'NASA OPERA', egms: 'EGMS', opera: 'NASA OPERA' }[coveredBy(e).id] || coveredBy(e).name) + ' coverage' : 'an existing service');
    if (e && e.status === 'validated') checks.push('GPS');
    if (operaAgrees(OPERA[id])) checks.push('NASA OPERA');   // only when the two maps actually agree
    return 'Calibration site: ' + (checks.length ? 'checked against ' + checks.join(' and ') : OPERA[id] ? 'compared with NASA OPERA' : 'inside NASA OPERA coverage, comparison pending');
  }
  // How to read each OPERA comparison. Agreement is decided from the numbers; where they do not agree, the reason is
  // written here per site because it needs judgement (window.OPERA_CHECK notes are technical).
  var OPERA_WORDS = {
    mexico_city: { context: 'For context, OPERA\'s own ascending and descending products agree with each other at r = 0.66.' },
    celaya: { verdict: 'weak agreement (our map likely blurs a narrow fault-bounded feature)' },
    sjv: { inconclusive: 'only a 3-month winter overlap with little motion' }
  };
  function operaAgrees(o) { return o && o.r != null && o.slope != null && o.r >= 0.7 && Math.abs(o.slope - 1) <= 0.3; }
  function operaHtml(id) {
    var o = OPERA[id];
    if (!o) return '';
    var w = OPERA_WORDS[id] || {}, period = Array.isArray(o.period) ? monthSpan(o.period.map(function (d) { return String(d).replace(/-/g, ''); })) : (o.period || '');
    var nums = 'correlation ' + (+o.r).toFixed(2) + ' (1 = perfect)' + (o.rms_cm != null ? ', typical gap ' + (+o.rms_cm).toFixed(1) + ' cm' : '') +
      (o.slope != null ? ', ours ' + (+o.slope).toFixed(2) + ' times the size of OPERA\'s' : '');
    var head;
    if (operaAgrees(o)) head = '<b>Compared with NASA OPERA: good agreement</b> (' + nums + ').' + (w.context ? ' ' + esc(w.context) : '');
    else if (w.inconclusive) head = '<b>NASA OPERA comparison inconclusive</b> (' + esc(w.inconclusive) + '; ' + nums + ').';
    else head = '<b>Compared with NASA OPERA: ' + esc(w.verdict || 'weak agreement') + '</b> (' + nums + ').';
    var u = o.unfiltered, depth = '';
    if (operaAgrees(o) && u && u.bowl && u.bowl.ratio_of_sums != null) {
      depth = ' <b>Full depth, no filter:</b> inside the sinking areas our total is ' + Math.round(u.bowl.ratio_of_sums * 100) + '% of OPERA\'s' +
        (u.ramp_removed ? ' (after removing a gentle ' + u.ramp_removed.plane_span_cm.toFixed(1) + ' cm tilt across the scene that neither product corrects; correlation then ' + u.ramp_removed.r.toFixed(2) + ')' : '') + '.';
      (u.gps || []).forEach(function (g) {
        depth += ' At GPS station ' + esc(g.id) + ', to ' + fmtDate(g.gps_to) + ': GPS ' + cm(g.gps_up_change_cm) + ' cm, OPERA ' + cm(g.opera_cm) + ' cm, ours ' + cm(g.ours_cm) + ' cm.';
      });
    }
    return '<span class="opera">' + head + depth + ' <span class="muted">Shape compared after removing patterns wider than about 30 km (how OPERA publishes its open layer)' +
      (period ? '; over ' + esc(period) : '') + '.' + (o.url ? ' <a href="' + esc(o.url) + '" rel="noopener" target="_blank" title="' + esc(o.citation || '') + '">OPERA DISP-S1 data and validation</a>' : '') + '</span></span>';
  }


  // ---------- world view: every place we looked at, with an honest status (site/data/observatory.js)
  var OBS = (function () {
    var obs = (window.OBSERVATORY || []).slice();
    function km(a, b) { return Math.sqrt(Math.pow((a.lat - b.lat) * 111.2, 2) + Math.pow((a.lon - b.lon) * 111.2 * Math.cos(a.lat * Math.PI / 180), 2)); }
    (window.HOTSPOTS || []).forEach(function (h) {
      if (h.lat == null || h.lon == null) return;
      if (obs.some(function (o) { return o.id === h.id || km(o, h) < 30; })) return;   // the observatory entry wins
      obs.push(h);
    });
    return obs;
  })(), world = null, worldMarkers = {};
  var STATUS = {
    validated: { label: 'Checked against GPS', colour: '#2ecc71', text: 'Measured from NISAR radar, and the radar agrees with GPS stations on the ground.' },
    measured: { label: 'Measured, not yet checked against GPS', colour: '#f5b700', text: 'Measured from NISAR radar, but there is no GPS station here to check it against yet.' },
    refused: { label: 'Satellite can\'t see clearly here yet', colour: '#9aa0a6', text: 'We processed the radar images, but on review did not trust the result (for example humid air, or motion too small to resolve).' },
    unconfirmed: { label: 'Unconfirmed', colour: '#b39ddb', text: 'Passed our automatic quality check, but on comparing it with published studies we did not see the sinking area they describe, so we do not report a number.' },
    no_coverage: { label: 'No radar images yet', colour: '#9aa0a6', text: 'NISAR has not yet published images over this place.' },
    not_processed: { label: 'Known from published research', colour: '#ffffff', text: 'Sinking reported in published studies; we have not processed it yet.' }
  };
  // Sites whose result we publish but trust less, with the plain reason.
  var LOW_CONFIDENCE = {
    konya: 'Our sinking speed here is about three times the published rate. Summer irrigation pumping may explain part of it.',
    celaya: 'Our deepest bowl sits north-east of the centre, while published work puts the fastest sinking south and east of it.'
  };
  function obsEntry(id) { return OBS.filter(function (e) { return e.id === id; })[0]; }
  var COUNTRY_CONTINENT = { 'United States': 'North America', Mexico: 'North America', Canada: 'North America', Iran: 'Asia', Indonesia: 'Asia', Thailand: 'Asia', Vietnam: 'Asia',
    China: 'Asia', India: 'Asia', Pakistan: 'Asia', Nepal: 'Asia', Taiwan: 'Asia', Turkey: 'Asia', Nigeria: 'Africa', Afghanistan: 'Asia', 'Jordan / Israel': 'Asia',
    Philippines: 'Asia', Yemen: 'Asia', Ethiopia: 'Africa', Argentina: 'South America', Chile: 'South America' };
  function continentOf(e) { return e.continent || COUNTRY_CONTINENT[e.country] || 'Other'; }
  function monthSpan(d) {
    if (!d || d.length < 2) return '';
    var a = toDate(d[0]), b = toDate(d[d.length - 1]);
    return MONTHS[a.getUTCMonth()] + (a.getUTCFullYear() === b.getUTCFullYear() ? '' : ' ' + a.getUTCFullYear()) + '–' + MONTHS[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
  }
  // Our headline number: change over the period actually covered, never a yearly rate.
  function obsNumber(e) {
    if (e.peak_change_cm == null || !e.span_days) return '';
    return e.peak_change_cm.toFixed(1) + pm(e.peak_sigma_cm) + ' cm of sinking in ' + e.span_days + ' days (' + monthSpan(e.dates) + ')' + (e.peak_quantity === 'los' ? ', as seen by the satellite' : '');
  }
  function literatureHtml(e) {
    var L = e.literature;
    if (!L) return '';
    var rate = L.rate_cm_yr == null ? 'No single rate given' : 'About ' + L.rate_cm_yr + ' cm per year' + (L.period ? ' (' + esc(L.period) + ')' : '');
    return '<div class="lit"><div class="kicker">Published research, not our measurement</div><p><b>' + rate + '</b></p>' +
      '<p class="muted">' + esc(L.citation || '') + (L.note ? '. ' + esc(L.note) : '') + '</p>' +
      (L.url ? '<p><a href="' + esc(L.url) + '" rel="noopener" target="_blank">Read the study</a></p>' : '') + '</div>';
  }
  function worldCard(e) {
    var st = STATUS[e.status] || STATUS.not_processed, html = '<div class="kicker"><span class="dot-st st-' + esc(e.status) + '"></span>' + esc(st.label) + '</div>' +
      '<div class="big">' + esc(e.name) + '</div><p class="muted">' + esc(e.country || '') + '</p>';
    if (e.status === 'refused') {
      html += '<p><b>Why there is no map:</b> ' + esc(e.reason || '') + '</p><p class="muted">' +
        (e.refused_by === 'manual_review' ? 'Decided by the team on reviewing the result by hand, not by an automatic test.' : 'Rejected by the pipeline\'s automatic quality check.') +
        (e.pipeline && e.pipeline.pairs ? ' We processed ' + e.pipeline.pairs + ' radar image pairs, ' + monthSpan(e.dates) + '.' : '') + '</p>';
    } else if (e.status === 'unconfirmed') {
      html += '<p><b>Why we do not report a number:</b> ' + esc(e.unconfirmed_reason || st.text) + '</p><p class="muted">The radar result passed the automatic quality check' +
        (e.pipeline && e.pipeline.pairs ? ' (' + e.pipeline.pairs + ' image pairs, ' + monthSpan(e.dates) + ')' : '') + '. We then compared it with published studies and could not confirm it, so it is left out of every total on this page.</p>';
    } else if (e.status === 'not_processed') {
      html += '<p>' + st.text + '</p>';
      if (e.first_batch_rank) html += '<p class="next-tag">Next in line to be measured (number ' + e.first_batch_rank + ' in our first batch).</p>';
      if (isCal(e)) html += '<p class="next-tag">' + esc(calibrationTag(e.id)) + '.</p>';
    } else {
      html += '<p><b>' + esc(obsNumber(e)) + '</b></p>';
    }
    var cov = coveredBy(e);
    if (cov) html += '<p class="cov-note">' + esc(coverLabel(cov)) + (cov.placeholder ? ' (approximate outline)' : '') + ': a free ground-motion service already maps this area. <a href="' + esc(cov.url) + '" rel="noopener" target="_blank">' + esc(cov.name) + '</a></p>';
    html += literatureHtml(e);
    if (e.has_site_data && DATA[e.id]) html += '<p><button class="chip open-site" type="button">Open the ' + esc(e.name) + ' map →</button></p>';
    var box = $('worldCard');
    box.innerHTML = html;
    var b = box.querySelector && box.querySelector('.open-site');
    if (b && b.addEventListener) b.addEventListener('click', function () { flyToSite(e.id); });
  }
  function worldIntro() {
    $('worldCard').innerHTML = '<div class="kicker">How to use this map</div><p>Click a coloured dot to open that place: its map, the year played back, and the 3D view. Grey and hollow dots open a short note on why we have no map yet, with the published figure for comparison.</p>';
  }
  function worldSummary() {
    var c = {}, cal = OBS.filter(isCal), cov = 0;
    OBS.forEach(function (e) {
      if (isCal(e)) return;
      if (coveredBy(e)) { cov++; return; }
      c[e.status] = (c[e.status] || 0) + 1;
    });
    var measured = (c.validated || 0) + (c.measured || 0), parts = ['Where no free service exists: ' + measured + ' place' + (measured === 1 ? '' : 's') + ' measured'];
    if (c.refused) parts.push(c.refused + ' where the satellite can\'t measure reliably yet');
    if (c.not_processed) parts.push(c.not_processed + ' more known only from published research');
    void parts;
    var chips = [
      [measured, 'measured', 'st-measured', 'Measured from NISAR radar where no free service exists'],
      [c.refused || 0, 'can\'t see clearly yet', 'st-refused', 'Processed, but on review we did not trust the result'],
      [c.unconfirmed || 0, 'unconfirmed', 'st-unconfirmed', 'Passed the automatic check, but did not match published studies; no number reported'],
      [c.not_processed || 0, 'published only', 'st-not_processed', 'Known from published research; not processed by us yet'],
      [cal.length, 'calibration', 'st-cal', 'Inside EGMS or NASA OPERA, where we test the method']
    ];
    $('worldSummary').innerHTML = chips.map(function (x) {
      return '<span class="cchip" title="' + esc(x[3]) + '"><span class="dot-st ' + x[2] + '"></span><b>' + x[0] + '</b> ' + esc(x[1]) + '</span>';
    }).join('') + (cov ? '<span class="cchip-note">+ ' + cov + ' places already covered by free services</span>' : '');
  }
  function worldLegend() {
    var G = window.GLOBAL_LAYER, html = ['validated', 'measured', 'unconfirmed', 'refused', 'not_processed'].map(function (k) {
      return '<div class="wl"><span class="dot-st st-' + k + '"></span><div><b>' + esc(STATUS[k].label) + '</b><span>' + esc(STATUS[k].text) + '</span></div></div>';
    }).join('');
    if (OBS.some(function (e) { return e.first_batch_rank; })) html += '<div class="wl"><span class="dot-st st-next"></span><div><b>Next in line to be measured</b><span>Published hotspots in our first processing batch.</span></div></div>';
    html += '<div class="wl"><span class="dot-st st-cal"></span><div><b>Calibration site</b><span>Inside an existing free service, where we test our method against GPS and that service.</span></div></div>';
    if (COVER.length) html += '<div class="wl"><span class="sw-cover"></span><div><b>Already covered by a free service</b><span>' + COVER.map(function (c) {
      return '<a href="' + esc(c.url) + '" rel="noopener" target="_blank">' + esc(coverLabel(c)) + '</a>';
    }).join(', ') + '. <small class="muted">' + (COVER[0].placeholder ? 'Rough placeholder outlines.' : 'Outlines approximate the stated coverage.') + '</small></span></div></div>';
    if (G && G.legend) html += '<div class="wl gl"><label class="gl-toggle"><input type="checkbox" id="globalToggle" checked> <b>' + esc('Where sinking is likely (model)') + '</b></label>' +
      '<div class="gl-ramp">' + G.legend.map(function (l) { return '<span><i style="background:' + esc(l.swatch) + '"></i>' + esc(l.label) + '</span>'; }).join('') + '</div>' +
      '<span class="muted small">' + esc(G.quantity || '') + '. ' + esc(capital(G.caveat || 'modelled likelihood, not a measurement')) + '; groundwater-driven only. <a href="' + esc(G.url) + '" rel="noopener" target="_blank">Hasan et al. 2023</a> (CC BY 4.0).</span></div>';
    var lg = $('worldLegend');
    lg.innerHTML = html;
    var t = lg.querySelector && lg.querySelector('#globalToggle');   // created just above, so not looked up with $()
    if (t && t.addEventListener) t.addEventListener('change', function () { if (!world || !globalLayer) return; if (t.checked) globalLayer.addTo(world); else world.removeLayer(globalLayer); });
  }
  function capital(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
  function worldList() {
    var html = '', gap = OBS.filter(function (e) { return !isCal(e) && !coveredBy(e); });
    function btn(e) { return '<button type="button" class="linkbtn' + (e.first_batch_rank ? ' next' : '') + '" data-obs="' + esc(e.id) + '"' + (e.first_batch_rank ? ' title="Next in line to be measured"' : '') + '>' + esc(e.name) + '</button>'; }
    function byContinent(es) {
      var g = {};
      es.forEach(function (e) { (g[continentOf(e)] = g[continentOf(e)] || []).push(e); });
      return Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; }).map(function (k) {
        return '<div class="wlist-sub"><span class="wlist-c">' + esc(k) + ' (' + g[k].length + ')</span>' + g[k].map(btn).join('') + '</div>';
      }).join('');
    }
    function group(label, dot, es, open) {
      if (!es.length) return '';
      if (open) return '<div class="wlist"><span class="wlist-k">' + dot + esc(label) + '</span>' + es.map(btn).join('') + '</div>';
      return '<details class="wgroup"><summary><span class="wlist-k">' + dot + esc(label) + ' (' + es.length + ')</span></summary>' + byContinent(es) + '</details>';
    }
    html += '<div class="wlist-h">Where no free ground-motion service exists</div>';
    ['validated', 'measured', 'unconfirmed', 'refused', 'not_processed'].forEach(function (k) {
      var es = gap.filter(function (e) { return e.status === k; });
      if (k === 'not_processed') es.sort(function (a, b) { return (a.first_batch_rank || 999) - (b.first_batch_rank || 999); });
      html += group(STATUS[k].label, '<span class="dot-st st-' + k + '"></span>', es, k === 'validated' || k === 'measured');
    });
    var cal = OBS.filter(isCal), other = OBS.filter(function (e) { return !isCal(e) && coveredBy(e); });
    if (cal.length || other.length) html += '<div class="wlist-h">Inside existing services</div>';
    html += group('Calibration sites', '<span class="dot-st st-cal"></span>', cal, true);
    html += group('Covered by EGMS or NASA OPERA', '<span class="sw-cover"></span>', other, false);
    var box = $('worldList'); box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll ? box.querySelectorAll('[data-obs]') : [], function (b) {
      b.addEventListener('click', function () { openObs(obsEntry(b.getAttribute('data-obs'))); });
    });
  }
  function openObs(e) {
    if (!e) return;
    if (e.has_site_data && DATA[e.id]) flyToSite(e.id);
    else { worldCard(e); if (world) world.panTo([e.lat, e.lon]); }
  }
  function initWorld() {
    if (!OBS.length) return;
    worldSummary(); worldImpact(); worldLegend(); worldList(); worldIntro();
    if (!window.L) return;
    world = L.map('worldMap', { zoomSnap: 0.5, scrollWheelZoom: false, worldCopyJump: true, minZoom: 1.5 });
    world.setView([20, 10], 2);                    // polygons need a view before they are added; showWorld() fits it properly
    window.GroundlineWorld = world;                // for debugging and the browser tests
    L.tileLayer(TILES.sat, { maxZoom: 18, attribution: SAT_CREDIT, zIndex: 1 }).addTo(world);
    L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, opacity: 0.85, zIndex: 10,
      attribution: 'Labels &copy; Esri, HERE, Garmin' }).addTo(world);
    world.attributionControl.addAttribution('Radar: NISAR previews via ASF DAAC');
    COVER.forEach(function (c) {
      if (!c.geojson) return;
      var lay = L.geoJSON(c.geojson, { style: { color: '#ffffff', weight: 1.2, opacity: 0.9, fillColor: '#ffffff', fillOpacity: 0.2, className: 'cover-area' } });
      lay.bindTooltip(esc(coverLabel(c)) + (c.placeholder ? ' (approximate outline)' : ''), { sticky: true });
      lay.bindPopup('<b>' + esc(coverLabel(c)) + '</b>' + (c.description ? '<br>' + esc(c.description) : '') + '<br><a href="' + esc(c.url) + '" rel="noopener" target="_blank">' + esc(c.name) + (c.operator ? ', ' + esc(c.operator) : '') + '</a>' + (c.placeholder ? '<br><i>Approximate outline.</i>' : ''));
      lay.addTo(world);
      var at = COVER_LABEL_AT[c.id];
      if (at) L.marker(at, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'cover-label', html: '<span>' + esc(at[2]) + '</span>', iconSize: null }) }).addTo(world);
    });
    function dilate() {                         // soften the coarse pixels more when zoomed out
      try {
        var d = document.getElementById('glDilate'), f = document.getElementById('glBlur'), z = Number(world.getZoom());
        if (!isFinite(z)) return;
        if (d) d.setAttribute('radius', z <= 2 ? 0.8 : z <= 3 ? 0.5 : 0);            // a little growth so tiny hotspots survive
        if (f) f.setAttribute('stdDeviation', z <= 2 ? 1.4 : z <= 3 ? 1 : z <= 5 ? 0.7 : 0.5);   // and a blur so patches are soft, not square
      } catch (e) { /* no zoom yet */ }
    }
    world.on('zoomend', dilate); dilate();
    var G = window.GLOBAL_LAYER;
    if (G && G.tiles) {
      globalLayer = L.tileLayer(G.tiles, { className: 'gl-tiles', minZoom: G.minZoom || 0, maxNativeZoom: G.maxNativeZoom || 6, maxZoom: 18, zIndex: 5, opacity: G.opacity == null ? 1 : G.opacity,
        bounds: G.bounds ? L.latLngBounds(G.bounds) : undefined, attribution: esc(G.attribution || ''), noWrap: false });
      globalLayer.createTile = globalCreateTile;
      globalLayer.on('tileerror', function () { /* empty tile: nothing to draw */ });
      globalLayer.addTo(world);
    }
    var order = ['not_processed', 'no_coverage', 'refused', 'unconfirmed', 'measured', 'validated'];   // trusted results drawn on top
    OBS.slice().sort(function (a, b) { return order.indexOf(a.status) - order.indexOf(b.status); }).forEach(function (e) {
      var st = STATUS[e.status] || STATUS.not_processed, ours = e.status === 'validated' || e.status === 'measured';
      var lit = e.status === 'not_processed', next = lit && e.first_batch_rank;
      var m = L.circleMarker([e.lat, e.lon], {
        radius: e.status === 'validated' ? 10 : ours ? 8.5 : next ? 6.5 : 5.5, color: lit ? '#ffffff' : '#111111', weight: lit ? 2 : 2,
        fillColor: next ? '#ffffff' : st.colour, fillOpacity: next ? 0.55 : lit ? 0.12 : 1, dashArray: e.status === 'refused' ? '3 3' : e.status === 'unconfirmed' ? '1 3' : null,
        className: 'obs st-' + e.status + (isCal(e) ? ' cal' : '') + (next ? ' next' : '') });
      if (isCal(e)) L.circleMarker([e.lat, e.lon], { radius: 14, color: '#ffffff', weight: 2, fill: false, interactive: false, className: 'cal-ring' }).addTo(world);
      var ip = IMPACT[e.id] && IMPACT[e.id].exposure && IMPACT[e.id].exposure.people && IMPACT[e.id].exposure.people.ge_5cm;
      var tip = '<b>' + esc(e.name) + '</b><br>' + esc(st.label) + (ours ? '<br>' + esc(obsNumber(e)) : '') +
        (ours && ip ? '<br>' + fmtPeople(ip.people) + ' people on ground that sank 5 cm or more' : '') + (LOW_CONFIDENCE[e.id] ? '<br>Low confidence' : '') +
        ((lit || e.status === 'unconfirmed') && e.literature && e.literature.rate_cm_yr != null ? '<br>Published: about ' + e.literature.rate_cm_yr + ' cm per year (not our measurement)' : '') +
        (next ? '<br>Next in line to be measured' : '') +
        (isCal(e) ? '<br><i>' + esc(calibrationTag(e.id)) + '</i>' : coveredBy(e) ? '<br><i>' + esc(coverLabel(coveredBy(e))) + '</i>' : '');
      m.bindTooltip(tip, { direction: 'top', offset: [0, -8] });
      m.on('click', function () { openObs(e); });
      m.addTo(world);
      worldMarkers[e.id] = m;
    });
    world.on('focus', function () { world.scrollWheelZoom.enable(); });
    world.on('blur', function () { world.scrollWheelZoom.disable(); });
  }
  // The global likelihood tiles: only tiles listed in window.GLOBAL_LAYER_TILES are requested (empty tiles are not
  // written, and requesting them would log 404s). Without the listing every tile is requested and errors are ignored.
  var globalLayer = null, tileSets = {};
  function globalCreateTile(coords, done) {
    var list = window.GLOBAL_LAYER_TILES;
    if (list && !hasTile(list, coords)) { var d = document.createElement('div'); setTimeout(function () { done(null, d); }, 0); return d; }
    return L.TileLayer.prototype.createTile.call(this, coords, done);
  }
  function hasTile(list, c) {
    var set = tileSets[c.z];
    if (!set) {
      set = tileSets[c.z] = {};
      String(list[c.z] || '').split(';').forEach(function (col) {
        var p = col.split(':'); if (p.length < 2) return;
        p[1].split(',').forEach(function (y) { set[p[0] + '/' + y] = 1; });
      });
    }
    return !!set[c.x + '/' + c.y];
  }
  function showWorld() {
    stop();
    document.documentElement.setAttribute('data-mode', 'world');
    if (world) {
      setTimeout(function () {
        world.invalidateSize();
        world.fitBounds(OBS.map(function (e) { return [e.lat, e.lon]; }), { padding: [30, 30], maxZoom: 3 });
      }, 30);
    }
    Array.prototype.forEach.call(document.querySelectorAll('#siteSwitch button'), function (b) { b.setAttribute('aria-selected', 'false'); });
    updateTour();
    try { history.replaceState(null, '', '#world'); } catch (e) { /* file:// in some browsers */ }
  }
  function inWorld() { return document.documentElement.getAttribute('data-mode') === 'world'; }
  function enterSite(id) {
    document.documentElement.setAttribute('data-mode', 'site');
    selectSite(id);
  }
  function flyToSite(id, then) {
    var e = obsEntry(id), go = function () { enterSite(id); if (then) then(); var x = $('explore'); if (x.scrollIntoView) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!world || !e || !inWorld() || reduced) { go(); return; }
    world.flyTo([e.lat, e.lon], 8, { duration: 1.1 });
    world.once('moveend', go);
  }
  function siteStatus(s) {
    var e = obsEntry(s.id), box = $('siteStatus'), parts = [];
    if (!e) { box.hidden = true; return; }
    var st = STATUS[e.status] || {};
    if (CALIBRATION[s.id]) parts.push('<span class="cal-tag">' + esc(calibrationTag(s.id)) + '</span>');
    if (e.status === 'validated') parts.push('<b class="ok">Checked against ' + ((e.gps && e.gps.stations) || []).length + ' GPS station' + (((e.gps && e.gps.stations) || []).length === 1 ? '' : 's') + '.</b>');
    else if (e.status === 'measured') parts.push('<b class="warn">Not yet checked against GPS.</b>');
    else parts.push('<b>' + esc(st.label || e.status) + '.</b>');
    if (s.span_days < 200) parts.push('This record covers only ' + s.span_days + ' days (' + monthSpan(s.dates) + '), so all numbers are change over that period, not a yearly rate.');
    if (LOW_CONFIDENCE[s.id]) parts.push('<b class="warn">Low confidence:</b> ' + esc(LOW_CONFIDENCE[s.id]));
    if (e.status === 'measured' && e.literature && e.literature.rate_cm_yr != null) parts.push('Published research (not our measurement) reports about ' + e.literature.rate_cm_yr + ' cm per year (' + esc(e.literature.period || '') + ').');
    if (OPERA[s.id]) parts.push(operaHtml(s.id));
    box.innerHTML = parts.join(' ');
    box.hidden = false;
  }

  // ---------- quick tour: the demo in three clicks (from the world view: San Joaquin, its GPS check, Mexico City)
  function tourStation(s) {
    var ids = s.headline ? s.headline.series.stations : [];
    var pool = (s.gps || []).filter(function (g) { return ids.indexOf(g.id) >= 0; });
    if (!pool.length) pool = s.gps || [];
    // among stations that moved clearly (GPS beyond twice the noise), the closest match between the two curves
    var n = s.noise.value_cm || 0, moving = pool.filter(function (g) { var v = last(g.gps_cm || []); return v != null && Math.abs(v) > 2 * n; });
    if (moving.length) pool = moving;
    return pool.slice().sort(function (a, b) { return (a.rms_cm == null ? 1e9 : a.rms_cm) - (b.rms_cm == null ? 1e9 : b.rms_cm); })[0];
  }
  function otherSite() { return ORDER.filter(function (k) { return k !== state.site.id; })[0]; }
  function showDetail() {
    var d = $('detail'), r = d.getBoundingClientRect();
    if (r.top > window.innerHeight - 120 || r.bottom < 60) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function initTour() {
    var first = DATA.sjv ? 'sjv' : ORDER[0];
    $('tourPlay').addEventListener('click', function () {
      if (inWorld()) flyToSite(first, function () { play(); });
      else if (!state.timer) play();
    });
    $('tourGps').addEventListener('click', function () {
      function pickGps() { var g = tourStation(state.site); if (g) { select({ type: 'gps', id: g.id }); showDetail(); } }
      if (inWorld()) flyToSite(first, pickGps); else pickGps();
    });
    $('backWorld').addEventListener('click', showWorld);
    $('tourSite').addEventListener('click', function () {
      var id = inWorld() ? (DATA.mexico_city ? 'mexico_city' : otherSite()) : otherSite(); if (!id) return;
      document.documentElement.setAttribute('data-mode', 'site');
      selectSite(id);
      if (!$('viewToggle').hidden && DATA[id].grid) setView('3d');
      var g = tourStation(DATA[id]); if (g) select({ type: 'gps', id: g.id });
    });
  }
  function updateTour() {
    var w = inWorld() && OBS.length;
    $('backWorld').hidden = !OBS.length || w;
    if (w) {
      var f = DATA.sjv || DATA[ORDER[0]], fg = tourStation(f), m = DATA.mexico_city || DATA[ORDER[1]];
      $('tourPlay').innerHTML = '<b>1</b> ' + esc(f.name) + ': play the year';
      $('tourGps').hidden = !fg; if (fg) $('tourGps').innerHTML = '<b>2</b> Compare radar with GPS at ' + esc(fg.id);
      $('tourSite').hidden = !m; if (m) $('tourSite').innerHTML = '<b>3</b> ' + esc(m.name) + ($('viewToggle').hidden || !m.grid ? '' : ' in 3D');
      return;
    }
    $('tourPlay').innerHTML = '<b>1</b> Play the year';
    var g = tourStation(state.site), o = DATA[otherSite()];
    $('tourGps').hidden = !g;
    if (g) $('tourGps').innerHTML = '<b>2</b> Compare radar with GPS at ' + esc(g.id);
    $('tourSite').hidden = !o;
    if (o) $('tourSite').innerHTML = '<b>3</b> ' + esc(o.name) + ($('viewToggle').hidden || !o.grid ? '' : ' in 3D');
  }

  // ---------- site selection
  function selectSite(id) {
    var s = DATA[id]; if (!s) return;
    stop(); state.site = s; state.sel = null; state.i = s.dates.length - 1;
    Array.prototype.forEach.call(document.querySelectorAll('#siteSwitch button'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-site') === id ? 'true' : 'false'); });
    var more = moreSel;
    if (more) { more.value = FEATURED.indexOf(id) >= 0 ? '' : id; if (moreCell && moreCell.setAttribute) moreCell.setAttribute('data-active', more.value ? 'true' : 'false'); }
    $('siteBlurb').textContent = BLURB[id] || '';
    $('mapTitle').textContent = 'How far the ground moved since ' + fmtDate(s.dates[0]);
    $('mapSub').textContent = s.dates.length + ' NISAR radar passes, ' + fmtDate(s.dates[0]) + ' to ' + fmtDate(s.dates[s.dates.length - 1]);
    var sl = $('dateSlider'); sl.max = s.dates.length - 1;
    statTiles(s); results(s); limits(s); legend(s); buildPicker(s);
    loadSiteOnMap(s); layerControls(s); setDate(state.i); renderDetail(); freshness(s);
    if (state.view === '3d') setView('3d');                              // rebuild the surface for the new case (or fall back to 2D)
    siteStatus(s);
    impactPanel(s);
    updateTour();
    $('buildInfo').textContent = 'Data file for this case built ' + s.provenance.generated_utc.replace('T', ' ').replace('Z', ' UTC') + '. ' + provenanceText(s.provenance.built_by);
    if (!inWorld()) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// in some browsers */ } }
  }

  // ---------- start
  function start() {
    initTheme();
    if (!ORDER.length) { $('detail').innerHTML = '<div class="empty"><div><strong>No data files found</strong>Expected site/data/*.js next to this page.</div></div>'; return; }
    buildSwitch(); initMap(); initView(); initTour(); initWorld();
    $('dateSlider').addEventListener('input', function (e) { stop(); setDate(+e.target.value); });
    $('playBtn').addEventListener('click', function () { if (state.timer) stop(); else play(); });
    $('picker').addEventListener('change', function (e) {
      var v = e.target.value, k = v.indexOf(':');
      if (!v) return select(null);
      var type = v.slice(0, k), key = v.slice(k + 1);
      select(type === 'gps' ? { type: type, id: key } : { type: type, name: key });
    });
    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (state.sel) renderDetail(); if (view3d && state.view === '3d') view3d.resize(); }, 180); });
    var wanted = (location.hash || '').slice(1);
    if (DATA[wanted] || !OBS.length) { document.documentElement.setAttribute('data-mode', 'site'); selectSite(DATA[wanted] ? wanted : ORDER[0]); }
    else { document.documentElement.setAttribute('data-mode', 'world'); selectSite(DATA.sjv ? 'sjv' : ORDER[0]); showWorld(); }   // a site is loaded behind the world view
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
