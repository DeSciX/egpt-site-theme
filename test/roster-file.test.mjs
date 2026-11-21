// The app's roster file (spec "roster"): a pinned @descix/frqtl-web/registry that ships no rows (0.7, normalizeRoster)
// takes its tiles from the app's own roster, read from the app's committed inputs (./page) and normalized by the
// registry (./tiles loadRoster). Each case runs the REAL CLI with the REAL 0.7 release (the devDependency alias
// ROSTER_07) against the vendored roster of the showcase app (test/fixtures/roster-0.7) and the stills home.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { world, spec, tiles, throughLines, THEME, THROUGH_DECL, ROSTER_07, PKG_ALIASES, installedVersion } from './lib/world.mjs';
import { tokensCss, gridColumns } from '../src/tokens.mjs';
import { assertPage } from '../src/gates.mjs';
import { loadRoster } from '../src/tiles.mjs';

const FIXTURE = path.join(THEME, 'test', 'fixtures', 'roster-0.7', 'roster.json');
const JSON_TEXT = fs.readFileSync(FIXTURE, 'utf8');
const R = await import(pathToFileURL(createRequire(path.join(THEME, 'package.json')).resolve(`${ROSTER_07}/registry`)).href);
// the roster as the showcase app's own pages read it: at its https media URL (the theme reads it at its file URL)
const ROSTER = R.normalizeRoster(JSON.parse(JSON_TEXT), 'https://roster.example/assets/scenes/roster.json');
const CARDS = ROSTER.showcase.rows;
const ORIGIN = ROSTER.showcase.siteOrigin;
const SHOW = new URL(ORIGIN).hostname.split('.')[0];
const COLUMNS = gridColumns(tokensCss());
const stillOf = c => `images/${R.sceneKey(ROSTER, { id: c.id, modeId: c.mode })}.png`;
const withRoster = (selfHost, extra = {}) => spec(selfHost, [{ use: 'proof' }], { ...THROUGH_DECL, roster: 'scenes/roster.json', ...extra });
const world07 = (o = {}) => world({ pkg: '0.7', ...o, files: { 'scenes/roster.json': JSON_TEXT, ...(o.files || {}) } });
const v07 = installedVersion(ROSTER_07), v06 = installedVersion('@descix/frqtl-web');
const reEsc = s => s.replace(/[.]/g, '\\.');
// every 0.7 alternative of the peer range the tests install (a devDependency alias): each builds the showcase page
const ALIASES_07 = Object.keys(PKG_ALIASES).filter(a => /^0\.7\./.test(PKG_ALIASES[a]));
assert.ok(ALIASES_07.includes(ROSTER_07), `${ROSTER_07} is one of the installed 0.7 alternatives (${ALIASES_07.join(', ')})`);

for (const alias of ALIASES_07) test(`0.7 roster file (${PKG_ALIASES[alias]}): the showcase app's page has one tile per showcase card, in order, relative links from showcaseHref`, () => {
  assert.equal(installedVersion(alias), PKG_ALIASES[alias], `${alias} is installed at its alternative`);
  const w = world07({ pkg: alias, specs: { [SHOW]: withRoster(ORIGIN) } });
  const r = w.build(SHOW);
  assert.equal(r.code, 0, r.err);
  const got = tiles(r.html);
  assert.equal(got.length, CARDS.length);
  CARDS.forEach((c, i) => {
    assert.equal(got[i].href, R.showcaseHref(ROSTER, c), `tile ${i + 1} href: the roster's writer, independent of where the roster was read`);
    assert.doesNotMatch(got[i].attrs, /target=/);
    assert.equal(got[i].line, c.tile);
    assert.equal(got[i].img, c.still ? stillOf(c) : null);
    if (c.still) { assert.equal(got[i].alt, c.still.alt); assert.ok(fs.existsSync(path.join(r.out, stillOf(c))), `${stillOf(c)} written`); }
  });
  assert.deepEqual(throughLines(r.html), [ROSTER.showcase.throughLine.join('')]);
  assert.match(r.html, new RegExp(`data-frontpage-roster="${reEsc(PKG_ALIASES[alias])}"`));
  assert.doesNotMatch(r.html, /file:/, 'the roster file\'s own URL never reaches the page');
});

test('0.7 roster file: another site\'s page links absolute, from showcaseUrl, in a new tab', () => {
  const r = world07({ specs: { other: withRoster('https://other.example') } }).build('other');
  assert.equal(r.code, 0, r.err);
  const got = tiles(r.html);
  assert.deepEqual(got.map(t => t.href), CARDS.map(c => R.showcaseUrl(ROSTER, c)));
  for (const t of got) { assert.equal(new URL(t.href).origin, ORIGIN); assert.match(t.attrs, / target="_blank" rel="noopener"/); }
});

