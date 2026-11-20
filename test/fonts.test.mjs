// The fonts render as 0.1.0-p8's did (README "Fonts"). p8 linked Google Fonts for exactly the faces its request named
// (expected.mjs GOOGLE_FONTS_HEAD, the head p8 shipped); the theme self-hosts them, so the faces fonts.css declares must
// resolve every weight a page asks for to the face p8's request resolved, at the weight p8 drew. A face the request
// did not offer is a page that renders differently: a variable Fraunces declared 100–900 draws a true 400 where p8 drew
// its 400 text with the 500 face. The files are pinned by sha256: each was measured headless, at every weight and in
// both styles, to the text widths p8's Google files give; a changed file is a new measurement, not a refresh.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fontsCss, FONT_FILES, FONTS_DIR } from '../src/chrome.mjs';
import { tokensCss } from '../src/tokens.mjs';
import { loadPartials } from '../src/partials.mjs';
import { GOOGLE_FONTS_HEAD } from './lib/expected.mjs';

/** p8's faces, read off its Google Fonts request: family → [{style, lo, hi}] (a requested weight is a one-weight face). */
export function requestFaces(head) {
  const href = head.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  const faces = {};
  for (const fam of new URL(href).searchParams.getAll('family')) {
    const [name, spec = 'wght@400'] = fam.split(':');
    const [axesS, tuplesS] = spec.split('@');
    const axes = axesS.split(',');
    const wi = axes.indexOf('wght'), ii = axes.indexOf('ital');
    faces[name] = tuplesS.split(';').map(t => {
      const v = t.split(',');
      const w = wi < 0 ? 400 : Number(v[wi]);
      return { style: ii >= 0 && v[ii] === '1' ? 'italic' : 'normal', lo: w, hi: w };
    });
  }
  return faces;
}

