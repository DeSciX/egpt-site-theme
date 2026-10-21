// Conformance off the exported contracts: the exports map (every door resolves, publishes a non-empty surface, and the
// README's table names exactly the doors), the tile bag (TILE_FIELDS), the copy slots (COPY_SLOTS ↔ partials), the
// spec table (SPEC_KEYS ↔ README) and the view declarer's outcomes (⊂ @descix/frqtl-web/host-view HOST_VIEW_OUTCOMES).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { THEME, X } from './lib/world.mjs';
import { TILE_FIELDS, TILE_IMG_FIELDS, tileOf, tileHtml } from '../src/tiles.mjs';
import { COPY_SLOTS, normalizeCopy, ROSTER_OWNED, COPY_SCHEMA } from '../src/copy.mjs';
import { loadPartials, SECTION_IDS } from '../src/partials.mjs';
import { SPEC_KEYS, normalizeSpec } from '../src/spec.mjs';
import { CODESITE_SCRIPT } from '../src/bridge.mjs';
import { gridColumns } from '../src/tokens.mjs';

const PKG = JSON.parse(fs.readFileSync(path.join(THEME, 'package.json'), 'utf8'));
const README = fs.readFileSync(path.join(THEME, 'README.md'), 'utf8');
const self = createRequire(path.join(THEME, 'test', '_.js'));

test('exports map: every door resolves by package name and a module door publishes names', async () => {
  for (const [door, target] of Object.entries(PKG.exports)) {
    assert.ok(fs.existsSync(path.join(THEME, target)), `${door} → ${target} exists`);
    const file = self.resolve(`${PKG.name}${door.slice(1)}`);
    assert.equal(file, path.join(THEME, target), `${door} resolves by package name`);
    if (target.endsWith('.mjs')) assert.ok(Object.keys(await import(pathToFileURL(file).href)).length, `${door} publishes names`);
  }
  for (const f of PKG.files) assert.ok(fs.existsSync(path.join(THEME, f)), `files entry ${f} exists`);
  assert.ok(fs.existsSync(path.join(THEME, PKG.bin['egpt-site-theme'])), 'the bin exists');
});

