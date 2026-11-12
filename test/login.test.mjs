// The login button's behaviour is the theme's (partials/scripts/login.js): placed when the spec sets "login": true, its
// signed-in label is the nav.login.signedin copy slot, and an app script that still drives #descix-login refuses.
// The script runs in node:vm with the theme's auth watcher against stub buses: its label follows the watcher's state, a
// click opens Powch once Powch is on the bus, and it is a plain link before that and outside the shell.
import test from 'node:test';
import assert from 'node:assert';
import { stubBus, runScripts, settle, authScriptOf } from './lib/bus.mjs';
import { world, spec } from './lib/world.mjs';
import { COPY_SCHEMA } from '../src/copy.mjs';
import { unPlaceLogin } from './lib/expected.mjs';

const S = (extra = {}) => spec('https://login.example', [], { login: true, nav: 'template', brand: 'template', ...extra });
const scriptOf = html => html.match(/<script>\n(\(function\(\)\{\n  \/\/ The Powch login button[\s\S]*?)\n<\/script>/)[1];

// Runs the page's auth watcher and login script against one stub bus (test/lib/bus.mjs); returns the button.
async function run(html, bus) {
  const btn = { textContent: 'Log in with Powch', listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
  const r = runScripts([authScriptOf(html), scriptOf(html)], { bus, globals: { document: { getElementById: id => (id === 'descix-login' ? btn : null) } } });
  await settle();
  const click = () => { let prevented = 0; btn.listeners.click({ preventDefault() { prevented++; } }); return prevented; };
  return { btn, click, ...r };
}

test('login: true places the theme login script with the signed-in copy; an override reaches it; an app login script refuses', () => {
  const w = world({ specs: { plain: S(), over: S({ copy: 'over.copy.json' }), dup: S({ scripts: { extra: ['mine.js'] } }) }, files: {
    'over.copy.json': JSON.stringify({ schema: COPY_SCHEMA, slots: { 'nav.login.signedin': 'Signed in </script>' } }),
    'mine.js': "document.getElementById('descix-login');",
  } });
  const plain = w.build('plain');
  assert.equal(plain.code, 0, plain.err);
  assert.ok(scriptOf(plain.html).includes('var L={"signedIn":"Logged In"};'));
  const over = w.build('over');
  assert.equal(over.code, 0, over.err);
  assert.ok(scriptOf(over.html).includes('var L={"signedIn":"Signed in \\u003c/script>"};'), 'the override lands, a closing script tag cannot');
  const dup = w.build('dup');
  assert.equal(dup.code, 1);
  assert.match(dup.err, /mine\.js drives #descix-login; the theme's login script owns the login button's behaviour/);
  const none = w.build('other');
  assert.equal(none.code, 0, none.err);
  assert.ok(!/The Powch login button/.test(none.html), 'no login button, no login script');
});

test('the login script takes the sign-in state from the auth watcher: the label follows it; a click opens Powch once Powch is on the bus, and is a plain link before and outside', async () => {
  const w = world({ specs: { plain: S() } });
  const html = w.build('plain').html;
  // (a) Powch on the bus at ready(): the replay, then a sign-in and a sign-out
  const bus = stubBus({ signedIn: false });
  const a = await run(html, bus);
  assert.equal(a.btn.textContent, 'Log in with Powch', 'signed out: the markup label');
  bus.auth({ signedIn: true, address: '0xabc' });
  assert.equal(a.btn.textContent, 'Logged In', 'signed in: the slot');
  bus.auth({ signedIn: false, address: null });
  assert.equal(a.btn.textContent, 'Log in with Powch', 'signed out again');
  assert.equal(a.click(), 1, 'the link is taken over');
  assert.equal(bus.logins.length, 1, 'a click opens Powch');
  // (b) Powch arrives later: before, the button is the link; after DESCX_BRIDGE_READY, it opens Powch
  const late = stubBus({ powch: 'late', signedIn: true });
  const b = await run(html, late);
  assert.equal(b.click(), 0, 'before Powch: a plain link');
  assert.equal(late.logins.length, 0);
  assert.equal(b.btn.textContent, 'Log in with Powch');
  late.arrive();
  assert.equal(b.btn.textContent, 'Logged In', 'Powch arrived signed in: the replay');
  assert.equal(b.click(), 1);
  assert.equal(late.logins.length, 1);
  // outside the shell: a plain link, the label never moves
  for (const o of [null, stubBus({ mode: 'standalone' })]) {
    const c = await run(html, o);
    assert.equal(c.click(), 0);
    assert.equal(c.btn.textContent, 'Log in with Powch');
  }
  // plant: the label ignores the state → red
  const deaf = html.replace('btn.textContent=s.signedIn?L.signedIn:label;', '');
  assert.notEqual(deaf, html);
  const bus2 = stubBus({ signedIn: true });
  const d = await run(deaf, bus2);
  assert.notEqual(d.btn.textContent, 'Logged In', 'the plant: the label does not follow');
});

test('the login button sits in the header after the nav links (which collapse at phone width), never inside them; the login CSS keeps it at the right end at every width', () => {
  const w = world({ specs: { plain: S() } });
  const html = w.build('plain').html;
  const nav = html.match(/<nav class="nav">[\s\S]*?<\/nav>/)[0];
  const links = nav.match(/<div class="navlinks">[\s\S]*?<\/div>/)[0];
  assert.ok(!links.includes('descix-login'), 'not inside the collapsing links');
  assert.match(nav, /<\/div>\n  <a class="btn btn-primary btn-sm" id="descix-login" href="https:\/\/descix\.net\/">Log in with Powch<\/a>\n<\/div><\/nav>$/, 'in the header, after the links');
  assert.equal(html.split('id="descix-login"').length, 2, 'once');
  const css = html.match(/\/\* login \*\/\n([\s\S]*?)\n<\/style>/)[1];
  assert.match(css, /@media \(max-width:820px\)\{#descix-login\{margin-left:auto;flex:none;white-space:nowrap\}\.nav \.brand\{white-space:nowrap\}\.nav \.brand span\{display:none\}\}/,
    'at phone width it takes the right end whole, and the brand keeps one line by dropping its tag');
  assert.match(css, /@media \(max-width:374px\)\{\.nav \.brand b\{font-size:18px\}#descix-login\{padding-inline:12px\}\}$/, 'below 375px the brand and the button tighten to fit a 320px header');
  assert.ok(!/#descix-login[^{]*\{[^}]*display:none/.test(html), 'nothing hides it');
  // the tokens' phone rule hides the links only
  assert.match(html, /@media \(max-width:820px\)\{\.navlinks\{display:none\}\}/);
  // the fixture comparison moves it back exactly once where it belongs
  assert.throws(() => unPlaceLogin(html, false), /in the header 1 times, wants 0/);
  assert.throws(() => unPlaceLogin(unPlaceLogin(html, true), true), /0 times, wants 1/);
  // a page whose spec has no login has no button
  const none = w.build('other');
  assert.ok(!none.html.includes('descix-login'));
});
