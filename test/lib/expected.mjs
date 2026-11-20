// The one comparison of a built page directory with a fixture's expected output (test/fixtures/egpt/expected/<app>/):
// the file set and every file by sha256 (files.json) except the bridge file (the pinned @descix/app-sdk's, below), index.html byte for byte except the one provenance line, and
// share.json byte for byte. Used by test/zero-diff.test.mjs and by scripts/publish-gate.sh's install smoke test.
//
// What is normalised: the head's fonts (unFonts), the one Courant nav link's attribute order on a page planted with the
// Courant chrome (unMono), the proposal forms' regions on a page that carries the licence form (HOOK_REGIONS), and the line `<body data-frontpage-…>` (the generator stamped data-frontpage-template and the
// library's HEAD; the theme stamps data-frontpage-theme, data-frontpage-roster and the app repository's HEAD).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBridgeFile } from '../../src/bridge.mjs';
import { FONT_FILES, FONTS_DIR, FONTS_OUT, fontsCss } from '../../src/chrome.mjs';
import { tokensCss } from '../../src/tokens.mjs';

export const EXPECTED = fileURLToPath(new URL('../fixtures/egpt/expected/', import.meta.url));
// The bridge file is @descix/app-sdk's (SITE_SCAFFOLD_BRIDGE), not the generator's: the fixtures were generated at app-sdk
// 0.6.0, the theme pins its own peer. A built page's bridge is held to the PINNED package's file, byte for byte.
const THEME_DIR = fileURLToPath(new URL('../../', import.meta.url));
/** null when the installed @descix/app-sdk is the version package.json pins as the peer; else what differs. */
export const appSdkPinDrift = (pkg, installed) => (pkg.peerDependencies['@descix/app-sdk'] === installed ? null
  : `@descix/app-sdk ${installed} is installed but package.json pins ${pkg.peerDependencies['@descix/app-sdk']} — run npm ci`);
const PIN = appSdkPinDrift(JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'package.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'node_modules', '@descix', 'app-sdk', 'package.json'), 'utf8')).version);
if (PIN) throw new Error(`the bridge the fixtures are held to is not the pinned one: ${PIN}`);
export const BRIDGE = await loadBridgeFile(THEME_DIR);
const SOURCE = JSON.parse(fs.readFileSync(new URL('../fixtures/egpt/source.json', import.meta.url), 'utf8'));
const specOf = app => JSON.parse(fs.readFileSync(new URL(`../fixtures/egpt/inputs/${SOURCE.dir}/${app}.json`, import.meta.url), 'utf8'));
/** The files a fixture page's build writes: files.json's (the generator's outputs, bridge excluded) and, when the spec
 *  asks for the SDK, the bridge file named by the pinned @descix/app-sdk. */
export const expectedFiles = app => {
  const want = JSON.parse(fs.readFileSync(path.join(EXPECTED, app, 'files.json'), 'utf8'));
  if (BRIDGE.name in want) throw new Error(`fixture: expected/${app}/files.json carries ${BRIDGE.name}; the bridge is @descix/app-sdk's file, not a vendored hash`);
  return { want, files: [...Object.keys(want), ...(specOf(app).scripts.sdk ? [BRIDGE.name] : []), ...FONT_FILES.map(f => `${FONTS_OUT}/${f}`)].sort() };
};
export const STAMP = /^<body data-frontpage-app="[^"]*"[^>\n]*>$/m;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)).map(x => `${e.name}/${x}`) : [e.name])).sort();

