# Groundline

**Groundline turns NASA's newest radar into a sinking-ground map anyone can open, that only counts what it can confirm.**

Built for NASA Space Apps 2026, challenge *Dancing with the SARs*, from free NASA-ISRO NISAR L-band radar data.

The story in five lines:

1. **The problem.** In California's Central Valley, pumping groundwater makes the ground sink. One canal lost more
   than 60% of its capacity along one stretch, repairing ten miles cost about $326 million, and the State's own
   sinking map comes out months late.
2. **What we built.** A map of the San Joaquin Valley over the past year, from NISAR radar, that anyone can open and play.
3. **Is it right?** In the towns, yes: at GPS station P307 in Madera, GPS reads −5.8 cm and the map around it −5.9 cm,
   and over towns and open land inside the sinking areas our map (−4.1 cm) matches California's State map (−4.15 cm).
4. **We found crops fool the radar, and filtered them out.** Fields read about 4.1 cm lower than the town they
   surround, in 32 of 32 towns: a crop signal, not confirmed sinking. So farmland is marked on the map and left out of
   every count. What we can confirm: at least 170,900 people live on ground that sank 5 cm or more.
5. **It runs anywhere.** The world map shows 2 places checked against GPS (Mexico City is the best-checked: within a
   centimetre of GPS all year), 19 measured but not yet checked, and the rest still waiting.

<!-- TODO(team): team name, members, links to the Space Apps project page and the live demo. -->

The main demo is the San Joaquin Valley. Mexico City is the supporting, best-checked example. Both run on one engine:

| Case | Role | What the map shows | Built by |
|---|---|---|---|
| San Joaquin Valley, California | the decision case | vertical-equivalent change, 24 Nov 2025 to 14 Oct 2026, tied to GPS, with profiles along the Friant-Kern Canal, California Aqueduct, Delta-Mendota Canal, State Routes 99, 43 and 198, Interstate 5 and the high-speed rail alignment | the team's research export, converted by `pipeline/import_research_export.py` |
| Mexico City | the showcase | line-of-sight change, 30 Oct 2025 to 13 Oct 2026, with GPS station MMX1 | `pipeline/refresh.py mexico_city`, end to end |

Open `site/index.html` in a browser. It opens on the San Joaquin Valley with a guided tour: press **Next**, or use the
right and left arrow keys (Page Down / Page Up from a presenter clicker also work), to run the whole pitch in six steps.
`site/classic.html` is the earlier, more detailed version of the page, kept as a fallback (its code is in `site/classic/`).
 No server and no build step are needed; the same folder works on
GitHub Pages. The page needs the internet only for the base map, the fonts and the optional live
catalogue check.

## Presentation build (offline)

`present/index.html` is the talk itself: one keyboard-driven page for the projector, with no network needed (libraries in
`present/vendor/`, base imagery in `present/base/`). Open it from disk in Chrome or Edge.

- Right Arrow, Space or Page Down: next. Left Arrow or Page Up: back. Home: start again.
- `3` / `4`: the 3-minute (7 scenes) or 4-minute (10 scenes) version; `index.html?len=4` opens the longer one directly.
- `F` fullscreen, `T` timer on or off (amber in the last 30 seconds), `?` help, `D` opens `present/explore.html`
  (the full page with "Details and limits") for questions. Clicking the map reads the value of that spot.

