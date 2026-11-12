// The proposal forms (README "Proposal forms"): the licence form (request section) and the general form (proposal
// section) send one record to DeSciX's proposal intake through DeSciX.call, from a signed-in visitor. The built page's
// auth watcher and request-form script run in node:vm against a stub DOM made from the built form and a stub shell bus
// (test/lib/bus.mjs); a refusal is a REJECTION whose error comes from another realm (never instanceof this frame's
// Error), a success the whole bus envelope. Every gate below is shown red on a planted fault.
import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { stubBus, runScripts, settle, authScriptOf } from './lib/bus.mjs';
import { unForms } from './lib/expected.mjs';
import { world, spec } from './lib/world.mjs';
import {
  REQUEST_FIELDS, FORMS, FORM_KEYS, formFields, INTAKE, PROPOSAL_KINDS, TEXT_LIMITS, EXTRA, EXTRA_MAX_KEYS, REFUSALS,
  REFUSED_SPEC_KEYS, SCRIPT_SLOTS, SIGNED_OUT_MESSAGE, kindSlot, scriptConfig, formHtml, formInputNames, formRequiredNames,
} from '../src/request.mjs';
import { COPY_SLOTS, normalizeCopy, COPY_SCHEMA } from '../src/copy.mjs';
import { loadPartials } from '../src/partials.mjs';
import { tokensCss } from '../src/tokens.mjs';
import { assertTheme, assertPage } from '../src/gates.mjs';
import { normalizeSpec } from '../src/spec.mjs';
import { unent } from '../src/html.mjs';

