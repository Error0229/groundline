// Consistency check of the static site, no browser needed:  node pipeline/check_site.js
// Loads site/data/*.js the way the page does and verifies that every referenced file exists and that
// array lengths line up. Exits non-zero on the first problem list.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const site = path.join(__dirname, '..', 'site');
const problems = [];
const need = (ok, msg) => { if (!ok) problems.push(msg); };

const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const local = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|data:)/.test(u));
local.forEach(u => need(fs.existsSync(path.join(site, u)), 'index.html references missing file ' + u));
need(/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/\d+\.\d+\.\d+\/leaflet\.js/.test(html), 'Leaflet must come from cdnjs with an exact version');
const ids = [...fs.readFileSync(path.join(site, 'app.js'), 'utf8').matchAll(/\$\('([A-Za-z0-9]+)'\)/g)].map(m => m[1]);
[...new Set(ids)].forEach(id => { if (!['fallbackImg', 'recheck'].includes(id)) need(html.includes('id="' + id + '"'), 'app.js uses #' + id + ' which index.html does not define'); });

// the fallback page (the earlier, detailed version) must keep working next to the new one
const classic = fs.existsSync(path.join(site, 'classic.html')) ? fs.readFileSync(path.join(site, 'classic.html'), 'utf8') : '';
need(!!classic, 'classic.html (the fallback page) is missing');
[...classic.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|data:)/.test(u)).forEach(u => need(fs.existsSync(path.join(site, u)), 'classic.html references missing file ' + u));
['classic/app.js', 'classic/view3d.js', 'classic/style.css'].forEach(u => need(fs.existsSync(path.join(site, u)), 'fallback file missing: ' + u));
need(!/(?:src|href)="\//.test(html), 'index.html must use relative URLs only (GitHub Pages sub-path, file://)');

const ctx = { window: {} };
vm.createContext(ctx);
fs.readdirSync(path.join(site, 'data')).filter(f => f.endsWith('.js')).forEach(f => vm.runInContext(fs.readFileSync(path.join(site, 'data', f), 'utf8'), ctx, { filename: f }));
const data = ctx.window.SITE_DATA || {};
need(Object.keys(data).length >= 2, 'expected at least two case studies in site/data');
// site/data/manifest.js drives what the page loads (site/loader.js): every listed file must exist, every site file must be listed
const M = ctx.window.GROUNDLINE_MANIFEST;
need(!!M, 'site/data/manifest.js missing or does not set window.GROUNDLINE_MANIFEST');
if (M) {
  (M.layers || []).forEach(n => need(fs.existsSync(path.join(site, 'data', n + '.js')), 'manifest layer missing: data/' + n + '.js'));
  (M.sites || []).forEach(id => need(fs.existsSync(path.join(site, 'data', id + '.js')) && data[id], 'manifest site missing or not loading: data/' + id + '.js'));
  (M.impact || []).forEach(id => need(fs.existsSync(path.join(site, 'data', id + '_impact.js')), 'manifest impact file missing: data/' + id + '_impact.js'));
  Object.keys(data).forEach(id => need((M.sites || []).includes(id), 'data/' + id + '.js exists but is not listed in manifest.sites'));
}

let bytes = 0;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(path.join(d, e.name)) : bytes += fs.statSync(path.join(d, e.name)).size);
walk(site);
// 30 MB since the gap-region batch (2026-11-14): GitHub Pages hosting has no hard 15 MB limit; new sites are kept
// to ~300 kB each (monthly frames, half-resolution fallback pictures)
need(bytes < 30e6, 'site folder is ' + (bytes / 1e6).toFixed(1) + ' MB, over the 30 MB budget');