Base imagery in the presentation: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (<https://s2maps.eu>), CC BY 4.0,
contains modified Copernicus Sentinel data 2016; downloaded once by `pipeline/fetch_base_imagery.js`. Press clippings in
`present/press/`: KVPR (3 Aug 2017) and SJV Water (16 Jul 2026), shown with their source and date.

## How it works, in six steps

1. **Find.** Ask the ASF search API for every NISAR L2 GUNW interferogram of one track and frame over the place.
2. **Read.** Download each pair's public preview PNG and turn its colours back into phase. The previews use
   matplotlib's `twilight` colour map and match its 510 colours exactly, so this is a table lookup.
3. **Stack.** Drop pairs that are only noise, take the longest chain of consecutive pairs, and for each pair:
   smooth, unwrap, remove a smooth ramp with a robust fit, and add the result to the running total.
   One colour cycle is 11.9 cm of motion along the radar's line of sight.
4. **Locate.** Tie the non-transparent part of each picture to that pair's footprint polygon and fit one
   pixel-to-degrees mapping for the whole track. Resample onto a Web Mercator grid for the map.
5. **Check.** Compare with daily GPS heights from the Nevada Geodetic Laboratory, projected to the line of sight.
6. **Publish.** Write one PNG per date and one data script, `site/data/<id>.js`. A scheduled job repeats this.

Four rules are built in because we broke each of them once:

- **Map the picture's opaque footprint, not the whole canvas.** A 2.3 km offset halved our correlation with GPS.
- **Take preview URLs from the search listing, never from a template.** On 2026-11-12 new products moved from
  `/BROWSE/NISAR_L2_GUNW_PROVISIONAL_V1/` to `/BROWSE/L2_L_GUNW/`.
- **Prefer PROVISIONAL over BETA** when a pair exists twice, and skip urgent-response copies (`/NISAR-UR/`).
- **Refuse to publish a noisy stack.** Pairs with a coherence proxy below 0.5 are dropped; a chain shorter
  than three pairs or with a mean proxy below 0.6 is not written (San Joaquin track 114 has two noise-only
  pairs from the 2026-05-17 scene).

## Run the pipeline

Python 3.10 or newer with `numpy`, `scipy`, `pillow` and `scikit-image`. No login of any kind.

```
pip install -r pipeline/requirements.txt
python pipeline/refresh.py mexico_city          # rebuilds site/data/mexico_city.js and site/img/mexico_city/
node pipeline/check_site.js                     # every referenced file exists, numbers match their series
node pipeline/smoke_test.js                     # runs the page logic without a browser
```

Useful options: `--cache DIR` (where previews and GPS files are kept, default `pipeline/cache/`),
`--offline` (cached files only), `--listing FILE` (a saved ASF geojson instead of calling the API),
`--cafile PEM`, `--force` (rebuild even when no new pair exists). Exit codes: `0` written or nothing new,
`2` the quality gate refused, `3` the georeferencing could not be trusted. In the last two cases nothing
is overwritten.

Case studies are defined in `pipeline/sites.json`. To add a city: copy the `mexico_city` entry, set the
search point, the track and frame, a bounding box, a stable reference area and any GPS stations.

`python pipeline/refresh.py sjv` also runs, but writes to `pipeline/out/sjv/` instead of the site, because
it rebuilds only the plain ascending-track map (see Limitations). To regenerate the San Joaquin site data
from the research export:

```
python pipeline/import_research_export.py path/to/canal_app.json path/to/rasters
```

`.github/workflows/refresh.yml` runs the Mexico City refresh daily and commits new data.
**It is untested**: it was written during the hackathon and has never run on GitHub. Since pipeline v2
replaced the Mexico City layer, that workflow would put the preview-based map back as soon as a new pair
is published; switch it to `pipeline/v2/run.py mexico_city --publish` (needs an Earthdata secret) or disable it.

## Pipeline v2: full GUNW science products

`pipeline/v2/` processes the NISAR L2 GUNW HDF5 products instead of their preview pictures. It needs a free
NASA Earthdata login in `~/.netrc` (`%USERPROFILE%\_netrc` on Windows), entry `machine urs.earthdata.nasa.gov`.
Nothing is downloaded whole: only the 512 x 512 chunks over the site are read with HTTPS byte ranges
(about 35-40 MB per pair for a city, against 2.3 GB per product), and cached as small `.npz` subsets in
`pipeline/cache/v2/<id>/`. Calibration sites (Mexico City, San Joaquin Valley, Celaya) lie inside NASA OPERA
DISP-S1 coverage and prove the method; the point of the observatory is the places outside OPERA and EGMS.

```
python -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install -r pipeline/v2/requirements.txt      # bin/python on Linux/macOS
pipeline/.venv/Scripts/python -I pipeline/v2/run.py tehran            # -> pipeline/out_v2/tehran/ (+ report.json)
pipeline/.venv/Scripts/python -I pipeline/v2/run.py tehran --publish  # also replaces site/data/tehran.js if the gate passes
pipeline/.venv/Scripts/python -I pipeline/build_observatory.py        # statuses from the gate + GPS
pipeline/.venv/Scripts/python -I pipeline/v2/compare_gps.py mexico_city sjv --extra-sjv   # v1 vs v2 against GPS
```

Site ids come from `pipeline/sites.json` and from the gap-region catalogue `pipeline/hotspots_candidates.json`
(same entry format; catalogue entries are never published to the site). `--publish` copies the old files to
`pipeline/out_v2/_backup/<id>/` first and keeps the published grid size, so other layers stay aligned.
Exit codes: `0` gate passed, `2` gate refused (nothing published), `3` no data.

**Method, per 12-day pair**: read `unwrappedPhase`, `coherenceMagnitude`, `connectedComponents`,
`ionospherePhaseScreen` and the product `mask` (water, sub-swath validity, data anomalies) over the site and
average 3 x 3 cells (240 m; 400 m for valley-sized boxes); subtract the split-spectrum ionosphere screen;
keep cells with coherence >= 0.3 in the main connected component; elsewhere recover the phase by re-wrapping
the complex-averaged phase about a smooth field from the reliable cells (only where the 80 m cells agree,
|phasor| >= 0.5); convert to centimetres; fit a robust plane plus a phase-elevation term (Copernicus GLO-90)
on cells that do not move (found in a first pass); subtract the median of the stable reference area; sum the
chain of consecutive pairs. A cell missing from one pair gets its own mean velocity times that pair's span.
Sign: `d_los = -(23.84 cm / 4 pi) x phase`, positive toward the satellite (checked against GPS MMX1).
Tested and left out: the weather-model troposphere screens in the product metadata (they made the series
noisier, either sign) and a quadratic surface (it absorbed the San Joaquin bowl).

**Uncertainty** (1 sigma, per cell and date): `sqrt(2 x epoch noise^2 + accumulated decorrelation noise +
gap filling)`. The epoch noise is the scatter of each cell's series about a smooth (18-day local-linear)
trajectory; the decorrelation noise follows from coherence. Published as `uncertainty{}`, a `sigma.png` layer
and `radar_sigma_cm` per GPS station.

**Quality gate** (frozen on 2026-11-14 after calibrating on Mexico City and San Joaquin, before any other site
was run; every number is in `report.json` and in `quality_gate{}` of the data file):

| check | threshold | why |
|---|---|---|
| pairs in the chain | >= 3 | fewer cannot separate motion from noise |
| a pair's usable land fraction | >= 0.20, else the pair is dropped | a pair that is mostly masked adds gaps, not data |
| mean usable (coherent, main component) land fraction | >= 0.40 | calibration sites: 0.93-0.94 |
| land cells surviving the whole chain | >= 0.30 | a map that is mostly holes cannot show a bowl |
| epoch noise about a smooth trajectory (median) | <= 1.0 cm | the closure test: NISAR rarely publishes the 24-day pair that would close a 12+12-day triplet, so the series' own jumps stand in for misclosure; calibration 0.45 and 0.99 cm; above 1 cm a four-month record cannot resolve a few cm/yr |
| reference area coherent | in >= 80 % of pairs | an incoherent reference shifts every date |
| motion above noise | most significant sinking >= 3 sigma | otherwise there is nothing to report |

Against GPS (same method as v1: radar LOS vs GPS up x 0.77, zeroed at the first date), v2 beats the preview
pipeline at the calibration sites: Mexico City MMX1 RMS 0.70 cm against 0.80 (r 0.997 and 0.998);
San Joaquin, one track, not tied to GPS, like for like: QCAP r 0.73 against 0.34, HANF 0.69 against 0.42,
P056 0.47 against -0.06, TLBN 0.88 against 0.88; over 24 valley-floor stations median RMS 1.84 cm against
2.33. Details: `pipeline/out_v2/gps_comparison.json`.

### Gap-region batch (2026-11-14)

The 20 first-batch sites of `pipeline/hotspots_candidates.json`, its 6 alternates, and Delhi again were run
with the frozen gate. Each now has a `sites.json` entry with a `reference.reason`, saying why that area was
chosen, and a hand-written `location_check` that compares the bowl with the cited literature (`location_match`:
yes / partial / plausible / no). Both are copied into `observatory.js`. Rules used to pick a reference:
keep the catalogue's proposal if it is coherent in at least 95 % of pairs and moves by 1 cm or less relative
to the scene's non-moving cells. Otherwise take the nearest bedrock-like cell that passes the same tests (at
least 25 m local relief and 50 m above the plain, from GLO-90). On flat plains with no bedrock
(Hengshui, Lahore, Mehsana), take a quiet, low-noise cell at least 5 km from any sinking area and at least
15 km from the documented centre.

