// Runs site/app.js against a tiny fake page (no browser) and exercises every panel and the guided tour:
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
      id, style: {}, children: [], value: '', hidden: false, open: false, checked: false, disabled: false, selectedIndex: 0, clientWidth: 380, scrollTop: 0, _html: '', textContent: '',
      classList: { toggle() {}, add() {}, remove() {} },
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
  const mapHandlers = handlers.slice(0, handlers.findIndex(hd => hd.type === 'blur') + 1);
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

  // ---- the landing view and the guided tour, driven by the arrow keys
  must(document.documentElement.getAttribute('data-mode') === 'site' && /San Joaquin/.test(el('placeKicker').textContent), 'the landing place must be San Joaquin Valley');
  must(/60%/.test(html('stepBox')) && /\$326 million/.test(html('stepBox')), 'the landing view must state the problem');
  must(/only counts what it can confirm/.test(el('headline').textContent), 'page headline');
  const key = k => docKeys.forEach(fn => fn({ key: k, target: { tagName: 'BODY' }, preventDefault() {}, stopPropagation() {} }));
  const seen = [el('tourCaption').textContent];
  for (let i = 0; i < 12 && !/Start again/.test(el('tourNext').innerHTML); i++) { key('ArrowRight'); expectClean('tour step ' + (i + 2)); seen.push(el('tourCaption').textContent); }
  must(seen.length === 6, 'expected a 6-step tour, got ' + seen.length + ': ' + seen.join(' | '));
  seen.forEach(c => must(c.split(/\s+/).length <= 17, 'tour caption over 17 words: ' + c));
  must(/can confirm/.test(seen[4]) && /only counts what it can confirm/.test(seen[5]), 'tour order: what we can confirm, then the world map with the closing sentence');
  must(/within a centimetre or two of GPS/.test(seen[2]), 'town step caption must not overstate the agreement');
  must(document.documentElement.getAttribute('data-mode') === 'world', 'the tour must end on the world view');
  must(/It runs anywhere/.test(html('worldTitle')), 'the tour must close on the world step');
  must((html('worldLegend').match(/class="wl"/g) || []).length === 3, 'the world legend must have exactly three states');
  const mx = window.IMPACT.mexico_city.exposure.people.ge_5cm.people, total = Math.round((mx + T.people.ge_5cm_floor) / 1e5) / 10;
  const obs = window.OBSERVATORY.filter(e => e.status === 'validated' || e.status === 'measured').length;
  must(html('worldImpact').includes('>' + obs + '<') && /places mapped so far/.test(html('worldImpact')) && !/million/.test(html('worldImpact')), 'world headline must be the places mapped so far, counted from the data');
  must(html('worldNotes').includes(total.toFixed(1) + ' million') && /2 GPS-checked places/.test(html('worldNotes')), 'the people total (details) must count only GPS-checked places, San Joaquin at its floor');
  must(!/<b>\d+<\/b> not measured/.test(html('worldLegend')), 'the legend must not count the places not measured yet');
  must(/open-mx/.test(html('worldCard')) && /Mexico City/.test(html('worldNotes')), 'world step must offer Mexico City as the best-checked example');
  key('ArrowLeft'); must(/170,900/.test(html('impact')) && /at least/.test(html('impact')), 'San Joaquin must show the conservative floor');
  must(!/14\.1|sank 10 cm or more<|Worst stretches/.test(html('impact')), 'San Joaquin must not show the worst-stretch or 10 cm figures');
  key('ArrowLeft'); must(/32 of 32/.test(html('stepBox')) && el('shadeToggle').checked === true, 'fields step: evidence and shading on');
  must(/farmland: filtered out/.test(html('legend')), 'the legend must mark filtered-out farmland while the filter is on');
  key('ArrowLeft'); must(new RegExp('GPS station ' + T.town_check.station).test(html('placeTitle')) && el('shadeToggle').checked === false, 'town step: the town GPS station, shading off');
  must(!/24 GPS station/.test(html('statusChip')) && /crop signal filtered out/.test(html('statusChip')), 'San Joaquin status label must say the crop signal is filtered out, and not imply farmland is validated');
  must(!/inconclusive/i.test(html('statusChip') + html('stepBox') + html('detail') + html('placeTitle')), 'the OPERA "inconclusive" note belongs in Details and limits only');

  // ---- the text rule: every tour step shows one heading of at most 8 words and no paragraph that repeats the caption
  key('ArrowLeft'); key('ArrowLeft');
  for (let i = 0; i < 5; i++) {
    const head = el('placeTitle').innerHTML.replace(/<[^>]+>/g, '').trim(), box = ['stepBox', 'detail', 'impact'].find(id => !el(id).hidden);
    must(head.split(/\s+/).length <= 8, 'heading over 8 words: ' + head);
    must(!/class="(plain|lead|note|small muted)"/.test(el(box).innerHTML), 'step ' + (i + 1) + ': paragraph text at top level of #' + box);
    key('ArrowRight');
  }

  // ---- every place: its buttons, the look-up menu, the slider, map clicks, details
  for (const id of Object.keys(data)) {
    const s = data[id];
    handlers.length = 0;
    el('placeSelect').fire('change', { target: { value: id } });
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
console.log('smoke test passed: ' + total + ' panel states rendered without undefined/NaN; tour order, conservative numbers and the three world states hold');
