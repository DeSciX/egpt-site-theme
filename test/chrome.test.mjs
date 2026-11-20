// The chrome (README "Chrome"): ./chrome renderChrome is the one renderer of the theme CSS (fonts, tokens, the app's
// CSS, the login CSS), the header and the footer; buildPage renders its chrome through it, so a page an app writes with
// its own generator carries the same strings. The fonts are self-hosted: no head the theme ships, and no head a build
// writes, loads anything from another origin. Every gate below is shown red on a planted fault.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { world, spec, THEME } from './lib/world.mjs';
import { renderChrome, normalizeChrome, fontsCss, FONT_FILES, FONTS_DIR, FONTS_OUT, CHROME_KEYS } from '../src/chrome.mjs';
import { loadPartials } from '../src/partials.mjs';
import { tokensCss } from '../src/tokens.mjs';
import { assertTheme, assertPage, assertNoRemote, REMOTE_REF } from '../src/gates.mjs';
import { normalizeCopy, COPY_SCHEMA, REFUSED_SLOTS } from '../src/copy.mjs';
import { normalizeSpec } from '../src/spec.mjs';
import { pageOutputs, THEME_VERSION } from '../src/page.mjs';

const COPY = normalizeCopy(null);
const CHROME = {
  brand: { name: 'Brand & Co', tag: 'the tag' },
  nav: [{ text: 'One', href: '#one' }, { text: 'Out', href: 'https://example.org/x?a=1&b=2' }, { text: 'Go →', href: '#go', class: 'mono', style: 'color:var(--cyan)' }],
  footer: { name: 'Foot', tag: 'foot tag', links: [{ text: 'Home', href: '#top' }, { html: '<b>Bold</b>', href: 'https://descix.net' }], legal_html: 'Legal <a href="#top">line</a>.' },
};
const APP_CSS = '.x{color:red}';
const specs = { full: spec('https://full.example', [], { ...CHROME, login: true, css: APP_CSS }), plain: spec('https://plain.example', [], CHROME) };
// what renderChrome makes from the same data buildPage gets from the spec (and the copy: the login label)
const chromeFor = name => renderChrome({ ...CHROME, ...(name === 'full' ? { login: COPY['nav.login'], app_css: { name, css: APP_CSS } } : {}) });

/** The differences of a built page directory from renderChrome's strings and files: [] when the page carries them. */
function chromeDiff(out, chrome) {
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const d = [];
  for (const [what, s] of [['css', `<style>\n${chrome.css}`], ['nav', chrome.nav], ['footer', chrome.footer]]) if (html.split(s).length !== 2) d.push(what);
  for (const [rel, data] of chrome.files) if (!fs.existsSync(path.join(out, rel)) || !fs.readFileSync(path.join(out, rel)).equals(data)) d.push(rel);
  return d;
}

let W;
const w = () => (W = W || world({ specs }));

test('buildPage renders its chrome through renderChrome: the page carries renderChrome\'s css, header and footer exactly, and writes its font files', () => {
  for (const name of ['full', 'plain']) {
    const r = w().build(name);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(chromeDiff(r.out, chromeFor(name)), [], name);
  }
  const full = chromeFor('full');
  assert.match(full.nav, /<\/div>\n  <a class="btn btn-primary btn-sm" id="descix-login" href="https:\/\/descix\.net\/">Log in with Powch<\/a>\n<\/div><\/nav>$/, 'the login button: in the header, after the links');
  assert.ok(full.css.indexOf(`/* full */\n${APP_CSS}`) > full.css.indexOf(':root{') && full.css.indexOf(`/* full */`) < full.css.indexOf('/* login */'), 'tokens, then the app\'s CSS, then the login CSS');
  assert.ok(!chromeFor('plain').nav.includes('descix-login') && !chromeFor('plain').css.includes('/* login */'));
  assert.ok(full.nav.includes('<b>Brand &amp; Co</b>') && full.nav.includes('href="https://example.org/x?a=1&amp;b=2" target="_blank" rel="noopener"'), 'text and hrefs escaped; an http link opens a new tab');
  assert.ok(full.footer.includes('<a href="https://descix.net" target="_blank" rel="noopener"><b>Bold</b></a>') && full.footer.includes('<p class="legal">Legal <a href="#top">line</a>.</p>'));
});