const COPY = normalizeCopy(null);
const slot = id => COPY_SLOTS.find(s => s.id === id).default;
const ORIGIN = app => `https://${app}.descix.net`;
const FOUR = PROPOSAL_KINDS.filter(k => k !== FORMS.licence.kind);
const S = (app, sections, extra = {}) => spec(ORIGIN(app), sections, { scripts: { sdk: true, template_scripts: true }, ...extra });
const BOTH = () => S('both', [{ use: 'request' }, { use: 'proposal' }], { proposal: { kinds: FOUR } });
const scriptOf = html => html.match(/<script>\n(\(function\(\)\{\n  \/\/ The proposal forms[\s\S]*?)\n<\/script>/)[1];
const configOf = html => JSON.parse(scriptOf(html).match(/\n  var C=(\{.*\});\n/)[1]);

// A stub DOM from the built page: each form's controls (value: the markup default), its labels, its button and lines.
function dom(html) {
  const els = {}, forms = {};
  const node = (id, extra = {}) => (els[id] = { id, hidden: /\bhidden\b/.test((html.match(new RegExp(`<[a-z0-9]+\\b[^>]*\\bid="${id}"[^>]*>`)) || [''])[0]), textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, hasAttribute(k) { return k in this.attrs; },
    children: [], appendChild(c) { this.children.push(c); this.textContent += c.textContent; }, scrollIntoView() {}, ...extra });
  for (const id of Object.values(FORMS).map(f => f.id)) {
    const form = formHtml(html, id);
    if (!form) continue;
    const elements = {};
    for (const m of form.matchAll(/<(input|textarea|select)\b([^>]*)>/g)) {
      const name = (m[2].match(/\bname="([^"]+)"/) || [])[1];
      const cid = (m[2].match(/\bid="([^"]+)"/) || [])[1];
      if (m[2].includes('type="radio"')) { if (!elements[name] || /\bchecked\b/.test(m[2])) elements[name] = { value: m[2].match(/\bvalue="([^"]*)"/)[1], attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } }; continue; }
      const first = m[1] === 'select' ? (form.slice(m.index).match(/<option value="([^"]*)"/) || [])[1] : '';
      elements[name] = { id: cid, value: first || '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
    }
    const b = form.match(/<button class="btn btn-primary" type="submit"([^>]*)>([^<]*)<\/button>/);
    const button = { textContent: unent(b[2]), disabled: /disabled/.test(b[1]), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, hasAttribute(k) { return k in this.attrs; } };
    const labels = Object.fromEntries([...form.matchAll(/<label for="([^"]+)">([^<]*)<\/label>/g)].map(m => [m[1], { textContent: unent(m[2]) }]));
    const handlers = {};
    forms[id] = node(id, { elements, button, handlers, addEventListener(t, h) { handlers[t] = h; },
      querySelector: q => (q === 'button[type=submit]' ? button : labels[(q.match(/^label\[for="([^"]+)"\]$/) || [])[1]] || null) });
    for (const part of Object.values(Object.values(FORMS).find(f => f.id === id).parts)) node(part);
  }
  return { els, forms };
}

// Runs the page's scripts once. bus: undefined (no shell), or stubBus options ({ mode, powch, signedIn, call }).
async function run(html, opts, storage = new Map()) {
  const { els, forms } = dom(html);
  const bus = opts && stubBus(opts);
  const session = { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
  const doc = { getElementById: id => els[id] || null, createElement: () => ({ textContent: '' }), createTextNode: t => ({ textContent: t }) };
  const r = runScripts([authScriptOf(html), scriptOf(html)], { bus, globals: { document: doc, sessionStorage: session } });
  await settle();
  return { els, forms, calls: bus ? bus.calls : [], logins: bus ? bus.logins : [], errors: r.errors, storage, settle, bus,
    auth: s => bus.auth(s),
    async submit(id) { forms[id].handlers.submit({ preventDefault() {} }); await settle(); await settle(); } };
}
// An error as the shell's window makes it: an Error of ANOTHER realm (not instanceof this one's Error) with the bus's
// fields, or a plain object with them.
const OTHER = vm.createContext({});
const shellError = (fields, message = 'refused') => Object.assign(vm.runInContext(`new Error(${JSON.stringify(message)})`, OTHER), fields);
const refusal = (code, data = {}) => [shellError({ code, status: 400, data }), { code, message: 'refused', status: 400, data }];
// Fills every control of a form: required and optional, a distinct value each; the text long enough.
const fill = (form, cfg) => { for (const f of cfg.fields) form.elements[f.name].value = f.record === 'contact' ? `${f.name}@example.org` : f.record === 'kind' ? FOUR[1] : f.record === 'text' ? `${f.name} — ${'a proposal in a few sentences '.repeat(2)}` : `${f.name}-value`; };
// The record the table says a filled form sends: each control's value under its record field (extra: under its name).
function expectedRecord(form, cfg, page_url) {
  const r = { type: INTAKE.type, kind: cfg.kind, page_url }, extra = {};
  for (const f of cfg.fields) { const v = form.elements[f.name].value.trim(); if (!v) continue; if (f.record === EXTRA) extra[f.name] = v; else r[f.record] = v; }
  if (Object.keys(extra).length) r[EXTRA] = extra;
  return r;
}
// The bus's success: the whole envelope, the receipt in message.
const OK = { status: 'OK', auth_status: 'authenticated', message: { content_sha256_by_file_id: { 'proposal-7f3a': 'ab' }, content_sha256: 'ab' } };

test('the field table: each form\'s controls derive from REQUEST_FIELDS; the module refuses a table that breaks the record contract', () => {
  for (const k of FORM_KEYS) assert.deepEqual(formFields(k).map(f => f.name), REQUEST_FIELDS.filter(f => f.forms[k]).map(f => f.name));
  assert.deepEqual(formFields('proposal').map(f => f.record), ['kind', 'name', 'org', 'text', 'contact']);
  assert.ok(formFields('licence').filter(f => f.record === EXTRA).length <= EXTRA_MAX_KEYS);
  const t = (rows, re, key = 'licence') => assert.throws(() => formFields(key, rows), re);
  t(REQUEST_FIELDS.map(f => (f.record === 'text' ? { ...f, record: EXTRA } : f)), /a required control fills "text"/);
  t(REQUEST_FIELDS.map(f => (f.name === 'org' ? { ...f, record: 'name' } : f)), /who and org both fill "name"/);
  t(REQUEST_FIELDS.map(f => (f.name === 'org' ? { ...f, record: 'status' } : f)), /org fills "status", which is not a record field/);
  t([...REQUEST_FIELDS, ...[1, 2, 3].map(i => ({ name: `x${i}`, record: EXTRA, forms: { licence: 'optional' } }))], new RegExp(`7 controls land in extra, the intake takes at most ${EXTRA_MAX_KEYS} keys`));
  t(REQUEST_FIELDS.map(f => (f.name === 'kind' ? { ...f, forms: { licence: 'optional' } } : f)), /always sends kind licence; kind may not fill "kind" too/);
  t(REQUEST_FIELDS.filter(f => f.name !== 'kind'), /the form sends no fixed kind, so a required control fills "kind"/, 'proposal');
  t(REQUEST_FIELDS.map(f => (f.name === 'who' ? { ...f, forms: { licence: 'yes' } } : f)), /form licence is "yes"/);
});

test('conformance: the record the built script sends is the table\'s, field by field, for each form; a planted record mapping goes red', async () => {
  const w = world({ specs: { both: BOTH() } });
  const r = w.build('both');
  assert.equal(r.code, 0, r.err);
  const C = configOf(r.html);
  for (const k of FORM_KEYS) assert.deepEqual(C.forms[FORMS[k].id].fields, formFields(k).map(f => ({ ...f })), `${k}: the script's field list is formFields`);
  assert.equal(C.app_id, 'both');
  assert.equal(C.page_url, `${ORIGIN('both')}/`);
  // the partials carry exactly the table's controls (the gate's own reading of the built page)
  for (const k of FORM_KEYS) assert.deepEqual(formInputNames(formHtml(r.html, FORMS[k].id)), formFields(k).map(f => f.name));
  const check = async html => {
    const p = await run(html, { signedIn: true, call: () => OK });
    for (const k of FORM_KEYS) {
      const id = FORMS[k].id, cfg = formFields(k).map(f => ({ ...f }));
      fill(p.forms[id], { fields: cfg });
      await p.submit(id);
      const sent = p.calls.find(c => c.params.records[0].kind === (FORMS[k].kind || FOUR[1]));
      assert.ok(sent, `${k}: sent`);
      assert.equal(sent.command, INTAKE.command);
      assert.deepEqual(Object.keys(sent.params).sort(), ['app_id', 'kb_id', 'records']);
      assert.equal(sent.params.kb_id, INTAKE.kb_id);
      assert.deepEqual(sent.params.records, [expectedRecord(p.forms[id], { kind: FORMS[k].kind || FOUR[1], fields: cfg }, `${ORIGIN('both')}/`)], `${k}: the record`);
      for (const f of ['status', 'note', 'decided_at', 'ref']) assert.ok(!(f in sent.params.records[0]), `${k}: never sends ${f}`);
    }
  };
  await check(r.html);
  // plant: the page's script maps one control to another record field than the table says (who → extra)
  const planted = r.html.replace('{"name":"who","record":"name","required":true}', '{"name":"who","record":"extra","required":true}');
  assert.notEqual(planted, r.html, 'the plant reached the page');
  await assert.rejects(check(planted), /the record/);
  // an empty optional control is left out of the record; extra is absent when every extra control is empty
  const p = await run(r.html, { signedIn: true, call: () => OK });
  const lic = p.forms[FORMS.licence.id];
  fill(lic, { fields: formFields('licence') });
  for (const f of formFields('licence').filter(x => x.record === EXTRA)) lic.elements[f.name].value = '';
  await p.submit(FORMS.licence.id);
  assert.ok(!(EXTRA in p.calls[0].params.records[0]));
});

test('refusals: each REFUSALS code, as a rejection with err.code (a cross-realm error or a plain object), shows its line; the signed-out Error shows the sign-in line; anything else the fail line, logged; a plant in each goes red', async () => {
  const w = world({ specs: { both: BOTH() } });
  const { html } = w.build('both');
  const send = async (reject, { page = html, key = 'proposal' } = {}) => {
    const id = FORMS[key].id, P = FORMS[key].parts;
    const p = await run(page, { signedIn: true, call: () => Promise.reject(reject) });
    fill(p.forms[id], { fields: formFields(key) });
    await p.submit(id);
    return { refused: p.els[P.refused], fail: p.els[P.fail], done: p.els[P.done], button: p.forms[id].button, form: p.forms[id], errors: p.errors };
  };
  assert.equal(shellError({ code: 'X' }) instanceof Error, false, 'the fixture error is of another realm');
  for (const [code, slotId] of Object.entries(REFUSALS)) {
    for (const x of refusal(code)) {
      const r = await send(x);
      assert.equal(r.refused.hidden, false, `${code}: the refused line shows`);
      assert.equal(r.refused.textContent, slot(slotId), `${code}: its line`);
      assert.equal(r.fail.hidden, true);
      assert.equal(r.done.hidden, true, 'the form stays');
      assert.equal(r.button.disabled, false, 'the button is free again');
      assert.equal(r.errors.length, 1, 'logged once');
    }
  }
  // PROPOSAL_FIELD_INVALID names the control err.data.field names, by its label, and marks it: a record field, an extra
  const field = await send(shellError({ code: 'PROPOSAL_FIELD_INVALID', status: 400, data: { field: 'text' } }));
  assert.equal(field.refused.textContent, `${slot(REFUSALS.PROPOSAL_FIELD_INVALID)} ${slot('proposal.label.4')}`);
  assert.equal(field.form.elements.use.attrs['aria-invalid'], 'true');
  // an edit of the marked control clears its mark; an edit of another leaves it
  field.form.handlers.input({ target: field.form.elements.who });
  assert.equal(field.form.elements.use.attrs['aria-invalid'], 'true', 'another control edited: still marked');
  field.form.handlers.input({ target: field.form.elements.use });
  assert.equal(field.form.elements.use.attrs['aria-invalid'], undefined, 'edited: the mark goes');
  const sel = await send(shellError({ code: 'PROPOSAL_FIELD_INVALID', data: { field: 'kind' } }));
  assert.equal(sel.form.elements.kind.attrs['aria-invalid'], 'true');
  sel.form.handlers.change({ target: sel.form.elements.kind });
  assert.equal(sel.form.elements.kind.attrs['aria-invalid'], undefined, 'a changed select: the mark goes');
  // plant: an edit that does not clear the mark → the mark stays (red)
  const sticky = html.replace("if(t&&t.removeAttribute)t.removeAttribute('aria-invalid');", '');
  assert.notEqual(sticky, html);
  const st = await send(shellError({ code: 'PROPOSAL_FIELD_INVALID', data: { field: 'text' } }), { page: sticky });
  st.form.handlers.input({ target: st.form.elements.use });
  assert.equal(st.form.elements.use.attrs['aria-invalid'], 'true', 'the plant: the mark stays after an edit');
  const extra = await send({ code: 'PROPOSAL_FIELD_INVALID', data: { field: `${EXTRA}.scale` } }, { key: 'licence' });
  assert.equal(extra.form.elements.scale.attrs['aria-invalid'], 'true');
  const unnamed = await send({ code: 'PROPOSAL_FIELD_INVALID', message: 'text is too short' });
  assert.equal(unnamed.refused.textContent, slot(REFUSALS.PROPOSAL_FIELD_INVALID), 'no data.field: the line alone (the message is not read)');
  // the shell's signed-out refusal: a plain Error, no code → the sign-in line, not the fail line
  const out = await send(shellError({}, SIGNED_OUT_MESSAGE));
  assert.equal(out.refused.hidden, false);
  assert.equal(out.refused.textContent, slot(SCRIPT_SLOTS.signin));
  assert.equal(out.fail.hidden, true);
  assert.equal(out.done.hidden, true);
  // an unknown code, no code, a code only in the message, a null: the fail line, logged
  for (const x of [shellError({ code: 'SOMETHING_NEW' }), shellError({}, 'network down'), shellError({}, 'Command failed: RATE_LIMITED (429)'), { message: 'RATE_LIMITED' }, null]) {
    const r = await send(x);
    assert.equal(r.fail.hidden, false, `${x && x.message}: the fail line`);
    assert.equal(r.refused.hidden, true);
    assert.equal(r.done.hidden, true);
    assert.equal(r.errors.length, 1, 'logged');
  }
  // plant: the page's refusal map loses RATE_LIMITED → a rate refusal falls to the fail line (red)
  const C = configOf(html);
  const lostMap = html.replace(JSON.stringify(C.refusals), JSON.stringify(Object.fromEntries(Object.entries(C.refusals).filter(([k]) => k !== 'RATE_LIMITED'))));
  assert.notEqual(lostMap, html);
  const lost = await send(refusal('RATE_LIMITED')[0], { page: lostMap });
  assert.equal(lost.refused.hidden, true, 'the plant: the rate line is gone');
  assert.equal(lost.fail.hidden, false);
  // plant: the code read only from an instanceof Error → the cross-realm refusal falls to the fail line (red)
  const realm = html.replace("function codeOf(x){return x!=null&&", 'function codeOf(x){return x instanceof Error&&');
  assert.notEqual(realm, html);
  const r1 = await send(refusal('RATE_LIMITED')[0], { page: realm });
  assert.equal(r1.refused.hidden, true, 'the plant: a cross-realm refusal is not read');
  // plant: the signed-out message is not the shell's → the signed-out Error shows the fail line (red)
  const signed = html.replace(`"signed_out":${JSON.stringify(SIGNED_OUT_MESSAGE)}`, '"signed_out":"Not signed in."');
  assert.notEqual(signed, html);
  const r2 = await send(shellError({}, SIGNED_OUT_MESSAGE), { page: signed });
  assert.equal(r2.fail.hidden, false, 'the plant: the signed-out refusal is a generic failure');
  // plant: the field read from err.field, not err.data.field → no control is named (red)
  const flat = html.replace('var t=x.data&&x.data.field;', 'var t=x.field;');
  assert.notEqual(flat, html);
  const r3 = await send(shellError({ code: 'PROPOSAL_FIELD_INVALID', data: { field: 'text' } }), { page: flat });
  assert.equal(r3.form.elements.use.attrs['aria-invalid'], undefined, 'the plant: the field is not named');
});

test('success: the envelope\'s receipt names the record by the one key of message.content_sha256_by_file_id; else the plain done panel; storage cleared; a plant goes red', async () => {
  const w = world({ specs: { both: BOTH() } });
  const { html } = w.build('both');
  const id = FORMS.licence.id, P = FORMS.licence.parts;
  const env = message => ({ status: 'OK', auth_status: 'authenticated', message });
  const answers = [
    [OK, 'proposal-7f3a', 0],
    // a receipt that names no one record, or not the envelope (the map at the top, a bare file_id): sent, but no
    // receipt, and logged
    [env({ content_sha256_by_file_id: { 'proposal-1': 'a', 'proposal-2': 'b' } }), null, 1],
    [env({}), null, 1],
    [{ content_sha256_by_file_id: { 'proposal-7f3a': 'ab' } }, null, 1],
    [{ success: true, file_id: 'p-2' }, null, 1],
  ];
  const sendWith = async (page, answer, store = new Map()) => {
    const p = await run(page, { signedIn: true, call: () => answer }, store);
    fill(p.forms[id], { fields: formFields('licence') });
    p.forms[id].handlers.input();
    assert.ok(store.size, 'typing is kept');
    await p.submit(id);
    return p;
  };
  for (const [answer, rid, logged] of answers) {
    const store = new Map();
    const p = await sendWith(html, answer, store);
    assert.equal(p.forms[id].hidden, true);
    assert.equal(p.els[P.done].hidden, false);
    assert.equal(p.els[P.receipt].hidden, !rid, JSON.stringify(answer));
    if (rid) assert.equal(p.els[P.receiptId].textContent, rid);
    assert.equal(store.size, 0, 'sent: the kept values go');
    assert.equal(p.errors.length, logged, `${JSON.stringify(answer)}: logged ${logged}`);
  }
  // plant: the id read from the envelope's top level (the old shape) → no receipt for the bus's answer (red)
  const top = html.replace('r.message.content_sha256_by_file_id:undefined', 'r.content_sha256_by_file_id:undefined');
  assert.notEqual(top, html);
  const q = await sendWith(top, OK);
  assert.equal(q.els[P.receipt].hidden, true, 'the plant: the receipt is lost');
});

test('signed out: the button reads "Sign in to send" and opens Powch, the typing survives the sign-in, then Send; before Powch arrives it says sign in; outside the shell it says where', async () => {
  const w = world({ specs: { both: BOTH() } });
  const { html } = w.build('both');
  const id = FORMS.proposal.id, P = FORMS.proposal.parts;
  const send = unent(html.match(/<form id="proposal-form"[\s\S]*?type="submit"[^>]*>([^<]*)</)[1]);
  assert.equal(send, slot('proposal.btn'));
  assert.match(formHtml(html, id), /type="submit" disabled>/, 'without the script the button does nothing');
  // in the shell, signed out
  const store = new Map();
  const a = await run(html, { signedIn: false, call: () => OK }, store);
  assert.equal(a.forms[id].button.textContent, slot(SCRIPT_SLOTS.signin));
  assert.equal(a.forms[FORMS.licence.id].button.textContent, slot(SCRIPT_SLOTS.signin));
  assert.equal(a.forms[id].button.disabled, false);
  fill(a.forms[id], { fields: formFields('proposal') });
  const typed = Object.fromEntries(Object.entries(a.forms[id].elements).map(([k, v]) => [k, v.value]));
  await a.submit(id);
  assert.equal(a.logins.length, 1, 'Sign in to send opens Powch');
  assert.equal(a.calls.length, 0, 'nothing is sent signed out');
  // the shell routes away on sign-in; the page loads again, signed in: the typing is back, the button reads send
  const b = await run(html, { signedIn: true, call: () => OK }, store);
  assert.deepEqual(Object.fromEntries(Object.entries(b.forms[id].elements).map(([k, v]) => [k, v.value])), typed);
  assert.equal(b.forms[id].button.textContent, send);
  b.auth({ signedIn: false, address: null });
  assert.equal(b.forms[id].button.textContent, slot(SCRIPT_SLOTS.signin), 'the label follows a sign-out');
  b.auth({ signedIn: true, address: '0xabc' });
  await b.submit(id);
  assert.equal(b.calls.length, 1, 'then Send sends');
  // in the shell before Powch arrives: the sign-in line, no Powch, no call; after DESCX_BRIDGE_READY, signed in: Send
  const l = await run(html, { powch: 'late', signedIn: true, call: () => OK });
  fill(l.forms[id], { fields: formFields('proposal') });
  await l.submit(id);
  assert.equal(l.els[P.refused].textContent, slot(SCRIPT_SLOTS.signin));
  assert.equal(l.logins.length + l.calls.length, 0);
  l.bus.arrive();
  assert.equal(l.forms[id].button.textContent, send, 'Powch arrived signed in');
  await l.submit(id);
  assert.equal(l.calls.length, 1);
  // outside the shell (no bus: a plain static serve; ready() mode 'standalone' means unmanaged): no call, no Powch, the line
  for (const bus of [undefined, { mode: 'standalone', signedIn: true, call: () => OK }]) {
    const c = await run(html, bus);
    assert.equal(c.forms[id].button.textContent, slot(SCRIPT_SLOTS.signin));
    fill(c.forms[id], { fields: formFields('proposal') });
    await c.submit(id);
    assert.equal(c.calls.length, 0);
    assert.equal(c.els[P.refused].hidden, false);
    assert.equal(c.els[P.refused].textContent, `${slot(SCRIPT_SLOTS.outside)} ${ORIGIN('both')}/`);
  }
  // the checks before sign-in: a required control empty, a bad email, a short text
  const d = await run(html, { signedIn: false, call: () => OK });
  fill(d.forms[id], { fields: formFields('proposal') });
  d.forms[id].elements.contact.value = 'not-an-email';
  await d.submit(id);
  assert.equal(d.els[P.err].hidden, false);
  fill(d.forms[id], { fields: formFields('proposal') });
  d.forms[id].elements.use.value = 'x'.repeat(TEXT_LIMITS.min - 1);
  await d.submit(id);
  assert.equal(d.els[P.refused].textContent, slot(SCRIPT_SLOTS.text).replace('{min}', TEXT_LIMITS.min).replace('{max}', TEXT_LIMITS.max));
  assert.equal(d.logins.length, 0, 'no sign-in for a form that would be refused');
  // plant: the watcher's state is never taken → the label never reads send (red)
  const deaf = html.replace('egptSiteAuth.watch(function(s){state=s;labels();});', '');
  assert.notEqual(deaf, html);
  const e = await run(deaf, { signedIn: true, call: () => OK });
  assert.notEqual(e.forms[id].button.textContent, send, 'the plant: signed in, the button still says sign in');
});

test('the kind chooser: the spec\'s kinds, in order, labelled by their slots; an override reaches it; unknown, repeated, empty or missing kinds refuse', () => {
  const P = (proposal, extra = {}) => S('p', [{ use: 'proposal' }], { ...(proposal === undefined ? {} : { proposal }), ...extra });
  const w = world({ specs: {
    p: P({ kinds: FOUR }, { copy: 'p.copy.json' }),
    unknown: { ...P({ kinds: [...FOUR, 'bounty'] }), self_host: ORIGIN('unknown') },
    twice: { ...P({ kinds: [FOUR[0], FOUR[0]] }), self_host: ORIGIN('twice') },
    empty: { ...P({ kinds: [] }), self_host: ORIGIN('empty') },
    missing: { ...P(undefined), self_host: ORIGIN('missing') },
    orphan: spec('https://o.example', [{ use: 'licensing' }], { proposal: { kinds: FOUR } }),
  }, files: { 'p.copy.json': JSON.stringify({ schema: COPY_SCHEMA, slots: { [kindSlot('talk')]: 'Give a talk' } }) } });
  const ok = w.build('p');
  assert.equal(ok.code, 0, ok.err);
  assert.ok(ok.html.includes(`<select id="p-kind" name="kind" required>${FOUR.map(k => `<option value="${k}">${k === 'talk' ? 'Give a talk' : slot(kindSlot(k))}</option>`).join('')}</select>`));
  const cases = {
    unknown: /proposal\.kinds names "bounty", which is not a proposal kind \(PROPOSAL_KINDS: /,
    twice: new RegExp(`proposal\\.kinds names "${FOUR[0]}" twice`),
    empty: /proposal\.kinds is unset or empty/,
    missing: /proposal\.kinds is unset or empty/,
    orphan: /proposal is declared but the page does not use the proposal section/,
  };
  for (const [name, re] of Object.entries(cases)) {
    const r = w.build(name);
    assert.equal(r.code, 1, name);
    assert.match(r.err, re, name);
  }
});

test('build refusals: a leftover request.action names the replacement; no, a foreign or a non-https self_host; no sdk; the script missing or orphaned', () => {
  const lic = (app, extra = {}) => S(app, [{ use: 'request' }], extra);
  const w = world({ specs: {
    leftover: lic('leftover', { request: { action: 'https://proposals.example/intake' } }),
    nohost: { ...lic('nohost'), self_host: null },
    foreign: { ...lic('foreign'), self_host: 'https://egpt.descix.net' },
    plain: { ...lic('plain'), self_host: 'http://plain.descix.net' },
    path: { ...lic('path'), self_host: 'https://path.descix.net/site' },
    nosdk: lic('nosdk', { scripts: { template_scripts: true } }),
    noscript: lic('noscript', { scripts: { sdk: true } }),
    script: spec('https://script.example', [{ use: 'licensing' }], { scripts: { sdk: true, template_scripts: true } }),
    good: lic('good'),
  } });
  const cases = {
    leftover: /request\.action is deleted: the forms no longer post to an endpoint\. They send to DeSciX's proposal intake \(app_records_put, kb proposals\)[\s\S]*drop "request" and declare "self_host"/,
    nohost: /the page carries a proposal form, which sends page_url, the page's public https address on the app's own host — declare "self_host": "https:\/\/nohost\.descix\.net"/,
    foreign: /self_host "https:\/\/egpt\.descix\.net" is not the app's own host \(its first label is not foreign\)/,
    plain: /self_host "http:\/\/plain\.descix\.net" is not an https origin/,
    path: /self_host "https:\/\/path\.descix\.net\/site" is not an https origin/,
    nosdk: /the request section needs scripts\.sdk/,
    noscript: /the request section needs scripts\.template_scripts/,
    script: /scripts\.template_scripts is the proposal forms' script, and the page uses neither/,
  };
  for (const [name, re] of Object.entries(cases)) {
    const r = w.build(name);
    assert.equal(r.code, 1, `${name} refuses`);
    assert.match(r.err, re, name);
    assert.equal(r.html, null, `${name} writes no page`);
  }
  assert.deepEqual(Object.keys(REFUSED_SPEC_KEYS), ['request']);
  const good = w.build('good');
  assert.equal(good.code, 0, good.err);
  // the old path is gone from the page: no action, no method, no hidden fields, no honeypot
  const form = formHtml(good.html, FORMS.licence.id);
  assert.match(form, /^<form id="licence-form" novalidate>/);
  assert.doesNotMatch(good.html, /type="hidden"|name="website"|name="app"|name="page"|x-www-form-urlencoded|fetch\(/);
  // page_url is in the script's config only: a link to self_host anywhere else still refuses
  assert.equal(good.html.split(ORIGIN('good')).length, 2, 'self_host appears once, in the config');
  const w2 = world({ specs: { good: lic('good', { sections: [{ use: 'request' }, { file: 'self.html' }] }) }, files: { 'self.html': `<section class="sec" id="x"><div class="wrap"><a href="${ORIGIN('good')}/">me</a></div></section>` } });
  const self = w2.build('good');
  assert.equal(self.code, 1);
  assert.match(self.err, /a self-link to https:\/\/good\.descix\.net remains/);
});

test('theme gate: each form\'s controls and required marks are the table\'s, it has no action, its lines are there; a plant in each refuses', () => {
  const P = loadPartials(), css = tokensCss();
  assert.doesNotThrow(() => assertTheme(P, css));
  for (const k of FORM_KEYS) {
    const form = formHtml(P.sections[FORMS[k].section], FORMS[k].id);
    assert.deepEqual(formInputNames(form), formFields(k).map(f => f.name), k);
    assert.deepEqual(formRequiredNames(form), formFields(k).filter(f => f.required).map(f => f.name), k);
  }
  const plant = (section, from, to) => {
    const html = P.sections[section].replace(from, to);
    assert.notEqual(html, P.sections[section], `the plant ${from} reached ${section}`);
    return { ...P, sections: { ...P.sections, [section]: html } };
  };
  assert.throws(() => assertTheme(plant('request', '<form id="licence-form" novalidate>', '<form id="licence-form" method="post" action="https://x.example" novalidate>'), css), /carries an action or method/);
  assert.throws(() => assertTheme(plant('request', 'name="licence_type"', 'name="kind"'), css), /REQUEST_FIELDS' licence controls are/);
  assert.throws(() => assertTheme(plant('proposal', 'name="org" type="text"', 'name="org" type="text" required'), css), /marks \[kind, who, org, use, contact\] required/);
  assert.throws(() => assertTheme(plant('proposal', 'id="proposal-refused"', 'id="proposal-refusal"'), css), /carries id="proposal-refused" \(the form's refused\) 0 times/);
  assert.throws(() => assertTheme(plant('proposal', '{{proposal:kinds}}', ''), css), /\{\{proposal:kinds\}\} 0 times/);
  assert.throws(() => assertTheme({ ...P, requestForm: P.requestForm.replace('{{request:config}}', '{}') }, css), /var C=\{\{request:config\}\}; 0 times/);
});

test('the script\'s config is the one serialisation: a copy override of an intake line reaches it; a page whose config was edited refuses at assertPage', () => {
  const w = world({ specs: { both: { ...BOTH(), copy: 'both.copy.json' } }, files: { 'both.copy.json': JSON.stringify({ schema: COPY_SCHEMA, slots: { [SCRIPT_SLOTS.signin]: 'Sign in with Powch to send', [REFUSALS.RATE_LIMITED]: 'Slow down </script>' } }) } });
  const r = w.build('both');
  assert.equal(r.code, 0, r.err);
  const C = configOf(r.html);
  assert.equal(C.lines.signin, 'Sign in with Powch to send');
  assert.equal(C.refusals.RATE_LIMITED, 'Slow down </script>');
  assert.ok(!scriptOf(r.html).includes('</script>'), 'a closing script tag cannot');
  const copy = normalizeCopy({ schema: COPY_SCHEMA, slots: { [SCRIPT_SLOTS.signin]: 'Sign in with Powch to send', [REFUSALS.RATE_LIMITED]: 'Slow down </script>' } });
  assert.ok(r.html.includes(`var C=${scriptConfig('both', { ...BOTH(), self_host: ORIGIN('both') }, copy)};`));
  const attr = n => r.html.match(new RegExp(`${n}="([^"]+)"`))[1];
  const ctx = { app: 'both', theme: attr('data-frontpage-theme'), build: attr('data-frontpage-build'), spec: normalizeSpec({ ...BOTH(), copy: 'both.copy.json' }, 'both'), copy, roster: null, columns: 4 };
  assert.doesNotThrow(() => assertPage(r.html, ctx));
  const edited = r.html.replace(`"page_url":"${ORIGIN('both')}/"`, `"page_url":"${ORIGIN('both')}/other"`);
  assert.notEqual(edited, r.html);
  assert.throws(() => assertPage(edited, ctx), /the request-form script's config is not \.\/request scriptConfig of this spec and copy/);
});

test('a refused control is marked: the forms\' CSS (partials/forms.css) gives [aria-invalid="true"] the --gold border, once, on a page with a form and on no other', () => {
  const w = world({ specs: { both: BOTH(), plain: spec('https://plain.example', [{ use: 'proof' }]) } });
  const both = w.build('both');
  assert.equal(both.code, 0, both.err);
  const style = both.html.match(/<style>[\s\S]*?<\/style>/)[0];
  assert.equal(style.split('/* forms */').length, 2, 'once');
  assert.match(style, /\/\* forms \*\/\n\.field \[aria-invalid="true"\]\{border-color:var\(--gold\)\}\n<\/style>/);
  assert.match(style, /--gold:#[0-9a-f]{6}/, 'the token it names is defined');
  const plain = w.build('plain');
  assert.ok(!plain.html.includes('/* forms */') && !plain.html.includes('aria-invalid="true"]'));
  // the fixture comparison takes it out exactly once where it belongs
  assert.throws(() => unForms(both.html, false), /the forms CSS is there 1 times, wants 0/);
  assert.throws(() => unForms(unForms(both.html, true), true), /0 times, wants 1/);
});
