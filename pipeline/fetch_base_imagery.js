// Downloads the bundled base imagery for the presentation build (app/present/base/):   node pipeline/fetch_base_imagery.js
// Source: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (https://s2maps.eu), licence CC BY 4.0
// ("Contains modified Copernicus Sentinel data 2016"). One Web-Mercator picture per fixed view of the talk, so the
// presentation never depends on a tile server. Also writes base/views.js (bounds of each picture) and
// base/sjv_texture.js (the valley picture cropped to the data grid, as a data URI, for the 3D view).
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const out = path.join(__dirname, '..', 'present', 'base');
const WMS = 'https://tiles.maps.eox.at/wms?service=WMS&request=GetMap&version=1.1.1&layers=s2cloudless_3857&styles=&srs=EPSG:3857&format=image/jpeg';
const R = 6378137, X = lon => lon * Math.PI / 180 * R, Y = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R;
// name: [[south, west], [north, east]], picture width in pixels
const VIEWS = {
  world: [[-58, -180], [74, 180], 3072],
  valley: [[33.6, -124.6], [39.4, -115.1], 2880],
  madera: [[36.42, -121.2], [37.5, -118.9], 2560],
  mexico: [[18.7, -100.45], [20.25, -97.7], 2560]
};
const SJV_GRID = [[35.45, -121], [37.6, -118.7], 920];        // bounds of data/sjv.js, for the 3D texture

function once(url, file) {
  return new Promise((ok, fail) => {
    const q = https.get(url, { headers: { 'User-Agent': 'groundline-presentation-build' }, timeout: 120000 }, r => {
      if (r.statusCode !== 200 || String(r.headers['content-type'] || '').indexOf('image/jpeg') < 0) { r.resume(); return fail(new Error(file + ': HTTP ' + r.statusCode + ' ' + r.headers['content-type'])); }
      const parts = []; r.on('data', d => parts.push(d)); r.on('end', () => ok(Buffer.concat(parts))); r.on('error', fail);
    });
    q.on('error', fail); q.on('timeout', () => q.destroy(new Error('timeout')));
  });
}
async function get(url, file) {                                // the connection is sometimes reset: try a few times
  for (let k = 1; ; k++) {
    try { return await once(url, file); }
    catch (e) { if (k >= 12) throw e; console.log('  ' + file + ': ' + e.message + ', retry ' + k); await new Promise(r => setTimeout(r, 1500 * k)); }
  }
}
function request(b, w) {
  const x0 = X(b[0][1]), x1 = X(b[1][1]), y0 = Y(b[0][0]), y1 = Y(b[1][0]), h = Math.round(w * (y1 - y0) / (x1 - x0));
  return { url: WMS + '&bbox=' + [x0, y0, x1, y1].map(v => v.toFixed(2)).join(',') + '&width=' + w + '&height=' + h, h };
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const meta = {};
  const only = process.argv.includes('--textures-only');      // skip the big view pictures
  for (const [name, v] of Object.entries(only ? {} : VIEWS)) {
    const q = request(v, v[2]), buf = await get(q.url, name);
    fs.writeFileSync(path.join(out, name + '.jpg'), buf);
    meta[name] = { file: 'base/' + name + '.jpg', bounds: [v[0], v[1]], width: v[2], height: q.h };
    console.log(name + '.jpg ' + v[2] + 'x' + q.h + ', ' + (buf.length / 1e6).toFixed(2) + ' MB');
  }
  const q = request(SJV_GRID, SJV_GRID[2]), tex = await get(q.url, 'sjv texture');
  if (!only) fs.writeFileSync(path.join(out, 'views.js'), '// Written by pipeline/fetch_base_imagery.js. Base imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (https://s2maps.eu), CC BY 4.0.\n' +
    'window.BASE_VIEWS = ' + JSON.stringify(meta) + ';\nwindow.BASE_CREDIT = "Sentinel-2 cloudless 2016 by EOX IT Services GmbH (s2maps.eu), CC BY 4.0. Contains modified Copernicus Sentinel data 2016.";\n');
  fs.writeFileSync(path.join(out, 'sjv_texture.js'), '// Written by pipeline/fetch_base_imagery.js: the valley picture cropped to the data/sjv.js grid, as a data URI (a file:// picture cannot be used as a WebGL texture).\n' +
    'window.BASE_TEXTURE = { sjv: "data:image/jpeg;base64,' + tex.toString('base64') + '" };\n');
  console.log('sjv_texture.js ' + SJV_GRID[2] + 'x' + q.h + ', ' + (tex.length / 1e6).toFixed(2) + ' MB');
  // Mexico City, cropped to the data/mexico_city.js grid, for the online app's 3D view
  const MX = [[19.1, -99.4], [19.85, -98.75], 900], qm = request(MX, MX[2]), tm = await get(qm.url, 'mexico texture');
  fs.writeFileSync(path.join(__dirname, '..', 'site', 'base', 'mexico_texture.js'), '// Written by pipeline/fetch_base_imagery.js: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0), cropped to the data/mexico_city.js grid.\n' +
    'window.BASE_TEXTURE = window.BASE_TEXTURE || {}; window.BASE_TEXTURE.mexico_city = "data:image/jpeg;base64,' + tm.toString('base64') + '";\n');
  console.log('mexico_texture.js ' + MX[2] + 'x' + qm.h + ', ' + (tm.length / 1e6).toFixed(2) + ' MB');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
