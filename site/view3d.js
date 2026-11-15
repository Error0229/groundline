/* Groundline, 3D view: the displacement map as a surface whose height is the measured change.
   Needs three.js (classic global build, r128). Everything that does not touch WebGL lives in `math`
   so it can be tested without a browser. The vertical scale is hugely exaggerated on purpose and the
   page says by how much. */
(function () {
  'use strict';

  // ColorBrewer RdBu, the same ramp as the 2D map and its legend.
  var RDBU = [[103, 0, 31], [178, 24, 43], [214, 96, 77], [244, 165, 130], [253, 219, 199], [247, 247, 247],
    [209, 229, 240], [146, 197, 222], [67, 147, 195], [33, 102, 172], [5, 48, 97]];

  var math = {
    /* Weight 0..1 that fades out changes inside the noise band, so noise does not look like terrain:
       0 below half the noise level, 1 above one and a half times it, smooth in between. */
    weight: function (v, noise, flatten) {
      if (!flatten || !noise) return 1;
      var a = Math.abs(v), lo = 0.5 * noise, hi = 1.5 * noise;
      if (a <= lo) return 0;
      if (a >= hi) return 1;
      var t = (a - lo) / (hi - lo);
      return t * t * (3 - 2 * t);
    },
    /* How strongly a change is tinted over the imagery: clear inside the noise band, then in proportion to the change, up to 95% (same rule as the 2D map). */
    tintAlpha: function (v, noise, vmax) {
      var a = Math.abs(v), n = noise || 0;
      if (a <= n) return 0;
      var edge = Math.min(1, (a - n) / Math.max(0.25 * n, 0.05));
      return edge * edge * (3 - 2 * edge) * 0.95 * Math.min(1, a / (0.75 * vmax));   // pale colours (small changes) stay faint
    },
    /* Web Mercator pixel position at zoom z (256-pixel tiles). */
    tilePx: function (lon, lat, z) {
      var n = 256 * Math.pow(2, z);
      return [(lon + 180) / 360 * n, (1 - math.mercY(lat) / Math.PI) / 2 * n];
    },
    /* Zoom level and tile range that cover the bounds with at most maxPx pixels on the longer side and at most maxTiles tiles. */
    tilePlan: function (sc, maxPx, maxTiles, maxZ) {
      for (var z = Math.min(17, maxZ || 17); z > 1; z--) {
        var a = math.tilePx(sc.west, sc.north, z), b = math.tilePx(sc.east, sc.south, z);
        if (Math.max(b[0] - a[0], b[1] - a[1]) > maxPx) continue;
        var t0 = [Math.floor(a[0] / 256), Math.floor(a[1] / 256)], t1 = [Math.floor((b[0] - 1e-6) / 256), Math.floor((b[1] - 1e-6) / 256)];
        if ((t1[0] - t0[0] + 1) * (t1[1] - t0[1] + 1) > maxTiles) continue;
        return { z: z, x0: a[0], y0: a[1], w: Math.ceil(b[0] - a[0]), h: Math.ceil(b[1] - a[1]), t0: t0, t1: t1, count: (t1[0] - t0[0] + 1) * (t1[1] - t0[1] + 1) };
      }
      return null;
    },
    /* Write the ramp colour of v (cm) into out[o..o+2] as 0..1. */
    colour: function (v, vmax, out, o) {
      var t = Math.max(0, Math.min(1, (v / vmax + 1) / 2)) * (RDBU.length - 1), i = Math.min(Math.floor(t), RDBU.length - 2), f = t - i;
      out[o] = (RDBU[i][0] * (1 - f) + RDBU[i + 1][0] * f) / 255;
      out[o + 1] = (RDBU[i][1] * (1 - f) + RDBU[i + 1][1] * f) / 255;
      out[o + 2] = (RDBU[i][2] * (1 - f) + RDBU[i + 1][2] * f) / 255;
    },
    /* Real size of the mapped area and its size in scene units (longer side = 100 units). */
    scene: function (bounds) {
      var south = bounds[0][0], west = bounds[0][1], north = bounds[1][0], east = bounds[1][1], mid = (south + north) / 2;
      var widthKm = (east - west) * 111.32 * Math.cos(mid * Math.PI / 180), heightKm = (north - south) * 110.95;
      var kmPerUnit = Math.max(widthKm, heightKm) / 100;
      return { widthKm: widthKm, heightKm: heightKm, kmPerUnit: kmPerUnit, w: widthKm / kmPerUnit, d: heightKm / kmPerUnit,
        west: west, east: east, south: south, north: north, mid: mid };
    },
    round2: function (x) { var p = Math.pow(10, Math.floor(Math.log10(x)) - 1); return Math.round(x / p) * p; },
    /* Exaggeration that makes the largest change about 5% of the longer side of the map. */
    defaultTimes: function (maxCm, sc) { return math.round2(0.05 * Math.max(sc.widthKm, sc.heightKm) / (Math.max(maxCm, 0.1) * 1e-5)); },
    /* Scene units of height per centimetre of real change at a given exaggeration. */
    unitsPerCm: function (times, sc) { return times * 1e-5 / sc.kmPerUnit; },
    mercY: function (lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); },
    latOfRow: function (row, grid, sc) {       // grid rows are evenly spaced in Web Mercator, north first
      var yn = math.mercY(sc.north), ys = math.mercY(sc.south), y = yn - (row + 0.5) / grid.height * (yn - ys);
      return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
    },
    cellOf: function (lon, lat, grid, sc) {    // index of the grid cell under a lon/lat, or -1
      var col = Math.floor((lon - sc.west) / (sc.east - sc.west) * grid.width);
      var row = Math.floor((math.mercY(sc.north) - math.mercY(lat)) / (math.mercY(sc.north) - math.mercY(sc.south)) * grid.height);
      return col < 0 || row < 0 || col >= grid.width || row >= grid.height ? -1 : row * grid.width + col;
    },
    xOf: function (lon, sc) { return (lon - (sc.west + sc.east) / 2) * 111.32 * Math.cos(sc.mid * Math.PI / 180) / sc.kmPerUnit; },
    zOf: function (lat, sc) { return (sc.mid - lat) * 110.95 / sc.kmPerUnit; },      // north is -z
    /* Median over the (2r+1)x(2r+1) cells with data around each cell: removes spikes a few cells wide but keeps
       the edges of real bowls. Cells without data stay 0. */
    median: function (vals, valid, W, H, r) {
      var out = new Float32Array(vals.length), buf = new Float32Array((2 * r + 1) * (2 * r + 1));
      for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
        var k = j * W + i, m = 0;
        if (!valid[k]) continue;
        for (var jj = Math.max(0, j - r); jj <= Math.min(H - 1, j + r); jj++) for (var ii = Math.max(0, i - r); ii <= Math.min(W - 1, i + r); ii++) {
          if (!valid[jj * W + ii]) continue;
          var v = vals[jj * W + ii], q = m++;
          while (q > 0 && buf[q - 1] > v) { buf[q] = buf[q - 1]; q--; }
          buf[q] = v;
        }
        out[k] = m & 1 ? buf[m >> 1] : (buf[m / 2 - 1] + buf[m / 2]) / 2;
      }
      return out;
    },
    /* Mean over the (2r+1)x(2r+1) cells with data: rounds off the steps a median leaves. */
    mean: function (vals, valid, W, H, r) {
      var out = new Float32Array(vals.length);
      for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
        var k = j * W + i, sum = 0, m = 0;
        if (!valid[k]) continue;
        for (var jj = Math.max(0, j - r); jj <= Math.min(H - 1, j + r); jj++) for (var ii = Math.max(0, i - r); ii <= Math.min(W - 1, i + r); ii++) {
          if (valid[jj * W + ii]) { sum += vals[jj * W + ii]; m++; }
        }
        out[k] = sum / m;
      }
      return out;
    },
    /* The filtered surface: 5x5-cell median, then 3x3-cell mean. */
    clean: function (vals, valid, W, H) { return math.mean(math.median(vals, valid, W, H, 2), valid, W, H, 1); },
    lonOf: function (x, sc) { return (sc.west + sc.east) / 2 + x * sc.kmPerUnit / (111.32 * Math.cos(sc.mid * Math.PI / 180)); },
    latOf: function (z, sc) { return sc.mid - z * sc.kmPerUnit / 110.95; },
    /* Terrarium-encoded elevation in metres (AWS Terrain Tiles). */
    terrarium: function (r, g, b) { return r * 256 + g + b / 256 - 32768; },
    maxAbs: function (frames, grid) {
      var m = 0;
      frames.forEach(function (f) { for (var k = 0; k < f.length; k++) if (f[k] !== grid.nodata) { var a = f[k] < 0 ? -f[k] : f[k]; if (a > m) m = a; } });
      return m * grid.step_cm;
    }
  };

  /* Fetch the imagery tiles over the bounds and stitch them into one canvas. done(canvas) or done(null, reason).
     The tiles must be served with CORS (Esri sends Access-Control-Allow-Origin: *), or the canvas would be tainted
     and WebGL refuses it; that case is detected and reported. */
  var imageryCache = {};
  function loadImagery(sc, url, maxPx, done, maxTiles, maxZ) {
    var key = url + '|' + maxPx + '|' + [sc.west, sc.south, sc.east, sc.north].join(',');
    if (imageryCache[key]) { done(imageryCache[key]); return; }
    if (/^data:/.test(url)) {                               // one picture that covers the bounds exactly, rows even in Web Mercator
      var pic = new Image();
      pic.onload = function () {
        var pc = document.createElement('canvas'), px = pc.getContext && pc.getContext('2d');
        if (!px) { done(null, 'no 2D canvas'); return; }
        pc.width = pic.naturalWidth; pc.height = pic.naturalHeight; px.drawImage(pic, 0, 0);
        imageryCache[key] = pc; done(pc);
      };
      pic.onerror = function () { done(null, 'the bundled picture could not be read'); };
      pic.src = url;
      return;
    }
    var plan = math.tilePlan(sc, maxPx, maxTiles || 120, maxZ);
    if (!plan) { done(null, 'no tile zoom level fits these bounds'); return; }
    var c = document.createElement('canvas'), ctx = c.getContext && c.getContext('2d', maxTiles ? { willReadFrequently: true } : undefined);
    if (!ctx) { done(null, 'no 2D canvas'); return; }
    c.width = plan.w; c.height = plan.h;
    var left = plan.count, failed = 0, finished = false;
    function finish(reason) {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (reason) { done(null, reason); return; }
      if (failed > plan.count / (maxTiles ? 8 : 2)) { done(null, failed + ' of ' + plan.count + ' tiles failed to load'); return; }   // elevation needs nearly all tiles
      try { ctx.getImageData(0, 0, 1, 1); } catch (e) { done(null, 'the tile canvas is tainted (tiles served without CORS): ' + e.message); return; }
      imageryCache[key] = c;
      done(c);
    }
    var timer = setTimeout(function () { finish(left > plan.count / 2 ? 'imagery tiles timed out' : null); }, 20000);
    for (var ty = plan.t0[1]; ty <= plan.t1[1]; ty++) for (var tx = plan.t0[0]; tx <= plan.t1[0]; tx++) (function (tx, ty) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { if (finished) return; ctx.drawImage(im, tx * 256 - plan.x0, ty * 256 - plan.y0); if (!--left) finish(); };
      im.onerror = function () { if (finished) return; failed++; if (!--left) finish(); };
      im.src = url.replace('{z}', plan.z).replace('{x}', tx).replace('{y}', ty);
    })(tx, ty);
  }

  /* Elevation (metres) at every grid vertex, from AWS Terrain Tiles (Terrarium PNG, CORS-enabled). done(Float32Array) or
     done(null, reason). The stitched canvas covers the bounds with rows even in Web Mercator, like the grid. */
  var demCache = {};
  function loadElevation(sc, grid, url, done) {
    var W = grid.width, H = grid.height, key = url + '|' + W + 'x' + H + '|' + [sc.west, sc.south, sc.east, sc.north].join(',');
    if (demCache[key]) { done(demCache[key]); return; }
    loadImagery(sc, url, Math.min(1024, 3 * Math.max(W, H)), function (c, reason) {
      if (!c) { done(null, reason); return; }
      var d;
      try { d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; } catch (e) { done(null, 'cannot read elevation pixels: ' + e.message); return; }
      var cw = c.width, ch = c.height, out = new Float32Array(W * H), holes = 0;
      function at(x, y) { var o = 4 * (y * cw + x); return d[o + 3] < 255 ? NaN : math.terrarium(d[o], d[o + 1], d[o + 2]); }
      for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
        var fx = Math.min(cw - 1.001, Math.max(0, (i + 0.5) / W * cw - 0.5)), fy = Math.min(ch - 1.001, Math.max(0, (j + 0.5) / H * ch - 0.5));
        var x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        var e = (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
        if (isFinite(e)) out[j * W + i] = Math.max(e, 0);     // sea floor drawn at sea level
        else { out[j * W + i] = NaN; holes++; }
      }
      if (holes > W * H / 4) { done(null, Math.round(100 * holes / (W * H)) + '% of the area has no elevation'); return; }
      for (var pass = 0; holes && pass < 64; pass++) {        // fill small holes from their neighbours
        holes = 0;
        for (var k = 0; k < W * H; k++) {
          if (out[k] === out[k]) continue;
          var x = k % W, sum = 0, m = 0;
          [k - 1, k + 1, k - W, k + W].forEach(function (q, t) {
            if (q < 0 || q >= W * H || (t === 0 && x === 0) || (t === 1 && x === W - 1)) return;
            if (out[q] === out[q]) { sum += out[q]; m++; }
          });
          if (m) out[k] = sum / m; else holes++;
        }
      }
      if (holes) { done(null, 'elevation has gaps'); return; }
      demCache[key] = out;
      done(out);
    }, 48, 14);
  }

  // Surface shader: imagery (or a plain base colour) under the change colour, with simple sun shading and a little
  // extra darkness with depth, so that bowls read as dips rather than mesas.
  var VERT = [
    'attribute vec4 tint;',
    'varying vec2 vUv; varying vec4 vTint; varying vec3 vN; varying float vH;',
    'void main() {',
    '  vUv = uv; vTint = tint; vN = normal; vH = position.y;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'].join('\n');
  var FRAG = [
    'uniform sampler2D map; uniform float useMap; uniform vec3 base; uniform vec3 sun; uniform float depthRef;',
    'varying vec2 vUv; varying vec4 vTint; varying vec3 vN; varying float vH;',
    'void main() {',
    '  vec3 c = useMap > 0.5 ? texture2D(map, vUv).rgb : base;',
    '  c = mix(c, vTint.rgb, vTint.a);',
    '  float l = 0.68 + 0.5 * max(dot(normalize(vN), sun), 0.0);',
    '  l *= 1.0 - 0.32 * clamp(-vH / depthRef, 0.0, 1.0);',
    '  gl_FragColor = vec4(c * l, 1.0);',
    '}'].join('\n');

  function supported() {
    if (!window.THREE) return false;
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* onPick(sel) is called for a click (not a drag) with {type:'gps', id}, {type:'place', name, lat, lon} or {type:'point', lat, lon}. */
  function create(host, labelHost, onPick) {
    var T = window.THREE;
    var renderer = new T.WebGLRenderer({ antialias: true });
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(36, 1, 1, 3000);
    var canvas = renderer.domElement;
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', '3D surface of ground displacement. Drag to rotate, scroll or pinch to zoom, arrow keys to rotate.');
    host.insertBefore(canvas, labelHost);
    var SUN = new T.Vector3(-0.55, 0.62, -0.55).normalize();   // from the north-west, fairly low, so slopes show
    var credit = document.createElement('div');
    credit.className = 'credit3d'; credit.hidden = true;
    host.appendChild(credit);
    var imageryToken = 0, mode = 'terrain', TERRAIN0 = 2;      // real terrain at 2x by default; the slider scales it
    var group = new T.Group();
    scene.add(group);

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var HOME = { theta: -0.45, phi: 1.02, radius: 150 }, orbit = { theta: HOME.theta, phi: HOME.phi, radius: HOME.radius };
    var S = null, mult = 1, flatten = true, pending = false, tween = null, labels = [], built = [], ink = '#1d1b17', vec = new T.Vector3();
    function add(o) { group.add(o); built.push(o); return o; }

    function css(name, fallback) {
      var v = '';
      try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) { /* keep fallback */ }
      return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    }

    // ---- build everything for one case study
    function setSite(site) {
      built.forEach(function (c) { group.remove(c); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
      if (S && S.tex) S.tex.dispose();
      built = [];
      labels.forEach(function (l) { labelHost.removeChild(l.el); });
      labels = [];
      var g = site.grid, sc = math.scene(site.bounds), W = g.width, H = g.height, n = W * H, lastFrame = site.frames[site.frames.length - 1];
      S = { site: site, grid: g, sc: sc, n: n, pos: new Float32Array(n * 3), col: new Float32Array(n * 4), nor: new Float32Array(n * 3), uv: new Float32Array(n * 2), hasMap: false,
        valid: new Uint8Array(n), cur: new Float32Array(n), shown: new Float32Array(n), values: {}, smooth: {}, date: 0,
        maxCm: math.maxAbs(site.frames, g), drapes: [], pins: [] };
      S.times0 = math.defaultTimes(S.maxCm, sc);
      var k, i, j;
      for (j = 0; j < H; j++) {
        var z = math.zOf(math.latOfRow(j, g, sc), sc);
        for (i = 0; i < W; i++) {
          k = j * W + i;
          S.pos[3 * k] = math.xOf(sc.west + (i + 0.5) / W * (sc.east - sc.west), sc);
          S.pos[3 * k + 2] = z;
          S.uv[2 * k] = (i + 0.5) / W; S.uv[2 * k + 1] = 1 - (j + 0.5) / H;   // imagery canvas rows are even in Mercator too
          S.valid[k] = lastFrame[k] !== g.nodata ? 1 : 0;      // cells without data are left out of the surface
        }
      }
      var index = [], indexAll = [];
      for (j = 0; j < H - 1; j++) for (i = 0; i < W - 1; i++) {
        k = j * W + i;
        indexAll.push(k, k + W, k + 1, k + 1, k + W, k + W + 1);
        if (S.valid[k] && S.valid[k + 1] && S.valid[k + W] && S.valid[k + W + 1]) index.push(k, k + W, k + 1, k + 1, k + W, k + W + 1);
      }
      S.all = new Uint8Array(n).fill(1);
      var geom = new T.BufferGeometry();
      S.aPos = new T.BufferAttribute(S.pos, 3); S.aCol = new T.BufferAttribute(S.col, 4); S.aNor = new T.BufferAttribute(S.nor, 3);
      geom.setAttribute('position', S.aPos); geom.setAttribute('tint', S.aCol); geom.setAttribute('normal', S.aNor); geom.setAttribute('uv', new T.BufferAttribute(S.uv, 2));
      S.idxData = new T.BufferAttribute(n > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1);
      S.idxAll = new T.BufferAttribute(n > 65535 ? new Uint32Array(indexAll) : new Uint16Array(indexAll), 1);   // terrain mode: the whole rectangle
      geom.setIndex(mode === 'terrain' ? S.idxAll : S.idxData);
      S.mat = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        uniforms: { map: { value: null }, useMap: { value: 0 }, base: { value: new T.Color(247 / 255, 247 / 255, 247 / 255) }, sun: { value: SUN }, depthRef: { value: 1 } } });
      var surface = new T.Mesh(geom, S.mat);
      surface.frustumCulled = false;
      add(surface); S.surface = surface;
      S.dx = sc.w / W; S.dz = sc.d / H; S.triangles = index.length / 3;

      // flat reference at zero: a faint sheet plus a line grid, so that bowls read as depressions
      var hw = sc.w / 2, hd = sc.d / 2, lines = [], stepU = 10, x, zz;
      for (x = -Math.floor(hw / stepU) * stepU; x <= hw; x += stepU) lines.push(x, 0, -hd, x, 0, hd);
      for (zz = -Math.floor(hd / stepU) * stepU; zz <= hd; zz += stepU) lines.push(-hw, 0, zz, hw, 0, zz);
      lines.push(-hw, 0, -hd, hw, 0, -hd, hw, 0, -hd, hw, 0, hd, hw, 0, hd, -hw, 0, hd, -hw, 0, hd, -hw, 0, -hd);
      var lg = new T.BufferGeometry();
      lg.setAttribute('position', new T.BufferAttribute(new Float32Array(lines), 3));
      S.zeroLines = new T.LineSegments(lg, new T.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.22 }));
      add(S.zeroLines);
      S.zeroSheet = new T.Mesh(new T.PlaneGeometry(sc.w, sc.d), new T.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.05, depthWrite: false, side: T.DoubleSide }));
      S.zeroSheet.rotation.x = -Math.PI / 2;
      add(S.zeroSheet);
      S.gridKm = Math.round(stepU * sc.kmPerUnit);

      // infrastructure draped on the surface as flat ribbons (WebGL lines are one pixel wide)
      var rp = [], ri = [], cells = [];
      (site.alignments || []).forEach(function (a) {
        var half = a.kind === 'canal' ? 0.36 : 0.26, base = rp.length / 3, pts = [];
        a.lon.forEach(function (lo, q) { pts.push([math.xOf(lo, sc), math.zOf(a.lat[q], sc), math.cellOf(lo, a.lat[q], g, sc)]); });
        pts.forEach(function (p, q) {
          var a0 = pts[Math.max(q - 1, 0)], a1 = pts[Math.min(q + 1, pts.length - 1)], tx = a1[0] - a0[0], tz = a1[1] - a0[1], len = Math.sqrt(tx * tx + tz * tz) || 1;
          rp.push(p[0] - tz / len * half, 0, p[1] + tx / len * half, p[0] + tz / len * half, 0, p[1] - tx / len * half);
          cells.push(p[2], p[2]);
          if (q && Math.sqrt(Math.pow(p[0] - pts[q - 1][0], 2) + Math.pow(p[1] - pts[q - 1][1], 2)) < 6) {      // do not bridge gaps in coverage
            var b = base + 2 * q;
            ri.push(b - 2, b - 1, b, b, b - 1, b + 1);
          }
        });
      });
      if (ri.length) {
        var rg = new T.BufferGeometry();
        S.ribbonPos = new Float32Array(rp); S.ribbonCells = cells; S.aRibbon = new T.BufferAttribute(S.ribbonPos, 3);
        rg.setAttribute('position', S.aRibbon);
        rg.setIndex(new T.BufferAttribute(rp.length / 3 > 65535 ? new Uint32Array(ri) : new Uint16Array(ri), 1));
        S.ribbon = new T.Mesh(rg, new T.MeshBasicMaterial({ color: ink, side: T.DoubleSide }));
        S.ribbon.frustumCulled = false;
        add(S.ribbon);
      }

      // GPS stations as pins; places and (when there are few) station names as labels
      var few = (site.gps || []).length <= 3;
      (site.gps || []).forEach(function (st) {
        // drawn after the surface without a depth test, so a steep hill in front never hides a station
        var pin = new T.Mesh(new T.SphereGeometry(0.85, 14, 10), new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
        var rim = new T.Mesh(new T.SphereGeometry(1.15, 14, 10), new T.MeshBasicMaterial({ color: ink, side: T.BackSide, depthTest: false }));
        rim.renderOrder = 10; pin.renderOrder = 11;
        var o = { x: math.xOf(st.lon, sc), z: math.zOf(st.lat, sc), cell: math.cellOf(st.lon, st.lat, g, sc), meshes: [pin, rim], y: 0,
          pick: { type: 'gps', id: st.id } };
        add(pin); add(rim); S.pins.push(o);
        if (few) addLabel('GPS ' + st.id, o, 1.8);
      });
      (site.places || []).forEach(function (p) {
        addLabel(p.name, { x: math.xOf(p.lon, sc), z: math.zOf(p.lat, sc), cell: math.cellOf(p.lon, p.lat, g, sc),
          pick: { type: 'place', name: p.name, lat: p.lat, lon: p.lon } }, 0.6);
      });
      addLabel('N ↑', { x: 0, z: -hd - 4, cell: -1 }, 0, 'north');
      restyle();
      S.cur.set(valuesOf(site.frames.length - 1)); S.date = site.frames.length - 1;
      apply();
      resize();
      credit.hidden = true; S.credits = {};
      if (site.elevation) {
        var mineE = S;
        S.demState = 'loading';
        loadElevation(sc, g, site.elevation.url, function (elev, reason) {
          if (S !== mineE) return;
          if (!elev) { S.demState = 'failed: ' + reason; if (window.console) console.warn('Groundline 3D: no elevation (' + reason + '); terrain drawn flat.'); if (S.onImagery) S.onImagery(); return; }
          var lo = Infinity, hi = -Infinity;
          for (var q = 0; q < elev.length; q++) { if (elev[q] < lo) lo = elev[q]; if (elev[q] > hi) hi = elev[q]; }
          S.elev = elev; S.elevBase = lo; S.elevTop = hi; S.demState = 'ok';
          S.credits.elev = site.elevation.credit; showCredits();
          apply();
          if (S.onImagery) S.onImagery();
        });
      }
      if (site.imagery) {
        var token = ++imageryToken, mine = S, maxPx = Math.min(3072, renderer.capabilities.maxTextureSize || 2048);
        loadImagery(sc, site.imagery.url, maxPx, function (canvasImg, reason) {
          if (token !== imageryToken || S !== mine) return;     // the case changed meanwhile
          if (!canvasImg) { if (window.console) console.warn('Groundline 3D: no satellite texture (' + reason + '); using plain colouring.'); return; }
          var tex = new T.CanvasTexture(canvasImg);
          tex.generateMipmaps = false; tex.minFilter = T.LinearFilter; tex.magFilter = T.LinearFilter;
          tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
          S.mat.uniforms.map.value = tex; S.mat.uniforms.useMap.value = 1; S.hasMap = true; S.tex = tex;
          S.zeroLines.material.opacity = 0.14; S.zeroSheet.material.opacity = 0.025;
          S.credits.img = site.imagery.credit; showCredits();
          apply();
          if (S.onImagery) S.onImagery();
        });
      }
    }

    function showCredits() {
      var c = [S.credits.img, S.credits.elev].filter(Boolean);
      credit.innerHTML = c.join('<br>'); credit.hidden = !c.length;
    }

    function addLabel(text, where, lift, cls) {
      var el = document.createElement('span');
      el.className = 'l3' + (cls ? ' ' + cls : '');
      el.textContent = text;
      if (where.pick && onPick) {                             // labels are clickable, like the markers on the 2D map
        el.className += ' pick';
        el.addEventListener('click', function (e) {          // a station under the label wins, as it is the smaller target
          var q = local(e), pin = pinAt(q[0], q[1]);
          onPick(pin ? pin.pick : where.pick);
        });
      }
      labelHost.appendChild(el);
      var o = { el: el, x: where.x, z: where.z, cell: where.cell, lift: lift, y: 0 };
      labels.push(o); S.drapes.push(o);
    }

    function valuesOf(i) {                                   // one date as centimetres, cached; median-filtered when flattening noise
      if (!S.values[i]) {
        var f = S.site.frames[i], g = S.grid, out = new Float32Array(S.n);
        for (var k = 0; k < S.n; k++) out[k] = f[k] === g.nodata ? 0 : f[k] * g.step_cm;
        S.values[i] = out;
      }
      if (!flatten) return S.values[i];
      return S.smooth[i] || (S.smooth[i] = math.clean(S.values[i], S.valid, S.grid.width, S.grid.height));
    }

    // ---- heights, colours and normals from the current values
    function apply() {
      var g = S.grid, W = g.width, H = g.height, u = math.unitsPerCm(S.times0 * mult, S.sc), noise = S.site.noise, vmax = S.site.vmax, k, v;
      var terrain = mode === 'terrain', mask = terrain ? S.all : S.valid, perM = TERRAIN0 * mult / (S.sc.kmPerUnit * 1000);
      var dim = S.site.dim;                                    // optional: cells not counted (class above 1) are drawn grey
      for (k = 0; k < S.n; k++) {
        v = S.cur[k] * math.weight(S.cur[k], noise, flatten);  // inside the noise band: flattened and colourless

        S.shown[k] = v;
        if (terrain) S.pos[3 * k + 1] = S.elev ? (S.elev[k] - S.elevBase) * perM : 0;   // real relief; change shown by colour only
        else S.pos[3 * k + 1] = (v > 0 && flatten && !S.site.upliftConfirmed ? 0 : v) * u;   // rise no GPS confirms: colour only
        math.colour(v, vmax, S.col, 4 * k);
        S.col[4 * k + 3] = S.hasMap ? math.tintAlpha(v, noise, vmax) : 1;
        if (dim && dim[k] > 1) { S.col[4 * k] = S.col[4 * k + 1] = S.col[4 * k + 2] = 0.74; S.col[4 * k + 3] = S.hasMap ? 0.62 : 1; }   // not counted: grey
      }
      for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
        k = j * W + i;
        var l = i > 0 && mask[k - 1] ? k - 1 : k, r = i < W - 1 && mask[k + 1] ? k + 1 : k, t = j > 0 && mask[k - W] ? k - W : k, b = j < H - 1 && mask[k + W] ? k + W : k;
        var sx = r === l ? 0 : (S.pos[3 * r + 1] - S.pos[3 * l + 1]) / ((r - l) * S.dx), sz = b === t ? 0 : (S.pos[3 * b + 1] - S.pos[3 * t + 1]) / (((b - t) / W) * S.dz);
        var inv = 1 / Math.sqrt(sx * sx + 1 + sz * sz);
        S.nor[3 * k] = -sx * inv; S.nor[3 * k + 1] = inv; S.nor[3 * k + 2] = -sz * inv;
      }
      S.aPos.needsUpdate = true; S.aCol.needsUpdate = true; S.aNor.needsUpdate = true;
      S.mat.uniforms.depthRef.value = terrain ? 1e9 : Math.max(0.01, Math.min(S.maxCm, vmax) * u);
      S.zeroLines.visible = S.zeroSheet.visible = !terrain;   // the zero level only means something for sinking depth
      S.surface.geometry.boundingSphere = null; S.surface.geometry.boundingBox = null;   // recomputed on the next pick
      function height(cell) { return cell >= 0 && mask[cell] ? S.pos[3 * cell + 1] : 0; }
      if (S.ribbon) {
        for (k = 0; k < S.ribbonCells.length; k++) S.ribbonPos[3 * k + 1] = height(S.ribbonCells[k]) + 0.22;
        S.aRibbon.needsUpdate = true;
      }
      S.pins.forEach(function (p) { var y = p.y = height(p.cell) + 1.2; p.meshes.forEach(function (m) { m.position.set(p.x, y, p.z); }); });
      S.drapes.forEach(function (d) { d.y = height(d.cell) + d.lift; });
      requestRender();
    }

    function setDate(i, animate) {
      if (!S) return;
      var to = valuesOf(i);
      S.date = i;
      if (!animate || reduced) { tween = null; S.cur.set(to); apply(); return; }
      tween = { from: new Float32Array(S.cur), to: to, t0: null, ms: 480 };
      requestRender();
    }

    // ---- camera and drawing
    function requestRender() {
      if (pending) return;
      pending = true;
      (window.requestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 16); })(frame);
    }
    function frame(now) {
      pending = false;
      if (!S) return;
      if (tween) {
        if (tween.t0 == null) tween.t0 = now;
        var t = Math.min(1, (now - tween.t0) / tween.ms), e = t * t * (3 - 2 * t), a = tween.from, b = tween.to;
        for (var k = 0; k < S.n; k++) S.cur[k] = a[k] + (b[k] - a[k]) * e;
        if (t >= 1) tween = null;
        apply();                                             // also asks for the next frame
      }
      var sp = Math.sin(orbit.phi);
      camera.position.set(orbit.radius * sp * Math.sin(orbit.theta), orbit.radius * Math.cos(orbit.phi), orbit.radius * sp * Math.cos(orbit.theta));
      camera.lookAt(0, -2, 0);
      renderer.render(scene, camera);
      var w = host.clientWidth, h = host.clientHeight;
      labels.forEach(function (l) {
        vec.set(l.x, l.y, l.z).project(camera);
        var hide = vec.z > 1 || vec.x < -1.05 || vec.x > 1.05 || vec.y < -1.05 || vec.y > 1.05;
        l.el.style.display = hide ? 'none' : '';
        l.el.style.left = ((vec.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
        l.el.style.top = ((-vec.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
      });
      if (tween) requestRender();
    }
    function resize() {
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      var aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      HOME.radius = 150 * Math.max(1, 1.15 / aspect);   // step back on a tall, narrow screen
      if (!resize.done) { orbit.radius = HOME.radius; resize.done = true; }
      requestRender();
    }
    function reset() { orbit.theta = HOME.theta; orbit.phi = HOME.phi; orbit.radius = HOME.radius; requestRender(); }
    function clamp() {
      orbit.phi = Math.max(0.12, Math.min(1.5, orbit.phi));
      orbit.radius = Math.max(35, Math.min(520, orbit.radius));
    }
    function restyle() {
      ink = css('--ink', '#1d1b17');
      renderer.setClearColor(css('--surface', '#fbf9f4'), 1);
      if (S) {
        [S.zeroLines, S.zeroSheet, S.ribbon].forEach(function (o) { if (o) o.material.color.set(ink); });
        S.pins.forEach(function (p) { p.meshes[1].material.color.set(ink); });
      }
      requestRender();
    }

    // ---- picking: a GPS pin within a few pixels of the pointer first, then the surface under it
    var ray = new T.Raycaster(), ndc = new T.Vector2();
    function pinAt(px, py) {                                 // px, py relative to the canvas; generous hit radius
      if (!S) return null;
      var w = host.clientWidth, h = host.clientHeight, best = null, bd = 14;
      S.pins.forEach(function (p) {
        vec.set(p.x, p.y, p.z).project(camera);
        var d = Math.sqrt(Math.pow((vec.x * 0.5 + 0.5) * w - px, 2) + Math.pow((-vec.y * 0.5 + 0.5) * h - py, 2));
        if (vec.z < 1 && d < bd) { bd = d; best = p; }
      });
      return best;
    }
    function pick(px, py) {
      if (!S || !onPick) return null;
      var p = pinAt(px, py), sel = null;
      if (p) sel = p.pick;
      else {
        ndc.set(px / host.clientWidth * 2 - 1, -(py / host.clientHeight) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        var hit = ray.intersectObject(S.surface, false)[0];
        if (hit) sel = { type: 'point', lat: math.latOf(hit.point.z, S.sc), lon: math.lonOf(hit.point.x, S.sc) };
      }
      if (sel) onPick(sel);
      return sel;
    }
    function local(e) { var b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }

    // ---- a small orbit control: drag rotates, wheel or pinch zooms, arrow keys rotate; a press without movement picks
    var fingers = {}, engaged = false, pinch = 0, press = null;
    function count() { return Object.keys(fingers).length; }
    function spread() { var p = Object.keys(fingers).map(function (id) { return fingers[id]; }); return Math.sqrt(Math.pow(p[0].x - p[1].x, 2) + Math.pow(p[0].y - p[1].y, 2)); }
    canvas.addEventListener('pointerdown', function (e) {
      fingers[e.pointerId] = { x: e.clientX, y: e.clientY }; engaged = true;
      press = count() === 1 ? { x: e.clientX, y: e.clientY, moved: 0 } : null;   // a second finger is never a click
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      if (count() === 2) pinch = spread();
    });
    canvas.addEventListener('pointermove', function (e) {
      var f = fingers[e.pointerId];
      if (!f) { var q = local(e); canvas.style.cursor = pinAt(q[0], q[1]) ? 'pointer' : ''; return; }   // hover
      if (press) press.moved = Math.max(press.moved, Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y));
      if (press && press.moved < 5) return;                   // below the drag threshold: still a click
      var dx = e.clientX - f.x, dy = e.clientY - f.y;
      f.x = e.clientX; f.y = e.clientY;
      if (count() === 1) { orbit.theta -= dx * 0.008; orbit.phi -= dy * 0.006; }
      else if (count() === 2) { var s = spread(); if (pinch > 0 && s > 0) orbit.radius *= pinch / s; pinch = s; }
      clamp(); requestRender();
    });
    function release(e) { delete fingers[e.pointerId]; pinch = 0; }
    canvas.addEventListener('pointerup', function (e) {
      var was = press; press = null;
      release(e);
      if (was && was.moved < 5 && (e.pointerType !== 'mouse' || e.button === 0)) { var q = local(e); pick(q[0], q[1]); }
    });
    canvas.addEventListener('pointercancel', function (e) { press = null; release(e); });
    canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !count()) engaged = false; });
    canvas.addEventListener('wheel', function (e) {
      if (!engaged && !e.ctrlKey) return;                    // until the view is clicked, the wheel scrolls the page
      e.preventDefault();
      orbit.radius *= Math.exp(e.deltaY * 0.0012); clamp(); requestRender();
    }, { passive: false });
    canvas.addEventListener('keydown', function (e) {
      var used = true;
      if (e.key === 'ArrowLeft') orbit.theta -= 0.12; else if (e.key === 'ArrowRight') orbit.theta += 0.12;
      else if (e.key === 'ArrowUp') orbit.phi -= 0.08; else if (e.key === 'ArrowDown') orbit.phi += 0.08;
      else if (e.key === '+' || e.key === '=') orbit.radius *= 0.9; else if (e.key === '-') orbit.radius *= 1.1;
      else if (e.key === '0') reset(); else used = false;
      if (used) { e.preventDefault(); clamp(); requestRender(); }
    });

    var api = window.Groundline3D.current = {                // the live view, for debugging and the browser tests
      setSite: setSite, setDate: setDate, resize: resize, reset: reset, restyle: restyle,
      setExaggeration: function (m) { mult = m; if (S) apply(); },
      spin: function (d) { orbit.theta += d; requestRender(); },                       // slow turn, driven by the presentation
      view: function (o) { if (o.theta != null) orbit.theta = o.theta; if (o.phi != null) orbit.phi = o.phi; if (o.radius != null) orbit.radius = o.radius; clamp(); requestRender(); },
      pick: pick, pinScreen: function (id) {                // canvas position of a station (used by tests)
        var p = S && S.pins.filter(function (q) { return q.pick.id === id; })[0];
        if (!p) return null;
        vec.set(p.x, p.y, p.z).project(camera);
        return [(vec.x * 0.5 + 0.5) * host.clientWidth, (-vec.y * 0.5 + 0.5) * host.clientHeight];
      },
      onImagery: function (fn) { if (S) S.onImagery = fn; },
      setMode: function (m) {
        mode = m === 'depth' ? 'depth' : 'terrain';
        if (!S) return;
        S.surface.geometry.setIndex(mode === 'terrain' ? S.idxAll : S.idxData);
        apply();
      },
      setFlatten: function (on) { flatten = !!on; if (S) { tween = null; S.cur.set(valuesOf(S.date)); apply(); } },
      info: function () {
        return !S ? null : { times: math.round2(S.times0 * mult), maxCm: S.maxCm, widthKm: S.sc.widthKm, heightKm: S.sc.heightKm, gridKm: S.gridKm,
          flatten: flatten, noise: S.site.noise, reduced: reduced, triangles: S.triangles, upliftFlat: flatten && !S.site.upliftConfirmed,
          cellKm: S.sc.widthKm / S.grid.width, imagery: S.hasMap, mode: mode, terrainTimes: +(TERRAIN0 * mult).toFixed(2),
          dem: S.demState || 'none', reliefM: S.elev ? Math.round(S.elevTop - S.elevBase) : null, lowM: S.elev ? Math.round(S.elevBase) : null };
      }
    };
    return api;
  }

  window.Groundline3D = { supported: supported, create: create, math: math };
})();
