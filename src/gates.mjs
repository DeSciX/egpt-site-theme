// ./gates — the conformance checks. assertTheme holds the theme's own partials to the page contract (run by every
// build, before anything is assembled); assertPage is the ONE check of an assembled page, run by buildPage on every
// page it writes and by any consumer on a page it serves.
import { refuse, unent, esc } from './html.mjs';
import { COPY_SLOTS, SLOT_TOKEN } from './copy.mjs';
import { TOKENS_INCLUDE } from './partials.mjs';
import { gridColumns } from './tokens.mjs';
import { tileOf, tileHtml } from './tiles.mjs';
import { FORMS, FORM_KEYS, formFields, formHtml, PROPOSAL_TOKEN, SCRIPT_TOKEN, INTAKE_SLOTS, pageForms, scriptConfigLine, formInputNames, formRequiredNames } from './request.mjs';

export const EXHIBITS_MARK = /<[a-z][a-z0-9]*\b[^>]*\bdata-exhibits\b[^>]*>/g;
export const THROUGH_MARK = /<[a-z][a-z0-9]*\b[^>]*\bdata-showcase-throughline\b[^>]*>/g;
export const THROUGH_SLOT = /<([a-z][a-z0-9]*)\b([^>]*\bdata-showcase-throughline\b[^>]*)>([\s\S]*?)<\/\1>/g;
const HAND_TILE = /<a\b[^>]*\bclass="tile[\s"]/g;
/** The slots no partial places: the tile writer places proof.tile.cta; the login script's config carries
 *  nav.login.signedin; the request-form script's config and the kind chooser carry ./request INTAKE_SLOTS. */
export const WRITER_SLOTS = Object.freeze(['proof.tile.cta', 'nav.login.signedin', ...INTAKE_SLOTS]);
/** The <body> provenance stamp: attribute → the stampOf key it carries, in order (a null roster is omitted). */
export const STAMP_ATTRS = Object.freeze([['data-frontpage-app', 'app'], ['data-frontpage-theme', 'theme'], ['data-frontpage-roster', 'roster'], ['data-frontpage-build', 'build']].map(Object.freeze));

