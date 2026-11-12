// ./request — the theme's two proposal forms and what they send. The request section carries the licence form
// (#licence-form), the proposal section the general form (#proposal-form); each sends ONE record to DeSciX's proposal
// intake, from a signed-in visitor, through the shell's bus (the request-form script):
//
//   DeSciX.call('app_records_put', { app_id, kb_id: 'proposals', records: [{ type: 'proposal', kind, text, page_url,
//                                                                            name?, org?, contact?, extra? }] })
//
// app_id is the app id (the spec's file name); page_url is the page's public address on the app's own host, the spec's
// self_host + '/'; the server stamps the submitter and the time. REQUEST_FIELDS is the one owner of every control a form
// carries and of where its value lands in the record: the partials' controls are held to it (gates assertTheme), the
// script's field list is written from it (formFields), and the record is built from that list alone.
import { esc, refuse } from './html.mjs';

// The intake contract below (INTAKE through REFUSALS) is a copy; it is deleted when @descix/app-sdk exports it.
/** The intake call: the bus command, the knowledge base and the record type every form sends. */
export const INTAKE = Object.freeze({ command: 'app_records_put', kb_id: 'proposals', type: 'proposal' });
/** The proposal kinds a form may send in `kind`. */
export const PROPOSAL_KINDS = Object.freeze(['licence', 'seat', 'one-thing', 'talk', 'other']);
/** The record's `text` length the intake takes, in characters (after trimming). */
export const TEXT_LIMITS = Object.freeze({ min: 20, max: 5000 });
/** The most keys the record's `extra` object may carry. */
export const EXTRA_MAX_KEYS = 6;
/** The record fields a control may fill; a control whose record is EXTRA lands in `extra` under its own name. */
export const RECORD_FIELDS = Object.freeze(['name', 'org', 'contact', 'text', 'kind']);
export const EXTRA = 'extra';
/** The record field the script checks as an email address. */
export const EMAIL_FIELD = 'contact';

/**
 * The forms, by key: the element id, the theme section that carries it, the kind it always sends (null: the person
 * chooses it in its `kind` control), and the ids of the lines and the done panel the script shows.
 */
export const FORMS = Object.freeze({
  licence: Object.freeze({ id: 'licence-form', section: 'request', kind: 'licence',
    parts: Object.freeze({ err: 'form-err', fail: 'form-fail', refused: 'form-refused', done: 'form-done', receipt: 'form-receipt', receiptId: 'form-receipt-id' }) }),
  proposal: Object.freeze({ id: 'proposal-form', section: 'proposal', kind: null,
    parts: Object.freeze({ err: 'proposal-err', fail: 'proposal-fail', refused: 'proposal-refused', done: 'proposal-done', receipt: 'proposal-receipt', receiptId: 'proposal-receipt-id' }) }),
});
export const FORM_KEYS = Object.freeze(Object.keys(FORMS));
export const formOfSection = section => FORM_KEYS.find(k => FORMS[k].section === section) || null;

const R = 'required', O = 'optional';
// name: the control's name= in the partial; record: the record field it fills (RECORD_FIELDS, or EXTRA);
// forms: {<form key>: 'required' | 'optional'}, the forms that carry the control; doc: what it is.
export const REQUEST_FIELDS = Object.freeze([
  ['kind', 'kind', { proposal: R }, 'the proposal kind, one of the spec\'s proposal.kinds (select)'],
  ['who', 'name', { licence: R, proposal: R }, 'the submitter\'s name'],
  ['org', 'org', { licence: R, proposal: O }, 'the organisation'],
  ['use', 'text', { licence: R, proposal: R }, `the proposal itself (${TEXT_LIMITS.min} to ${TEXT_LIMITS.max} characters)`],
  ['scale', EXTRA, { licence: O }, 'scale'],
  ['timeline', EXTRA, { licence: O }, 'timeline'],
  ['licence_type', EXTRA, { licence: O }, 'software | hardware | both (radio)'],
  ['contact', 'contact', { licence: R, proposal: R }, 'an email'],
  ['role', EXTRA, { licence: O }, 'node | dev | reseller | referrer | unsure (select)'],
].map(([name, record, forms, doc]) => Object.freeze({ name, record, forms: Object.freeze(forms), doc })));
export const REQUEST_FIELD_NAMES = Object.freeze(REQUEST_FIELDS.map(f => f.name));

