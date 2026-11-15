/* Groundline: one engine, any number of case studies.
   Every number on the page is read from window.SITE_DATA (site/data/*.js) or is a cited fact in index.html. */
(function () {
  'use strict';

  var DATA = window.SITE_DATA || {};
  var ORDER = ['sjv', 'mexico_city'].filter(function (k) { return DATA[k]; });
  Object.keys(DATA).forEach(function (k) { if (ORDER.indexOf(k) < 0) ORDER.push(k); });

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

  var state = { site: null, i: 0, timer: null, sel: null, opacity: 0.9, view: '2d', plain: false, base: 'sat', mode3d: 'depth', shade: false };
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

  // ---------- place menu, headline, status label, guided steps
  var TRUST = window.SJV_TRUST || null;                       // San Joaquin cropland finding (site/data/sjv_trust.js)
  var ui = { step: null, box: 'step' }, has3d = false, zoomed = false;
  var CROP_CAVEAT = 'In California we found this radar reads several centimetres too deep over cropland. The same may apply here.';
  var HEAD = {
    start: 'A sinking-ground map from NASA\'s newest radar that only counts what it can confirm.',
    world: 'Most of the world\'s sinking ground has no free map.'
  };
  // The three states shown on the world map and as the status label of a place.
  var G3 = {
    checked: { label: 'Checked against GPS', colour: '#2fbf71' },
    measured: { label: 'Measured, not yet checked against GPS', colour: '#f5b700' },
    none: { label: 'Not measured yet', colour: '#ffffff' }
  };
  function group3(e) { return !e ? 'none' : e.status === 'validated' ? 'checked' : e.status === 'measured' ? 'measured' : 'none'; }
  function months(s) { return Math.max(1, Math.round(days(s.dates[0], s.dates[s.dates.length - 1]) / 30.4)); }
  function shortName(id) { return id === 'sjv' ? 'San Joaquin Valley' : String(DATA[id] ? DATA[id].name : id).split(' (')[0]; }
  function fullName(id) { var e = obsEntry(id) || {}, n = DATA[id].name; return n + (e.country && n.indexOf(e.country) < 0 && id !== 'sjv' ? ', ' + e.country : ''); }

  function buildSwitch() {
    var sel = $('placeSelect'), g = { checked: [], measured: [] };
    ORDER.forEach(function (id) { g[group3(obsEntry(id)) === 'checked' ? 'checked' : 'measured'].push(id); });
    g.measured.sort(function (a, b) { return DATA[a].name < DATA[b].name ? -1 : 1; });
    function opts(ids) { return ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(fullName(id)) + '</option>'; }).join(''); }
    sel.innerHTML = '<option value="">All ' + ORDER.length + ' places…</option>' +
      '<optgroup label="Checked against GPS">' + opts(g.checked) + '</optgroup>' +
      (g.measured.length ? '<optgroup label="Measured, not yet checked">' + opts(g.measured) + '</optgroup>' : '') +
      (OBS.length ? '<option value="world">World map</option>' : '');
    sel.addEventListener('change', function (ev) {
      var v = ((ev && ev.target) || sel).value;
      if (v === 'world') openAct('world'); else if (v) openAct(v);
      if (sel.blur) sel.blur();
    });
    Array.prototype.forEach.call(document.querySelectorAll('#acts [data-act]'), function (b) {
      b.addEventListener('click', function () { openAct(b.getAttribute('data-act')); });
    });
    var brand = $('brand');
    brand.addEventListener('click', function (e) { if (e && e.preventDefault) e.preventDefault(); tourGo(0); });
  }
  // Open a place or the world: through the tour when it is part of the story, directly otherwise.
  function openAct(id) {
    var i = -1;
    TOUR.forEach(function (t, k) { if (i < 0 && (id === 'world' ? t.world : t.site === id)) i = k; });
    if (i >= 0) { tourGo(i); return; }
    if (id === 'world') { showWorld(); renderTour(); return; }
    document.documentElement.setAttribute('data-mode', 'site');
    selectSite(id); renderTour();
  }
  function markActs() {
    var cur = inWorld() ? 'world' : state.site ? state.site.id : '';
    Array.prototype.forEach.call(document.querySelectorAll('#acts [data-act]'), function (b) {
      if (b.getAttribute('data-act') === cur) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    var sel = $('placeSelect'); sel.value = cur; if (sel.selectedIndex < 0) sel.selectedIndex = 0;
    $('headline').textContent = HEAD[cur] || HEAD.start;
  }

  var CROP_SHORT = 'Not yet checked on the ground; crop areas may need filtering.';
  // The one heading of the panel, and the text that belongs under "Details and limits" for the current view.
  // temp = true for a look-up (a station, a spot): the step's own heading and notes come back when it is closed.
  function setHeading(html, temp) { if (!temp) ui.head = html; $('placeTitle').innerHTML = html; }
  function setNotes(html, temp) {
    var full = html ? '<h3>About this view</h3>' + html : '';
    if (!temp) ui.notes = full;
    $('stepNotes').innerHTML = full;
  }
  function chartH() {                                        // the chart takes the room the removed text left
    var w = window.innerWidth || 1280, hh = window.innerHeight || 720;
    return w < 900 ? 210 : Math.max(170, Math.min(440, hh - 424));
  }
  function peakOf(s) { var e = obsEntry(s.id) || {}; return e.peak_change_cm != null ? e.peak_change_cm : s.extreme ? Math.abs(s.extreme.min_cm) : null; }
  function placeHead(s) {
    var e = obsEntry(s.id) || {}, k = group3(e), chip = $('statusChip'), cav = $('placeCaveat');
    if (!obsEntry(s.id)) k = (s.gps || []).length ? 'checked' : 'measured';
    $('placeKicker').textContent = fullName(s.id);
    if (s.id === 'sjv' && TRUST) {
      chip.className = 'status mixed';
      chip.textContent = 'Checked on the ground · crop signal filtered out';
    } else {
      chip.className = 'status ' + (k === 'checked' ? 'ok' : 'warn');
      chip.textContent = k === 'checked' ? 'Checked against GPS' + (operaAgrees(OPERA[s.id]) ? ' and NASA\'s own map' : '') : G3.measured.label;
    }
    cav.hidden = k !== 'measured';
    cav.textContent = k === 'measured' ? CROP_SHORT : '';
  }

  // The obvious buttons of a place. San Joaquin has its own three, because its story is the cropland finding.
  function stepDefs(s) {
    var d = [], I = IMPACT[s.id];
    d.push(['play', s.span_days >= 300 ? 'Play the year' : 'Play the ' + months(s) + ' months', 'Play']);
    var sj = s.id === 'sjv' && TRUST;
    if (tourStation(s)) d.push(['gps', sj ? 'Is it right? Check a town' : 'Check it against GPS', sj ? 'Town' : 'GPS']);
    if (sj) d.push(['crops', 'Now look at the fields', 'Fields']);
    if (I && I.exposure) d.push(['people', sj ? 'What we can confirm' : 'Who lives on it', sj ? 'Confirmed' : 'People']);
    return d;
  }
  function buildSteps(s) {
    var box = $('steps'); box.innerHTML = '';
    stepDefs(s).forEach(function (d, i) {
      var b = h('button', { type: 'button', 'class': 'step', 'data-step': d[0], 'aria-pressed': 'false', title: d[1], 'aria-label': d[1] }, '<b>' + (i + 1) + '</b><span>' + esc(d[2]) + '</span>');
      b.addEventListener('click', function () { stepClick(s.id, d[0]); });
      box.appendChild(b);
    });
  }
  function stepClick(siteId, step) {
    var i = tourIndex(siteId, step);
    if (i >= 0) tourGo(i); else runStep(step);
  }
  function markSteps() {
    Array.prototype.forEach.call($('steps').children, function (b) {
      var k = b.getAttribute('data-step');
      b.setAttribute('aria-pressed', (k === '3d' ? state.view === '3d' : k === ui.step) ? 'true' : 'false');
    });
  }
  function showBox(which) {
    ui.box = which;
    $('stepBox').hidden = which !== 'step'; $('detail').hidden = which !== 'detail'; $('impact').hidden = which !== 'impact';
  }
  function runStep(step) {
    var s = state.site;
    if (step !== '3d') ui.step = step;
    if (step !== 'play' && step !== '3d') stop();
    if (step === 'gps') {
      var g = tourStation(s);
      if (s.id === 'sjv') setShade(false);
      if (g) { select({ type: 'gps', id: g.id }); if (map && s.id === 'sjv') { zoomed = true; map.flyTo([g.lat, g.lon], 10.5, { duration: 1.2 }); } }
    } else {
      select(null);
      if (zoomed && map) { zoomed = false; map.flyToBounds(s.overlay.bounds, { padding: [4, 4], duration: 0.8 }); }
      if (step === 'people') { if (s.id === 'sjv') setShade(true); impactPanel(s); showBox('impact'); }
      else {
        if (step === 'intro') { if (s.id === 'sjv') setShade(false); introBox(); }
        else if (step === 'play') { if (s.id === 'sjv') setShade(false); playBox(s); stop(); play(); }
        else if (step === 'crops') { cropsBox(); setShade(true, true); }
        showBox('step');
        if (step === 'crops') cropsChart();      // drawn once the box is visible and has a width
      }
    }
    markSteps();
  }
  // What a place shows before any button is pressed.
  function defaultBox(s) {
    ui.step = null;
    if (s.id === 'sjv') { introBox(); showBox('step'); }
    else { playBox(s); showBox('step'); }
    markSteps();
  }

  function kpi(v, l) { return '<div class="kpi"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
  function introBox() {
    var sp = state.site && state.site.state_product;
    setHeading('California\'s Central Valley <b>is sinking</b>');
    $('stepBox').innerHTML = '<div class="facts3">' +
      '<div><b>&gt; 60%</b><span>canal capacity lost</span></div>' +
      '<div><b>$326 million</b><span>to repair 10 miles</span></div>' +
      '<div><b>Months late</b><span>the State\'s map</span></div></div>';
    setNotes('<p class="note">Pumping groundwater makes the ground sink: slowly, invisibly and mostly for good. The Friant-Kern Canal lost more than 60% of its capacity along one stretch, and repairing ten miles of it cost about $326 million. ' +
      'California\'s own sinking map is published quarterly' + (sp ? '; its latest edition runs to ' + fmtDate(sp.provisional_to.replace(/-/g, '')) : '') + '. Sources are listed under "Why it matters here" below.</p>');
  }
  function playBox(s) {
    var sj = s.id === 'sjv' && TRUST, peak = peakOf(s), span = s.span_days >= 300 ? 'One year' : months(s) + ' months';
    var pl = (s.places || []).filter(function (p) { return p.median_cm != null; }).slice().sort(function (a, b) { return a.median_cm - b.median_cm; }).slice(0, 4);
    if (sj || peak == null) {
      setHeading(span + ' of NASA radar');
      $('stepBox').innerHTML = bignum(String(s.dates.length), 'radar passes, ' + esc(monthSpan(s.dates)), 'huge');
    } else {
      setHeading('Deepest sinking in ' + months(s) + ' months');
      $('stepBox').innerHTML = bignum((+peak).toFixed(peak >= 20 ? 0 : 1) + ' cm', 'at the fastest-sinking spot', 'huge');
    }
    setNotes('<p class="note">Red is sinking. Each frame is one pass of the NISAR radar: ' + s.dates.length + ' passes, ' + fmtDate(s.dates[0]) + ' to ' + fmtDate(s.dates[s.dates.length - 1]) +
      '. Click any spot on the map to see its own curve.</p>' +
      (pl.length && !sj ? '<ul class="rows">' + pl.map(function (p) { return '<li><span>' + esc(p.name) + '</span><b>' + cm(p.median_cm) + ' cm</b></li>'; }).join('') + '</ul><p class="note">Median change around each place.</p>' : ''));
  }
  // San Joaquin, the key step: fields read lower than the town they surround.
  function cropsBox() {
    var T = TRUST.towns, X = TRUST.excess_vs_state_cm;
    setHeading('We found crops fool the radar');
    $('stepBox').innerHTML = '<div class="kpis">' + kpi(T.n_fields_lower + ' of ' + T.n, 'towns') + kpi(cm(T.fields_minus_town_cm) + ' cm', 'fields against their town') + '</div>' +
      '<div class="chart-legend"><span><i style="border-color:var(--radar)"></i>Our map: fields minus town</span><span><i class="dash" style="border-color:var(--gps)"></i>State map: no gap</span></div><div class="chart"></div>';
    setNotes('<p class="note">Real sinking doesn\'t stop at the city limits. The gap opens in spring as the crops leaf out: the crops are fooling the radar. ' +
      'It is a crop-related radar effect, not confirmed sinking; the exact mechanism is not identified. So farmland is shaded and left out of every count.</p>' +
      '<p class="note">Average of ' + T.n + ' towns: fields within about 1 to 5 km of the town edge, minus the town. Over ' + esc(T.window) + ' the gap on our map is ' +
      cm(T.fields_minus_town_cm, 2) + ' ± ' + T.se_cm.toFixed(2) + ' cm; on the State map it is ' + cm(T.state_fields_minus_town_cm, 2) + ' cm (drawn as a flat line over that period). Compared with the State map, orchards and vines read ' +
      cm(X.orchards_vines) + ' cm, field crops ' + cm(X.field_crops) + ' cm, towns ' + cm(X.towns) + ' cm. Cropland from the USDA Cropland Data Layer 2025.</p>' +
      '<p><a href="img/sjv/evidence_crops.png" target="_blank" rel="noopener"><img class="evidence" src="img/sjv/evidence_crops.png" alt="Analysis figure: where our map reads deeper than the State map, by land cover, and the height of farmland relative to the nearest town over the year" loading="lazy"></a></p>');
  }
  function cropsChart() {
    var T = TRUST.towns, host = $('stepBox').querySelector('.chart'), dates = T.by_date.map(function (x) { return x[0]; }), ax = dateAxis({ dates: dates });
    if (!host) return;
    var flat = dates.map(function (d) { return d >= '20251201' && d <= '20260710' ? T.state_fields_minus_town_cm : null; });
    chart(host, { height: chartH() - 40, xs: ax.xs, xTicks: ax.ticks, xFmt: ax.fmt, yLabel: 'cm, fields minus town', label: 'Fields read lower than the town they surround',
      series: [{ name: 'Our map', short: 'Our map', ys: T.by_date.map(function (x) { return x[1]; }), color: 'var(--radar)', width: 3 },
        { name: 'State map', short: 'State map', ys: flat, color: 'var(--gps)', width: 2.5, dash: '6 4' }] });
  }

  // "Details and limits": the numbers behind a place.
  function results(s) {
    var out = [], H = s.headline, P = s.provenance;
    if (H) {
      out.push(['r = ' + fmtR(H.validation.r) + ' · RMS ' + H.validation.rms_los_cm.toFixed(1) + ' cm',
        'Radar against GPS stations held out of the fit (slanted view, valley floor, final date). The stations sit mostly beside towns, canals and open land, so this check does not cover farmland.']);
      out.push(['r = ' + H.series.r_min.toFixed(2) + ' to ' + H.series.r_max.toFixed(2),
        'Whole time series at stations ' + H.series.stations.join(', ') + ', each held out of the fit.']);
      out.push(['r = ' + H.two_tracks.r.toFixed(2) + ' between tracks',
        'Ascending and descending passes, processed separately, over ' + H.two_tracks.window + '. Half their difference is ±' + H.two_tracks.mean_sigma_cm.toFixed(1) + ' cm.']);
      if (TRUST) {
        var A = TRUST.agree, T = TRUST.towns, X = TRUST.excess_vs_state_cm;
        out.push([cm(last(A.ours_non_crop_cm)) + ' vs ' + cm(last(A.state_non_crop_cm), 2) + ' cm', 'Towns and open land inside the State map\'s sinking areas: our map against the State map, ' + A.window + '.']);
        out.push([cm(last(A.ours_crop_cm)) + ' vs ' + cm(last(A.state_crop_cm)) + ' cm', 'Cropland in the same areas: our map reads far deeper than the State map.']);
        out.push([T.n_fields_lower + ' of ' + T.n + ' towns', 'Fields read lower than the town they surround, by ' + cm(T.fields_minus_town_cm, 2) + ' cm on average; the State map shows ' + cm(T.state_fields_minus_town_cm, 2) + ' cm.']);
        out.push([cm(X.orchards_vines) + ' / ' + cm(X.field_crops) + ' / ' + cm(X.towns) + ' cm', 'Our map minus the State map over orchards and vines / field crops / towns.']);
        out.push(['Not reported', 'Canal, highway and rail lines here run mostly through fields, so no "worst stretch" or 10 cm figure is given for this place.']);
      }
    } else {
      s.gps.forEach(function (g) {
        out.push(['r = ' + fmtR(g.r) + ' · RMS ' + g.rms_cm.toFixed(1) + ' cm', 'Radar against GPS station ' + g.id + ' over ' + g.n + ' dates (' + g.gps_label + ').']);
      });
      s.places.slice(0, 1).forEach(function (p) {
        out.push([cm(p.median_cm) + ' cm in ' + s.span_days + ' days', p.name + ': median within ' + p.radius_km + ' km (5th to 95th percentile ' + cm(p.p05_cm) + ' to ' + cm(p.p95_cm) + ' cm), ' + s.quantity.short + '.']);
      });
      if (s.extreme) out.push([cm(s.extreme.min_cm) + pm(s.extreme.sigma_cm) + ' cm', 'Fastest spot on the map (3×3-cell median) at ' + Math.abs(s.extreme.lat).toFixed(3) + '°' + (s.extreme.lat < 0 ? 'S' : 'N') + ', ' + Math.abs(s.extreme.lon).toFixed(3) + '°' + (s.extreme.lon < 0 ? 'W' : 'E') + (s.extreme.sigma_cm != null ? ' (± is one standard deviation).' : '.')]);
      if (s.noise.areas && s.noise.value_cm != null) out.push(['±' + s.noise.value_cm.toFixed(1) + ' cm', 'Noise level: largest spread inside areas assumed stable: ' + s.noise.areas.map(function (a) { return a.name + ' ' + a.std_cm.toFixed(1); }).join(', ') + ' cm.']);
      if (P.coherence_proxy) out.push([P.coherence_proxy.mean.toFixed(2) + ' signal quality', 'Mean coherence proxy over ' + s.tracks[0].pairs + ' pairs (lowest ' + P.coherence_proxy.min.toFixed(2) + '); ' + P.dropped_noise_only_pairs.length + ' pairs dropped as noise-only.']);
    }
    $('results').innerHTML = out.map(function (x) { return '<li><b>' + esc(x[0]) + '</b>' + esc(x[1]) + '</li>'; }).join('');
    $('resultsNote').textContent = provenanceText(P.built_by) + ' Method: ' + P.method + '. Source: ' + P.source + '.';
    $('contextPanel').style.display = s.id === 'sjv' ? '' : 'none';
    var td = $('trustDetail');
    if (s.id === 'sjv' && TRUST) {
      var M = TRUST.mask;
      td.innerHTML = '<table class="mini"><thead><tr><th>On the map</th><th>Area, km²</th><th>People</th></tr></thead><tbody>' +
        [['Towns and open land: counted', 'trusted'], ['Farmland: shaded, not counted', 'cropland'], ['Edges of the data: not counted', 'edge'], ['Hills outside the State map: not checked', 'hills']].map(function (r) {
          return '<tr><td>' + r[0] + '</td><td class="num">' + M.area_km2[r[1]].toLocaleString('en-US') + '</td><td class="num">' + M.people[r[1]].toLocaleString('en-US') + '</td></tr>';
        }).join('') + '</tbody></table><p class="small muted">' + esc(capital(M.rule)) + '.</p>';
    } else td.innerHTML = '';
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
      if (TRUST) {
        var A = TRUST.agree;
        $('limitState').textContent = 'Over towns and open land inside the sinking areas the two agree (' + cm(last(A.ours_non_crop_cm)) + ' cm against ' + cm(last(A.state_non_crop_cm), 2) + ' cm, ' + A.window +
          '). Over cropland in the same areas ours reads ' + cm(last(A.ours_crop_cm)) + ' cm against ' + cm(last(A.state_crop_cm)) + ' cm: too deep.';
      }
    }
  }

  // ---------- map
  function initMap() {
    if (!window.L) { $('map').innerHTML = '<div class="fallback"><div><p>The map library could not be loaded (offline?). Showing the data layer only.</p><img id="fallbackImg" alt="Displacement layer for the selected date"></div></div>'; return; }
    map = L.map('map', { zoomSnap: 0.25, scrollWheelZoom: false, keyboard: false });
    map.attributionControl.addAttribution('Radar: NISAR previews via ASF DAAC');
    map.createPane('data'); map.getPane('data').style.zIndex = 350;
    map.createPane('trust'); map.getPane('trust').style.zIndex = 360; map.getPane('trust').style.pointerEvents = 'none';
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

  // Well-known cities, for orientation (San Joaquin's own place list is small farm towns that crowd the map).
  var CITY_LABELS = { sjv: [['Fresno', 36.7378, -119.7871], ['Madera', 36.9613, -120.0607], ['Merced', 37.3022, -120.483], ['Hanford', 36.3275, -119.6457], ['Visalia', 36.3302, -119.2921], ['Tulare', 36.2077, -119.3473]] };
  function lineStyle(kind) { return kind === 'canal' ? null : kind === 'rail' ? '2 7' : '9 6'; }

  function rim() { return state.base === 'sat' && !state.plain ? '#ffffff' : '#1d1b17'; }   // marker outlines that read on the base map

  function drawVectors(s) {
    vectors.clearLayers(); shapes = {};
    (s.alignments || []).forEach(function (a) {
      var pts = a.lat.map(function (la, i) { return [la, a.lon[i]]; });
      var casing = L.polyline(pts, { color: '#ffffff', weight: 4.5, opacity: 0.9, interactive: false });
      var line = L.polyline(pts, { color: '#1d1b17', weight: 2, dashArray: lineStyle(a.kind), lineCap: 'butt', interactive: false });
      var hit = L.polyline(pts, { color: '#000', weight: 18, opacity: 0 });
      hit.bindTooltip(a.name, { sticky: true });
      hit.on('click', function (e) { L.DomEvent.stopPropagation(e); select({ type: 'alignment', name: a.name }); });
      vectors.addLayer(casing); vectors.addLayer(line); vectors.addLayer(hit);
      shapes['alignment:' + a.name] = { line: line, base: { color: '#1d1b17', weight: 2 } };
    });
    var cities = CITY_LABELS[s.id];
    (cities || []).forEach(function (c) {
      vectors.addLayer(L.marker([c[1], c[2]], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'city-label', html: '<span>' + esc(c[0]) + '</span>', iconSize: null }) }));
    });
    (s.places || []).forEach(function (p) {
      var m = L.circleMarker([p.lat, p.lon], { radius: 3, color: '#1d1b17', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1 });
      m.bindTooltip(p.name, cities ? { direction: 'right', offset: [5, 0] } : { permanent: true, direction: 'right', offset: [5, 0], className: 'place' });
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
    map.fitBounds(s.overlay.bounds, { padding: [4, 4], animate: false });
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
    var shade = s.id === 'sjv' && TRUST && state.shade, lg = $('legend');
    lg.innerHTML = '<div class="bar" style="background:linear-gradient(90deg,' + stops + ')"></div>' +
      '<div class="ticks"><span>−' + v + ' cm sinking</span><span>rising +' + v + ' cm</span></div>' +
      '<div class="cap">since ' + fmtDate(s.dates[0]) + '</div>' +
      (shade ? '<div class="lg-key"><i class="sw-crop"></i>farmland: filtered out</div>' : '');
    // the explanations stay available on hover or tap, and in "Details and limits"
    lg.title = (n == null ? '' : 'Clear = under ' + n.toFixed(1) + ' cm, too small to tell from noise. ') +
      (shade ? 'Hatched farmland carries a crop signal and is filtered out of every count. Grey edges and hills are not checked.' : '');
    $('measureNote').innerHTML = '<b>What exactly is measured.</b> ' + esc(s.quantity.note) + (n == null ? '' : ' Noise level: ±' + n.toFixed(1) + ' cm (' + esc(s.noise.label) + '); the map leaves smaller changes clear.') +
      (s.grid && s.grid.clipped_at_cm ? ' The colour scale and the values stop at ' + s.grid.clipped_at_cm + ' cm.' : '') +
      (s.id === 'sjv' && TRUST ? ' Hatched farmland reads too deep and is not counted; grey edges of the data and hills outside the State map are not checked.' : '');
  }

  // ---------- San Joaquin trust mask: cropland reads too deep, so it is shaded and not counted
  var trustLayer = null, trustUrl = null, trustBytes = null, shadeTimer = null;
  function trustMask() {
    if (!TRUST) return null;
    if (!trustBytes) { var bin = atob(TRUST.mask.data_b64); trustBytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) trustBytes[i] = bin.charCodeAt(i); }
    return trustBytes;
  }
  function trustClassAt(lat, lon) {
    if (!TRUST) return null;
    var M = TRUST.mask, b = M.bounds, col = Math.floor((lon - b[0][1]) / (b[1][1] - b[0][1]) * M.width);
    var row = Math.floor((mercY(b[1][0]) - mercY(lat)) / (mercY(b[1][0]) - mercY(b[0][0])) * M.height);
    if (col < 0 || row < 0 || col >= M.width || row >= M.height) return null;
    return trustMask()[row * M.width + col];
  }
  function trustImage() {
    if (trustUrl) return trustUrl;
    var M = TRUST.mask, k = 4, c = document.createElement('canvas'), ctx = c.getContext && c.getContext('2d');
    if (!ctx) return null;
    c.width = M.width * k; c.height = M.height * k;
    var img = ctx.createImageData(c.width, c.height), d = img.data, m = trustMask(), x, y, o, cls, line;
    for (y = 0; y < c.height; y++) for (x = 0; x < c.width; x++) {
      cls = m[Math.floor(y / k) * M.width + Math.floor(x / k)]; o = 4 * (y * c.width + x);
      if (cls === 2) { line = (x + y) % 8 < 2; d[o] = d[o + 1] = d[o + 2] = line ? 40 : 226; d[o + 3] = line ? 210 : 205; }      // pale veil with dark hatching
      else if (cls === 3 || cls === 4) { d[o] = d[o + 1] = d[o + 2] = 150; d[o + 3] = 150; }
    }
    ctx.putImageData(img, 0, 0);
    try { trustUrl = c.toDataURL('image/png'); } catch (e) { trustUrl = null; }
    return trustUrl;
  }
  // fade = true makes the change slow and visible (the "now look at the fields" moment): the shading is taken off, then fades in.
  function setShade(on, fade) {
    var s = state.site, box = $('shadeBox'), can = !!(s && s.id === 'sjv' && TRUST);
    clearTimeout(shadeTimer);
    box.hidden = !can;
    if (can) { state.shade = !!on; $('shadeToggle').checked = state.shade; }
    if (map && trustLayer) { map.removeLayer(trustLayer); trustLayer = null; }
    if (s) legend(s);
    if (view3d && view3dSite === 'sjv') { view3dSite = null; if (state.view === '3d' && can) load3d(); }   // the 3D surface greys farmland too
    if (!can || !state.shade || !map) return;
    var url = trustImage(); if (!url) return;
    trustLayer = L.imageOverlay(url, TRUST.mask.bounds, { opacity: fade ? 0 : 1, className: 'trust', pane: 'trust', interactive: false }).addTo(map);
    if (fade) { var lay = trustLayer; shadeTimer = setTimeout(function () { if (trustLayer === lay) lay.setOpacity(1); }, 900); }
  }

  // ---------- time
  function setDate(i) {
    var s = state.site; state.i = i;
    $('dateSlider').value = i;
    $('dateLabel').textContent = fmtDate(s.dates[i]);
    $('dateSub').textContent = i === 0 ? 'start of the record' : days(s.dates[0], s.dates[i]) + ' days in';
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
  function select(sel) { state.sel = sel; var p = $('picker'); p.value = sel ? sel.type + ':' + (sel.name || sel.id || '') : ''; if (p.selectedIndex < 0) p.selectedIndex = 0; highlight(); renderDetail();
    if (sel) { showBox('detail'); if (sel.type !== 'gps') { ui.step = null; markSteps(); } }
    else if (ui.box === 'detail') { showBox('step'); $('placeTitle').innerHTML = ui.head || ''; $('stepNotes').innerHTML = ui.notes || ''; }
  }

  function buildPicker(s) {
    var html = '<option value="">Choose a station, a line or a place…</option>';
    if ((s.alignments || []).length) html += '<optgroup label="Canals, roads and rail">' + s.alignments.map(function (a) { return '<option value="alignment:' + esc(a.name) + '">' + esc(a.name) + '</option>'; }).join('') + '</optgroup>';
    if ((s.gps || []).length) html += '<optgroup label="GPS stations">' + s.gps.map(function (g) { return '<option value="gps:' + esc(g.id) + '">' + esc(g.id) + ' (r = ' + fmtR(g.r) + ')</option>'; }).join('') + '</optgroup>';
    var pl = (s.places || []).filter(function (p) { return p.series_cm; });
    if (pl.length) html += '<optgroup label="Places">' + pl.map(function (p) { return '<option value="place:' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('') + '</optgroup>';
    $('picker').innerHTML = html;
  }

  // A look-up or a check: the heading, up to three figures, at most one short line, and the chart. The rest goes to the notes.
  function seriesPanel(s, o) {
    var ax = dateAxis(s), box = $('detail');
    setHeading(esc(o.title), true);
    box.innerHTML = (o.kpis ? '<div class="kpis">' + o.kpis.map(function (k) { return kpi(esc(k[0]), esc(k[1])); }).join('') + '</div>' : '') +
      (o.line ? '<p class="plain">' + esc(o.line) + '</p>' : '') +
      chartLegend(o.series, o.noise ? '<span><i class="bandkey"></i>noise ±' + o.noise.toFixed(1) + ' cm</span>' : '') + '<div class="chart"></div>';
    setNotes((o.flag ? '<p class="flag">' + esc(o.flag) + '</p>' : '') + '<p class="note"><b>' + esc(o.kicker) + '.</b> ' + (o.plain || '') + '</p>' +
      '<p class="note">' + esc(o.note) + '</p>' + (o.extra || '') +
      valueTable(['Date'].concat(o.series.map(function (x) { return (x.short || x.name) + ' (cm)'; })), s.dates.map(function (d, i) {
        return [fmtDate(d)].concat(o.series.map(function (x) { return cm(x.ys[i], 2); }));
      })), true);
    chart(box.querySelector('.chart'), { height: chartH() - (o.line ? 34 : 0), xs: ax.xs, xTicks: ax.ticks, xFmt: ax.fmt, series: o.series, yLabel: 'cm moved, ' + plainQ(s), cursor: ax.xs[state.i], noise: o.noise, label: o.title });
  }
  // The single line a GPS view may carry outside the tour (the tour caption carries it on the San Joaquin town step).
  function gpsLine(s, g) {
    var mx = 0, o = OPERA[s.id], T = TRUST && s.id === 'sjv' && TRUST.town_check, t;
    g.gps_cm.forEach(function (v, i) { if (v != null && g.radar_cm[i] != null) mx = Math.max(mx, Math.abs(v - g.radar_cm[i])); });
    if (s.id === 'sjv') return T && g.id === T.station ? '' : trustClassAt(g.lat, g.lon) === 2 ? 'This station stands among fields, where the crop signal is filtered out.' : '';
    t = mx <= 1.2 ? 'Within a centimetre of GPS all year' : 'Typically ' + (g.rms_cm == null ? 'n/a' : g.rms_cm.toFixed(1)) + ' cm from GPS';
    if (operaAgrees(o) && o.unfiltered && o.unfiltered.bowl && o.unfiltered.bowl.ratio_of_sums != null) t += '; total sinking is ' + Math.round(o.unfiltered.bowl.ratio_of_sums * 100) + '% of NASA\'s own map';
    return t + '.';
  }
  function gpsPlain(s, g) {
    var mx = 0, T = TRUST && s.id === 'sjv' && TRUST.town_check, o = OPERA[s.id], txt;
    g.gps_cm.forEach(function (v, i) { if (v != null && g.radar_cm[i] != null) mx = Math.max(mx, Math.abs(v - g.radar_cm[i])); });
    if (T && g.id === T.station) {
      var m = T.main, A = TRUST.agree;
      txt = 'This station stands in the town of ' + esc(T.town) + ', not among fields. By the end GPS reads ' + cm(last(g.gps_cm)) + ' cm and the map around it ' + cm(m.ours_trusted_full_cm) + ' cm.' +
        ' <span class="line2">Across towns and open land in the sinking areas: our map ' + cm(last(A.ours_non_crop_cm)) + ' cm, California\'s State map ' + cm(last(A.state_non_crop_cm), 2) + ' cm.</span>';
      return txt;
    }
    txt = mx <= 1.2 ? 'Radar and GPS stay within about a centimetre of each other the whole time.'
      : 'Radar and GPS typically differ by ' + (g.rms_cm == null ? 'n/a' : g.rms_cm.toFixed(1)) + ' cm; at most ' + mx.toFixed(1) + ' cm.';
    if (operaAgrees(o) && o.unfiltered && o.unfiltered.bowl && o.unfiltered.bowl.ratio_of_sums != null) {
      txt += ' <span class="line2">Against NASA\'s own Sentinel-1 map (OPERA): our total sinking inside the sinking areas is ' + Math.round(o.unfiltered.bowl.ratio_of_sums * 100) + '% of theirs.</span>';
    }
    if (s.id === 'sjv' && TRUST) txt += ' <span class="line2">' + (trustClassAt(g.lat, g.lon) === 2 ? 'This station stands among fields, where the map reads too deep.' : 'GPS stations here sit mostly beside towns, canals and open land.') + '</span>';
    return txt;
  }
  function gpsExtra(s, g) {
    var T = TRUST && s.id === 'sjv' && TRUST.town_check;
    if (!T || g.id !== T.station) return '';
    function row(x) { return '<tr><td>' + esc(x.id) + ', ' + esc(x.town) + (x.kind === 'independent' ? ' (never used to adjust the map)' : '') + '</td><td class="num">' + cm(x.gps_full_cm) + '</td><td class="num">' + cm(x.ours_trusted_full_cm) + '</td><td class="num">' + cm(x.gps_dec_jul_cm) + '</td><td class="num">' + cm(x.ours_trusted_dec_jul_cm) + '</td><td class="num">' + cm(x.state_dec_jul_cm) + '</td></tr>'; }
    return '<p class="note">Town stations on counted (non-crop) cells, in cm. Full period, then 1 Dec 2025 to 1 Jul 2026, where the State map exists. Our map is not always closer than this: at Hanford it reads about 2 cm shallower than GPS.</p>' +
      '<div class="scroll"><table class="mini"><thead><tr><th>Station</th><th>GPS, year</th><th>Ours, year</th><th>GPS, Dec–Jul</th><th>Ours</th><th>State</th></tr></thead><tbody>' + row(T.main) + T.others.map(row).join('') + '</tbody></table></div>' +
      '<p class="note">Station ' + esc(T.not_used.id) + ' in ' + esc(T.not_used.town) + ' is not used for this check: it ' + esc(T.not_used.why) + '.</p>';
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
    has3d = true;
    [['2d', '2D map'], ['3d', 'See it in 3D']].forEach(function (v) {
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
    $('map').hidden = v === '3d'; $('map3d').hidden = v !== '3d'; $('controls3d').hidden = v !== '3d'; $('layerRow').hidden = v === '3d'; $('mode3d').hidden = v !== '3d';
    $('mapWrap').setAttribute('data-view', v); markSteps();
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
        alignments: s.alignments, gps: s.gps, places: s.places, upliftConfirmed: upliftConfirmed(s), dim: s.id === 'sjv' && TRUST && state.shade ? trustMask() : null,
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
        { name: 'Radar (NISAR)' + (g.radar_sigma_cm ? ', with ±1σ band' : ''), short: 'Radar', ys: g.radar_cm, color: 'var(--radar)', width: 3, dots: true,
          band: g.radar_sigma_cm ? { lo: g.radar_cm.map(function (v, i) { return v == null || g.radar_sigma_cm[i] == null ? null : v - g.radar_sigma_cm[i]; }),
            hi: g.radar_cm.map(function (v, i) { return v == null || g.radar_sigma_cm[i] == null ? null : v + g.radar_sigma_cm[i]; }) } : null },
        { name: 'GPS', short: 'GPS', ys: g.gps_cm, color: 'var(--gps)', width: 2.5, dots: true }];
      if (g.radar_map_cm) series.push({ name: 'Map at this spot', short: 'Map', ys: g.radar_map_cm, color: 'var(--muted)', width: 1.5, dash: '5 4' });
      var a = last(g.gps_cm), b = last(g.radar_cm), over = noise != null && a != null && b != null && Math.abs(a) < noise && Math.abs(b - a) > noise;
      var town = TRUST && s.id === 'sjv' && TRUST.town_check && TRUST.town_check.station === g.id ? TRUST.town_check.town : null;
      seriesPanel(s, {
        kicker: 'Independent check on the ground', title: 'GPS station ' + g.id + (town ? ', ' + town : ''), series: series, line: gpsLine(s, g),
        kpis: [[cm(a) + ' cm', 'GPS, by ' + fmtDate(s.dates[s.dates.length - 1])], [cm(b) + ' cm', 'radar, same day'], [g.rms_cm == null ? 'n/a' : g.rms_cm.toFixed(1) + ' cm', 'typical gap']],
        plain: gpsPlain(s, g), extra: gpsExtra(s, g),
        flag: over ? 'The radar over-reads here: GPS shows almost no motion, yet the radar differs from it by more than the noise level. Slowly moving ground is where this method is weakest.' : '',
        note: 'Match between the curves: r = ' + fmtR(g.r) + ' (1 = perfect) over ' + g.n + ' dates. Radar: ' + g.radar_label + '. GPS: ' + g.gps_label + '. ' + (s.quantity.key === 'vertical'
          ? 'The radar curve was computed with this station left out of the GPS adjustment, so it is an independent check. The typical gap is computed from the two curves shown.'
          : 'Radar is measured relative to ' + (s.reference ? s.reference.name : 'the scene median') + ', assumed stable. ' +
            (g.los_unit_enu ? 'GPS east, north and up motion is projected onto the radar\'s slanted view with the viewing geometry stored in the radar product.' : 'GPS height change is multiplied by an assumed 0.77 to project it onto the radar\'s slanted view.'))
      });
    } else if (sel.type === 'place' || sel.type === 'point') {
      var ys, title, kick, note, sig = null, flagP = '';
      if (sel.type === 'place') {
        var p = s.places.filter(function (x) { return x.name === sel.name; })[0];
        ys = p.series_cm; title = p.name; kick = 'Place, median within ' + p.radius_km + ' km';
        note = 'Final value ' + cm(p.median_cm) + pm(p.sigma_cm) + ' cm; 5th to 95th percentile inside the circle ' + cm(p.p05_cm) + ' to ' + cm(p.p95_cm) + ' cm.';
        var sig = p.sigma_cm;
      } else {
        ys = gridSeries(s, sel.lat, sel.lon); title = 'This spot'; kick = 'Map reading at ' + sel.lat.toFixed(3) + '°, ' + sel.lon.toFixed(3) + '°';
        sig = sigmaAt(s, sel.lat, sel.lon);
        note = 'Read from a half-resolution copy of the map (cells of about ' + Math.round(s.provenance.pixel_m[0] * 2 / 10) * 10 + ' m, steps of ' + s.grid.step_cm + ' cm).';
        if (!ys) { box.innerHTML = '<div class="empty"><div><strong>No data at this point</strong>Click inside the coloured area.</div></div>'; return; }
        var lim = s.grid.clipped_at_cm;
        if (lim && ys.some(function (v) { return v != null && Math.abs(v) >= lim - s.grid.step_cm; })) note += ' This layer stops at ±' + lim + ' cm: readings at that limit mean "' + lim + ' cm or more".';
        if (s.grid.source) note += ' Values are ' + s.grid.source + '.';
        title = 'This spot moved ' + cm(last(ys)) + ' cm';
        var tc = s.id === 'sjv' ? trustClassAt(sel.lat, sel.lon) : null;
        if (tc === 2) flagP = 'Farmland: crop signal here, so it is filtered out of every count.';
        else if (tc === 3 || tc === 4) flagP = 'Edge of the data or hills: not checked.';
      }
      seriesPanel(s, { kicker: kick, title: title, noise: noise, note: note, line: flagP,
        kpis: [[cm(last(ys)) + pm(sig) + ' cm', 'by ' + fmtDate(s.dates[s.dates.length - 1]) + (sig != null ? ' (± one standard deviation)' : '')], [cm(ys[state.i]) + ' cm', 'on ' + fmtDate(s.dates[state.i])]],
        series: [{ name: 'Radar (NISAR)', short: 'Radar', ys: ys, color: 'var(--radar)', width: 3, dots: true }] });
    } else if (sel.type === 'alignment') {
      var al = s.alignments.filter(function (x) { return x.name === sel.name; })[0], rows = s.reaches.filter(function (r) { return r.alignment === al.name; });
      var nOver = rows.filter(function (r) { return r.exceeds_noise; }).length, summer = rows.some(function (r) { return r.summer_mean_cm != null; });
      var lastDate = fmtDate(s.dates[s.dates.length - 1]), series = [
        { name: 'Total to ' + lastDate + ', with ±1σ band', short: 'Total', ys: al.total_cm, color: 'var(--ink-2)', width: 1.5,
          band: { lo: al.total_cm.map(function (v, i) { return v - al.sigma_cm[i]; }), hi: al.total_cm.map(function (v, i) { return v + al.sigma_cm[i]; }) } },
        { name: 'On ' + fmtDate(s.dates[state.i]), short: fmtDate(s.dates[state.i]), ys: al.series_cm[state.i], color: 'var(--radar)', width: 2.5 }];
      var d0 = al.dist_km[0], d1 = al.dist_km[al.dist_km.length - 1], st = niceStep(d1 - d0, 6), ticks = [];
      for (var t = Math.ceil(d0 / st) * st; t <= d1; t += st) ticks.push({ v: t, label: t + ' km' });
      setHeading(esc(al.name), true); setNotes('', true);
      box.innerHTML = '<div class="kicker">Profile along the line, median within ' + s.buffer_km + ' km</div>' +
        (s.id === 'sjv' && TRUST ? '<p class="flag">This line runs mostly through farmland, where the map reads several centimetres too deep. Read this profile as a rough guide, not as confirmed sinking.</p>' : '') +
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
  function bignum(v, l, cls) { return '<div class="bignum' + (cls ? ' ' + cls : '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
  function impactPanel(s) {
    var box = $('impact'), I = IMPACT[s.id], POP = 'Population: GHS-POP R2023A (European Commission JRC, CC BY 4.0). ';
    if (!I || !I.exposure) { setHeading('Who lives on it'); box.innerHTML = '<p class="plain">No population estimate for this place yet.</p>'; setNotes(''); return; }
    var E = I.exposure, P = E.people || {}, inf = E.infrastructure || {}, pc = E.population_check || {}, k = group3(obsEntry(s.id));
    var g5 = P.ge_5cm, g10 = P.ge_10cm, bn = P.beyond_noise;
    if (s.id === 'sjv' && TRUST) {
      var T = TRUST.people, rg = T.range_if_threshold_moved_by_1cm;
      setHeading('What we can confirm');
      box.innerHTML = bignum('<small>at least</small> ' + T.ge_5cm_floor.toLocaleString('en-US'), 'people on ground that sank 5&nbsp;cm or more', 'huge');
      setNotes('<p class="note">Mainly ' + T.mostly.slice(0, 3).map(function (m) { return esc(m[0]); }).join(', ').replace(/, ([^,]*)$/, ' and $1') + '. Towns and open land only. ' +
        'It is a floor: farmland is shaded and not counted, and nearly 4 in 10 residents live on ground we do not count.</p>' +
        '<p class="note">' + T.mostly.map(function (m) { return esc(m[0]) + ' ' + m[1].toLocaleString('en-US'); }).join(', ') + '. Period: ' + esc(T.window) +
        ', measured as up-and-down movement. Before the cropland check this page showed ' + T.uncorrected_was.toLocaleString('en-US') + ' people, most of them on farmland cells that read too deep. Moving the 5 cm threshold by 1 cm either way gives ' +
        rg[0].toLocaleString('en-US') + ' to ' + rg[1].toLocaleString('en-US') + '. Canals, highways and rail lines here run mostly through fields, so no "worst stretch" and no 10 cm figure is reported.</p>' +
        '<p class="imp-credit">' + POP + 'Cropland: USDA Cropland Data Layer 2025.</p>');
      return;
    }
    var ports = (inf.airports || []).filter(function (a) { return a.median_cm != null && a.beyond_noise; }).sort(function (a, b) { return a.median_cm - b.median_cm; });
    setHeading('Who lives on it');
    box.innerHTML = bignum((k !== 'checked' ? '<small>unchecked estimate:</small> ' : g5 && g5.people >= 1000 ? '<small>about</small> ' : '') + fmtPeople(g5 && g5.people), 'people on ground that sank 5&nbsp;cm or more', 'huge') +
      (ports[0] ? '<p class="plain">' + esc(ports[0].name) + ' sank about ' + Math.abs(ports[0].median_cm).toFixed(0) + ' cm.</p>' : '');
    var more = '<p class="note">In ' + s.span_days + ' days (' + esc(monthSpan(s.dates)) + '), ' + quantityWords(E.quantity && E.quantity.key) + '.' +
      (g10 && g10.people != null ? ' On ground that sank 10 cm or more: ' + fmtPeople(g10.people) + ' people.' : '') + '</p>';
    if (k !== 'checked') more += '<p class="flag">Unchecked estimate: not yet compared with GPS, and this radar can read too deep over cropland.</p>';
    if (pc.cells_over_50k_per_km2 > 0) more += '<p class="flag">Upper-end estimate: the population model is very dense here (' + pc.cells_over_50k_per_km2 + ' map cells above 50,000 people per km², up to ' + (pc.max_cell_people_per_km2 || 0).toLocaleString('en-US') + '), so these counts may run high.</p>';
    if (bn && bn.people != null) more += '<p class="note">Counting every change beyond the noise (' + Math.abs(bn.threshold_cm).toFixed(1) + ' cm or more here): ' + fmtPeople(bn.people) + ' people.' + (bn.threshold_cm > -5 ? ' The noise level is small here, so this count reaches down to small changes and runs high.' : '') + '</p>';
    var segs = inf.worst_segments || [], allPorts = (inf.airports || []).filter(function (a) { return a.median_cm != null; });
    if (segs.length) {
      more += '<h4>Worst stretches</h4><ul class="imp-list">' + segs.slice(0, 5).map(function (g, i) {
        return '<li><button type="button" class="imp-go" data-seg="' + i + '"><span class="imp-k">' + esc(KIND[g.kind] || g.kind) + '</span> ' + bdi(g.name) +
          (g.km_from != null ? ' <span class="muted">km ' + g.km_from + '–' + g.km_to + '</span>' : '') +
          ' <b>' + cm(g.mean_cm) + ' cm</b>' + (g.near ? ' <span class="muted">near ' + bdi(g.near) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>';
    }
    if (allPorts.length) {
      more += '<h4>Airports</h4><ul class="imp-list">' + allPorts.map(function (a, i) {
        return '<li><button type="button" class="imp-go" data-port="' + i + '"><span class="imp-k">airport</span> ' + bdi(a.name) + (a.iata ? ' (' + esc(a.iata) + ')' : '') +
          ' <b>' + cm(a.median_cm) + ' cm</b> <span class="muted">median' + (a.beyond_noise ? '' : ', within noise') + '</span></button></li>';
      }).join('') + '</ul>';
    }
    var L10 = [], L5 = [];
    Object.keys(inf.lengths || {}).forEach(function (q) {
      var x = inf.lengths[q];
      if (x.ge_10cm_km > 0) L10.push(esc(KIND[q] || q) + ' ' + x.ge_10cm_km.toFixed(0) + ' km');
      else if (x.ge_5cm_km > 0) L5.push(esc(KIND[q] || q) + ' ' + x.ge_5cm_km.toFixed(0) + ' km');
    });
    if (L10.length) more += '<p class="note">On ground that sank 10 cm or more: ' + L10.join(' · ') + '.</p>';
    if (L5.length) more += '<p class="note">On ground that sank 5 cm or more: ' + L5.join(' · ') + '.</p>';
    if (I.change && I.change.verdict) more += '<p class="note"><b>Since the last few passes:</b> ' + esc(I.change.verdict) + '</p>';
    setNotes(more + '<p class="imp-credit">' + POP + 'Roads, rail, canals and airports: &copy; OpenStreetMap contributors (ODbL).</p>');
    var nb = $('stepNotes');
    Array.prototype.forEach.call(nb.querySelectorAll ? nb.querySelectorAll('.imp-go') : [], function (b) {
      b.addEventListener('click', function () {
        var si = b.getAttribute('data-seg'), pi = b.getAttribute('data-port');
        showFeature(s, si != null ? segs[+si] : null, pi != null ? allPorts[+pi] : null);
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
  // World view headline: people on ground that sank 5 cm or more, in the places checked against GPS only.
  // San Joaquin enters at its conservative floor (towns and open land). Unchecked places are never added.
  function worldPeople() {
    var ids = OBS.filter(function (e) { return e.status === 'validated' && DATA[e.id] && IMPACT[e.id] && IMPACT[e.id].exposure && IMPACT[e.id].exposure.people && IMPACT[e.id].exposure.people.ge_5cm; }).map(function (e) { return e.id; });
    var total = 0, parts = [];
    ids.forEach(function (k) {
      var floor = k === 'sjv' && TRUST, n = floor ? TRUST.people.ge_5cm_floor : IMPACT[k].exposure.people.ge_5cm.people || 0;
      total += n; parts.push(shortName(k) + ' ' + fmtPeople(n) + (floor ? ' (a floor: farmland not counted)' : ''));
    });
    return { ids: ids, total: total, parts: parts };
  }
  function worldImpact() {
    var box = $('worldImpact'), W = worldPeople(), mx = DATA.mexico_city, g = mx && mx.gps && mx.gps[0], gap = 0;
    if (!box) return;
    if (g) g.gps_cm.forEach(function (v, i) { if (v != null && g.radar_cm[i] != null) gap = Math.max(gap, Math.abs(v - g.radar_cm[i])); });
    var wc = worldCounts();
    box.innerHTML = bignum(String(wc.checked + wc.measured), 'places mapped so far', 'huge');
    $('worldNotes').innerHTML = '<p class="note">' + wc.checked + ' of the ' + (wc.checked + wc.measured) + ' mapped places are checked against GPS; ' + wc.measured + ' are measured and not yet checked.</p>' +
      (W.ids.length ? '<p class="note">About ' + fmtPeople(Math.round(W.total / 1e5) * 1e5) + ' people live on ground that sank 5 cm or more in the ' + W.ids.length + ' GPS-checked places: ' + esc(W.parts.join(' + ')) + '. Places not yet checked are left out of this number.</p>' : '') +
      (g ? '<p class="note"><b>It runs anywhere the radar looks.</b> Best-checked example: in Mexico City the map stays within ' + (gap <= 1.2 ? 'a centimetre' : gap.toFixed(1) + ' cm') + ' of GPS all year.</p>' : '') +
      '<p class="note">Big dots are places we measured: click one to open its map. Small dots are known sinking places still waiting.</p>';
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
  // A clicked dot: one status label, one number or one line; the rest sits behind "More about this place".
  function worldCard(e) {
    var k = group3(e), st = STATUS[e.status] || STATUS.not_processed, sj = e.id === 'sjv' && TRUST, more = '';
    $('worldTitle').textContent = e.name + (e.country && e.name.indexOf(e.country) < 0 ? ', ' + e.country : '');
    var html = '<div class="kicker"><span class="dot3 ' + k + '"></span>' + esc(G3[k].label) + '</div>';
    if (e.status === 'refused') {
      html += '<p class="plain">We tried here, and do not trust the result.</p>';
      more += '<p class="note">' + esc(e.reason || '') + ' ' + (e.refused_by === 'manual_review' ? 'Decided by the team on reviewing the result by hand, not by an automatic test.' : 'Rejected by the pipeline\'s automatic quality check.') +
        (e.pipeline && e.pipeline.pairs ? ' We processed ' + e.pipeline.pairs + ' radar image pairs, ' + monthSpan(e.dates) + '.' : '') + '</p>';
    } else if (e.status === 'unconfirmed') {
      html += '<p class="plain">We tried here, and could not confirm it.</p>';
      more += '<p class="note">' + esc(e.unconfirmed_reason || st.text) + ' The radar result passed the automatic quality check' +
        (e.pipeline && e.pipeline.pairs ? ' (' + e.pipeline.pairs + ' image pairs, ' + monthSpan(e.dates) + ')' : '') + ', but did not match published studies, so no number is reported and it is left out of every total.</p>';
    } else if (k === 'none') {
      html += '<p class="plain">' + (e.first_batch_rank ? 'Next in line to be measured.' : 'Known from published research only.') + '</p>';
      more += '<p class="note">' + esc(st.text) + (e.first_batch_rank ? ' Number ' + e.first_batch_rank + ' in our first batch.' : '') + '</p>';
    } else if (sj) {
      html += '<p class="plain"><b>At least ' + TRUST.people.ge_5cm_floor.toLocaleString('en-US') + ' people</b> on ground that sank 5 cm or more.</p>';
    } else {
      html += '<p class="plain"><b>' + esc(capital(obsNumber(e))) + '</b></p>';
      if (k === 'measured') html += '<p class="caveat">' + esc(CROP_SHORT) + '</p>';
      if (LOW_CONFIDENCE[e.id]) more += '<p class="note"><b>Low confidence:</b> ' + esc(LOW_CONFIDENCE[e.id]) + '</p>';
    }
    var cov = coveredBy(e);
    if (cov) more += '<p class="note">' + esc(coverLabel(cov)) + ': a free ground-motion service already maps this area. <a href="' + esc(cov.url) + '" rel="noopener" target="_blank">' + esc(cov.name) + '</a></p>';
    more += literatureHtml(e);
    if (e.has_site_data && DATA[e.id]) html += '<p><button class="cta open-site" type="button">Open ' + esc(shortName(e.id)) + ' →</button></p>';
    if (more) html += '<details class="about"><summary>More about this place</summary>' + more + '</details>';
    var box = $('worldCard');
    box.innerHTML = html;
    var b = box.querySelector && box.querySelector('.open-site');
    if (b && b.addEventListener) b.addEventListener('click', function () { flyToSite(e.id); });
  }
  // The world panel before anything is clicked: the headline number and Mexico City, the best-checked example.
  function worldButtons(close) {
    var box = $('worldCard');
    box.innerHTML = '<p>' + (DATA.mexico_city ? '<button class="cta open-mx" type="button">Open Mexico City →</button>' : '') +
      (close ? '<button class="cta quiet again" type="button">← Back to the start</button>' : '') + '</p>';
    var b = box.querySelector && box.querySelector('.open-mx'), a = close && box.querySelector && box.querySelector('.again');
    if (b && b.addEventListener) b.addEventListener('click', function () { flyToSite('mexico_city'); });
    if (a && a.addEventListener) a.addEventListener('click', function () { tourGo(0); });
  }
  function worldIntro() { $('worldTitle').textContent = 'It runs anywhere'; worldButtons(false); }
  function closeCard() { $('worldTitle').textContent = 'One thing to remember'; worldButtons(true); }
  function worldCounts() {
    var c = { checked: 0, measured: 0, none: 0 };
    OBS.forEach(function (e) { c[group3(e)]++; });
    return c;
  }
  function worldLegend() {
    var c = worldCounts();
    $('worldLegend').innerHTML = ['checked', 'measured', 'none'].map(function (k) {
      return '<div class="wl"><span class="dot3 ' + k + '"></span><b>' + (k === 'none' ? '' : c[k]) + '</b> ' + esc(G3[k].label.charAt(0).toLowerCase() + G3[k].label.slice(1)) + '</div>';
    }).join('');
    var G = window.GLOBAL_LAYER, box = $('worldOptions'), html = '';
    if (COVER.length) html += '<p class="small">Hatched areas already have a free ground-motion service: ' + COVER.map(function (x) {
      return '<a href="' + esc(x.url) + '" rel="noopener" target="_blank">' + esc(coverLabel(x)) + '</a>';
    }).join(', ') + '. Outlines are approximate.</p>';
    if (G && G.legend) html += '<label class="gl-toggle"><input type="checkbox" id="globalToggle"> Show where a published model expects sinking</label>' +
      '<div class="gl-ramp">' + G.legend.map(function (l) { return '<span><i style="background:' + esc(l.swatch) + '"></i>' + esc(l.label) + '</span>'; }).join('') + '</div>' +
      '<p class="small muted">' + esc(G.quantity || '') + '. ' + esc(capital(G.caveat || 'modelled likelihood, not a measurement')) + '; groundwater-driven only. <a href="' + esc(G.url) + '" rel="noopener" target="_blank">Hasan et al. 2023</a> (CC BY 4.0).</p>';
    html += '<p class="small muted">"Not measured yet" covers three cases, told apart when you click a dot: known from published research only; tried, but the result was not trusted; tried, but not confirmed against published studies.</p>';
    box.innerHTML = html;
    var t = box.querySelector && box.querySelector('#globalToggle');
    if (t && t.addEventListener) t.addEventListener('change', function () { if (!world || !globalLayer) return; if (t.checked) globalLayer.addTo(world); else world.removeLayer(globalLayer); });
  }
  function capital(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
  function worldList() {
    var html = '';
    function btn(e) { return '<button type="button" class="linkbtn" data-obs="' + esc(e.id) + '">' + esc(e.name) + '</button>'; }
    function byContinent(es) {
      var g = {};
      es.forEach(function (e) { (g[continentOf(e)] = g[continentOf(e)] || []).push(e); });
      return Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; }).map(function (k) {
        return '<div class="wlist-sub"><span class="wlist-c">' + esc(k) + ' (' + g[k].length + ')</span>' + g[k].map(btn).join('') + '</div>';
      }).join('');
    }
    ['checked', 'measured', 'none'].forEach(function (k) {
      var es = OBS.filter(function (e) { return group3(e) === k; });
      if (!es.length) return;
      html += '<div class="wlist"><div class="wlist-k"><span class="dot3 ' + k + '"></span>' + esc(G3[k].label) + ' (' + es.length + ')</div>' + (k === 'checked' ? es.map(btn).join('') : byContinent(es)) + '</div>';
    });
    var box = $('worldList'); box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll ? box.querySelectorAll('[data-obs]') : [], function (b) {
      b.addEventListener('click', function () { openObs(obsEntry(b.getAttribute('data-obs'))); });
    });
  }
  function openObs(e) {
    if (!e) return;
    if (e.has_site_data && DATA[e.id]) flyToSite(e.id);
    else { worldCard(e); var wm = $('worldMore'); if (wm) wm.open = false; if (world) world.panTo([e.lat, e.lon]); }
  }
  function initWorld() {
    if (!OBS.length) return;
    worldImpact(); worldLegend(); worldList(); worldIntro();
    if (!window.L) return;
    world = L.map('worldMap', { zoomSnap: 0.25, scrollWheelZoom: false, worldCopyJump: true, minZoom: 1.5, keyboard: false });
    world.setView([20, 10], 2);                    // polygons need a view before they are added; showWorld() fits it properly
    window.GroundlineWorld = world;                // for debugging and the browser tests
    L.tileLayer(TILES.sat, { maxZoom: 18, attribution: SAT_CREDIT, zIndex: 1 }).addTo(world);
    L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, opacity: 0.85, zIndex: 10,
      attribution: 'Labels &copy; Esri, HERE, Garmin' }).addTo(world);
    world.attributionControl.addAttribution('Radar: NISAR previews via ASF DAAC');
    COVER.forEach(function (c) {
      if (!c.geojson) return;
      var lay = L.geoJSON(c.geojson, { style: { color: '#ffffff', weight: 1, opacity: 0.55, fillColor: '#ffffff', fillOpacity: 0.1, className: 'cover-area' } });
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
      globalLayer.on('tileerror', function () { /* empty tile: nothing to draw */ });   // off until ticked under "All places and map options"
    }
    var rank = { none: 0, measured: 1, checked: 2 };                 // trusted results drawn on top
    OBS.slice().sort(function (a, b) { return rank[group3(a)] - rank[group3(b)]; }).forEach(function (e) {
      var k = group3(e), st = STATUS[e.status] || STATUS.not_processed, sj = e.id === 'sjv' && TRUST;
      var m = L.circleMarker([e.lat, e.lon], k === 'checked' ? { radius: 12, color: '#ffffff', weight: 3.5, fillColor: G3.checked.colour, fillOpacity: 1, className: 'obs g-checked' }
        : k === 'measured' ? { radius: 8, color: '#111111', weight: 1.5, fillColor: G3.measured.colour, fillOpacity: 1, className: 'obs g-measured' }
          : { radius: 2.5, color: '#ffffff', weight: 1, opacity: 0.4, fillColor: '#ffffff', fillOpacity: 0.15, className: 'obs g-none' });
      var ip = IMPACT[e.id] && IMPACT[e.id].exposure && IMPACT[e.id].exposure.people && IMPACT[e.id].exposure.people.ge_5cm;
      var tip = '<b>' + esc(e.name) + '</b><br>' + esc(G3[k].label) +
        (sj ? '<br>At least ' + TRUST.people.ge_5cm_floor.toLocaleString('en-US') + ' people on ground that sank 5 cm or more<br>Farmland is filtered out of this count'
          : k !== 'none' ? '<br>' + esc(obsNumber(e)) + (k === 'checked' && ip ? '<br>' + fmtPeople(ip.people) + ' people on ground that sank 5 cm or more' : '') : '') +
        (k === 'measured' ? '<br>Crop areas may need filtering' : '') +
        (k === 'none' ? '<br>' + esc(st.label) + (e.literature && e.literature.rate_cm_yr != null ? '<br>Published: about ' + e.literature.rate_cm_yr + ' cm per year (not our measurement)' : '') : '');
      m.bindTooltip(tip, { direction: 'top', offset: [0, -8] });
      m.on('click', function () { openObs(e); });
      m.addTo(world);
      if (k === 'checked') L.marker([e.lat, e.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'obs-label', html: '<span>' + esc(shortName(e.id)) + '</span>', iconSize: null }) }).addTo(world);
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
        world.fitBounds(OBS.filter(function (e) { return group3(e) !== 'none'; }).map(function (e) { return [e.lat, e.lon]; }), { padding: [40, 40], maxZoom: 3 });
      }, 30);
    }
    markActs();
    try { history.replaceState(null, '', '#world'); } catch (e) { /* file:// in some browsers */ }
  }
  function inWorld() { return document.documentElement.getAttribute('data-mode') === 'world'; }
  function enterSite(id) {
    document.documentElement.setAttribute('data-mode', 'site');
    selectSite(id);
    renderTour();
  }
  function flyToSite(id) {
    var e = obsEntry(id), go = function () { enterSite(id); };
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!world || !e || !inWorld() || reduced) { go(); return; }
    world.flyTo([e.lat, e.lon], 7, { duration: 0.9 });
    world.once('moveend', go);
  }
  // The longer honest status, inside "Details and limits". The short label at the top is set by placeHead().
  function siteStatus(s) {
    var e = obsEntry(s.id), box = $('siteStatus'), parts = [];
    if (!e) { box.innerHTML = ''; return; }
    var st = STATUS[e.status] || {}, n = ((e.gps && e.gps.stations) || []).length;
    if (s.id === 'sjv' && TRUST) {
      parts.push('<b class="ok">Towns and open land agree with GPS and with California\'s State map.</b> <b class="warn">Farmland reads several centimetres too deep</b>, so it is shaded and not counted. ' +
        'The ' + n + ' GPS stations used to adjust this map sit mostly beside towns, canals and open land; they do not validate the farmland values.');
    } else {
      if (CALIBRATION[s.id]) parts.push('<span class="cal-tag">' + esc(calibrationTag(s.id)) + '.</span>');
      if (e.status === 'validated') parts.push('<b class="ok">Checked against ' + n + ' GPS station' + (n === 1 ? '' : 's') + '.</b>');
      else if (e.status === 'measured') parts.push('<b class="warn">Not yet checked against GPS.</b> ' + esc(CROP_CAVEAT));
      else parts.push('<b>' + esc(st.label || e.status) + '.</b>');
    }
    if (s.span_days < 200) parts.push('This record covers only ' + s.span_days + ' days (' + monthSpan(s.dates) + '), so all numbers are change over that period, not a yearly rate.');
    if (LOW_CONFIDENCE[s.id]) parts.push('<b class="warn">Low confidence:</b> ' + esc(LOW_CONFIDENCE[s.id]));
    if (e.status === 'measured' && e.literature && e.literature.rate_cm_yr != null) parts.push('Published research (not our measurement) reports about ' + e.literature.rate_cm_yr + ' cm per year (' + esc(e.literature.period || '') + ').');
    if (OPERA[s.id]) parts.push(operaHtml(s.id));
    box.innerHTML = parts.join(' ');
  }

  // ---------- the GPS station a place leads with
  function tourStation(s) {
    var T = TRUST && s.id === 'sjv' && TRUST.town_check, town = T && (s.gps || []).filter(function (g) { return g.id === T.station; })[0];
    if (town) return town;                                  // San Joaquin: a town station on counted (non-crop) cells
    var ids = s.headline ? s.headline.series.stations : [];
    var pool = (s.gps || []).filter(function (g) { return ids.indexOf(g.id) >= 0; });
    if (!pool.length) pool = s.gps || [];
    // among stations that moved clearly (GPS beyond twice the noise), the closest match between the two curves
    var n = s.noise.value_cm || 0, moving = pool.filter(function (g) { var v = last(g.gps_cm || []); return v != null && Math.abs(v) > 2 * n; });
    if (moving.length) pool = moving;
    return pool.slice().sort(function (a, b) { return (a.rms_cm == null ? 1e9 : a.rms_cm) - (b.rms_cm == null ? 1e9 : b.rms_cm); })[0];
  }

  // ---------- guided tour: the whole pitch with Next / Back or the arrow keys
  var TOUR = [], tour = { i: 0 };
  function buildTour() {
    var s = DATA.sjv, T = TRUST, c = worldCounts();
    if (s && T) {
      TOUR.push({ site: 'sjv', step: 'intro', cap: 'In California\'s Central Valley, pumping groundwater makes the ground sink.' });
      TOUR.push({ site: 'sjv', step: 'play', cap: 'One year of NASA radar over the valley. Red is sinking.' });
      if (tourStation(s)) TOUR.push({ site: 'sjv', step: 'gps', cap: 'In the towns, it lands within a centimetre or two of GPS.' });
      TOUR.push({ site: 'sjv', step: 'crops', cap: 'Real sinking doesn\'t stop at the city limits. The crops are fooling the radar.' });
      TOUR.push({ site: 'sjv', step: 'people', cap: 'What we can confirm: towns and open land.' });
    } else {
      var first = DATA[ORDER[0]];
      TOUR.push({ site: first.id, step: 'play', cap: 'NASA radar over ' + shortName(first.id) + '. Red is sinking.' });
      if (tourStation(first)) TOUR.push({ site: first.id, step: 'gps', cap: 'A GPS station on the ground checks the radar.' });
    }
    if (OBS.length) {
      TOUR.push({ world: true, step: 'world', cap: 'NASA\'s newest radar, as a sinking map anyone can open, that only counts what it can confirm.' });
    }
  }
  function tourIndex(siteId, step) {
    for (var i = 0; i < TOUR.length; i++) if (TOUR[i].site === siteId && TOUR[i].step === step) return i;
    return -1;
  }
  function tourGo(i) {
    if (!TOUR.length) return;
    i = Math.max(0, Math.min(TOUR.length - 1, i));
    tour.i = i; tour.on = true;
    var t = TOUR[i], more = $('more');
    if (more) more.open = false;
    if (t.world) {
      showWorld();
      if (t.step === 'close') closeCard(); else worldIntro();
    } else {
      document.documentElement.setAttribute('data-mode', 'site');
      if (!state.site || state.site.id !== t.site) selectSite(t.site, true);
      else { markActs(); if (map) setTimeout(function () { map.invalidateSize(false); }, 30); }
      if (state.view === '3d') setView('2d');
      if (t.step !== 'play') { stop(); setDate(state.site.dates.length - 1); }
      runStep(t.step);
      try { history.replaceState(null, '', i === 0 ? '#start' : '#' + t.site); } catch (e) { /* file:// in some browsers */ }
    }
    renderTour();
    var p = $('panel'); if (p) p.scrollTop = 0;
  }
  function renderTour() {
    if (!TOUR.length) return;
    var t = TOUR[tour.i], here = inWorld() ? !!t.world : !t.world && state.site && state.site.id === t.site;
    $('tourCount').textContent = 'Step ' + (tour.i + 1) + ' of ' + TOUR.length;
    $('tourDots').innerHTML = TOUR.map(function (x, k) { return '<i' + (k === tour.i ? ' class="on"' : '') + '></i>'; }).join('');
    $('tourCaption').textContent = here ? t.cap : 'You left the tour. Press Next to pick it up again.';
    $('tourBack').disabled = tour.i === 0;
    $('tourNext').innerHTML = tour.i === TOUR.length - 1 ? '<span>Start again</span> ↺' : '<span>Next</span> →';
    tour.here = here;
  }
  function tourStep(d) {
    if (!tour.here) { tourGo(tour.i + (d > 0 && tour.left ? 1 : 0)); return; }      // off the path: come back to the same step
    if (d > 0 && tour.i === TOUR.length - 1) tourGo(0); else tourGo(tour.i + d);
  }
  function initTour() {
    buildTour();
    $('tourBack').addEventListener('click', function () { tourStep(-1); });
    $('tourNext').addEventListener('click', function () { tourStep(1); });
    // Arrow keys and presenter clickers (Page Up / Page Down) drive the tour from anywhere on the page.
    document.addEventListener('keydown', function (e) {
      if (!e || e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key, fwd = k === 'ArrowRight' || k === 'PageDown', back = k === 'ArrowLeft' || k === 'PageUp', tag = e.target && e.target.tagName;
      if (!fwd && !back) return;
      if ((tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') && (k === 'ArrowRight' || k === 'ArrowLeft')) return;
      e.preventDefault(); e.stopPropagation();
      tourStep(fwd ? 1 : -1);
    }, true);
  }

  // ---------- site selection
  var freshFor = null;
  function selectSite(id, quiet) {
    var s = DATA[id]; if (!s) return;
    stop(); state.site = s; state.sel = null; state.i = s.dates.length - 1; ui.step = null;
    state.shade = !quiet;                                   // opened directly: shading on; the tour turns it on at the right moment
    markActs();
    var sl = $('dateSlider'); sl.max = s.dates.length - 1;
    placeHead(s); buildSteps(s); results(s); limits(s); legend(s); buildPicker(s);
    loadSiteOnMap(s); layerControls(s); setDate(state.i); renderDetail();
    setShade(state.shade);
    if (state.view === '3d') setView('3d');                              // rebuild the surface for the new case (or fall back to 2D)
    siteStatus(s);
    freshFor = null;
    if ($('more').open) { freshness(s); freshFor = s.id; }
    if (!quiet) defaultBox(s);
    $('buildInfo').textContent = 'Data file for this place built ' + s.provenance.generated_utc.replace('T', ' ').replace('Z', ' UTC') + '. ' + provenanceText(s.provenance.built_by);
    if (!inWorld()) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// in some browsers */ } }
  }

  // ---------- start
  function start() {
    initTheme();
    if (!ORDER.length) { $('stepBox').innerHTML = '<p class="plain"><strong>No data files found.</strong> Expected site/data/*.js next to this page.</p>'; return; }
    initMap(); initView(); buildSwitch(); initTour(); initWorld();
    var sl = $('dateSlider');
    sl.addEventListener('input', function (e) { stop(); setDate(+e.target.value); });
    sl.addEventListener('pointerup', function () { if (sl.blur) sl.blur(); });          // so the arrow keys go back to the tour
    $('playBtn').addEventListener('click', function () { if (state.timer) stop(); else play(); });
    $('shadeToggle').addEventListener('change', function (e) { setShade(!!e.target.checked); });
    $('more').addEventListener('toggle', function () { if ($('more').open && state.site && freshFor !== state.site.id) { freshness(state.site); freshFor = state.site.id; } });
    $('picker').addEventListener('change', function (e) {
      var v = e.target.value, k = v.indexOf(':');
      if (!v) return select(null);
      var type = v.slice(0, k), key = v.slice(k + 1);
      select(type === 'gps' ? { type: type, id: key } : { type: type, name: key });
    });
    var rz; window.addEventListener('resize', function () {
      clearTimeout(rz); rz = setTimeout(function () {
        if (state.sel) renderDetail(); else if (ui.step === 'crops' && ui.box === 'step') cropsChart();
        if (map) map.invalidateSize(false); if (world && inWorld()) world.invalidateSize(false);
        if (view3d && state.view === '3d') view3d.resize();
      }, 180);
    });
    var wanted = (location.hash || '').slice(1);
    if (wanted === 'world' && OBS.length) { selectSite(DATA.sjv ? 'sjv' : ORDER[0]); openAct('world'); }
    else if (DATA[wanted] && tourIndex(wanted, 'intro') < 0) { document.documentElement.setAttribute('data-mode', 'site'); selectSite(wanted); renderTour(); }
    else tourGo(0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
