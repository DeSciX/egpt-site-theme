// The tile grid and the through-line: ./tiles under ./page, the theme preconditions (./gates assertTheme), the roster's
// link writer under the app-id rule, the stills home and the final sweep (./gates assertPage).
//
// Each case runs the REAL CLI against the REAL roster — the theme's pinned @descix/frqtl-web (its ./registry export),
// installed into the case's app repository as the real package or a fixture package re-exporting it — and the vendored
// stills home. The pinned package not installed (no npm ci) is a FAILURE, never a skip.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { world, spec, X, key, tiles, throughLines, THROUGH_DECL } from './lib/world.mjs';
import { loadPartials } from '../src/partials.mjs';
import { tokensCss, gridColumns } from '../src/tokens.mjs';
import { assertTheme, assertPage } from '../src/gates.mjs';
import { IMPORT_MAP_BEGIN, IMPORT_MAP_END } from '../src/page.mjs';

const SHOW = () => X.SHOWCASE_SITE.app;
const SHOW_ORIGIN = () => X.SHOWCASE_SITE.origin;
const THROUGH_TEXT = X.SHOWCASE_THROUGH_LINE.join('');
const COLUMNS = gridColumns(tokensCss());
// The §3 tile rule off the world's own roster: showcaseHref(row) on the showcase app's page, else showcaseUrl(row).
async function wantHrefs(w, app) {
  const R = await w.roster();
  return R.EXHIBITS.map(r => (app === R.SHOWCASE_SITE.app ? R.showcaseHref(r) : R.showcaseUrl(r)));
}
const assertTileHrefs = (html, want) => assert.deepEqual(tiles(html).map(t => t.href), want, 'tile hrefs are the roster writer\'s');

test('another site\'s page: one tile per roster row, in order, absolute links from showcaseUrl, stills iff declared', async () => {
  const w = world({ undeclare: X.EXHIBITS.find(x => x.still).id });
  const r = w.build('other');
  assert.equal(r.code, 0, r.err);
  const got = tiles(r.html);
  assert.equal(got.length, w.rows.length);
  assertTileHrefs(r.html, await wantHrefs(w, 'other'));
  w.rows.forEach((row, i) => {
    assert.equal(got[i].title, row.title.replace(/&/g, '&amp;'));
    assert.equal(new URL(got[i].href).origin, SHOW_ORIGIN(), `tile ${i + 1} is absolute on SHOWCASE_SITE.origin`);
    assert.match(got[i].attrs, / target="_blank" rel="noopener"/);
    assert.equal(got[i].img, row.still ? `images/${key(row)}.png` : null);
    assert.equal(/class="tile dark"/.test(got[i].attrs), !row.still);
    if (row.still) assert.ok(fs.existsSync(path.join(r.out, 'images', `${key(row)}.png`)), `${key(row)}.png written`);
  });
  assert.ok(w.rows.some(x => x.still) && w.rows.some(x => !x.still), 'the roster exercises both tile forms');
});

test('the showcase app\'s own page (app === SHOWCASE_SITE.app): relative links from showcaseHref, no target', async () => {
  const w = world();
  const r = w.build(SHOW());
  assert.equal(r.code, 0, r.err);
  assertTileHrefs(r.html, await wantHrefs(w, SHOW()));
  for (const t of tiles(r.html)) { assert.doesNotMatch(t.href, /^[a-z]+:/i, 'relative'); assert.doesNotMatch(t.attrs, /target=/); }
});

