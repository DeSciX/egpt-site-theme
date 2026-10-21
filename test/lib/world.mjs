// A throwaway app repository for one test case: specs, fragments and the tile stills committed in a git repo, and a
// node_modules holding the roster package the build resolves from the app (the real pinned @descix/frqtl-web,
// symlinked, or a fixture package whose ./registry re-exports the real module with the case's exports replaced).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unent } from '../../src/html.mjs';

export const THEME = fileURLToPath(new URL('../../', import.meta.url));
export const BIN = path.join(THEME, 'bin', 'egpt-site-theme.mjs');
export const FIXTURES = path.join(THEME, 'test', 'fixtures', 'egpt');
export const SOURCE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'source.json'), 'utf8'));
export const FIXTURE_DIR = path.join(FIXTURES, 'inputs', SOURCE.dir);
export const PKG = '@descix/frqtl-web';
const req = createRequire(path.join(THEME, 'package.json'));
let PKG_DIR, REGISTRY_FILE;
try { PKG_DIR = path.dirname(req.resolve(`${PKG}/package.json`)); REGISTRY_FILE = req.resolve(`${PKG}/registry`); }
catch (e) { throw new Error(`${PKG} is not installed in ${THEME} — run npm ci (package.json pins it): ${e.message}`); }
export const X = await import(pathToFileURL(REGISTRY_FILE).href);
export const key = r => X.sceneKey({ kind: r.kind, id: r.id, modeId: r.mode });

export const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
export const commitAll = cwd => { git(cwd, 'add', '-A'); git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'w', '--allow-empty'); };

export const spec = (selfHost, sections, extra = {}) => ({
  title: 'T', description: 'D', brand: { name: 'B', tag: 't' }, nav: [],
  hero: { eyebrow: 'e', h1_html: 'H', lede: 'l', primary: { text: 'p', href: '#top' } },
  sections, links: [], self_host: selfHost,
  footer: { name: 'F', tag: 't', links: [], legal_html: 'L' }, scripts: {}, ...extra,
});
export const THROUGH_DECL = { through_line: { source: 'served-roster' } };

/**
 * world({ stills, pkg, specs, undeclare, serve, files })
 *   stills     'real' (the vendored stills home) or a filter over its file names
 *   pkg        true (the real package), false (none), 'broken' (./registry resolves but fails to load)
 *   specs      { <app>: spec } beside the defaults: the showcase app's, other and bare
 *   undeclare  a roster row id the fixture package serves WITHOUT its still (its files leave the home too)
 *   serve      a JS object expression over X whose keys replace the package's exports
 *   files      { <path>: text } more committed inputs (fragments, copy files)
 */