test('exports map: README "Exports" table names exactly the doors, in order', () => {
  const sec = README.split('## Exports')[1].split('\n## ')[0];
  const rows = [...sec.matchAll(/^\| `([^`]+)` \|/gm)].map(m => m[1]);
  assert.deepEqual(rows, Object.keys(PKG.exports).filter(d => d !== './package.json'));
});

test('exports map: pins are exact; the peers are the dev pins', () => {
  for (const [n, v] of Object.entries(PKG.peerDependencies)) {
    assert.match(v, /^\d+\.\d+\.\d+(-[\w.]+)?$/, `${n} is pinned exactly`);
    assert.equal(PKG.devDependencies[n], v, `${n}: the tests run the version the theme names as its peer`);
  }
});

test('TILE_FIELDS: tileOf yields exactly TILE_FIELDS (and img exactly TILE_IMG_FIELDS) for every roster row, both page kinds', () => {
  for (const app of [X.SHOWCASE_SITE.app, 'other']) {
    X.EXHIBITS.forEach((row, index) => {
      const bag = tileOf(row, { roster: X, app, index, columns: gridColumns(), cta: 'c' });
      assert.deepEqual(Object.keys(bag), [...TILE_FIELDS]);
      if (bag.img) assert.deepEqual(Object.keys(bag.img), [...TILE_IMG_FIELDS]);
      assert.equal(bag.href, app === X.SHOWCASE_SITE.app ? X.showcaseHref(row) : X.showcaseUrl(row));
      assert.equal(bag.external, app !== X.SHOWCASE_SITE.app);
    });
  }
});

test('TILE_FIELDS: tileHtml refuses a bag with a missing or an extra field; tileOf refuses a partial context', () => {
  const bag = tileOf(X.EXHIBITS[0], { roster: X, app: 'other', index: 0, columns: 3, cta: 'c' });
  assert.doesNotThrow(() => tileHtml(bag));
  const { cta, ...missing } = bag;
  assert.throws(() => tileHtml(missing), /a tile bag has exactly href, external, title, line, img, cta/);
  assert.throws(() => tileHtml({ ...bag, extra: 1 }), /a tile bag has exactly/);
  assert.throws(() => tileOf(X.EXHIBITS[0], { roster: X, app: 'other' }), /every context key is required/);
});

test('COPY_SLOTS: every slot is placed exactly once by the partials (or the tile writer); every token names a slot', () => {
  const P = loadPartials();
  const text = [P.head, P.nav, P.hero, P.footer, P.login, ...Object.values(P.sections)].join('\n');
  const tokens = [...text.matchAll(/\{\{slot:([^}]+)\}\}/g)].map(m => m[1]);
  const ids = COPY_SLOTS.map(s => s.id);
  assert.deepEqual([...new Set(tokens)].sort(), ids.filter(id => id !== 'proof.tile.cta').sort());
  assert.equal(tokens.length, new Set(tokens).size, 'no slot placed twice');
  for (const id of SECTION_IDS) assert.ok(ids.some(x => x.startsWith(`${id}.`)), `section ${id} has copy`);
});

test('COPY_SLOTS: no hand text left in a partial (outside tags, scripts, styles and tokens)', () => {
  const P = loadPartials();
  for (const [name, html] of Object.entries({ nav: P.nav, hero: P.hero, footer: P.footer, login: P.login, ...P.sections })) {
    const bare = html.replace(/<svg[\s\S]*?<\/svg>/g, s => s.replace(/<[^>]+>/g, '')).replace(/<[^>]+>/g, '').replace(/\{\{slot:[^}]+\}\}/g, '').replace(/&nbsp;/g, '');
    assert.equal(bare.trim(), '', `${name} carries hand text: ${JSON.stringify(bare.trim().slice(0, 60))}`);
    for (const a of html.matchAll(/\s(alt|aria-label|placeholder|title)="([^"]+)"/g)) assert.match(a[2], /^\{\{slot:[^}]+\}\}$/, `${name}: ${a[1]} is copy`);
  }
});

test('normalizeCopy: refuses an unknown id, a roster-owned id, a wrong kind, a placeholder, html outside the allowlist, another schema', () => {
  const c = slots => normalizeCopy({ schema: COPY_SCHEMA, slots }, 't');
  const textId = COPY_SLOTS.find(s => s.kind === 'text').id, htmlId = COPY_SLOTS.find(s => s.kind === 'html').id;
  assert.equal(c({ [textId]: 'x y' })[textId], 'x y');
  assert.equal(c({ [htmlId]: { html: '<b>x</b>' } })[htmlId], '<b>x</b>');
  assert.throws(() => c({ 'no.such': 'x' }), /no slot no\.such/);
  for (const id of Object.keys(ROSTER_OWNED)) assert.throws(() => c({ [id]: 'x' }), /is the showcase roster's/);
  assert.throws(() => c({ [textId]: { html: 'x' } }), /is a text slot; its override is a string/);
  assert.throws(() => c({ [htmlId]: 'x' }), /is an html slot; its override is \{"html": "…"\}/);
  assert.throws(() => c({ [textId]: 'TODO write this' }), /placeholder text/);
  assert.throws(() => c({ [htmlId]: { html: '<div>x</div>' } }), /<div> is not inline copy/);
  assert.throws(() => c({ [htmlId]: { html: '<a onclick="x">x</a>' } }), /attribute onclick/);
  assert.throws(() => normalizeCopy({ schema: 'other@1', slots: {} }, 't'), /is not egpt-site-theme\/copy@1/);
  assert.deepEqual(Object.fromEntries(Object.entries(normalizeCopy(null))), Object.fromEntries(COPY_SLOTS.map(s => [s.id, s.default])), 'no file: every default');
});

test('SPEC_KEYS: README "Spec" table names exactly the keys; normalizeSpec refuses an unknown key and fills defaults', () => {
  const sec = README.split('## Spec')[1].split('\n## ')[0];
  const rows = [...sec.matchAll(/^\| `([^`]+)` \|/gm)].map(m => m[1]);
  assert.deepEqual(rows, SPEC_KEYS.map(k => k.key));
  const min = { title: 't', description: 'd', brand: 'template', nav: 'template', hero: 'template', sections: [], footer: 'template', scripts: {} };
  const bag = normalizeSpec(min, 'a');
  for (const k of SPEC_KEYS.filter(k => !k.required)) assert.deepEqual(bag[k.key], k.default, k.key);
  assert.throws(() => normalizeSpec({ ...min, anchorz: [] }, 'a'), /unknown key "anchorz"/);
  assert.doesNotThrow(() => normalizeSpec({ ...min, _purpose: 'comment' }, 'a'));
  assert.throws(() => normalizeSpec({ ...min, scripts: { sdkk: true } }, 'a'), /unknown scripts key "sdkk"/);
  const { title, ...noTitle } = min;
  assert.throws(() => normalizeSpec(noTitle, 'a'), /spec lacks title/);
});