/** One form's controls, in table order: [{name, record, required}]. Refuses a table that breaks the record contract. */
export function formFields(key, fields = REQUEST_FIELDS) {
  const form = FORMS[key] || refuse(`no form "${key}" (FORMS: ${FORM_KEYS.join(', ')})`);
  const rows = fields.filter(f => f.forms[key]).map(f => Object.freeze({ name: f.name, record: f.record, required: f.forms[key] === R }));
  const where = `REQUEST_FIELDS, form ${key}`;
  for (const f of fields) for (const [k, v] of Object.entries(f.forms)) {
    if (!FORMS[k]) refuse(`REQUEST_FIELDS ${f.name}: no form "${k}" (FORMS: ${FORM_KEYS.join(', ')})`);
    if (v !== R && v !== O) refuse(`REQUEST_FIELDS ${f.name}: form ${k} is "${v}", not "${R}" or "${O}"`);
  }
  for (const f of rows) if (f.record !== EXTRA && !RECORD_FIELDS.includes(f.record)) refuse(`${where}: ${f.name} fills "${f.record}", which is not a record field (${RECORD_FIELDS.join(', ')}, or ${EXTRA})`);
  for (const r of RECORD_FIELDS) if (rows.filter(f => f.record === r).length > 1) refuse(`${where}: ${rows.filter(f => f.record === r).map(f => f.name).join(' and ')} both fill "${r}"`);
  const text = rows.find(f => f.record === 'text');
  if (!text || !text.required) refuse(`${where}: a required control fills "text" (the intake refuses a proposal without it)`);
  const extras = rows.filter(f => f.record === EXTRA).length;
  if (extras > EXTRA_MAX_KEYS) refuse(`${where}: ${extras} controls land in ${EXTRA}, the intake takes at most ${EXTRA_MAX_KEYS} keys`);
  const kind = rows.find(f => f.record === 'kind');
  if (form.kind === null && !(kind && kind.required)) refuse(`${where}: the form sends no fixed kind, so a required control fills "kind"`);
  if (form.kind !== null && kind) refuse(`${where}: the form always sends kind ${form.kind}; ${kind.name} may not fill "kind" too`);
  if (form.kind !== null && !PROPOSAL_KINDS.includes(form.kind)) refuse(`FORMS ${key}: kind ${form.kind} is not in PROPOSAL_KINDS`);
  return Object.freeze(rows);
}
for (const k of FORM_KEYS) formFields(k);   // the table is checked when the module loads

/** The intake's refusal codes → the copy slot whose line the page shows beside the form. Any other failure shows the form's fail line. */
export const REFUSALS = Object.freeze({
  PROPOSAL_FIELD_INVALID: 'intake.refused.field',
  PROPOSAL_NEEDS_IDENTITY: 'intake.refused.identity',
  PROPOSAL_ADMIN_ONLY: 'intake.refused.admin',
  RATE_LIMITED: 'intake.refused.rate',
});
/** The message of the shell's signed-out refusal: DeSciX.call rejects with a plain Error carrying it and no code. */
export const SIGNED_OUT_MESSAGE = 'User not authenticated.';
/** The copy slots the script shows, written into its config (no partial places them). */
export const SCRIPT_SLOTS = Object.freeze({ signin: 'intake.signin', outside: 'intake.outside', text: 'intake.text' });
/** The kind chooser's option labels: one copy slot per kind, written by fillProposalSection. */
export const kindSlot = kind => `proposal.kind.${kind}`;
export const INTAKE_SLOTS = Object.freeze([...Object.values(SCRIPT_SLOTS), ...Object.values(REFUSALS), ...PROPOSAL_KINDS.map(kindSlot)]);

/** The tokens the proposal section and the script carry for the builder to fill. */
export const PROPOSAL_TOKEN = '{{proposal:kinds}}';
export const SCRIPT_TOKEN = '{{request:config}}';
export const PROPOSAL_SPEC_KEYS = Object.freeze(['kinds']);
/** Spec keys that are gone, each refused naming what replaced it. */
export const REFUSED_SPEC_KEYS = Object.freeze({
  request: 'request.action is deleted: the forms no longer post to an endpoint. They send to DeSciX\'s proposal intake '
    + `(${INTAKE.command}, kb ${INTAKE.kb_id}) from a signed-in visitor, with app_id the spec's file name and page_url its self_host + "/" — drop "request" and declare "self_host": "https://<app id>.descix.net"`,
});

/** The spec's proposal block, checked: {kinds: [a non-empty subset of PROPOSAL_KINDS, no repeats]}. */
export function normalizeProposal(partial, where) {
  const shape = `"proposal": {"kinds": [${PROPOSAL_KINDS.map(k => JSON.stringify(k)).join(', ')} — any of them]}`;
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) refuse(`${where}: proposal is ${shape}`);
  for (const k of Object.keys(partial)) if (!PROPOSAL_SPEC_KEYS.includes(k) && !k.startsWith('_')) refuse(`${where}: unknown proposal key "${k}" (${shape})`);
  const kinds = partial.kinds;
  if (!Array.isArray(kinds) || !kinds.length) refuse(`${where}: proposal.kinds is unset or empty — the proposal section's form offers these kinds; declare ${shape}`);
  for (const k of kinds) if (!PROPOSAL_KINDS.includes(k)) refuse(`${where}: proposal.kinds names "${k}", which is not a proposal kind (PROPOSAL_KINDS: ${PROPOSAL_KINDS.join(', ')})`);
  const dup = kinds.find((k, i) => kinds.indexOf(k) !== i);
  if (dup) refuse(`${where}: proposal.kinds names "${dup}" twice`);
  return Object.freeze({ kinds: Object.freeze([...kinds]) });
}

