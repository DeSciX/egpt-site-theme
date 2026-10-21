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
import { STAMP, diffOf, stampFor, walk } from './lib/expected.mjs';

const ROSTER_VERSION = JSON.parse(fs.readFileSync(path.join(THEME, 'node_modules', '@descix', 'frqtl-web', 'package.json'), 'utf8')).version;
const CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-ground-cache-'));

// The inputs, committed in a throwaway app repository, with the theme's node_modules (the pinned roster and app-sdk).
function inputsRepo(plant) {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-zero-diff-'));
  fs.cpSync(path.join(FIXTURES, 'inputs'), T, { recursive: true });
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
    assert.deepEqual(diffOf(app, r.out), []);
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
    const d = diffOf(app, runs[app].out);
    assert.deepEqual(d, app === victim ? ['index.html'] : [], app);
  }
  const lines = f => fs.readFileSync(f, 'utf8').replace(STAMP, '<body>').split('\n');
  const a = lines(path.join(FIXTURES, 'expected', victim, 'index.html')), b = lines(path.join(runs[victim].out, 'index.html'));
  const changed = a.map((l, i) => [l, b[i]]).filter(([x, y]) => x !== y);
  assert.equal(a.length, b.length);
  assert.deepEqual(changed.map(([, y]) => y.trim()), ['<p class="lede">PLANTED copy override.</p>']);
});