test('0.7 roster file: the page gates run on it — a planted GYM href fails assertPage, self_host drift and stills refuse', async () => {
  const w = world07({ specs: { [SHOW]: withRoster(ORIGIN), drift: withRoster(ORIGIN) } });
  const r = w.build(SHOW);
  assert.equal(r.code, 0, r.err);
  const roster = await loadRoster(w.app, { path: FIXTURE, json: JSON.parse(JSON_TEXT), url: pathToFileURL(FIXTURE).href });
  const ctx = { app: SHOW, theme: r.html.match(/data-frontpage-theme="([^"]+)"/)[1], build: r.html.match(/data-frontpage-build="([^"]+)"/)[1],
    spec: { through_line: THROUGH_DECL.through_line, self_host: ORIGIN }, copy: { 'proof.tile.cta': 'Open live ↗' }, roster, columns: COLUMNS };
  assert.doesNotThrow(() => assertPage(r.html, ctx));
  const planted = r.html.replace(/preset=author/g, 'preset=compare');
  assert.notEqual(planted, r.html, 'the plant reached the page');
  assert.throws(() => assertPage(planted, ctx), /tiles are not the roster's/);
  const d = w.build('drift');
  assert.equal(d.code, 1); assert.match(d.err, /drift is not egpt-frqtl, so its spec's self_host may not be/);
  // a declared still missing from the stills home refuses, naming it
  const gone = CARDS.find(c => c.still);
  const s = world07({ specs: { [SHOW]: withRoster(ORIGIN) }, stills: fs_ => fs_.filter(f => !f.startsWith(path.basename(stillOf(gone), '.png') + '.')) }).build(SHOW);
  assert.equal(s.code, 1); assert.match(s.err, new RegExp(`declares a still .* but .*${path.basename(stillOf(gone)).replace(/[.]/g, '\\.')} does not exist`));
});

test('roster file: missing, not JSON, refused by normalizeRoster, or without a showcase — each fails loud naming the file', () => {
  const missing = world07({ specs: { a: withRoster('https://a.example', { roster: 'scenes/absent.json' }) } }).build('a');
  assert.equal(missing.code, 1); assert.equal(missing.html, null);
  assert.match(missing.err, /a\.json roster: .*scenes\/absent\.json does not exist/);

  const bad = world07({ specs: { a: withRoster('https://a.example') }, files: { 'scenes/roster.json': '{ "rows": [' } }).build('a');
  assert.equal(bad.code, 1); assert.match(bad.err, /a\.json roster: .*scenes\/roster\.json is not JSON: /);

  const j = JSON.parse(JSON_TEXT); delete j.rows[0].group;
  const refused = world07({ specs: { a: withRoster('https://a.example') }, files: { 'scenes/roster.json': JSON.stringify(j) } }).build('a');
  assert.equal(refused.code, 1); assert.match(refused.err, new RegExp(`roster file .*scenes/roster\\.json: @descix/frqtl-web@${reEsc(v07)} normalizeRoster refuses it: .*group`));

  const k = JSON.parse(JSON_TEXT); delete k.showcase;
  const none = world07({ specs: { a: withRoster('https://a.example') }, files: { 'scenes/roster.json': JSON.stringify(k) } }).build('a');
  assert.equal(none.code, 1); assert.match(none.err, /roster file .*scenes\/roster\.json declares no showcase/);

  const typed = world07({ specs: { a: withRoster('https://a.example', { roster: { file: 'scenes/roster.json' } }) } }).build('a');
  assert.equal(typed.code, 1); assert.match(typed.err, /roster must be string\|null/);
});

test('roster file vs registry: a 0.7 registry without the spec\'s roster refuses; a registry that ships rows refuses a roster file', () => {
  const no = world07({ specs: { a: spec('https://a.example', [{ use: 'proof' }]) } }).build('a');
  assert.equal(no.code, 1); assert.match(no.err, /ships no rows \(normalizeRoster\); declare the app's roster file in the spec: "roster"/);
  const both = world({ files: { 'scenes/roster.json': JSON_TEXT }, specs: { a: withRoster('https://a.example') } }).build('a');
  assert.equal(both.code, 1); assert.match(both.err, new RegExp(`scenes/roster\\.json: @descix/frqtl-web/registry \\(@descix/frqtl-web@${reEsc(v06)}\\) ships its own rows \\(EXHIBITS\\)`));
});