test('negative control: a page whose chrome differs from renderChrome\'s fails the comparison (planted in the page, and planted as a second derivation in buildPage)', () => {
  const r = w().build('full');
  const chrome = chromeFor('full');
  // (a) the page: one header byte, one CSS byte, one font file
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-chrome-'));
  fs.cpSync(r.out, T, { recursive: true });
  const f = path.join(T, 'index.html'), html = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, html.replace('<b>Brand &amp; Co</b>', '<b>Brand &amp; Co.</b>'));
  assert.deepEqual(chromeDiff(T, chrome), ['nav']);
  fs.writeFileSync(f, html.replace('--gold:#e5b95a', '--gold:#e5b95b'));
  assert.deepEqual(chromeDiff(T, chrome), ['css']);
  fs.writeFileSync(f, html);
  fs.appendFileSync(path.join(T, FONTS_OUT, FONT_FILES[0]), 'x');
  assert.deepEqual(chromeDiff(T, chrome), [`${FONTS_OUT}/${FONT_FILES[0]}`]);
  // (b) a copy of the package whose buildPage re-derives its header by hand instead of taking renderChrome's
  const P = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-plant-'));
  for (const d of ['src', 'bin']) fs.cpSync(path.join(THEME, d), path.join(P, d), { recursive: true });
  fs.copyFileSync(path.join(THEME, 'package.json'), path.join(P, 'package.json'));
  fs.symlinkSync(path.join(THEME, 'node_modules'), path.join(P, 'node_modules'));
  const page = path.join(P, 'src', 'page.mjs'), src = fs.readFileSync(page, 'utf8');
  const planted = src.replace('const navOut = chrome.nav;', "const navOut = chrome.nav.replace('<nav class=\"nav\">', '<nav class=\"nav\" data-own>');");
  assert.notEqual(planted, src, 'the plant reached buildPage');
  fs.writeFileSync(page, planted);
  const out = path.join(P, 'out');
  const b = spawnSync(process.execPath, [path.join(P, 'bin', 'egpt-site-theme.mjs'), 'build', path.join(w().app, 'full.json'), '--out', out], { encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  assert.deepEqual(chromeDiff(out, chrome), ['nav'], 'the planted second derivation is caught');
});

test('one renderer: only ./chrome reads the header, footer and login partials and the login CSS (the theme gate reads every partial to check it)', () => {
  const owners = {};
  for (const f of fs.readdirSync(path.join(THEME, 'src')).filter(f => f.endsWith('.mjs') && f !== 'gates.mjs')) {
    const js = fs.readFileSync(path.join(THEME, 'src', f), 'utf8');
    if (/\bpartials\.(?:nav|footer|login|loginCss)\b/.test(js)) owners[f] = true;
  }
  assert.deepEqual(Object.keys(owners), ['chrome.mjs']);
});

test('chrome data: normalizeChrome refuses an unknown key, a missing part and a malformed link; the spec\'s "template" chrome is removed, naming the data', () => {
  assert.doesNotThrow(() => normalizeChrome(CHROME));
  assert.deepEqual(Object.keys(CHROME_KEYS), ['brand', 'nav', 'footer', 'login', 'app_css']);
  assert.throws(() => normalizeChrome({ ...CHROME, logo: 'x' }), /unknown chrome key "logo"/);
  assert.throws(() => normalizeChrome({ ...CHROME, brand: { name: 'x' } }), /brand is \{name, tag\}/);
  assert.throws(() => normalizeChrome({ ...CHROME, nav: [{ text: 'x' }] }), /nav\[0\]: a link needs an href/);
  assert.throws(() => normalizeChrome({ ...CHROME, nav: [{ text: 'x', href: '#x', target: '_self' }] }), /unknown link key "target"/);
  assert.throws(() => normalizeChrome({ ...CHROME, footer: { ...CHROME.footer, legal_html: '' } }), /footer\.legal_html is a non-empty string/);
  assert.throws(() => normalizeChrome({ ...CHROME, login: true }), /login is the button's label/);
  assert.throws(() => normalizeChrome({ ...CHROME, app_css: '.x{}' }), /app_css is \{name, css\}/);
  const base = spec('https://t.example', []);
  for (const k of ['brand', 'nav', 'footer']) assert.throws(() => normalizeSpec({ ...base, [k]: 'template' }, 't'), new RegExp(`t\\.json: ${k} "template" is removed: .*brand \\{name, tag\\}, nav \\[`));
  assert.throws(() => normalizeSpec({ ...base, nav: [{ text: 'x' }] }, 't'), /t\.json nav\[0\]: a link needs an href/);
});

test('the header and footer copy slots are removed: an override that names one refuses, naming the chrome data that replaced it', () => {
  assert.equal(Object.keys(REFUSED_SLOTS).length, 21, 'nav.b, nav.span, nav.a.1-6, nav.mono, footer.b, footer.span, footer.a.1-9, footer.legal');
  assert.throws(() => normalizeCopy({ schema: COPY_SCHEMA, slots: { 'nav.b': 'DeSciX' } }, 'c.json'), /c\.json: slot nav\.b was removed; its replacement is the spec's brand\.name/);
  assert.throws(() => normalizeCopy({ schema: COPY_SCHEMA, slots: { 'footer.a.9': 'x' } }, 'c.json'), /footer\.links/);
  const P = loadPartials();
  for (const p of [P.nav, P.footer, P.login]) assert.ok(!/\{\{slot:/.test(p), 'the chrome partials carry no copy slot');
});

test('no shipped head references a third-party origin: the head partial and every CSS the theme ships; a built page\'s head is refused when it does', async () => {
  const P = loadPartials();
  const shipped = { 'head.html': P.head, 'fonts.css': fontsCss(), 'tokens.css': tokensCss(), 'login.css': P.loginCss, 'forms.css': P.formsCss, 'renderChrome css': chromeFor('full').css };
  for (const [name, text] of Object.entries(shipped)) assert.doesNotThrow(() => assertNoRemote(text, name), name);
  assert.doesNotThrow(() => assertTheme(P, chromeFor('full').css));
  // the gate is a gate: the googleapis link the head carried until 0.1.0-p8, and other remote forms, are refused
  const google = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces&display=swap">';
  assert.throws(() => assertTheme({ ...P, head: P.head.replace('<style>', `${google}\n<style>`) }, tokensCss()), /the head references another origin \("href=\\"https:\/\/fonts\.googleapis\.com/);
  for (const bad of ['@import url("https://fonts.googleapis.com/css2?family=X");', '@font-face{src:url(//cdn.example/x.woff2)}', '@import "https://cdn.example/x.css";'])
    assert.throws(() => assertTheme(P, `${bad}\n${tokensCss()}`), /the theme CSS references another origin/, bad);
  for (const ok of ['src:url(fonts/x.woff2)', 'href="#top"', 'href="images/a.png"', 'background:url(images/a.png)', '@import "local.css";']) assert.doesNotMatch(ok, REMOTE_REF, ok);
  // a build whose head would load from Google (the app's CSS here) refuses, naming the page's head
  const W2 = world({ specs: { remote: spec('https://remote.example', [], { css: '@import url("https://fonts.googleapis.com/css2?family=X");' }) } });
  const r = W2.build('remote');
  assert.equal(r.code, 1);
  assert.match(r.err, /remote\.json app_css references another origin \("url\(\\"https:\/\/fonts\.googleapis\.com/);
  // assertPage holds the assembled head to it too: the built page passes, the same page with the googleapis link planted
  // in its head refuses
  const built = w().build('full').html;
  const ctx = { app: 'full', theme: THEME_VERSION, build: built.match(/data-frontpage-build="([0-9a-f]+)"/)[1], spec: normalizeSpec(specs.full, 'full'), copy: COPY, roster: null, columns: 3 };
  assert.doesNotThrow(() => assertPage(built, ctx));
  const plantedPage = built.replace('<style>\n', `${google}\n<style>\n`);
  assert.notEqual(plantedPage, built);
  assert.throws(() => assertPage(plantedPage, ctx), /full: the page's <head> references another origin \("href=\\"https:\/\/fonts\.googleapis\.com/);
  // and every page a build writes passed it: the head of the full page names fonts/ only
  const head = built.split('</head>')[0];
  assert.ok(!/googleapis|gstatic/.test(head));
  assert.ok((head.match(/url\(fonts\/[^)]+\.woff2\)/g) || []).length > 0);
  assert.ok((await pageOutputs(THEME)).includes(`${FONTS_OUT}/`));
});

test('fonts: every file fonts.css names is shipped, every shipped font is named, and each family\'s licence (SIL OFL 1.1) ships beside them', () => {
  const css = fontsCss();
  const named = [...css.matchAll(/url\(fonts\/([^)]+)\)/g)].map(m => m[1]);
  const woff2 = FONT_FILES.filter(f => f.endsWith('.woff2'));
  assert.deepEqual([...new Set(named)].sort(), woff2);
  const rules = css.match(/@font-face\s*{[^}]*}/g);
  assert.equal(new Set(rules).size, rules.length, 'no @font-face rule is declared twice (a variable file serves one rule per weight p8 offered: test/fonts.test.mjs)');
  const families = [...new Set([...css.matchAll(/font-family:"([^"]+)"/g)].map(m => m[1]))].sort();
  assert.deepEqual(families, ['Fraunces', 'IBM Plex Mono', 'IBM Plex Sans'], 'the families tokens.css names');
  for (const f of families) assert.ok(tokensCss().includes(`"${f}"`), `tokens.css names ${f}`);
  const lic = { 'OFL-Fraunces.txt': /Copyright 2020 The Fraunces Project Authors/, 'OFL-IBM-Plex.txt': /Copyright © 2017 IBM Corp\. with Reserved Font Name "Plex"/ };
  for (const [f, holder] of Object.entries(lic)) {
    const t = fs.readFileSync(path.join(FONTS_DIR, f), 'utf8');
    assert.match(t, holder, f);
    assert.match(t, /SIL Open Font License, Version 1\.1/, f);
    assert.ok(FONT_FILES.includes(f), `${f} is written beside the fonts`);
  }
  assert.ok(css.startsWith('/* fonts: ') && css.includes('fonts/OFL-Fraunces.txt') && css.includes('fonts/OFL-IBM-Plex.txt'), 'the CSS names the licences');
  for (const f of woff2) assert.equal(fs.readFileSync(path.join(FONTS_DIR, f)).subarray(0, 4).toString('latin1'), 'wOF2', `${f} is a woff2 file`);
});
