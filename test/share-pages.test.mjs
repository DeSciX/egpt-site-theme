// Per-view share cards (README "Per-view share cards"): share.pages is ferried into share.json and every rule refuses at
// build, naming the slug and the field. The rules are read from ./share's exports, never restated here.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { THEME, FIXTURE_DIR, world, spec } from './lib/world.mjs';
import { loadShareContract, shareJson, validatePages, PAGES_KEY, PAGE_SLUG, PAGES_MAX, RESERVED_SLUGS, PAGE_FIELDS, PAGE_TO_FORBIDDEN, PAGE_TO_BASE } from '../src/share.mjs';

const C = await loadShareContract(THEME);
const block = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'egpt.json'), 'utf8')).share;
const good = { title: 'The library', description: 'Every source, one shelf.', image: 'images/share/share-1200x630.png', to: '#library' };
const max = n => PAGE_FIELDS.find(f => f.name === n).max;

test('pages: ferried into share.json, each page in PAGE_FIELDS order; the platform contract does not list it yet', () => {
  // The tripwire: the theme's interim copy of the edge's rules (./share PAGE_FIELDS, PAGE_SLUG, RESERVED_SLUGS, …) is
  // deleted when @descix/app-sdk's share contract exports them; this fails that day.
  assert.ok(!C.SHARE_CONTRACT.some(f => f.name === PAGES_KEY), 'the pinned @descix/app-sdk/share lists pages: the theme copy must go');
  const j = shareJson('t', { ...block, pages: { library: { to: '/library.html', title: 't', description: 'd' } } }, C);
  assert.deepEqual(Object.keys(j.pages.library), PAGE_FIELDS.map(f => f.name).filter(n => n !== 'image'));
  assert.ok(!('pages' in shareJson('t', block, C)), 'no block, no key');
});

test('pages: the planted faults refuse, naming slug and field', () => {
  const v = pages => () => validatePages('t', pages);
  assert.doesNotThrow(v({ library: good }));
  for (const r of RESERVED_SLUGS) assert.throws(v({ [r]: good }), new RegExp(`share\\.pages\\.${r.replace('.', '\\.')}: "${r.replace('.', '\\.')}" is a reserved slug`));
  // Community, .well-known and __descix already fail PAGE_SLUG; the reserved check names them first.
  for (const r of ['Community', '.well-known', '__descix']) assert.ok(RESERVED_SLUGS.includes(r) && !PAGE_SLUG.test(r), r);
  // exact and case-sensitive, as the edge matches: these are served as pages there, so they pass here
  for (const s of ['community', 'preview-2', 'api-docs', 'demos']) assert.doesNotThrow(v({ [s]: good }), s);
  assert.throws(v({ preview: good }), /"preview" is a reserved slug/);
  assert.throws(v({ api: good }), /share\.pages\.api: "api" is a reserved slug/);
  const { description, ...noDesc } = good;
  assert.throws(v({ library: noDesc }), /share\.pages\.library\.description is required/);
  assert.throws(v({ library: { ...good, to: '//x' } }), /share\.pages\.library\.to "\/\/x" must start with '#' or a single '\/'/);
  for (const bad of ['assets/x.png', '/images/x.png', 'https://cdn.example/x.png', '../x.png', 'images/../x.png']) {
    assert.throws(v({ library: { ...good, image: bad } }), /share\.pages\.library\.image .* never under assets\//, bad);
  }
});

test('pages: slug pattern, count, lengths, unknown fields', () => {
  const v = pages => () => validatePages('t', pages);
  for (const s of ['Library', '-x', 'a_b', 'x'.repeat(65)]) { assert.ok(!PAGE_SLUG.test(s)); assert.throws(v({ [s]: good }), /does not match/, s); }
  assert.ok(PAGE_SLUG.test('x'.repeat(64)));
  const many = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, good]));
  assert.doesNotThrow(v(many(PAGES_MAX)));
  assert.throws(v(many(PAGES_MAX + 1)), new RegExp(`has ${PAGES_MAX + 1} pages; at most ${PAGES_MAX}`));
  const ofLength = (name, n) => { const pre = { to: '#', image: 'images/' }[name] || ''; return pre + 'x'.repeat(n - pre.length); };
  for (const f of PAGE_FIELDS) {
    assert.doesNotThrow(v({ a: { ...good, [f.name]: ofLength(f.name, f.max) } }), `${f.name} at ${f.max}`);
    assert.throws(v({ a: { ...good, [f.name]: ofLength(f.name, f.max + 1) } }), new RegExp(`\\.${f.name} is ${f.max + 1} characters; at most ${max(f.name)}`));
  }
  assert.throws(v({ a: { ...good, href: '#x' } }), /unknown field "href"/);
  assert.throws(v([]), /share\.pages is an object/);
});

test('pages: an image must be a file the build writes into the bundle', () => {
  const share = path.join(FIXTURE_DIR, 'egpt', 'share');
  const w = world({ specs: {
    card: spec('https://card.example', [], { share: { ...block, pages: { lib: good } } }),
    stray: spec('https://stray.example', [], { share: { ...block, pages: { lib: { ...good, image: 'images/nowhere.png' } } } }),
  } });
  for (const f of fs.readdirSync(share)) for (const a of ['card', 'stray']) { fs.mkdirSync(path.join(w.app, a, 'share'), { recursive: true }); fs.copyFileSync(path.join(share, f), path.join(w.app, a, 'share', f)); }
  w.commit();
  const ok = w.build('card');
  assert.equal(ok.code, 0, ok.err);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ok.out, 'share.json'), 'utf8')).pages, { lib: good });
  const bad = w.build('stray');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /image "nowhere\.png" is neither a theme image nor declared in the spec/);
});