for (const [id, s] of Object.entries(data)) {
  const n = s.dates.length, tag = '[' + id + '] ';
  need(s.id === id, tag + 'id mismatch');
  need(s.overlay.files.length === n, tag + 'one overlay per date expected');
  s.overlay.files.concat((s.extra_overlays || []).map(x => x.file)).forEach(f => need(fs.existsSync(path.join(site, f)), tag + 'missing image ' + f));
  need(s.dates.every((d, i) => /^20\d{6}$/.test(d) && (i === 0 || d > s.dates[i - 1])), tag + 'dates must be ascending YYYYMMDD');
  need(s.noise && (s.noise.value_cm == null || s.noise.value_cm > 0), tag + 'noise level missing');
  (s.gps || []).forEach(g => {
    need(g.gps_cm.length === n && g.radar_cm.length === n, tag + 'GPS ' + g.id + ' series length');
    need(g.r == null || Math.abs(g.r) <= 1, tag + 'GPS ' + g.id + ' r out of range');
    // recompute r and RMS from the series that the chart draws
    const pts = g.gps_cm.map((v, i) => [v, g.radar_cm[i]]).filter(p => p[0] != null && p[1] != null);
    const mean = k => pts.reduce((a, p) => a + p[k], 0) / pts.length, mx = mean(0), my = mean(1);
    const r = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / Math.sqrt(pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0) * pts.reduce((a, p) => a + (p[1] - my) ** 2, 0));
    const rms = Math.sqrt(pts.reduce((a, p) => a + (p[1] - p[0]) ** 2, 0) / pts.length);
    need(g.r == null || Math.abs(r - g.r) < 0.02, tag + 'GPS ' + g.id + ' r ' + g.r + ' does not match its series (' + r.toFixed(3) + ')');
    need(g.rms_cm == null || Math.abs(rms - g.rms_cm) < 0.06, tag + 'GPS ' + g.id + ' RMS ' + g.rms_cm + ' does not match its series (' + rms.toFixed(2) + ')');
  });
  (s.alignments || []).forEach(a => {
    const k = a.lat.length;
    need([a.lon, a.dist_km, a.total_cm, a.sigma_cm].every(x => x.length === k), tag + a.name + ' profile lengths');
    need(a.series_cm.length === n && a.series_cm.every(x => x.length === k), tag + a.name + ' series shape');
    need(a.series_cm[n - 1].every((v, i) => Math.abs(v - a.total_cm[i]) < 0.011), tag + a.name + ' last series row should equal the total');
  });
  (s.reaches || []).forEach(r => need((s.alignments || []).some(a => a.name === r.alignment), tag + 'reach refers to unknown alignment ' + r.alignment));
  if (s.grid) need(s.grid.frames_b64.length === n && Buffer.from(s.grid.frames_b64[0], 'base64').length === s.grid.width * s.grid.height, tag + 'value grid shape');
  if (s.headline) {
    const H = s.headline, canal = s.reaches.filter(r => r.alignment === 'Friant-Kern Canal');
    need(H.canal.reaches_total === canal.length && H.canal.reaches_over_noise === canal.filter(r => r.exceeds_noise).length, tag + 'headline canal counts');
  }
  console.log(tag + n + ' dates ' + s.dates[0] + '..' + s.dates[n - 1] + ', ' + (s.gps || []).length + ' GPS, ' + (s.alignments || []).length + ' alignments, ' + (s.reaches || []).length + ' reaches, grid ' + (s.grid ? s.grid.width + 'x' + s.grid.height : 'none'));
}
// optional decision layers written by pipeline/build_impact.py (window.IMPACT[id])
for (const [id, m] of Object.entries(ctx.window.IMPACT || {})) {
  const tag = '[' + id + ' impact] ', s = data[id];
  need(s && m.id === id, tag + 'no matching SITE_DATA entry');
  const g = m.change && m.change.grid;
  need(g && Buffer.from(g.rate_change_b64, 'base64').length === g.width * g.height && Buffer.from(g.flags_b64, 'base64').length === g.width * g.height, tag + 'change grid shape');
  if (s && s.grid && g) need(g.width === s.grid.width && g.height === s.grid.height, tag + 'change grid must match the site grid');
  const p = m.exposure.people;
  need(p.ge_10cm.people <= p.ge_5cm.people, tag + 'people at 10 cm cannot exceed people at 5 cm');
  console.log(tag + m.change.status + ', ' + m.change.areas_total + ' change areas, ' + p.ge_5cm.people + ' people at >= 5 cm');
}
// San Joaquin cropland finding (pipeline/build_trust.js): the mask must sit on the site grid and the page numbers must be the conservative ones
const T = ctx.window.SJV_TRUST, sj = data.sjv, sjImp = (ctx.window.IMPACT || {}).sjv;
need(!!T, 'data/sjv_trust.js missing or not listed in manifest.layers');
if (T && sj) {
  const m = Buffer.from(T.mask.data_b64, 'base64');
  need(T.mask.width === sj.grid.width && T.mask.height === sj.grid.height && m.length === sj.grid.width * sj.grid.height, '[sjv trust] mask must match the sjv grid');
  need(JSON.stringify(T.mask.bounds) === JSON.stringify(sj.overlay.bounds), '[sjv trust] mask bounds must equal the sjv overlay bounds');
  need(m.every(v => v <= 4) && m.filter(v => v === 2).length === T.mask.cells['2'], '[sjv trust] mask classes');
  need(sjImp && T.people.ge_5cm_floor > 0 && T.people.ge_5cm_floor < sjImp.exposure.people.ge_5cm.people, '[sjv trust] the floor must be below the uncorrected count');
  need(T.towns.n_fields_lower <= T.towns.n && T.towns.by_date.length > 5, '[sjv trust] town evidence');
  need(sj.gps.some(g => g.id === T.town_check.station), '[sjv trust] town GPS station ' + T.town_check.station + ' is not in data/sjv.js');
  need(fs.existsSync(path.join(site, 'img/sjv/evidence_crops.png')), '[sjv trust] evidence figure missing');
  console.log('[sjv trust] floor ' + T.people.ge_5cm_floor + ' people (uncorrected ' + sjImp.exposure.people.ge_5cm.people + '), ' + T.towns.n_fields_lower + ' of ' + T.towns.n + ' towns, cropland cells ' + T.mask.cells['2'] + ', town station ' + T.town_check.station);
}
console.log('site folder: ' + (bytes / 1e6).toFixed(2) + ' MB, ' + local.length + ' local references');
if (problems.length) { console.error('PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('all checks passed');
