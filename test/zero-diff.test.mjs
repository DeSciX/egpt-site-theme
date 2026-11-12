// The generator's pages predate the proposal intake: a fixture page that carries the licence form is compared outside
// the forms' regions (expected.mjs HOOK_REGIONS), and one whose spec lacks self_host (the form's page_url) gets the
// app's own host planted (FIXTURE_SELF_HOST); test/request holds the regions themselves.
//
// Zero diff: the theme CLI, run on the vendored inputs of the five EGPT-community front pages (test/fixtures/egpt,
// source.json names the library repository and commit they come from), writes exactly the files the library's own
// generator wrote at that commit (expected/<app>/): index.html byte for byte except the one provenance line, share.json
// byte for byte, and every output file by sha256. The quotation ground is the library repository at the same commit,
// fetched from GitHub (ground.mjs githubGround); an unreachable ground is a FAILURE, never a skip.
//
// The comparison and what it normalises (the stamp line only) are test/lib/expected.mjs diffOf; the stamp line is itself
// asserted to name the app, this theme's version and the roster version the build used.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BIN, FIXTURES, SOURCE, THEME, git, commitAll, throughLines, X } from './lib/world.mjs';
import { THEME_VERSION, pageOutputs } from '../src/page.mjs';
import { STAMP, diffOf, stampFor, walk, BRIDGE, appSdkPinDrift, unPhone } from './lib/expected.mjs';

const ROSTER_VERSION = JSON.parse(fs.readFileSync(path.join(THEME, 'node_modules', '@descix', 'frqtl-web', 'package.json'), 'utf8')).version;
const CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-ground-cache-'));

const FIXTURE_SELF_HOST = app => `https://${app}.descix.net`;
const specOf = (dir, app) => JSON.parse(fs.readFileSync(path.join(dir, `${app}.json`), 'utf8'));
const HOOKED = SOURCE.apps.filter(a => specOf(path.join(FIXTURES, 'inputs', SOURCE.dir), a).sections.some(x => x.use === 'request'));
const LOGIN = SOURCE.apps.filter(a => specOf(path.join(FIXTURES, 'inputs', SOURCE.dir), a).login === true);
// the theme owns the login button's script now: a login page's spec drops the app's own login.js from scripts.extra
const plantLogin = dir => { for (const a of LOGIN) { const s = specOf(dir, a); fs.writeFileSync(path.join(dir, `${a}.json`), JSON.stringify({ ...s, scripts: { ...s.scripts, extra: s.scripts.extra.filter(f => f !== 'login.js') } })); } };
const opts = app => ({ hook: HOOKED.includes(app), login: LOGIN.includes(app) });
const plantRequest = dir => { for (const a of HOOKED) { const s = specOf(dir, a); if (!s.self_host) fs.writeFileSync(path.join(dir, `${a}.json`), JSON.stringify({ ...s, self_host: FIXTURE_SELF_HOST(a) })); } };

// The inputs, committed in a throwaway app repository, with the theme's node_modules (the pinned roster and app-sdk).
function inputsRepo(plant) {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-zero-diff-'));
  fs.cpSync(path.join(FIXTURES, 'inputs'), T, { recursive: true });
  plantRequest(path.join(T, SOURCE.dir));
  plantLogin(path.join(T, SOURCE.dir));
  if (plant) plant(path.join(T, SOURCE.dir));
  fs.writeFileSync(path.join(T, '.gitignore'), 'node_modules\n');
  fs.symlinkSync(path.join(THEME, 'node_modules'), path.join(T, 'node_modules'));
  git(T, 'init', '-q'); commitAll(T);
  return T;
}
function buildAll(T) {
  const out = path.join(T, '.out');
  const runs = {};
  for (const app of SOURCE.apps) {
    const r = spawnSync(process.execPath, [BIN, 'build', path.join(T, SOURCE.dir, `${app}.json`), '--out', path.join(out, app), '--ground-github', `${SOURCE.repo}@${SOURCE.commit}`],
      { encoding: 'utf8', env: { ...process.env, EGPT_SITE_THEME_CACHE: CACHE } });
    runs[app] = { code: r.status, err: r.stderr, out: path.join(out, app) };
  }
  return runs;
}
let base;
test.before(() => {
  const T = inputsRepo();
  base = { T, head: git(T, 'rev-parse', 'HEAD'), runs: buildAll(T) };
});

for (const app of SOURCE.apps) {
  test(`${app}: the theme writes the generator's files (index.html except the stamp line, share.json, every asset by sha256)`, () => {
    const r = base.runs[app];
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(diffOf(app, r.out, opts(app)), []);
    const stamp = fs.readFileSync(path.join(r.out, 'index.html'), 'utf8').match(STAMP)[0];
    assert.equal(stamp, stampFor({ app, theme: THEME_VERSION, roster: ROSTER_VERSION, build: base.head }));
  });
}

