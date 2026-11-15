// Writes site/data/sjv_trust.js (window.SJV_TRUST) from the San Joaquin cropland analysis:   node pipeline/build_trust.js
// Inputs (read-only, produced by the analysis scripts in ../extra):
//   extra/conservative/out/recommended_numbers.json, results.json, sjv_trust_mask.json
//   extra/diagnose/out/summary.json        (fields read lower than the town they surround, 32 of 32 towns)
// The page uses it to shade cropland on the San Joaquin map and to show the conservative people count.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..'), out = path.join(__dirname, '..', 'site', 'data', 'sjv_trust.js');
const J = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const rec = J('extra/conservative/out/recommended_numbers.json'), res = J('extra/conservative/out/results.json');
const mask = J('extra/conservative/out/sjv_trust_mask.json'), diag = J('extra/diagnose/out/summary.json');

const p5 = rec.numbers.find(n => /^People on ground that sank 5 cm or more, 24 Nov/.test(n.name));
if (!p5 || p5.variant !== 'B_own_valley') throw new Error('recommended 5 cm people count not found');
const H = diag.headline, T7 = diag.tests.T7_independent_remeasurement_real_gunw, bowls = diag.tests.extra.monthly_in_state_bowls_below_minus3cm || diag.tests.extra['monthly_in_state_bowls_below_-3cm'];
const cover = diag.tests.T2_land_cover.excess_by_dominant_cover_60pct;
const ap = mask.area_km2_and_people, mapped = Object.values(ap).reduce((a, x) => a + x.people, 0);
if (Buffer.from(mask.data_b64, 'base64').length !== mask.width * mask.height) throw new Error('mask shape');

const data = {
  schema: 1,
  generated_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  sources: ['extra/conservative/out/recommended_numbers.json', 'extra/conservative/out/results.json', 'extra/conservative/out/sjv_trust_mask.json', 'extra/diagnose/out/summary.json'],
  // class of every cell of the data/sjv.js grid: 0 no data, 1 trusted (towns and open land), 2 cropland, 3 edge artefact, 4 hills outside the State map
  mask: { width: mask.width, height: mask.height, bounds: mask.bounds, data_b64: mask.data_b64, cells: mask.cells, rule: 'cropland = 20 % or more of the cell is crops or fallow in USDA Cropland Data Layer 2025',
    area_km2: { trusted: ap['1'].area_km2, cropland: ap['2'].area_km2, edge: ap['3'].area_km2, hills: ap['4'].area_km2 },
    people: { trusted: ap['1'].people, cropland: ap['2'].people, edge: ap['3'].people, hills: ap['4'].people },
    share_people_not_counted: +(1 - ap['1'].people / mapped).toFixed(2) },
  people: { ge_5cm_floor: p5.value, window: rec.windows.full, range_if_threshold_moved_by_1cm: p5.range_if_threshold_moved_by_1cm, mostly: p5.mostly, uncorrected_was: p5.app_currently_shows,
    towns: res.towns_behind_trusted_people_count.towns.slice(0, 6).map(t => ({ town: t.town, people_ge_5cm: t.people_ge_5cm_full })) },
  // inside the sinking areas of the State map (State below -3 cm), 1 Dec 2025 to 1 Jul 2026, monthly means in cm
  agree: { window: '1 Dec 2025 to 1 Jul 2026', dates: bowls.dates, non_crop_cells: bowls.non_crop_cells, crop_cells: bowls.crop_cells,
    ours_non_crop_cm: bowls.ours_non_crop_cm, state_non_crop_cm: bowls.state_non_crop_cm, ours_crop_cm: bowls.ours_crop_cm, state_crop_cm: bowls.state_crop_cm,
    state_name: 'California DWR InSAR (Sentinel-1, TRE ALTAMIRA)' },
  // fields minus the town they surround, average of the towns, on our map, by radar date
  towns: { n: H.towns_tested, n_fields_lower: Math.round(H.towns_where_fields_read_lower_ours * H.towns_tested), fields_minus_town_cm: H.fields_minus_town_ours_cm, se_cm: H.fields_minus_town_ours_se_cm,
    state_fields_minus_town_cm: H.fields_minus_town_state_cm, window: '1 Dec 2025 to 1 Jul 2026',
    by_date: T7.town_vs_fields_by_frame_export_cm, full_period_cm: diag.tests.extra.town_vs_fields_full_period_cm.export },
  excess_vs_state_cm: { orchards_vines: cover.orchards_vines.excess_mean_cm, field_crops: cover.field_crops.excess_mean_cm, towns: cover.developed.excess_mean_cm, grass_rangeland: cover.grass_shrub.excess_mean_cm },
  // a town GPS station on trusted (non-crop) cells where both GPS and the map show clear sinking, plus the two independent town stations
  town_check: (function () {
    const st = id => res.gps_check.stations.find(x => x.id === id);
    const row = (id, town) => { const x = st(id); return { id, town, kind: x.kind, crop_share: x.crop_frac, gps_full_cm: x.gps_full, ours_trusted_full_cm: x.B_own_valley_full, gps_dec_jul_cm: x.gps_dj, ours_trusted_dec_jul_cm: x.B_own_valley_dj, state_dec_jul_cm: x.S_state_dj }; };
    return { station: 'P307', town: 'Madera', how: res.gps_check.how, main: row('P307', 'Madera'), others: [row('CAMD', 'Madera'), row('CAHA', 'Hanford')],
      not_used: { id: 'HANF', town: 'Hanford', why: 'stands among fields (61 % cropland around it), so it cannot check the trusted cells', crop_share: st('HANF').crop_frac } };
  })(),
  gps: { stations: H.ours_minus_gps_vs_crop_fraction.n, r_gap_vs_crop_share: H.ours_minus_gps_vs_crop_fraction.r },
  cause: 'A crop-related radar effect, not confirmed sinking. The exact mechanism is not identified.'
};
fs.writeFileSync(out, '// Written by pipeline/build_trust.js from the San Joaquin cropland analysis (extra/conservative, extra/diagnose). Do not edit by hand.\n' +
  'window.SJV_TRUST = ' + JSON.stringify(data) + ';\n');
console.log('wrote ' + out + ': floor ' + data.people.ge_5cm_floor + ' people, ' + data.towns.n_fields_lower + ' of ' + data.towns.n + ' towns, fields minus town ' + data.towns.fields_minus_town_cm +
  ' cm, non-crop ours/state ' + data.agree.ours_non_crop_cm.slice(-1)[0] + '/' + data.agree.state_non_crop_cm.slice(-1)[0] + ', not counted share ' + data.mask.share_people_not_counted);
