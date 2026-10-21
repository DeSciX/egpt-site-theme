// Vendors the zero-diff fixtures: the page inputs and the quotation ground of a library checkout AT ONE COMMIT, and
// the pages the library's own generator built from them (the expected outputs).
//
//   node test/tools/vendor-fixtures.mjs --source <library checkout at --commit, clean> --commit <full sha>
//        --repo <owner/name> --dir <inputs dir in the checkout> --apps <a,b,…> --expected <dir of <app>/ outputs> --out <fixtures dir>
//
// Inputs: exactly the paths each app's build reads (buildPage().inputs), spec files with their comment keys ("_…")
// removed — the build never reads them. The quotation ground is NOT vendored (it is the library's primary documents):
// the zero-diff test reads it from the public repository at the commit (ground.mjs githubGround).
// Expected: each app's index.html and share.json verbatim, and files.json, the sha256 of every output file.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildPage } from '../../src/page.mjs';
import { gitGround } from '../../src/ground.mjs';

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); if (i < 0 || !args[i + 1]) throw new Error(`${n} is required`); return args[i + 1]; };
const source = path.resolve(opt('--source')), commit = opt('--commit'), repo = opt('--repo'), dir = opt('--dir');
const apps = opt('--apps').split(','), expected = path.resolve(opt('--expected')), out = path.resolve(opt('--out'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source }).toString().trim();
if (head !== commit) throw new Error(`${source} is at ${head}, not ${commit}`);
if (execFileSync('git', ['status', '--porcelain', '--', dir], { cwd: source }).toString().trim()) throw new Error(`${source}/${dir} is not clean`);

const ground = gitGround(source, commit);
const inputs = new Set();
for (const app of apps) {
  const r = await buildPage(path.join(source, dir, `${app}.json`), { ground });
  r.inputs.forEach(p => inputs.add(p));
  console.log(r.log);
}
fs.rmSync(out, { recursive: true, force: true });
const strip = v => (Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, strip(x)])) : v);
const specs = new Set(apps.map(a => `${dir}/${a}.json`));
const copy = rel => {
  const from = path.join(source, rel), to = path.join(out, 'inputs', rel);
  if (fs.statSync(from).isDirectory()) { for (const f of fs.readdirSync(from)) copy(`${rel}/${f}`); return; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (specs.has(rel)) fs.writeFileSync(to, JSON.stringify(strip(JSON.parse(fs.readFileSync(from, 'utf8'))), null, 2) + '\n');
  else fs.copyFileSync(from, to);
};
[...inputs].sort().forEach(copy);
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)).map(x => `${e.name}/${x}`) : [e.name])).sort();
for (const app of apps) {
  const e = path.join(expected, app), o = path.join(out, 'expected', app);
  fs.mkdirSync(o, { recursive: true });
  for (const f of ['index.html', 'share.json']) if (fs.existsSync(path.join(e, f))) fs.copyFileSync(path.join(e, f), path.join(o, f));
  fs.writeFileSync(path.join(o, 'files.json'), JSON.stringify(Object.fromEntries(walk(e).map(f => [f, sha(path.join(e, f))])), null, 1) + '\n');
}
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({
  repo, commit, dir, apps,
  inputs: 'the paths the builds read, at the commit; spec comment keys ("_…") removed',
  ground: 'not vendored: the test reads the quotation ground from the repository at the commit (githubGround)',
  expected: `expected/<app>/: the library's own front-page generator (scripts/build-frontpage.js) at the commit, run with --out; index.html and share.json verbatim, files.json the sha256 of every output file`,
}, null, 1) + '\n');
console.log(`vendored ${inputs.size} input paths and ${apps.length} expected pages → ${out} (the builds read ${ground.reads.size} ground files)`);