test('the through-line is filled on exactly the pages whose spec declares it; every other #proof page leaves it empty', () => {
  for (const app of SOURCE.apps) {
    const s = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'inputs', SOURCE.dir, `${app}.json`), 'utf8'));
    if (!s.sections.some(x => x.use === 'proof')) continue;
    const got = throughLines(fs.readFileSync(path.join(base.runs[app].out, 'index.html'), 'utf8'));
    assert.deepEqual(got, [s.through_line ? X.SHOWCASE_THROUGH_LINE.join('') : ''], app);
  }
  assert.ok(SOURCE.apps.some(a => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'inputs', SOURCE.dir, `${a}.json`), 'utf8')).through_line), 'some fixture declares it');
});

test('pageOutputs names every top-level entry a build wrote (what a site refresh may treat as the theme\'s)', async () => {
  const outs = await pageOutputs(THEME);
  for (const app of SOURCE.apps) for (const f of walk(base.runs[app].out)) {
    const top = f.includes('/') ? `${f.split('/')[0]}/` : f;
    assert.ok(outs.includes(top), `${app}: ${f} is not under pageOutputs ${outs.join(', ')}`);
  }
});

// The negative control: one copy override in one app's copy file changes that app's page, at that slot, and no other.
test('negative control: a planted copy override in one slot shows up only in that app\'s page', () => {
  // the first fixture page that shows the theme's technology section (its lede is the planted slot)
  const victim = SOURCE.apps.find(a => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'inputs', SOURCE.dir, `${a}.json`), 'utf8')).sections.some(x => x.use === 'technology'));
  assert.ok(victim, 'a fixture page uses the technology section');
  const T = inputsRepo(dir => {
    fs.writeFileSync(path.join(dir, `${victim}.copy.json`), JSON.stringify({ schema: 'egpt-site-theme/copy@1', slots: { 'technology.lede': 'PLANTED copy override.' } }));
    const f = path.join(dir, `${victim}.json`);
    fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), copy: `${victim}.copy.json` }));
  });
  const runs = buildAll(T);
  for (const app of SOURCE.apps) {
    assert.equal(runs[app].code, 0, runs[app].err);
    const d = diffOf(app, runs[app].out, opts(app));
    assert.deepEqual(d, app === victim ? ['index.html'] : [], app);
  }
  const lines = h => h.replace(STAMP, '<body>').split('\n');
  const a = lines(fs.readFileSync(path.join(FIXTURES, 'expected', victim, 'index.html'), 'utf8')), b = lines(unPhone(fs.readFileSync(path.join(runs[victim].out, 'index.html'), 'utf8')));
  const changed = a.map((l, i) => [l, b[i]]).filter(([x, y]) => x !== y);
  assert.equal(a.length, b.length);
  assert.deepEqual(changed.map(([, y]) => y.trim()), ['<p class="lede">PLANTED copy override.</p>']);
});

// The bridge gate: DeSciXAppSDK.js is held to the pinned @descix/app-sdk's file, and the installed package to the pin.
test('negative control: a wrong or missing bridge file fails the page; an installed app-sdk other than the pin fails', () => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-bridge-'));
  fs.cpSync(base.runs.egpt.out, T, { recursive: true });
  assert.deepEqual(diffOf('egpt', T), [], 'the copy starts equal');
  fs.writeFileSync(path.join(T, BRIDGE.name), Buffer.concat([BRIDGE.data, Buffer.from('\n// planted')]));
  assert.deepEqual(diffOf('egpt', T), [`${BRIDGE.name} (not the pinned @descix/app-sdk bridge)`]);
  fs.rmSync(path.join(T, BRIDGE.name));
  assert.match(diffOf('egpt', T)[0], new RegExp(`file set: missing ${BRIDGE.name}`));
  const pkg = JSON.parse(fs.readFileSync(path.join(THEME, 'package.json'), 'utf8'));
  const installed = JSON.parse(fs.readFileSync(path.join(THEME, 'node_modules', '@descix', 'app-sdk', 'package.json'), 'utf8')).version;
  assert.equal(appSdkPinDrift(pkg, installed), null, 'installed == pin');
  assert.match(appSdkPinDrift(pkg, '0.6.0'), /@descix\/app-sdk 0\.6\.0 is installed but package\.json pins 0\.9\.0/);
});

// The phone-width rules: on every page, once, at the end of the theme CSS (tokens.css); the fixture comparison takes
// them out exactly once (expected.mjs unPhone). What they do is LOOKed at 320, 375 and 390 (scrollWidth == innerWidth).
test('the theme CSS ends with the phone-width rules: the technology column and the chains and roles tables never widen a phone page', () => {
  const css = fs.readFileSync(path.join(THEME, 'src', 'tokens.css'), 'utf8');
  assert.match(css, /\/\* phone width \*\/\n@media \(max-width:900px\)\{\.tech\{grid-template-columns:minmax\(0,1fr\)\}\.chains td,\.chains th\{overflow-wrap:anywhere\}\}@media \(max-width:400px\)\{\.roles td,\.roles th\{padding-right:8px;overflow-wrap:anywhere\}\.roles td\.mono\{white-space:normal\}\}\n$/);
  for (const app of SOURCE.apps) {
    const h = fs.readFileSync(path.join(base.runs[app].out, 'index.html'), 'utf8');
    assert.doesNotThrow(() => unPhone(h), app);
    assert.throws(() => unPhone(unPhone(h)), /0 times, wants 1/);
  }
});