/** What only the auth watcher may do; a consumer script that does any of it is refused (assertTheme). */
export const AUTH_READERS = Object.freeze([
  ['defines egptSiteAuth', /egptSiteAuth\s*=/],
  ['waits on ready()', /\.ready\s*\(/],
  ["reads the bus's members", /\bmembers\b/],
  ['reads bridgeLevel', /\bbridgeLevel\b/],
  ["subscribes to on('auth')", /\.on\s*\(\s*(['"`])auth\1/],
  ['listens for DESCX_BRIDGE_READY', /DESCX_BRIDGE_READY/],
].map(Object.freeze));

/** The theme's preconditions: what every page assumes of the partials and the CSS. */
export function assertTheme(partials, css) {
  const all = [partials.head, partials.nav, partials.hero, partials.footer, partials.login, ...Object.values(partials.sections)];
  const where = 'the theme partials';
  const hand = all.reduce((n, p) => n + (p.match(HAND_TILE) || []).length, 0);
  const slots = all.reduce((n, p) => n + (p.match(EXHIBITS_MARK) || []).length, 0);
  if (hand || !slots) refuse(`${where} ${[hand ? `carry ${hand} hand-written <a class="tile"` : '', slots ? '' : 'declare no data-exhibits slot'].filter(Boolean).join(' and ')}; the roster is the one owner of tiles`);
  const marks = all.reduce((n, p) => n + (p.match(THROUGH_MARK) || []).length, 0);
  if (marks !== 1) refuse(`${where} carry ${marks} data-showcase-throughline markers, need exactly one (in #proof) — the roster's SHOWCASE_THROUGH_LINE fills it`);
  const inProof = [...(partials.sections.proof || '').matchAll(THROUGH_SLOT)];
  if (inProof.length !== 1) refuse(`${where}: the data-showcase-throughline marker is not a closed element inside <section id="proof">`);
  if (inProof[0][3].trim()) refuse(`${where}: the data-showcase-throughline marker holds hand text ("${inProof[0][3].trim().slice(0, 60)}…"); the roster is the one owner of the through-line`);
  gridColumns(css);
  // each proposal form: its section carries it once, with no action or method (the script sends it); its controls are
  // exactly ./request formFields(key), in order, with the required marks; the lines and the done panel the script shows
  // are there once each. The proposal section carries the kinds token once; the script carries its config token once.
  for (const key of FORM_KEYS) {
    const F = FORMS[key], sec = partials.sections[F.section] || '';
    const form = formHtml(sec, F.id);
    if (!form || sec.split(`id="${F.id}"`).length !== 2) refuse(`${where}: the ${F.section} section does not carry <form id="${F.id}"> exactly once`);
    if (/^<form\b[^>]*\b(?:action|method)=/.test(form)) refuse(`${where}: <form id="${F.id}"> carries an action or method; the form is sent by the request-form script to DeSciX's proposal intake, never posted`);
    const rows = formFields(key);
    if (formInputNames(form).join() !== rows.map(f => f.name).join()) refuse(`${where}: the ${F.section} section's form carries [${formInputNames(form).join(', ')}], REQUEST_FIELDS' ${key} controls are [${rows.map(f => f.name).join(', ')}] — ./request is the one owner of the field names`);
    const req = rows.filter(f => f.required).map(f => f.name);
    if (formRequiredNames(form).join() !== req.join()) refuse(`${where}: the ${F.section} section's form marks [${formRequiredNames(form).join(', ')}] required, REQUEST_FIELDS' required ${key} controls are [${req.join(', ')}] — ./request is the one owner`);
    for (const [part, id] of Object.entries(F.parts)) if (sec.split(`id="${id}"`).length !== 2) refuse(`${where}: the ${F.section} section carries id="${id}" (the form's ${part}) ${sec.split(`id="${id}"`).length - 1} times, needs exactly once`);
  }
  if ((partials.sections.proposal || '').split(PROPOSAL_TOKEN).length !== 2) refuse(`${where}: the proposal section carries ${PROPOSAL_TOKEN} ${(partials.sections.proposal || '').split(PROPOSAL_TOKEN).length - 1} times, needs exactly once`);
  if (partials.requestForm.split(`var C=${SCRIPT_TOKEN};`).length !== 2) refuse(`${where}: the request-form script carries var C=${SCRIPT_TOKEN}; ${partials.requestForm.split(`var C=${SCRIPT_TOKEN};`).length - 1} times, needs exactly once`);
  if (partials.loginScript.split('{{login:config}}').length !== 2) refuse(`${where}: the login script carries {{login:config}} ${partials.loginScript.split('{{login:config}}').length - 1} times, needs exactly once`);
  // the sign-in state has one reader, the auth watcher: it alone defines egptSiteAuth, waits on ready(), reads the bus's
  // members and bridgeLevel, listens for DESCX_BRIDGE_READY and subscribes to powch's 'auth'
  if (partials.authScript.split('window.egptSiteAuth=').length !== 2) refuse(`${where}: the auth watcher script does not define window.egptSiteAuth exactly once`);
  for (const [name, js] of [['login', partials.loginScript], ['request-form', partials.requestForm]]) {
    if (!js.includes('egptSiteAuth.watch(')) refuse(`${where}: the ${name} script does not take the sign-in state from the auth watcher (egptSiteAuth.watch)`);
    const own = AUTH_READERS.find(([, re]) => re.test(js));
    if (own) refuse(`${where}: the ${name} script reads the sign-in state itself (${own[0]}); the auth watcher (partials/scripts/auth.js) is its one reader`);
  }
  if (partials.head.split(TOKENS_INCLUDE).length !== 2) refuse(`${where}: the head carries ${TOKENS_INCLUDE} ${partials.head.split(TOKENS_INCLUDE).length - 1} times, needs exactly once`);
  if (!partials.head.includes('</head>')) refuse(`${where}: the head has no </head>`);
  // every slot is placed exactly once, by one partial or by the tile writer; no partial names a slot COPY_SLOTS lacks
  const placedBy = new Map();
  for (const p of all) for (const m of p.matchAll(SLOT_TOKEN)) placedBy.set(m[1], (placedBy.get(m[1]) || 0) + 1);
  for (const id of WRITER_SLOTS) placedBy.set(id, (placedBy.get(id) || 0) + 1);
  for (const [id, n] of placedBy) {
    if (!COPY_SLOTS.some(s => s.id === id)) refuse(`${where} name slot ${id}, which COPY_SLOTS does not list`);
    if (n !== 1) refuse(`${where} place slot ${id} ${n} times; a slot is placed once`);
  }
  for (const s of COPY_SLOTS) if (!placedBy.has(s.id)) refuse(`COPY_SLOTS lists ${s.id}, which no partial places`);
}

/** The stamp: STAMP_ATTRS in order, each `attr="value"`; the roster attribute only when the page used a roster. */
export function stampOf(values) {
  return STAMP_ATTRS.filter(([, k]) => k !== 'roster' || values.roster).map(([attr, k]) => `${attr}="${esc(values[k])}"`).join(' ');
}

/**
 * The one check of an assembled page. ctx: { app, theme, build, spec (normalized), copy (bag), roster: {X, version}
 * | null, columns }. Refuses: a stamp that does not name the app and the pins the build used; an unfilled slot or
 * include token; a data-exhibits element whose content is not exactly the roster's tiles (tileOf/tileHtml, in roster
 * order); a through-line marker that does not hold the roster's line (declared) or nothing (undeclared); a link left
 * pointing at the app's own public origin.
 */
export function assertPage(html, ctx) {
  const { app, theme, build, spec, copy, roster, columns } = ctx;
  const stamp = `<body ${stampOf({ app, theme, roster: roster && roster.version, build })}>`;
  if (!html.includes(stamp)) refuse(`${app}: the page's <body> stamp is not ${stamp}`);
  const left = html.match(/\{\{(?:slot|theme|request|login|proposal):[^}]*\}\}/);
  if (left) refuse(`${app}: an unfilled token remains: ${left[0]}`);
  for (const m of html.matchAll(EXHIBITS_MARK)) {
    const rest = html.slice(m.index + m[0].length);
    const inner = m[0].startsWith('<div') ? rest.slice(0, rest.indexOf('</div>')) : '';
    const n = (inner.match(HAND_TILE) || []).length;
    if (!roster) refuse(`${app}: a data-exhibits slot, but no roster was loaded`);
    const want = roster.X.EXHIBITS.map((r, index) => tileHtml(tileOf(r, { roster: roster.X, app, index, columns, cta: copy['proof.tile.cta'] })));
    if (n !== want.length) refuse(`${app}: a data-exhibits slot holds ${n} tiles, the roster (@descix/frqtl-web@${roster.version}) has ${want.length} rows — an unfilled slot cannot ship (${m[0]})`);
    if (inner !== `\n${want.map(t => `    ${t}`).join('\n')}\n  `) refuse(`${app}: a data-exhibits slot's tiles are not the roster's (tileOf/tileHtml of @descix/frqtl-web@${roster.version}, in order)`);
  }
  const through = spec.through_line !== null;
  const marks = (html.match(THROUGH_MARK) || []).length;
  const filled = [...html.matchAll(THROUGH_SLOT)];
  if (filled.length !== marks) refuse(`${app}: ${marks} data-showcase-throughline markers but ${filled.length} closed elements — a marker the fill cannot reach cannot ship`);
  if (through && !marks) refuse(`${app}.json declares through_line but the page carries no data-showcase-throughline marker (it uses no #proof)`);
  for (const m of filled) {
    const got = unent(m[3]);
    if (through && got !== roster.X.SHOWCASE_THROUGH_LINE.join('')) refuse(`${app}: a data-showcase-throughline marker holds "${got.slice(0, 60)}…", not the roster's SHOWCASE_THROUGH_LINE (@descix/frqtl-web@${roster.version})`);
    if (!through && got.trim()) refuse(`${app}: a data-showcase-throughline marker holds "${got.slice(0, 60)}…", but ${app}.json declares no through_line — the slot stays empty`);
  }
  // the request-form script's config carries page_url (self_host + '/') by design: that one statement is not a link
  const config = spec.sections && spec.scripts && spec.scripts.template_scripts && pageForms(spec).length ? scriptConfigLine(app, spec, copy) : null;
  if (config && html.split(config).length !== 2) refuse(`${app}: the request-form script's config is not ./request scriptConfig of this spec and copy`);
  if (spec.self_host && (config ? html.replace(config, '') : html).includes(spec.self_host)) refuse(`a self-link to ${spec.self_host} remains; rewrite it to a deep link`);
}