Results: 25 sites passed the gate and are published as `measured`. Manila passed the gate but was refused by
GPS. Sana'a was refused by the gate (epoch noise 1.03 cm). Bangkok passed the gate but is not published: its
only GPS station sits inside the reference area, so it cannot test the map. **Passing the gate does not mean
the bowl is where the literature puts it.** For 12 of the 25 the deepest value is an isolated cell, a frame
edge, a first-pair jump or a water margin, and the documented area reads near zero. The `location_check` of
every site says which case it is. The `signal_snr` check takes the most significant cell out of
thousands, so a 4-sigma maximum can occur by chance.

Those 12, plus Bangkok, are published with the status `unconfirmed` (set by an `unconfirmed_reason` in
`sites.json`; `build_observatory.py` applies it). The page shows them as a separate marker with the reason
and the published figure only: no number of ours, no data file on the site, and they are left out of every
total. Their raw pipeline values stay in `observatory.js` under `diagnostics` for review. That leaves 13
gap-region sites with a published map (17 measured places in total outside existing free services).

`publish_compact` (in `sites.json`) keeps these sites small: about one published date every 24 days (every
36 days for records longer than 200 days; first and last dates are always kept), and fallback pictures at
the resolution of the value grid that the page draws. The gate, the uncertainty and the GPS statistics in
`report.json` use every date. GPS series in the data file are thinned the same way, so their r and RMS are
recomputed on the published dates, and the full-chain values are kept in `stats_full_chain`. The site budget in
`check_site.js` was raised from 15 to 30 MB (GitHub Pages has no hard 15 MB limit).

