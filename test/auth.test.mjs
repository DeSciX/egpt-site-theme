// The theme's auth watcher (partials/scripts/auth.js, README "Sign-in state"): the one reader of the shell's sign-in
// state. Placed once on a page with the login button or the proposal forms, before both; the login and request-form
// scripts take the state from egptSiteAuth.watch and never read it themselves (gates assertTheme). Run in node:vm
// against stub buses: Powch on the bus at ready(), Powch arriving later through DESCX_BRIDGE_READY on the shell's
// window, the replay then a change. Each gate is shown red on a planted fault.
import test from 'node:test';
import assert from 'node:assert';
import { world, spec } from './lib/world.mjs';
import { stubBus, runScripts, settle, authScriptOf } from './lib/bus.mjs';
import { loadPartials } from '../src/partials.mjs';
import { tokensCss } from '../src/tokens.mjs';
import { assertTheme, AUTH_READERS } from '../src/gates.mjs';
import { unAuth } from './lib/expected.mjs';

const ORIGIN = app => `https://${app}.descix.net`;
const PAGE = { scripts: { sdk: true, template_scripts: true }, login: true, nav: 'template', brand: 'template', proposal: { kinds: ['talk'] } };
let built;
const page = () => (built = built || world({ specs: { both: spec(ORIGIN('both'), [{ use: 'proposal' }], PAGE), lone: spec('https://lone.example', [{ use: 'proof' }]) } }));

// Runs the watcher (js) under a bus; returns the states a watcher saw.
async function watch(js, bus) {
  const seen = [];
  const r = runScripts([js, 'egptSiteAuth.watch(function(s){__seen.push(s);});'], { bus, globals: { __seen: seen } });
  await settle();
  return { ...r, seen, last: () => seen[seen.length - 1] };
}

test('placement: one auth watcher, before the scripts that consume it, on a page with the login button or the forms; none on a page with neither', () => {
  const w = page();
  const both = w.build('both');
  assert.equal(both.code, 0, both.err);
  assert.equal(both.html.split("// The theme's auth watcher").length, 2, 'exactly once');
  const at = both.html.indexOf("// The theme's auth watcher");
  assert.ok(at < both.html.indexOf('// The Powch login button') && at < both.html.indexOf('// The proposal forms'), 'before both consumers');
  assert.equal(both.html.split('window.egptSiteAuth=').length, 2, 'one definition on the page');
  const lone = w.build('lone');
  assert.equal(lone.code, 0, lone.err);
  assert.ok(!lone.html.includes('egptSiteAuth'));
});

test('(a) Powch on the bus at ready(): the watcher subscribes at once; (c) the replay, then a sign-in and a sign-out; dropped at pagehide', async () => {
  const js = authScriptOf(page().build('both').html);
  const bus = stubBus({ signedIn: true, address: '0xabc' });
  const r = await watch(js, bus);
  assert.deepEqual(r.last(), { shell: true, powch: true, signedIn: true, address: '0xabc' }, 'the replay: signed in at once');
  bus.auth({ signedIn: false, address: null });
  assert.deepEqual(r.last(), { shell: true, powch: true, signedIn: false, address: null }, 'the change to signed out');
  bus.auth({ signedIn: true, address: '0xdef' });
  assert.equal(r.last().address, '0xdef');
  assert.equal(bus.listening('DESCX_BRIDGE_READY'), 0, 'Powch was there: no wait');
  // a watcher that comes late gets the current state at once
  const late = [];
  r.ctx.egptSiteAuth.watch(s => late.push(s));
  assert.deepEqual(late, [{ shell: true, powch: true, signedIn: true, address: '0xdef' }]);
  r.fire('pagehide', { persisted: true });
  assert.equal(bus.offs.length, 0, 'kept for the back-forward cache');
  r.fire('pagehide', { persisted: false });
  assert.equal(bus.offs.length, 1, 'dropped when the page goes');
  // plant: the replay's signed-in flag ignored → red
  const deaf = js.replace('signedIn:!!a.signedIn', 'signedIn:false');
  assert.notEqual(deaf, js);
  const p = await watch(deaf, stubBus({ signedIn: true }));
  assert.notEqual(p.last().signedIn, true, 'the plant: the replay is lost');
});