/** The faces a CSS declares: family → [{style, lo, hi, src}], one per @font-face rule. */
export function cssFaces(css) {
  const faces = {};
  for (const [, body] of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const d = k => (body.match(new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
    const family = d('font-family').replace(/^["']|["']$/g, '');
    const w = (d('font-weight') || '400').split(/\s+/).map(Number);
    (faces[family] ||= []).push({ style: d('font-style') || 'normal', lo: w[0], hi: w[w.length - 1], src: d('src') });
  }
  return faces;
}

/**
 * CSS Fonts 4 §5.2 font matching, style then weight: the face a desired (style, weight) resolves to among a family's
 * faces, and the weight it is drawn at (the desired weight clamped into the face's range: a variable file declared at
 * one weight draws that weight). Returns "<style> <lo>[-<hi>] @<drawn>".
 */
export function resolve(faces, style, weight) {
  const order = style === 'italic' ? ['italic', 'oblique', 'normal'] : ['normal', 'oblique', 'italic'];
  const s = order.find(o => faces.some(f => f.style === o));
  const set = faces.filter(f => f.style === s);
  const within = set.find(f => f.lo <= weight && weight <= f.hi);
  let pick = within;
  if (!pick) {
    const below = set.filter(f => f.hi < weight).sort((a, b) => b.hi - a.hi);
    const above = set.filter(f => f.lo > weight).sort((a, b) => a.lo - b.lo);
    if (weight >= 400 && weight <= 500) pick = above.find(f => f.lo <= 500) || below[0] || above[0];
    else if (weight < 400) pick = below[0] || above[0];
    else pick = above[0] || below[0];
  }
  const drawn = Math.min(Math.max(weight, pick.lo), pick.hi);
  return `${s} ${pick.lo}${pick.hi === pick.lo ? '' : `-${pick.hi}`} @${drawn}`;
}

/** Every font-weight the theme's own CSS and markup ask for (tokens.css, the login and form CSS, every partial). */
export function usedWeights() {
  const P = loadPartials();
  const texts = [tokensCss(), P.loginCss, P.formsCss, P.head, P.nav, P.hero, P.footer, P.login, ...Object.values(P.sections)];
  const words = { normal: 400, bold: 700 };
  const out = new Set();
  for (const t of texts) {
    if (/(?:^|[;{\s"'])font\s*:/.test(t)) throw new Error('the theme CSS uses the font shorthand: read its weight here before it ships');
    for (const [, v] of t.matchAll(/font-weight\s*:\s*([^;}"'!]+)/g)) {
      const w = /^\d+$/.test(v.trim()) ? Number(v.trim()) : words[v.trim()];
      if (!w) throw new Error(`font-weight "${v.trim()}" is not a number, normal or bold: the gate cannot resolve it`);
      out.add(w);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The resolution table: "<family> <style> <weight>" → the face it resolves to, for every family p8 requested. */
export function resolutionTable(faces, families, weights) {
  const t = {};
  for (const fam of families) for (const style of ['normal', 'italic']) for (const w of weights) {
    t[`${fam} ${style} ${w}`] = faces[fam] ? resolve(faces[fam], style, w) : 'no face';
  }
  return t;
}

const P8 = requestFaces(GOOGLE_FONTS_HEAD);
const FAMILIES = Object.keys(P8).sort();
const WEIGHTS = () => [...new Set([100, 200, 300, 400, 500, 600, 700, 800, 900, ...usedWeights()])].sort((a, b) => a - b);

// The bytes measured equal to p8's rendering (headless Chromium, 20px samples, weights 100–900, normal and italic).
const MEASURED = Object.freeze({
  'IBMPlexMono-Medium-Latin1.woff2': '41201b658a328b9d',
  'IBMPlexMono-Medium-Latin2.woff2': '86208dbe8e00256a',
  'IBMPlexMono-Medium-Latin3.woff2': 'a90d0ca2314298c0',
  'IBMPlexMono-Regular-Latin1.woff2': 'e8993d946649b9d0',
  'IBMPlexMono-Regular-Latin2.woff2': '8c5e48e4c6ee6034',
  'IBMPlexMono-Regular-Latin3.woff2': '1ff2d301f841079f',
  'IBMPlexSansVar-Roman-Latin1.woff2': 'c9b893129ff599a5',
  'IBMPlexSansVar-Roman-Latin2.woff2': '9c3d087733ab5cba',
  'IBMPlexSansVar-Roman-Latin3.woff2': 'a8e4b2fd8c612da7',
  'fraunces-latin-ext-opsz-normal.woff2': 'a2930b27d13a228b',
  'fraunces-latin-opsz-normal.woff2': '7234ed860a9cc830',
  'fraunces-vietnamese-opsz-normal.woff2': 'f18853f63a870ebe',
});

test('fonts: p8\'s request reads as the faces it offered (the ground the gate below compares to)', () => {
  assert.deepEqual(Object.fromEntries(FAMILIES.map(f => [f, P8[f].map(x => `${x.style} ${x.lo}`)])), {
    Fraunces: ['normal 300', 'normal 500', 'normal 600'],
    'IBM Plex Mono': ['normal 400', 'normal 500'],
    'IBM Plex Sans': ['normal 400', 'normal 500', 'normal 600'],
  });
  assert.ok(usedWeights().length > 0, 'the theme CSS asks for weights');
});

test('fonts: every family and weight a page asks for resolves to the face p8 resolved, drawn at p8\'s weight', () => {
  const ours = cssFaces(fontsCss());
  assert.deepEqual(Object.keys(ours).sort(), FAMILIES, 'fonts.css declares exactly p8\'s families');
  const want = resolutionTable(P8, FAMILIES, WEIGHTS());
  const got = resolutionTable(ours, FAMILIES, WEIGHTS());
  const diff = Object.keys(want).filter(k => want[k] !== got[k]).map(k => `${k}: p8 ${want[k]}, fonts.css ${got[k]}`);
  assert.deepEqual(diff, [], `faces that render differently from p8:\n${diff.join('\n')}`);
});

test('fonts: the gate is red on a face p8 did not offer (a variable Fraunces declared 100 900, as 0.2.0-p1 at 897375d shipped)', () => {
  const planted = fontsCss().replace(/(font-family:"Fraunces";font-style:normal;font-weight:)\d+/g, '$1100 900');
  const t = resolutionTable(cssFaces(planted), FAMILIES, WEIGHTS());
  const want = resolutionTable(P8, FAMILIES, WEIGHTS());
  assert.equal(want['Fraunces normal 400'], 'normal 500 @500');
  assert.equal(t['Fraunces normal 400'], 'normal 100-900 @400');
  // and on an italic face p8 did not offer (p8 synthesised italic from the upright face)
  const italic = cssFaces(`${fontsCss()}@font-face{font-family:"IBM Plex Sans";font-style:italic;font-weight:400;src:url(fonts/x.woff2)}`);
  assert.notEqual(resolve(italic['IBM Plex Sans'], 'italic', 400), want['IBM Plex Sans italic 400']);
});

test('fonts: the files are the ones measured equal to p8 (a new file is a new measurement)', () => {
  const woff2 = FONT_FILES.filter(f => f.endsWith('.woff2'));
  assert.deepEqual(Object.keys(MEASURED).sort(), woff2);
  for (const f of woff2) {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(FONTS_DIR, f))).digest('hex').slice(0, 16);
    assert.equal(sha, MEASURED[f], f);
  }
});