// The negative control of the href assertion AND of the page gate: a page carrying the deleted GYM link shape.
test('a planted GYM href (preset=compare) fails the tile-href assertion and assertPage', async () => {
  const w = world();
  const r = w.build(SHOW());
  assert.equal(r.code, 0, r.err);
  const planted = r.html.replace(/preset=author/g, 'preset=compare');
  assert.notEqual(planted, r.html, 'the plant reached the page');
  const want = await wantHrefs(w, SHOW());
  assertTileHrefs(r.html, want);
  assert.throws(() => assertTileHrefs(planted, want), /tile hrefs are the roster writer's/);
  const ctx = { app: SHOW(), theme: r.html.match(/data-frontpage-theme="([^"]+)"/)[1], build: r.html.match(/data-frontpage-build="([^"]+)"/)[1],
    spec: { through_line: THROUGH_DECL.through_line, self_host: SHOW_ORIGIN() }, copy: { 'proof.tile.cta': 'Open live ↗' },
    roster: { X, version: r.html.match(/data-frontpage-roster="([^"]+)"/)[1] }, columns: COLUMNS };
  assert.doesNotThrow(() => assertPage(r.html, ctx));
  assert.throws(() => assertPage(planted, ctx), /tiles are not the roster's/);
});

test('self_host drift refuses naming both: the showcase spec off SHOWCASE_SITE.origin, another spec on it', () => {
  const w = world({ specs: { [SHOW()]: spec('https://drift.example', [{ use: 'proof' }], THROUGH_DECL), squat: spec(SHOW_ORIGIN(), [{ use: 'proof' }]) } });
  const a = w.build(SHOW());
  assert.equal(a.code, 1); assert.equal(a.html, null);
  assert.ok(a.err.includes(`self_host "https://drift.example" vs the roster's SHOWCASE_SITE ${JSON.stringify(X.SHOWCASE_SITE)}`), a.err);
  assert.match(a.err, new RegExp(`is the showcase app, so its spec's self_host must be ${SHOW_ORIGIN().replace(/[.]/g, '\\.')}`));
  const b = w.build('squat');
  assert.equal(b.code, 1); assert.equal(b.html, null);
  assert.ok(b.err.includes(`squat.json self_host ${JSON.stringify(SHOW_ORIGIN())} vs the roster's SHOWCASE_SITE`), b.err);
  assert.match(b.err, /squat is not .*, so its spec's self_host may not be/);
});

test('a stale pin without the link writer refuses, naming showcaseHref, showcaseUrl and SHOWCASE_SITE', () => {
  const r = world({ serve: '{ showcaseHref: undefined, showcaseUrl: undefined, SHOWCASE_SITE: undefined }' }).build('other');
  assert.equal(r.code, 1); assert.equal(r.html, null);
  assert.match(r.err, /exports no showcaseHref, showcaseUrl, SHOWCASE_SITE — the tile link writer; pin @descix\/frqtl-web exactly/);
});

test('{"hero": true} places the hero among the sections; two placements refuse', () => {
  const plain = '<section class="sec" id="plain"><div class="wrap"><p>plain</p></div></section>';
  const w = world({ files: { 'plain.html': plain }, specs: { placed: spec('https://p.example', [{ use: 'proof' }, { hero: true }, { file: 'plain.html' }]), twice: spec('https://p.example', [{ hero: true }, { use: 'proof' }, { hero: true }]) } });
  const r = w.build('placed');
  assert.equal(r.code, 0, r.err);
  const after = r.html.slice(r.html.indexOf('</nav>'));
  assert.ok(after.indexOf('id="proof"') < after.indexOf('<header class="hero"') && after.indexOf('<header class="hero"') < after.indexOf('id="plain"'));
  const d = w.build('other');
  assert.ok(d.html.slice(d.html.indexOf('</nav>')).indexOf('<header class="hero"') < d.html.indexOf('id="proof"'), 'no placement: the hero follows the nav');
  const t = w.build('twice');
  assert.equal(t.code, 1); assert.match(t.err, /exactly one \{"hero": true\}/);
});

// ---------------------------------------------------------------- the theme's own preconditions (planted partials)
const P = loadPartials();
const withProof = proof => ({ ...P, sections: { ...P.sections, proof } });
const GRID = '<div class="grid" data-exhibits></div>';
const THROUGH = '<p class="grid-note" data-showcase-throughline></p>';
test('theme precondition: the real partials pass; hand tiles or no data-exhibits slot refuse', () => {
  assert.doesNotThrow(() => assertTheme(P, tokensCss()));
  assert.ok(P.sections.proof.includes(GRID) && P.sections.proof.includes(THROUGH), 'the proof partial carries the slot and the marker the plants replace');
  assert.throws(() => assertTheme(withProof(P.sections.proof.replace(GRID, `${GRID}<a class="tile" href="x"><b>hand</b></a>`)), tokensCss()), /carry 1 hand-written <a class="tile"/);
  assert.throws(() => assertTheme(withProof(P.sections.proof.replace(GRID, '<div class="grid"></div>')), tokensCss()), /declare no data-exhibits slot/);
});

test('theme precondition: the through-line marker — none, two, hand text, or outside #proof refuse', () => {
  assert.throws(() => assertTheme(withProof(P.sections.proof.replace(THROUGH, '')), tokensCss()), /carry 0 data-showcase-throughline markers, need exactly one/);
  assert.throws(() => assertTheme(withProof(P.sections.proof.replace(THROUGH, THROUGH + THROUGH)), tokensCss()), /carry 2 data-showcase-throughline markers/);
  assert.throws(() => assertTheme(withProof(P.sections.proof.replace(THROUGH, '<p class="grid-note" data-showcase-throughline>typed by hand</p>')), tokensCss()), /marker holds hand text \("typed by hand/);
  assert.throws(() => assertTheme({ ...withProof(P.sections.proof.replace(THROUGH, '')), sections: { ...P.sections, proof: P.sections.proof.replace(THROUGH, ''), media: P.sections.media.replace('</section>', `${THROUGH}</section>`) } }, tokensCss()), /is not a closed element inside <section id="proof">/);
});

test('theme precondition: a head without </head> or without the tokens include refuses', () => {
  assert.throws(() => assertTheme({ ...P, head: P.head.replace('</head>', '') }, tokensCss()), /the head has no <\/head>/);
  assert.throws(() => assertTheme({ ...P, head: P.head.replace('{{theme:tokens.css}}', '') }, tokensCss()), /carries \{\{theme:tokens\.css\}\} 0 times/);
});

test('roster package absent refuses, naming npm ci; a page without the slot never needs it', () => {
  const w = world({ pkg: false, files: { 'plain.html': '<section class="sec" id="plain"><div class="wrap"><p>plain</p></div></section>' }, specs: { plainonly: spec('https://p.example', [{ file: 'plain.html' }]) } });
  const r = w.build('other');
  assert.equal(r.code, 1); assert.match(r.err, /roster unreadable: @descix\/frqtl-web\/registry is not installed — run npm ci/); assert.equal(r.html, null);
  const p = w.build('plainonly');
  assert.equal(p.code, 0, p.err);
  assert.doesNotMatch(p.html, /data-frontpage-roster=/, 'a page that used no roster names none in its stamp');
});

test('roster package installed but failing to load reports the load error as itself, never "not installed"', () => {
  const r = world({ pkg: 'broken' }).build('other');
  assert.equal(r.code, 1); assert.match(r.err, /roster unreadable: @descix\/frqtl-web\/registry failed to load: .*absent\.js/);
  assert.doesNotMatch(r.err, /not installed|npm ci/); assert.equal(r.html, null);
});

test('a roster row that is not a walk-through rung refuses (sceneKey refuses it before a tile is written)', () => {
  const row = X.EXHIBITS[0];
  const r = world({ serve: `{ EXHIBITS: X.EXHIBITS.map(r => (r.id === ${JSON.stringify(row.id)} ? { ...r, kind: 'experiment' } : r)) }` }).build('other');
  assert.equal(r.code, 1); assert.match(r.err, /unknown scene kind "experiment"/); assert.doesNotMatch(r.err, /experiment=/); assert.equal(r.html, null);
});

test('an uncommitted input refuses, naming it; an uncommitted file the page does not read does not', () => {
  const w = world();
  const edit = (name, title) => { const f = path.join(w.app, name); const s = JSON.parse(fs.readFileSync(f, 'utf8')); fs.writeFileSync(f, JSON.stringify({ ...s, title })); };
  fs.writeFileSync(path.join(w.app, 'untracked.json'), '{}');
  edit('bare.json', 'another app, uncommitted');
  const free = w.build(SHOW());
  assert.equal(free.code, 0, `an unrelated uncommitted spec blocked the build: ${free.err}`);
  edit(`${SHOW()}.json`, 'uncommitted');
  const r = w.build(SHOW());
  assert.equal(r.code, 1); assert.match(r.err, new RegExp(`${SHOW()}\\.json is uncommitted; .* — commit it, or build another app`));
  assert.doesNotMatch(r.err, /stash|bare\.json|untracked\.json/); assert.equal(r.html, null);
  const o = w.build('other');
  assert.equal(o.code, 0, `the showcase app's uncommitted spec blocked another page: ${o.err}`);
  w.commit();
  fs.writeFileSync(path.join(w.app, 'exhibits', 'stray.png'), 'png');
  const d = w.build(SHOW());
  assert.equal(d.code, 1); assert.match(d.err, /exhibits\/stray\.png is uncommitted/);
  fs.unlinkSync(path.join(w.app, 'exhibits', 'stray.png'));
  const ok = w.build(SHOW());
  assert.equal(ok.code, 0, ok.err); assert.match(ok.html, /<title>uncommitted<\/title>/);
});

test('final sweep: a data-exhibits slot the fill cannot reach refuses (a fragment\'s unfillable grid, a non-div slot)', () => {
  const w = world({ files: {
    'nbsp.html': '<section class="sec" id="x"><div class="wrap"><div class="grid" data-exhibits>&nbsp;</div></div></section>',
    'ul.html': '<section class="sec" id="x"><div class="wrap"><ul class="grid" data-exhibits></ul></div></section>',
  }, specs: { nbsp: spec('https://p.example', [{ file: 'nbsp.html' }]), ul: spec('https://p.example', [{ file: 'ul.html' }]) } });
  for (const app of ['nbsp', 'ul']) {
    const r = w.build(app);
    assert.equal(r.code, 1, app); assert.match(r.err, /a data-exhibits slot holds 0 tiles, the roster \(@descix\/frqtl-web@\d+\.\d+\.\d+\S*\) has \d+ rows/);
  }
});

test('stills: a declared still missing from the home refuses, naming the row', () => {
  const declared = X.EXHIBITS.find(x => x.still);
  const r = world({ stills: fs_ => fs_.filter(f => !f.startsWith(key(declared) + '.')) }).build('other');
  assert.equal(r.code, 1); assert.match(r.err, new RegExp(`roster row ${declared.id} declares a still .* does not exist`));
});

test('stills: a still no row declares refuses (no per-page image lists by the back door)', () => {
  const undeclared = X.EXHIBITS.find(x => x.still);
  const w = world({ undeclare: undeclared.id });
  const home = path.join(w.app, 'exhibits');
  fs.copyFileSync(path.join(home, fs.readdirSync(home).find(f => f.endsWith('.png'))), path.join(home, `${key(undeclared)}.png`));
  w.commit();
  const r = w.build('other');
  assert.equal(r.code, 1); assert.match(r.err, new RegExp(`${key(undeclared)}\\.png is a still no roster row declares`));
});

test('stills: a still without its provenance sidecar refuses', () => {
  const declared = X.EXHIBITS.find(x => x.still);
  const r = world({ stills: fs_ => fs_.filter(f => f !== `${key(declared)}.provenance.json`) }).build('other');
  assert.equal(r.code, 1); assert.match(r.err, /has no provenance sidecar/);
});

// ---------------------------------------------------------------- the tile's copy: its line, its still's alt, its CTA
test('tile copy: the caption line is the row\'s tile line, the img alt its still.alt, the CTA the proof.tile.cta slot', () => {
  const w = world({ files: { 'copy.json': JSON.stringify({ schema: 'egpt-site-theme/copy@1', slots: { 'proof.tile.cta': 'Run it ↗' } }) },
    specs: { cta: spec('https://p.example', [{ use: 'proof' }], { copy: 'copy.json' }) } });
  const r = w.build('other');
  assert.equal(r.code, 0, r.err);
  const got = tiles(r.html);
  X.EXHIBITS.forEach((row, i) => {
    assert.equal(got[i].line, row.tile, `tile ${i + 1} line`);
    if (row.still) assert.equal(got[i].alt, row.still.alt, `tile ${i + 1} alt`);
  });
  assert.ok(X.EXHIBITS.some(row => row.tile !== row.what), 'the roster distinguishes tile from what, so this case can tell the fields apart');
  assert.equal((r.html.match(/<i>Open live ↗<\/i>/g) || []).length, X.EXHIBITS.length, 'the default CTA on every tile');
  const c = w.build('cta');
  assert.equal(c.code, 0, c.err);
  assert.equal((c.html.match(/<i>Run it ↗<\/i>/g) || []).length, X.EXHIBITS.length, 'an override of proof.tile.cta reaches every tile');
});

test('tile copy: a declared still without its alt refuses, naming the row; no alt="" ships', () => {
  const row = X.EXHIBITS.find(x => x.still);
  for (const alt of ['undefined', "' '"]) {
    const r = world({ serve: `{ EXHIBITS: X.EXHIBITS.map(r => (r.id === ${JSON.stringify(row.id)} ? { ...r, still: { ...r.still, alt: ${alt} } } : r)) }` }).build('other');
    assert.equal(r.code, 1, `alt ${alt}: ${r.err}`); assert.match(r.err, new RegExp(`roster row ${row.id} declares a still without its alt text`)); assert.equal(r.html, null);
  }
});

test('tile copy: a row without its tile line refuses, naming the row', () => {
  const row = X.EXHIBITS[0];
  const r = world({ serve: `{ EXHIBITS: X.EXHIBITS.map(r => (r.id === ${JSON.stringify(row.id)} ? { ...r, tile: null } : r)) }` }).build('other');
  assert.equal(r.code, 1); assert.match(r.err, new RegExp(`roster row ${row.id} has no tile line`)); assert.equal(r.html, null);
});

// ---------------------------------------------------------------- lazy loading, derived from the theme CSS
const lazyOf = html => tiles(html).filter(t => t.img).map(t => t.loading === 'lazy' && t.decoding === 'async');
test('lazy: tiles past the grid\'s first desktop row (tokens.css repeat(N,1fr)) load lazily, the first N eagerly', () => {
  const r = world().build('other');
  assert.equal(r.code, 0, r.err);
  assert.ok(X.EXHIBITS.every(x => x.still), 'every row has a still, so every tile index is exercised');
  assert.ok(COLUMNS > 0 && COLUMNS < X.EXHIBITS.length, 'the roster is longer than one row, so both forms are exercised');
  assert.deepEqual(lazyOf(r.html), X.EXHIBITS.map((_, i) => i >= COLUMNS));
  for (const t of tiles(r.html).slice(0, COLUMNS)) { assert.equal(t.loading, null); assert.equal(t.decoding, null); }
});

test('lazy: the column count is read from the CSS, top-level rule only; no repeat(N,1fr) refuses', () => {
  assert.equal(gridColumns('.grid{display:grid;grid-template-columns:repeat(2,1fr)}'), 2);
  assert.equal(gridColumns('@media (max-width:820px){.grid{grid-template-columns:repeat(2,1fr)}}\n.grid{grid-template-columns:repeat(4,1fr)}'), 4);
  for (const css of ['.grid{display:grid;gap:18px}', '@media (max-width:820px){.grid{grid-template-columns:repeat(2,1fr)}}']) {
    assert.throws(() => gridColumns(css), /has 0 top-level \.grid\{grid-template-columns:repeat\(N,1fr\)\} rules/);
  }
});

// ---------------------------------------------------------------- the through-line slot
test('through-line: the marker is filled with the roster\'s SHOWCASE_THROUGH_LINE, once, between the grid and the grid-note', () => {
  for (const app of [SHOW(), 'other']) {
    const r = world().build(app);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(throughLines(r.html), [THROUGH_TEXT]);
    const proof = r.html.slice(r.html.indexOf('id="proof"'));
    const at = proof.indexOf('data-showcase-throughline');
    assert.ok(proof.lastIndexOf('data-exhibits', at) >= 0 && at < proof.indexOf('<p class="grid-note">Nothing here'), 'the through-line sits between the grid and the grid-note');
  }
});

test('through-line: a fragment page carrying the marker is filled; a fragment marker with hand text refuses at the final sweep', () => {
  const w = world({
    files: { 'frag.html': `<section class="sec" id="frag"><div class="wrap">${THROUGH}</div></section>`, 'hand.html': '<section class="sec" id="hand"><div class="wrap"><p data-showcase-throughline>hand</p></div></section>' },
    specs: { frag: spec('https://p.example', [{ file: 'frag.html' }], THROUGH_DECL), hand: spec('https://p.example', [{ file: 'hand.html' }], THROUGH_DECL) },
  });
  const ok = w.build('frag');
  assert.equal(ok.code, 0, ok.err); assert.deepEqual(throughLines(ok.html), [THROUGH_TEXT]);
  const bad = w.build('hand');
  assert.equal(bad.code, 1); assert.match(bad.err, /holds "hand…", not the roster's SHOWCASE_THROUGH_LINE/);
});

test('through-line: a roster through-line that is not plain text refuses (the page has no link renderer); a missing one refuses', () => {
  const link = world({ serve: '{ SHOWCASE_THROUGH_LINE: [\'FRQTL \', { text: \'links\', href: \'https://example.org\' }] }' }).build('other');
  assert.equal(link.code, 1); assert.match(link.err, /holds a non-string or empty segment; the through-line is plain text/);
  const gone = world({ serve: '{ SHOWCASE_THROUGH_LINE: undefined }' }).build('other');
  assert.equal(gone.code, 1); assert.match(gone.err, /exports no SHOWCASE_THROUGH_LINE paragraph/);
});

test('through-line: a spec that does not declare through_line renders its slot EMPTY (tiles still filled)', () => {
  const r = world().build('bare');
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(throughLines(r.html), ['']);
  assert.equal(tiles(r.html).length, X.EXHIBITS.length);
});

test('through-line: an undeclared spec whose page carries through-line text refuses at the final sweep', () => {
  const w = world({ files: { 'hand.html': `<section class="sec" id="hand"><div class="wrap"><p data-showcase-throughline>${THROUGH_TEXT}</p></div></section>` }, specs: { hand: spec('https://p.example', [{ file: 'hand.html' }]) } });
  const r = w.build('hand');
  assert.equal(r.code, 1); assert.match(r.err, /but hand\.json declares no through_line — the slot stays empty/);
});

test('through-line: an unknown source, an extra key or a bare string refuses; a declaration on a page with no marker refuses', () => {
  const w = world({ files: { 'plain.html': '<section class="sec" id="plain"><div class="wrap"><p>plain</p></div></section>' }, specs: {
    unknown: spec('https://p.example', [{ use: 'proof' }], { through_line: { source: 'typed' } }),
    extra: spec('https://p.example', [{ use: 'proof' }], { through_line: { source: 'served-roster', text: 'x' } }),
    str: spec('https://p.example', [{ use: 'proof' }], { through_line: 'served-roster' }),
    nomark: spec('https://p.example', [{ file: 'plain.html' }], THROUGH_DECL),
  } });
  for (const app of ['unknown', 'extra', 'str']) {
    const r = w.build(app);
    assert.equal(r.code, 1, app); assert.match(r.err, new RegExp(`${app}\\.json through_line .*the one form is \\{"source": "served-roster"\\}`)); assert.equal(r.html, null);
  }
  const n = w.build('nomark');
  assert.equal(n.code, 1); assert.match(n.err, /nomark\.json declares through_line but the page carries no data-showcase-throughline marker/);
});

// ---------------------------------------------------------------- the app's import-map block: markers only, filled by the app
const count = (s, sub) => s.split(sub).length - 1;
test('import map: "import_map": true leaves one EMPTY marker block last in the head, before the module scripts; without it, none', () => {
  const w = world({ specs: {
    mapped: spec('https://p.example', [{ use: 'proof' }], { scripts: { modules: ['app-assets/m.js'], import_map: true } }),
    unmapped: spec('https://p.example', [{ use: 'proof' }], { scripts: { modules: ['app-assets/m.js'] } }),
  } });
  const r = w.build('mapped');
  assert.equal(r.code, 0, r.err);
  assert.equal(count(r.html, IMPORT_MAP_BEGIN), 1); assert.equal(count(r.html, IMPORT_MAP_END), 1);
  assert.ok(r.html.includes(`${IMPORT_MAP_BEGIN}\n${IMPORT_MAP_END}\n</head>`), 'the block is empty and sits immediately before </head>');
  assert.ok(r.html.indexOf(IMPORT_MAP_END) < r.html.indexOf('<script type="module" src="app-assets/m.js"></script>'), 'the map precedes the module script');
  const u = w.build('unmapped');
  assert.equal(u.code, 0, u.err);
  assert.ok(!u.html.includes('IMPORT-MAP'), 'a spec that does not ask carries no block');
});

test('import map: asked without scripts.modules refuses', () => {
  const w = world({ specs: {
    none: spec('https://p.example', [{ use: 'proof' }], { scripts: { import_map: true } }),
    empty: spec('https://p.example', [{ use: 'proof' }], { scripts: { modules: [], import_map: true } }),
  } });
  for (const app of ['none', 'empty']) {
    const r = w.build(app);
    assert.equal(r.code, 1, app); assert.match(r.err, new RegExp(`${app}\\.json: scripts\\.import_map needs scripts\\.modules`)); assert.equal(r.html, null);
  }
});