test('(b) Powch arrives later: the watcher waits for DESCX_BRIDGE_READY on the shell\'s window (bridgeLevel up), then subscribes', async () => {
  const js = authScriptOf(page().build('both').html);
  const bus = stubBus({ powch: 'late', signedIn: true, address: '0x1' });
  const r = await watch(js, bus);
  assert.deepEqual(r.last(), { shell: true, powch: false, signedIn: false, address: null }, 'in the shell, Powch not yet there');
  assert.equal(bus.listening('DESCX_BRIDGE_READY'), 1, 'listening on the shell\'s window');
  assert.ok(!r.listeners.DESCX_BRIDGE_READY, 'not on the page\'s own window');
  bus.arrive();
  assert.deepEqual(r.last(), { shell: true, powch: true, signedIn: true, address: '0x1' }, 'Powch arrived: the replay');
  assert.equal(bus.listening('DESCX_BRIDGE_READY'), 0, 'once');
  bus.auth({ signedIn: false, address: null });
  assert.equal(r.last().signedIn, false);
  // plant: the walk up the frames dropped (the listener lands on the page's own window) → red
  const local = js.replace('w=w.parent', 'w=w');
  assert.notEqual(local, js);
  const b2 = stubBus({ powch: 'late', signedIn: true });
  const p = await watch(local, b2);
  b2.arrive();
  assert.equal(p.last().powch, false, 'the plant: the shell\'s DESCX_BRIDGE_READY is never heard');
  // plant: the members check dropped (always wait) → (a) red
  const wait = js.replace("r.members.indexOf('powch')>=0", 'false');
  assert.notEqual(wait, js);
  const q = await watch(wait, stubBus({ signedIn: true }));
  assert.equal(q.last().powch, false, 'the plant: Powch on the bus at ready() is never used');
});

test('outside the shell (no bridge, standalone, embedded without a readable bus): one state, shell false, nothing subscribed', async () => {
  const js = authScriptOf(page().build('both').html);
  for (const bus of [null, stubBus({ mode: 'standalone' }), stubBus({ mode: 'embedded-no-bridge' })]) {
    const r = await watch(js, bus);
    assert.deepEqual(r.seen, [{ shell: false, powch: false, signedIn: false, address: null }]);
  }
});

test('one reader: the theme gate refuses a login or request-form script that reads the sign-in state itself, or skips the watcher', () => {
  const P = loadPartials(), css = tokensCss();
  assert.doesNotThrow(() => assertTheme(P, css));
  // every reader the gate names is something the watcher itself does (a pattern that matches nothing gates nothing)
  for (const [what, re] of AUTH_READERS) assert.match(P.authScript, re, `the watcher ${what}`);
  const plants = {
    'waits on ready()': ["DeSciX.ready().then(function(r){});", "DeSciX.ready().then(function(r){if(r.members.indexOf('powch')>=0){}});"],
    "reads the bus's members": ['var m=DeSciX.bridge.members();'],
    'reads bridgeLevel': ['var w=window;for(var i=0;i<DeSciX.bridgeLevel;i++)w=w.parent;'],
    "subscribes to on('auth')": ["DeSciX.powch.on('auth',function(s){});", 'DeSciX.powch.on("auth",function(s){});', 'DeSciX.powch.on(`auth`,function(s){});', "DeSciX.powch.on( 'auth' ,function(s){});"],
    'listens for DESCX_BRIDGE_READY': ["parent.addEventListener('DESCX_BRIDGE_READY',function(){});"],
    'defines egptSiteAuth': ['window.egptSiteAuth = {watch:function(){}};'],
  };
  assert.deepEqual(Object.keys(plants).sort(), AUTH_READERS.map(([w]) => w).sort(), 'a plant for every reader');
  for (const [what, codes] of Object.entries(plants)) for (const code of codes) {
    const re = new RegExp(`reads the sign-in state itself \\(${what.replace(/[()]/g, '\\$&')}\\)`);
    assert.throws(() => assertTheme({ ...P, loginScript: P.loginScript.replace('var L=', `${code}var L=`) }, css), re, `login: ${code}`);
    assert.throws(() => assertTheme({ ...P, requestForm: P.requestForm.replace('var C=', `${code}var C=`) }, css), re, `request-form: ${code}`);
  }
  assert.throws(() => assertTheme({ ...P, loginScript: P.loginScript.replace('egptSiteAuth.watch(', 'egptSiteAuth.look(') }, css), /the login script does not take the sign-in state from the auth watcher/);
  assert.throws(() => assertTheme({ ...P, authScript: P.authScript.replace('window.egptSiteAuth=', 'window.siteAuth=') }, css), /does not define window\.egptSiteAuth exactly once/);
});

test('the fixture comparison takes the watcher out of a built page exactly once where it belongs, and refuses it twice, missing or misplaced', () => {
  const html = page().build('both').html;
  const out = unAuth(html, true);
  assert.ok(!out.includes('egptSiteAuth=') && out.length < html.length);
  assert.throws(() => unAuth(html, false), /the auth watcher is there 1 times, wants 0/);
  assert.throws(() => unAuth(out, true), /the auth watcher is there 0 times, wants 1/);
  const twice = html.replace(/(<script>\n\(function\(\)\{\n  \/\/ The theme's auth watcher[\s\S]*?<\/script>\n)/, '$1$1');
  assert.notEqual(twice, html);
  assert.throws(() => unAuth(twice, true), /2 times, wants 1/);
});