Records shorter than 300 days are never annualised: `observatory.js` gives `peak_change_cm` over
`span_days`, and `peak_rate_cm_yr` is null for them.

## Layout

```
site/        index.html, style.css, app.js, view3d.js, data/*.js (window.SITE_DATA[...]), img/<case>/*.png
             data/sjv_trust.js (cropland mask and conservative numbers), classic.html + classic/ (fallback page)
pipeline/    refresh.py, sites.json, nisar/ (search, previews, stack, georef, gps, export),
             v2/ (run, fetch, remote, gunw, dem, process, compare_gps), build_observatory.py,
             import_research_export.py, build_trust.js (writes site/data/sjv_trust.js), check_site.js, smoke_test.js
```

Data ships as scripts rather than JSON because browsers block `fetch()` of local files and the page
must work when opened from disk.

## Data sources

- NISAR L2 GUNW preview images, NASA/JPL and ISRO, distributed by the Alaska Satellite Facility DAAC:
  <https://search.asf.alaska.edu/> and the search API <https://api.daac.asf.alaska.edu/services/search/param>
- GPS daily positions, Nevada Geodetic Laboratory: <https://geodesy.unr.edu/>
- Base map and infrastructure lines: OpenStreetMap contributors, <https://www.openstreetmap.org/copyright>
- State comparison data: California DWR, TRE ALTAMIRA InSAR subsidence,
  <https://catalog.data.gov/dataset/tre-altamira-insar-subsidence-data>
- Cropland: USDA NASS Cropland Data Layer 2025, <https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php>
- NASA OPERA DISP-S1 (Sentinel-1) displacement product, used as a comparison for Mexico City, Celaya and San Joaquin:
  <https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/>
- Population: GHS-POP R2023A, European Commission Joint Research Centre (CC BY 4.0)
- Context for the San Joaquin case:
  - <https://sjvwater.org/slew-of-lawsuits-between-friant-water-authority-and-its-own-members-settled-in-one-fell-swoop/>
  - <https://www.usbr.gov/mp/sccao/fkc-fr.html>
  - <https://sjvwater.org/state-poised-to-nix-pumping/>
  - <https://www.waterboards.ca.gov/sgma/docs/tule/202409-tule-pbh-final-staff-report.pdf> (p. 105)

This project is not affiliated with or endorsed by any of these organisations.

## Limitations

