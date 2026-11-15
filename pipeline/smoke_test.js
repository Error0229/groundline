// Runs site/app.js against a tiny fake page (no browser) and exercises the explorer, every panel and the optional tour:
//   node pipeline/smoke_test.js
// Two passes: without a map library (the offline fallback) and with a stand-in for Leaflet that accepts
// any call, so the map code paths run too. It catches exceptions, missing data fields, and regressions in the
// story the page must tell (San Joaquin's conservative numbers, the three world states, the tour order).
// It does NOT test layout, real Leaflet behaviour or the live catalogue check.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const site = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(site, f), 'utf8');

function run(withMap) {
  const elements = {}, handlers = [], docKeys = [];
  function element(id) {
    const listeners = {}, attrs = {};
    return {
      id, style: { setProperty() {} }, children: [], value: '', hidden: false, open: false, checked: false, disabled: false, selectedIndex: 0, clientWidth: 380, scrollTop: 0, _html: '', textContent: '',
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
      set innerHTML(v) { this._html = String(v); this.children = []; this._inner = null; }, get innerHTML() { return this._html; },
      setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k]; }, removeAttribute(k) { delete attrs[k]; },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      fire(type, ev) { (listeners[type] || []).forEach(fn => fn(ev)); },
      querySelector() { return this._inner || (this._inner = element('(inner)')); }, querySelectorAll() { return []; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 380, height: 200 }; }, blur() {},
    };
  }
  const document = {
    readyState: 'complete', documentElement: element('html'),
    getElementById(id) { if (id === 'fallbackImg' || id === 'recheck') return null; return elements[id] || (elements[id] = element(id)); },
    createElement: tag => element(tag), querySelectorAll: () => [],
    addEventListener(type, fn) { if (type === 'keydown') docKeys.push(fn); },
  };
  // Stand-in for Leaflet: every property is the same callable object; .on() records the handler.
  const anything = new Proxy(function () {}, {
    get(_, key) {
      if (key === 'on') return (type, fn) => { handlers.push({ type, fn }); return anything; };
      if (key === 'style') return {};
      return anything;
    },
    apply() { return anything; },
    construct() { return anything; },
  });
  const window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const ctx = { window, document, location: { hash: '' }, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, console, Date, Math,
    atob: s => Buffer.from(s, 'base64').toString('latin1'), Image: function () {} };
  if (withMap) { window.L = anything; ctx.L = anything; }
  vm.createContext(ctx);
  for (const f of fs.readdirSync(path.join(site, 'data')).filter(f => f.endsWith('.js'))) vm.runInContext(read('data/' + f), ctx, { filename: f });
  vm.runInContext(read('app.js'), ctx, { filename: 'app.js' });
  // The map's own handlers (click, focus, blur) are registered first, once; the rest belong to the shapes
  // of whichever case was loaded at start-up and are re-created on every switch.
  const mapHandlers = handlers.filter(hd => hd.type === 'click').slice(0, 1);   // the map's own click handler is registered first
  const el = id => document.getElementById(id), html = id => el(id).innerHTML + el(id).children.map(c => c.innerHTML).join('') + el(id).textContent;
  const must = (ok, msg) => { if (!ok) throw new Error((withMap ? '[map] ' : '[no map] ') + msg); };

  const data = window.SITE_DATA, T = window.SJV_TRUST;
  let states = 0;
  const WATCH = ['results', 'legend', 'detail', 'picker', 'layerRow', 'stepBox', 'impact', 'placeTitle', 'statusChip', 'placeCaveat', 'siteStatus', 'measureNote', 'trustDetail', 'steps',
    'freshUsed', 'freshState', 'freshTimeline', 'freshLive', 'worldImpact', 'worldCard', 'worldLegend', 'worldList', 'worldNotes', 'worldTitle', 'stepNotes', 'tourCaption', 'headline'];
  function expectClean(what) {
    for (const id of WATCH) {
      const hit = html(id).match(/.{0,60}(undefined|NaN|\[object).{0,40}/);
      if (hit) throw new Error(what + ': #' + id + ' contains ' + hit[0]);
    }
    states++;
  }

  // ---- the explorer opens on San Joaquin Valley with the confirmed map and the conservative figure
  const mode = () => document.documentElement.getAttribute('data-mode'), G = window.Groundline;
  const home = () => mode() === 'site' && /San Joaquin/.test(el('placeKicker').textContent) && /170,900/.test(html('stepBox')) && /at least/.test(html('stepBox')) && el('shadeToggle').checked === true;
  must(!!G && document.documentElement.getAttribute('data-ready') === '1', 'the app did not finish starting');
  must(home(), 'the explorer must open on San Joaquin Valley: confirmed map, conservative floor');
  must(/farmland: filtered out/.test(html('legend')), 'the legend must mark filtered-out farmland while the filter is on');
  must(!/24 GPS station/.test(html('statusChip')) && /crop signal filtered out/.test(html('statusChip')), 'San Joaquin status label must say the crop signal is filtered out, and not imply farmland is validated');
  must(G.state() === 'p=sjv', 'default share state should be just the place, got ' + G.state());
  const key = k => docKeys.forEach(fn => fn({ key: k, target: { tagName: 'BODY' }, preventDefault() {}, stopPropagation() {} }));
  key('ArrowRight'); must(home(), 'arrow keys must do nothing outside the tour');

  // ---- the optional tour: six steps as an overlay, then back to the explorer as it was
  el('tourBtn').fire('click');
  const seen = [el('tourCaption').textContent], words = t => t.replace(/<[^>]+>/g, '').trim().split(/\s+/).length;
  must(/60%/.test(html('stepBox')) && /\$326 million/.test(html('stepBox')), 'the first tour step must state the problem');
  for (let i = 0; i < 12 && !/Finish/.test(el('tourNext').textContent); i++) {
    key('ArrowRight'); expectClean('tour step ' + (i + 2)); seen.push(el('tourCaption').textContent);
    if (mode() === 'site') must(words(el('placeTitle').innerHTML) <= 8, 'heading over 8 words: ' + el('placeTitle').innerHTML);
  }
  must(seen.length === 6, 'expected a 6-step tour, got ' + seen.length + ': ' + seen.join(' | '));
  seen.forEach(c => must(words(c) <= 17, 'tour caption over 17 words: ' + c));
  must(/can confirm/.test(seen[4]) && /See the ground sinking before something breaks/.test(seen[5]), 'tour order: what we can confirm, then the world map with the tagline');
  must(/within a centimetre or two of GPS/.test(seen[2]), 'town step caption must not overstate the agreement');
  must(!/wrong|fool/i.test(seen.join(' ')), 'tour captions must not say the satellite is wrong');
  must(mode() === 'world', 'the tour must end on the world view');
  must((html('worldLegend').match(/class="wl"/g) || []).length === 3, 'the world legend must have exactly three states');
  const mx = window.IMPACT.mexico_city.exposure.people.ge_5cm.people, total = Math.round((mx + T.people.ge_5cm_floor) / 1e5) / 10;
  const obs = window.OBSERVATORY.filter(e => e.status === 'validated' || e.status === 'measured').length;
  must(html('worldImpact').includes('>' + obs + '<') && /places mapped so far/.test(html('worldImpact')) && !/million/.test(html('worldImpact')), 'world headline must be the places mapped so far, counted from the data');
  must(html('worldNotes').includes(total.toFixed(1) + ' million') && /2 GPS-checked places/.test(html('worldNotes')), 'the people total (details) must count only GPS-checked places, San Joaquin at its floor');
  must(!/<b>\d+<\/b> not measured/.test(html('worldLegend')), 'the legend must not count the places not measured yet');
  must(/open-mx/.test(html('worldCard')) && /Mexico City/.test(html('worldNotes')), 'world step must offer Mexico City as the best-checked example');
  key('ArrowLeft'); must(/170,900/.test(html('impact')) && /at least/.test(html('impact')), 'San Joaquin must show the conservative floor');
  must(!/14\.1|sank 10 cm or more<|Worst stretches/.test(html('impact')), 'San Joaquin must not show the worst-stretch or 10 cm figures');
  key('ArrowLeft'); must(/32 of 32/.test(html('stepBox')) && el('shadeToggle').checked === true, 'farmland step: evidence and filter on');
  must(/quick map reads too deep/.test(html('placeTitle')), 'farmland step heading');
  key('ArrowLeft'); must(new RegExp('GPS station ' + T.town_check.station).test(html('placeTitle')) && el('shadeToggle').checked === false, 'town step: the town GPS station, filter off');
  must(!/inconclusive/i.test(html('statusChip') + html('stepBox') + html('detail') + html('placeTitle')), 'the OPERA "inconclusive" note belongs in Details and limits only');
  key('ArrowRight'); key('ArrowRight'); key('ArrowRight'); key('ArrowRight');
  must(home(), 'finishing the tour must return to the explorer as it was');
  el('tourBtn').fire('click'); key('ArrowRight'); key('Escape');
  must(home(), 'leaving the tour with Escape must return to the explorer');

  // ---- share links round-trip
  for (const h of ['p=sjv&d=' + data.sjv.dates[5] + '&f=0&st=' + T.town_check.station, 'p=sjv&cmp=30&gps=0&lines=0&b=plain', 'p=sjv&pt=36.9000,-120.0000', 'p=sjv&tab=crops', 'p=mexico_city&st=MMX1', 'p=world&q=jakarta', 'p=world']) {
    G.apply('#' + h); expectClean('share ' + h);
    must(G.state() === h, 'share link does not round-trip: ' + h + ' -> ' + G.state());
  }
  G.apply('#p=world&q=jakarta'); must(/Jakarta/.test(html('worldTitle')), 'a share link to a world place must open its card');
  must(/Not mapped yet/.test(html('worldCard')), 'a known place that is not mapped needs an honest card');
  G.apply('#nonsense=1&p=zzz'); must(home(), 'a broken link must fall back to the explorer default');

  // ---- export: farmland never carries a value
  G.apply('#p=sjv');
  const csv = G.exportText('csv').split('\n'), rows = csv.filter(l => l && l[0] !== '#').slice(1);
  must(csv[0].startsWith('# Groundline export') && csv.some(l => l === 'lat,lon,change_cm,status'), 'CSV header');
  must(rows.every(l => l.split(',').length === 4), 'CSV rows must have four columns');
  must(rows.filter(l => /,confirmed$/.test(l)).length === T.mask.cells['1'] && rows.filter(l => /,filtered_farmland$/.test(l)).length > 1000, 'CSV must list every confirmed cell and the filtered farmland');
  must(rows.every(l => /,confirmed$/.test(l) ? /,-?\d+(\.\d+)?,confirmed$/.test(l) : /,,[a-z_]+$/.test(l)), 'only confirmed cells may carry a value in the export');
  const gj = JSON.parse(G.exportText('geojson'));
  must(gj.type === 'FeatureCollection' && gj.features.length === T.mask.cells['1'] && gj.features.every(f => f.properties.status === 'confirmed' && f.geometry.coordinates.length === 2) && /Apache-2.0/.test(gj.licence), 'GeoJSON export');

  // ---- every place: its buttons, the look-up menu, the slider, map clicks, details
  for (const id of Object.keys(data)) {
    const s = data[id];
    handlers.length = 0;
    G.apply('#p=' + id);
    expectClean(id + ' initial');
    must(el('placeTitle').innerHTML.length > 10 && el('statusChip').textContent.length > 5, id + ': no headline or status label');
    const entry = (window.OBSERVATORY || []).find(e => e.id === id);
    if (entry && entry.status === 'measured') must(/crop areas may need filtering/.test(el('placeCaveat').textContent) && el('placeCaveat').hidden === false, id + ': unchecked place without the crop caveat');
    must(el('steps').children.length >= 1, id + ': no step buttons');
    el('steps').children.slice().forEach(b => { b.fire('click'); expectClean(id + ' step ' + b.getAttribute('data-step')); });
    el('more').open = true; el('more').fire('toggle'); expectClean(id + ' details');
    const pick = v => { el('picker').fire('change', { target: { value: v } }); expectClean(id + ' ' + v); };
    s.gps.forEach(g => pick('gps:' + g.id));
    s.alignments.forEach(a => pick('alignment:' + a.name));
    s.places.filter(p => p.series_cm).forEach(p => pick('place:' + p.name));
    el('dateSlider').fire('input', { target: { value: 3 } }); expectClean(id + ' slider');
    el('playBtn').fire('click'); el('playBtn').fire('click');
    pick('');
    const click = { latlng: { lat: s.view.center[0], lng: s.view.center[1] } };
    handlers.concat(mapHandlers).forEach(hd => { hd.fn(click); expectClean(id + ' map ' + hd.type); });   // markers, lines, map
    if (withMap && s.grid && !/This spot moved/.test(el('placeTitle').innerHTML)) throw new Error(id + ': a map click did not produce a point reading');
    console.log((withMap ? '[map] ' : '[no map] ') + id + ': ' + s.gps.length + ' stations, ' + s.alignments.length + ' alignments, ' + el('steps').children.length + ' steps, ' + handlers.length + ' map shapes clicked');
  }
  return states;
}

const total = run(false) + run(true);
console.log('smoke test passed: ' + total + ' panel states rendered without undefined/NaN; explorer default, tour, share links, export, conservative numbers and the three world states hold');