test('pages: a card image declared in the spec is copied into the bundle; a declared image no card or page uses refuses', () => {
  const share = path.join(FIXTURE_DIR, 'egpt', 'share');
  const card = { ...good, image: 'images/letter-card.png' };
  const img = [{ from: 'frontpage:art/letter-card.png', to: 'images/letter-card.png' }];
  const w = world({ specs: {
    used: spec('https://used.example', [], { images: img, share: { ...block, pages: { letter: card } } }),
    unused: spec('https://unused.example', [], { images: img, share: { ...block, pages: { letter: good } } }),
  } });
  fs.mkdirSync(path.join(w.app, 'art'), { recursive: true });
  fs.writeFileSync(path.join(w.app, 'art', 'letter-card.png'), 'PNG-BYTES-OF-THE-CARD');
  for (const a of ['used', 'unused']) { fs.mkdirSync(path.join(w.app, a, 'share'), { recursive: true }); for (const f of fs.readdirSync(share)) fs.copyFileSync(path.join(share, f), path.join(w.app, a, 'share', f)); }
  w.commit();
  const ok = w.build('used');
  assert.equal(ok.code, 0, ok.err);
  assert.ok(!ok.html.includes('letter-card.png'), 'the page body never shows the card image');
  assert.equal(fs.readFileSync(path.join(ok.out, 'images', 'letter-card.png'), 'utf8'), 'PNG-BYTES-OF-THE-CARD', 'the card image is in the bundle');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ok.out, 'share.json'), 'utf8')).pages.letter.image, 'images/letter-card.png');
  const bad = w.build('unused');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /spec declares an unused image: letter-card\.png \(neither the page nor a share\.pages card references it\)/);
  assert.equal(bad.html, null);
});

test('pages.to: the edge parser\'s rule — its character regex, written dot segments (plain or %2e), the resolved path never \'//\'', () => {
  const v = to => () => validatePages('t', { library: { ...good, to } });
  const CH = /carries a backslash, whitespace or control character/, DOT = /has the dot segment/, SL = /resolves to the path "\/\/[^"]*", which starts with '\/\/'/;
  // the character regex, one export, the edge's literally
  assert.equal(PAGE_TO_FORBIDDEN.source, '[\\s\\u0000-\\u001f\\u007f\\\\]');
  for (const c of ['\\', ' ', '\t', '\u0007', ' ', ' ', '\u007f']) assert.throws(v(`/x${c}`), CH, JSON.stringify(c));
  assert.throws(v('/\\evil.example/x'), CH);
  assert.throws(v('/a b'), CH);
  assert.throws(v('#a\tb'), CH);
  for (const c of ['\u0085', '​']) assert.doesNotThrow(v(`/x${c}`), `accepted as the edge accepts: ${JSON.stringify(c)}`);
  // the URL-API resolution: an encoded dot pair that resolves the path to '//' (WHATWG: pathname "//evil.example")
  assert.equal(new URL('/x/%2e%2e//evil.example', PAGE_TO_BASE).pathname, '//evil.example');
  assert.throws(v('/x/%2e%2e//evil.example'), SL);
  // dot segments as written, every mix of '.' and %2e/%2E
  assert.throws(v('/x/../..//evil.example'), SL);
  for (const to of ['/%2e%2e/x', '/x/%2E%2e/y#a', '/x/.%2e/y', '/%2e./x', '/%2E/x', '/./x', '/..', '/x/.']) assert.throws(v(to), DOT, to);
  for (const to of ['//x', 'https://evil.example/', 'javascript:x', 'mailto:a@b']) assert.throws(v(to), /must start with '#' or a single '\/'/, to);
  for (const ok of ['/@evil.example', '/%2F%2Fevil.example/x', '/%2fx', '/%5Cx', '/x//y', '/a.b/c..d', '/%2e%2ex', '/x.%2e', '#..', '/x?u=../y', '/x#/../..', '/']) assert.doesNotThrow(v(ok), ok);
});

// The edge refuses '/<k>?q' and '/<k>#f' too: DEVPLANE measured '/letter?x=1' and '/letter#a' REFUSED at PR #123 head ec07311.
test('pages.to: no card sends to a card — /<k> or /<k>/ (any query or fragment, refused at the edge as measured at ec07311) for any key of slug shape, its own and an invalid entry\'s included', () => {
  const LOOP = k => new RegExp(`is the path of the page "${k}"`);
  const v = (to, more = {}) => () => validatePages('t', { letter: { ...good, to }, ...more });
  for (const to of ['/letter', '/letter/', '/letter?x=1', '/letter#a']) assert.throws(v(to), LOOP('letter'), to);
  assert.throws(v('/scene', { scene: { title: 'only a title' } }), LOOP('scene'), 'an invalid entry of slug shape still owns its path');
  assert.throws(v('/scene/', { scene: good }), LOOP('scene'));
  for (const to of ['/letter/x', '/letters', '/Letter', '/x/letter']) assert.doesNotThrow(v(to), to);
  assert.doesNotThrow(() => validatePages('t', { letter: { ...good, to: '/library' } }), 'a path no key owns');
});