- **It reads too deep over cropland (found 14 Nov 2026).** In the San Joaquin Valley we compared the map with
  California's official State map (DWR / TRE ALTAMIRA, Sentinel-1) and with GPS. Over towns and open land the maps agree
  (inside the State map's sinking areas, 1 Dec 2025 to 1 Jul 2026: ours −4.1 cm, State −4.15 cm). Over orchards and crops
  ours reads several centimetres too deep (same areas: −8.6 cm against −4.6 cm). Fields read about 4.1 cm lower than the
  town they surround, in 32 of 32 towns, and the extra signal grows from mid-February to July, following the crop
  calendar. The same step appears when the pairs are re-read from the full science products, so it is not an artefact
  of the preview images. It is a crop-related radar effect, not confirmed sinking; **the exact mechanism is not
  identified** (canopy water, soil moisture and real topsoil movement were not separated). Consequences on the page:
  - cropland (20% or more of a cell is crops or fallow in the USDA Cropland Data Layer 2025) is shaded as
    "reads too deep, not counted"; edges of the data and hills outside the State map are shaded as "not checked";
  - the San Joaquin people count is a floor that uses towns and open land only: at least 170,900 people on ground that
    sank 5 cm or more (mainly Madera, Hanford and Tulare); it was 400,900 before the check;
  - no "worst stretch" of canal, road or rail and no 10 cm figure is reported for San Joaquin, because those lines run
    mostly through fields;
  - every place that is measured but not yet checked against GPS carries the caveat that the same effect may apply there,
    and no unchecked place enters the headline total on the world view.
  The town check is honest rather than flattering: at P307 (Madera) the radar curve with the station held out ends at
  −5.2 cm against GPS −5.8 cm, with a typical gap of 1.3 cm during the year; at the independent station CAHA (Hanford)
  our trusted cells read −5.7 cm against GPS −7.7 cm. Station HANF stands among fields and is not used for this check.
- **Line of sight, not true vertical.** The radar measures along its slanted view. Vertical is roughly
  line of sight divided by 0.77, with an *assumed* viewing angle. The San Joaquin layer is already
  converted (assumed 33 to 47 degrees across the swath) and ignores horizontal motion; the Mexico City
  layer is line of sight.
- **Preview pictures, not science products (v1 only).** Pixels are about 180 to 250 m and no official
  correction is applied. Layers built by pipeline v2 (`source: "GUNW-HDF5"`: Mexico City, Celaya, Tehran,
  Mashhad, Rafsanjan, Konya, Delhi and the 24 gap-region sites listed in `site/data/manifest.js`) use the science products with the ionosphere correction, real coherence and a
  per-cell uncertainty; troposphere is handled only by the empirical phase-elevation fit.
- **It over-reads at slowly moving GPS stations.**
- **Against the State product.** Over all cells the NISAR amplitude is about 1.6 times California's published product;
  the cropland effect above explains most of that gap.
- **It fails where motion is slow or the air is humid.** Houston: not detected. Jakarta: not detected.
- **Short record.** Data for many regions begins in mid-June 2026.
- **The San Joaquin layer is not rebuilt by `refresh.py` yet.** It comes from the team's exploratory
  scripts, which add three things the clean pipeline lacks: a GPS tie validated with held-out stations,
  the average of an ascending and a descending track, and sampling along infrastructure. Porting those
  is the first item of future work. Until then that layer does not update automatically. The GPS tie
  matters: `refresh.py sjv` without it (one track, no tie, 14 Nov 2026 run) correlated with GPS at only
  r = 0.88, 0.57, 0.50 and -0.05 at stations TLBN, QCAP, HANF and P056.
- **Mexico City numbers come from the clean pipeline** and differ somewhat from the team's earlier
  exploratory figures, which used a different stacking method and pixel-to-ground mapping. The two
  have not been reconciled.
- **The page has no in-browser processing.** If previews are ever fetched from a browser, they need a
  CORS request that carries an `Origin` header; they are served as `binary/octet-stream`.
- Not for engineering design or enforcement. Use it to decide where to look, then confirm with surveyed
  data and official products.

## AI use

The code in this repository and the analysis behind it were produced with an AI coding assistant
(Claude, by Anthropic) working under the team's direction. The team chose the questions, the case
studies and the checks, and is responsible for the claims made here.

<!-- TODO(team): complete this section before submitting. State which parts each person reviewed or
     wrote by hand, which results the team verified independently and how, and list any other AI tools
     used (for text, images, video or slides), as the Space Apps rules require. -->

## License

Apache License 2.0, see `LICENSE`.
<!-- TODO(team): add the copyright line (year and owner) you want to appear in notices. -->