export function world({ stills = 'real', pkg = true, specs = {}, undeclare = null, serve = null, files = {} } = {}) {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-world-'));
  const app = path.join(T, 'app');
  fs.mkdirSync(path.join(app, 'exhibits'), { recursive: true });
  if (undeclare && !X.EXHIBITS.some(r => r.id === undeclare && r.still)) throw new Error(`fixture: roster row ${undeclare} declares no still to withdraw`);
  const override = [undeclare ? `EXHIBITS: X.EXHIBITS.map(r => (r.id === ${JSON.stringify(undeclare)} ? { ...r, still: undefined } : r))` : '', serve ? `...(${serve})` : ''].filter(Boolean);
  const rows = X.EXHIBITS.map(r => (r.id === undeclare ? { ...r, still: undefined } : r));
  const withdrawn = undeclare ? `${key(X.EXHIBITS.find(r => r.id === undeclare))}.` : null;
  const all = { [X.SHOWCASE_SITE.app]: spec(X.SHOWCASE_SITE.origin, [{ use: 'proof' }], THROUGH_DECL), other: spec('https://other.example', [{ use: 'proof' }], THROUGH_DECL), bare: spec('https://bare.example', [{ use: 'proof' }]), ...specs };
  for (const [name, s] of Object.entries(all)) fs.writeFileSync(path.join(app, `${name}.json`), JSON.stringify(s));
  for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(app, name)), { recursive: true }); fs.writeFileSync(path.join(app, name), text); }
  const home = path.join(FIXTURE_DIR, 'exhibits');
  const real = fs.readdirSync(home);
  const kept = withdrawn ? real.filter(f => !f.startsWith(withdrawn)) : real;
  for (const f of (stills === 'real' ? kept : stills(kept))) fs.copyFileSync(path.join(home, f), path.join(app, 'exhibits', f));
  fs.writeFileSync(path.join(app, '.gitignore'), 'node_modules/\n');
  git(app, 'init', '-q'); commitAll(app);
  if (pkg) {
    const scope = path.join(app, 'node_modules', '@descix');
    fs.mkdirSync(scope, { recursive: true });
    fs.symlinkSync(path.join(THEME, 'node_modules', '@descix', 'app-sdk'), path.join(scope, 'app-sdk'));
    const dir = path.join(scope, 'frqtl-web');
    if (pkg === 'broken') {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: PKG, version: '0.0.0-broken', type: 'module', exports: { './registry': './registry.js', './package.json': './package.json' } }));
      fs.writeFileSync(path.join(dir, 'registry.js'), "export * from './absent.js';\n");
    } else if (!override.length) fs.symlinkSync(PKG_DIR, dir);
    else {
      const body = `{ ${override.join(', ')} }`;
      const names = Object.keys(new Function('X', `return ${body};`)(X));
      const writers = names.includes('EXHIBITS') ? ['showcaseHref', 'showcaseUrl'].filter(n => !names.includes(n)) : [];
      const realUrl = JSON.stringify(pathToFileURL(REGISTRY_FILE).href);
      fs.mkdirSync(dir);
      const { version } = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: PKG, version, type: 'module', exports: { './registry': './registry.js', './package.json': './package.json' } }));
      fs.writeFileSync(path.join(dir, 'registry.js'), `import * as X from ${realUrl};
export * from ${realUrl};
const O = ${body};
${names.map(n => `export const ${n} = O.${n};`).join('\n')}
${writers.length ? 'const real = (r) => { const i = EXHIBITS.indexOf(r); return i === -1 ? r : X.EXHIBITS[i]; };\n' : ''}${writers.map(n => `export const ${n} = (r) => X.${n}(real(r));`).join('\n')}
`);
    }
  }
  return {
    T, app, rows, commit: () => commitAll(app),
    async roster() { return import(pathToFileURL(createRequire(path.join(app, '_.js')).resolve(`${PKG}/registry`)).href); },
    build(name, extraArgs = []) {
      const out = path.join(T, 'out', name);
      fs.rmSync(out, { recursive: true, force: true });   // a refused build must not be read as an earlier build's page
      const r = spawnSync(process.execPath, [BIN, 'build', path.join(app, `${name}.json`), '--out', out, ...extraArgs], { encoding: 'utf8' });
      const html = fs.existsSync(path.join(out, 'index.html')) ? fs.readFileSync(path.join(out, 'index.html'), 'utf8') : null;
      return { code: r.status, err: r.stderr, html, out };
    },
  };
}

export const tiles = html => [...html.match(/<div\b[^>]*data-exhibits[^>]*>([\s\S]*?)<\/div>/)[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
  .map(([, attrs, body]) => {
    const img = (body.match(/<img\b[^>]*>/) || [])[0] || '';
    const a = n => { const m = img.match(new RegExp(`\\s${n}="([^"]*)"`)); return m ? unent(m[1]) : null; };
    return { attrs, href: attrs.match(/href="([^"]*)"/)[1].replace(/&amp;/g, '&'), img: a('src'), alt: a('alt'), loading: a('loading'), decoding: a('decoding'),
      title: body.match(/<b>([\s\S]*?)<\/b>/)[1], line: unent((body.match(/<\/b><span>([\s\S]*?)<\/span>/) || [])[1] || '') };
  });
export const throughLines = html => [...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bdata-showcase-throughline\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => unent(m[2]));