// The proposal forms' regions (README "Proposal forms"): the request section and the request-form script. The
// generator's pages predate the intake, so a page carrying the licence form differs from them there and only there.
export const HOOK_REGIONS = Object.freeze([/<section class="sec" id="request">[\s\S]*?<\/section>/, /<script>\n\(function\(\)\{\n(?:  var f=document\.getElementById\('licence-form'\)|  \/\/ The proposal forms)[\s\S]*?<\/script>/]);
// The login button's script: the generator's pages carried the app's own login.js; the theme now writes its own
// (partials/scripts/login.js) in the same place.
// the login CSS (partials/login.css), the generator's one line, the theme's header placement rules
const LOGIN_CSS_REGION = /\n\/\* login \*\/\n[\s\S]*?(?=\n<\/style>)/;
export const LOGIN_REGIONS = Object.freeze([LOGIN_CSS_REGION, /<script>\n\(function\(\)\{\n  \/\/ (?:ONE component: the|The) Powch login button[\s\S]*?<\/script>/]);
// The theme's auth watcher (partials/scripts/auth.js): the generator's pages had none, so a page with the login button
// or the proposal forms carries it as one added script element, before the scripts that consume it. It is taken out of
// the built page (exactly once there, never on the generator's), and its own test holds it (test/auth.test.mjs).
export const AUTH_REGION = /<script>\n\(function\(\)\{\n  \/\/ The theme's auth watcher[\s\S]*?<\/script>\n/;
export const unAuth = (h, on) => {
  const n = (h.match(new RegExp(AUTH_REGION.source, 'g')) || []).length;
  if (n !== (on ? 1 : 0)) throw new Error(`built page: the auth watcher is there ${n} times, wants ${on ? 1 : 0}`);
  return h.replace(AUTH_REGION, '');
};
// The theme CSS's phone-width rules (the end of tokens.css, under /* phone width */: no column or table wider than a
// 320px viewport): every built page carries them once, the generator's none; taken out of the built page.
export const PHONE_CSS_REGION = /\/\* phone width \*\/\n[^\n]*\n/;
export const unPhone = h => {
  const n = (h.match(new RegExp(PHONE_CSS_REGION.source, 'g')) || []).length;
  if (n !== 1) throw new Error(`built page: the phone-width CSS is there ${n} times, wants 1`);
  return h.replace(PHONE_CSS_REGION, '');
};
// The proposal forms' CSS (partials/forms.css), added to the head of a page that carries a form: taken out of the built
// page (exactly once there); its own test holds it (test/request.test.mjs).
export const FORMS_CSS_REGION = /\n\/\* forms \*\/\n[^\n]*\n(?=<\/style>)/;
export const unForms = (h, on) => {
  const n = (h.match(new RegExp(FORMS_CSS_REGION.source, 'g')) || []).length;
  if (n !== (on ? 1 : 0)) throw new Error(`built page: the forms CSS is there ${n} times, wants ${on ? 1 : 0}`);
  return h.replace(FORMS_CSS_REGION, '');
};
// The login button: the generator placed it as the last item inside the nav links; the theme places it in the header
// after them, so it stays when the links collapse at phone width. The built page's button is moved back (it must be
// in the header exactly once) and the login CSS is compared as a region (test/login.test.mjs holds both).
const LOGIN_IN_HEADER = /\n  <\/div>\n  (<a class="btn btn-primary btn-sm" id="descix-login"[^>]*>[^<]*<\/a>)\n<\/div><\/nav>/;
export const unPlaceLogin = (h, on) => {
  const n = (h.match(new RegExp(LOGIN_IN_HEADER.source, 'g')) || []).length;
  if (n !== (on ? 1 : 0)) throw new Error(`built page: the login button is in the header ${n} times, wants ${on ? 1 : 0}`);
  return h.replace(LOGIN_IN_HEADER, '$1\n  </div>\n</div></nav>');
};
// The fonts: the generator's pages linked Google Fonts in the head; the theme self-hosts them (./chrome): the built head
// opens its <style> with fonts.css and the tokens' header line, and writes the font files under fonts/ (held to the
// package's own files below). Each side's form is taken out exactly once.
export const GOOGLE_FONTS_HEAD = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">\n<style>\n';
export const SELF_HOSTED_HEAD = `<style>\n${fontsCss()}${tokensCss().split('\n')[0]}\n`;
const once = (h, from, to, side) => {
  const n = h.split(from).length - 1;
  if (n !== 1) throw new Error(`${side}: ${JSON.stringify(from.slice(0, 60))} is there ${n} times, wants 1`);
  return h.replace(from, () => to);
};
export const unFonts = (h, side = 'built page') => once(h, side === 'built page' ? SELF_HOSTED_HEAD : GOOGLE_FONTS_HEAD, '<style>\n', side);
// The chrome is data (./chrome renderChrome): a page whose vendored spec said "template" gets the Courant chrome data
// (test/fixtures/courant-chrome.json), and the one link the generator wrote class-first is written href-first by the
// one link writer (./chrome linkHtml). The generator's page is moved to that order, exactly once.
export const COURANT_MONO = ['<a class="mono" href="#request" style="color:var(--cyan)">', '<a href="#request" class="mono" style="color:var(--cyan)">'];
/** A fixture page whose vendored spec says "template" for its chrome: the test plants the Courant chrome data in it. */
export const plantedChrome = app => specOf(app).nav === 'template';
export const unMono = h => once(h, COURANT_MONO[0], COURANT_MONO[1], 'generator page');
/** The generator's page and the built page, each with its own known difference taken out (opts as diffOf's). */
export const sidesOf = (a, b, opts = {}) => [
  (opts.chrome ? unMono : x => x)(unFonts(a, 'generator page')).replace(STAMP, '<body>'),
  unPlaceLogin(unForms(unAuth(unPhone(unFonts(b)), opts.hook || opts.login), opts.hook), opts.login).replace(STAMP, '<body>'),
];
const maskWith = (regions, h) => regions.reduce((x, re) => { if (!re.test(x)) throw new Error(`fixture: region ${re} is not on the page`); return x.replace(re, '<!-- region -->'); }, h);
const masked = (h, opts) => [[opts.hook, HOOK_REGIONS], [opts.login, LOGIN_REGIONS]].reduce((x, [on, regions]) => (on ? maskWith(regions, x) : x), h);

// The differences of one app's output directory from its expected files: [] when zero. opts.hook: the page carries
// the licence form; opts.login: the page has the theme login button; index.html is then compared outside those regions
// (each must be present on both sides, and the page must differ from the generator's somewhere).
export function diffOf(app, dir, opts = {}) {
  const exp = path.join(EXPECTED, app);
  const { want, files } = expectedFiles(app);
  const got = walk(dir);
  const d = [];
  if (got.join() !== files.join()) d.push(`file set: missing ${files.filter(f => !got.includes(f))}, extra ${got.filter(f => !files.includes(f))}`);
  for (const f of got.filter(x => files.includes(x))) {
    const bytes = fs.readFileSync(path.join(dir, f));
    if (f === 'index.html') {
      const a = fs.readFileSync(path.join(exp, 'index.html'), 'utf8'), b = bytes.toString('utf8');
      if ((b.match(new RegExp(STAMP.source, 'gm')) || []).length !== 1) d.push('index.html: the stamp line is not there exactly once');
      const [ea, eb] = sidesOf(a, b, { ...opts, chrome: plantedChrome(app) });
      if (masked(ea, opts) !== masked(eb, opts)) d.push('index.html');
      if (sha(Buffer.from(a)) !== want[f]) d.push('fixture: expected/index.html is not the file files.json hashes');
      if ((opts.hook || opts.login) && a === b) d.push('index.html: the hook regions are the generator\'s (the hook did not reach the page)');
    } else if (f === BRIDGE.name) { if (!bytes.equals(BRIDGE.data)) d.push(`${f} (not the pinned @descix/app-sdk bridge)`);
    } else if (f.startsWith(`${FONTS_OUT}/`)) { if (!bytes.equals(fs.readFileSync(path.join(FONTS_DIR, f.slice(FONTS_OUT.length + 1))))) d.push(`${f} (not the theme's font file)`);
    } else if (sha(bytes) !== want[f]) d.push(f);
  }
  if (fs.existsSync(path.join(exp, 'share.json')) && !fs.readFileSync(path.join(exp, 'share.json')).equals(fs.readFileSync(path.join(dir, 'share.json')))) d.push('share.json');
  return d;
}

// The stamp line a build of <app> must carry.
export const stampFor = ({ app, theme, roster, build }) =>
  `<body data-frontpage-app="${app}" data-frontpage-theme="${theme}" data-frontpage-roster="${roster}" data-frontpage-build="${build}">`;