const ORIGIN = /^https:\/\/([a-z0-9-]+)((?:\.[a-z0-9-]+)+)$/;
/**
 * The intake's address for a page that carries a form: {app_id, page_url}. page_url is self_host + '/', and self_host
 * must be an https origin on the app's own host (its first label is the app id). Refuses naming self_host.
 */
export function intakeOf(app, selfHost, where) {
  const want = `"self_host": "https://${app}.descix.net"`;
  if (typeof selfHost !== 'string' || !selfHost) refuse(`${where}: the page carries a proposal form, which sends page_url, the page's public https address on the app's own host — declare ${want}`);
  const m = ORIGIN.exec(selfHost);
  if (!m) refuse(`${where}: self_host ${JSON.stringify(selfHost)} is not an https origin (https://<host>, no path, lower case); the form's page_url is self_host + "/" — declare ${want}`);
  if (m[1] !== app) refuse(`${where}: self_host ${JSON.stringify(selfHost)} is not the app's own host (its first label is not ${app}); the intake refuses a page_url on another host — declare ${want}`);
  return Object.freeze({ app_id: app, page_url: `${selfHost}/` });
}

/** The forms a page carries, by key, from its spec's sections. */
export const pageForms = spec => FORM_KEYS.filter(k => spec.sections.some(s => s.use === FORMS[k].section));

/**
 * The script's config: the intake call, the forms on this page with their fields (formFields), the refusal lines and
 * the script's own lines (from the copy bag). The ONE serialisation: the page carries it, and gates assertPage
 * recomputes it to exempt page_url from the self-link check.
 */
export function scriptConfig(app, spec, copy) {
  const { app_id, page_url } = intakeOf(app, spec.self_host, `${app}.json`);
  const lines = Object.fromEntries(Object.entries(SCRIPT_SLOTS).map(([k, id]) => [k, copy[id].split('{min}').join(TEXT_LIMITS.min).split('{max}').join(TEXT_LIMITS.max)]));
  return JSON.stringify({
    ...INTAKE, app_id, page_url, text: TEXT_LIMITS, extra: EXTRA, email: EMAIL_FIELD, store: `egpt-site-theme:intake:${app}`,
    forms: Object.fromEntries(pageForms(spec).map(k => [FORMS[k].id, { kind: FORMS[k].kind, parts: FORMS[k].parts, fields: formFields(k) }])),
    refusals: Object.fromEntries(Object.entries(REFUSALS).map(([code, id]) => [code, copy[id]])),
    signed_out: SIGNED_OUT_MESSAGE, lines,
  }).replace(/</g, '\\u003c');
}
/** The config statement the script carries, as written into the page. */
export const scriptConfigLine = (app, spec, copy) => `var C=${scriptConfig(app, spec, copy)};`;
export function fillRequestScript(js, app, spec, copy) {
  if (js.split(SCRIPT_TOKEN).length !== 2) refuse(`the theme's request-form script carries ${SCRIPT_TOKEN} ${js.split(SCRIPT_TOKEN).length - 1} times, needs exactly once`);
  return js.replace(`var C=${SCRIPT_TOKEN};`, () => scriptConfigLine(app, spec, copy));
}

/** The kind chooser's options: one per spec kind, labelled by its copy slot. `used` records the slots placed. */
export function fillProposalSection(html, proposal, copy, used) {
  if (html.split(PROPOSAL_TOKEN).length !== 2) refuse(`the theme's proposal section carries ${PROPOSAL_TOKEN} ${html.split(PROPOSAL_TOKEN).length - 1} times, needs exactly once`);
  const options = proposal.kinds.map(k => { used.add(kindSlot(k)); return `<option value="${esc(k)}">${esc(copy[kindSlot(k)])}</option>`; });
  return html.replace(PROPOSAL_TOKEN, () => options.join(''));
}

/** The <form id="…"> element of a section partial, or null. */
export const formHtml = (html, id) => (html.match(new RegExp(`<form\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?</form>`)) || [null])[0];
/** The control names in a form that carry a `required` attribute, in order. */
export const formRequiredNames = html => [...new Set([...html.matchAll(/<(?:input|textarea|select)\b[^>]*\bname="([^"]+)"[^>]*\brequired\b[^>]*>/g)].map(m => m[1]))];
/** The control names a form carries (name=), in order. */
export const formInputNames = html => [...new Set([...html.matchAll(/<(?:input|textarea|select)\b[^>]*\bname="([^"]+)"/g)].map(m => m[1]))];