// The CodeSite declarer's outcomes, DERIVED: the script runs in node:vm against one stub SDK per path it can take, and
// every value it writes to dataset.descixView is collected (an outcome id is the part before ':').
const VIEW_SCENARIOS = Object.freeze({
  'no SDK': undefined,
  'ready() rejects': { ready: () => Promise.reject(new Error('no bus')) },
  'standalone': { ready: async () => ({ mode: 'standalone' }) },
  'framed, no bridge': { ready: async () => ({ mode: 'embedded' }) },
  'shell without view': { ready: async () => ({ mode: 'shell' }) },
  'shell not listening': { ready: async () => ({ mode: 'shell' }), view: { available: () => false, set: () => {} } },
  'shell listening': { ready: async () => ({ mode: 'shell' }), view: { available: () => true, set: m => m } },
});
async function recordedOutcomes(script) {
  const seen = new Set();
  for (const sdk of Object.values(VIEW_SCENARIOS)) {
    const dataset = new Proxy({}, { set(t, k, v) { if (k === 'descixView') seen.add(String(v).split(':')[0]); t[k] = v; return true; } });
    await vm.runInNewContext(script, { window: { DeSciX: sdk }, document: { documentElement: { dataset } } });
  }
  return [...seen].sort();
}
// The gate's predicate: the outcomes a declarer records that the host-view table does not carry.
const outsideHostView = (recorded, hostIds) => recorded.filter(o => !hostIds.includes(o));

test('bridge: every outcome the CodeSite declarer records (run in node:vm) is a HOST_VIEW_OUTCOMES row of the pinned @descix/frqtl-web/host-view', async () => {
  const { HOST_VIEW_OUTCOMES } = await import(pathToFileURL(self.resolve('@descix/frqtl-web/host-view')).href);
  const ids = HOST_VIEW_OUTCOMES.map(o => o.id);
  const recorded = await recordedOutcomes(CODESITE_SCRIPT);
  assert.deepEqual(recorded, ['embedded-no-bridge', 'not-listening', 'pending', 'requested', 'sdk-absent', 'standalone', 'view-unpublished'], 'every path of the declarer is exercised');
  assert.deepEqual(outsideHostView(recorded, ids), []);
  // the gate fails: a planted extra outcome, and a planted script that records an outcome the table lacks
  assert.deepEqual(outsideHostView([...recorded, 'requested-by-hand'], ids), ['requested-by-hand']);
  const planted = CODESITE_SCRIPT.replace("rec('sdk-absent')", "rec('bogus')");
  assert.notEqual(planted, CODESITE_SCRIPT, 'the plant reached the script');
  assert.deepEqual(outsideHostView(await recordedOutcomes(planted), ids), ['bogus']);
});
