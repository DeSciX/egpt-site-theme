// ./gates — the conformance checks. assertTheme holds the theme's own partials to the page contract (run by every
// build, before anything is assembled); assertPage is the ONE check of an assembled page, run by buildPage on every
// page it writes and by any consumer on a page it serves.
import { refuse, unent, esc } from './html.mjs';
import { COPY_SLOTS, SLOT_TOKEN } from './copy.mjs';
import { TOKENS_INCLUDE } from './partials.mjs';
import { gridColumns } from './tokens.mjs';
import { tileOf, tileHtml } from './tiles.mjs';

export const EXHIBITS_MARK = /<[a-z][a-z0-9]*\b[^>]*\bdata-exhibits\b[^>]*>/g;
export const THROUGH_MARK = /<[a-z][a-z0-9]*\b[^>]*\bdata-showcase-throughline\b[^>]*>/g;
export const THROUGH_SLOT = /<([a-z][a-z0-9]*)\b([^>]*\bdata-showcase-throughline\b[^>]*)>([\s\S]*?)<\/\1>/g;
const HAND_TILE = /<a\b[^>]*\bclass="tile[\s"]/g;
/** The slots no partial places: the tile writer places proof.tile.cta. */
export const WRITER_SLOTS = Object.freeze(['proof.tile.cta']);
/** The <body> provenance stamp: attribute → the stampOf key it carries, in order (a null roster is omitted). */
export const STAMP_ATTRS = Object.freeze([['data-frontpage-app', 'app'], ['data-frontpage-theme', 'theme'], ['data-frontpage-roster', 'roster'], ['data-frontpage-build', 'build']].map(Object.freeze));

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
  const left = html.match(/\{\{(?:slot|theme):[^}]*\}\}/);
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
  if (spec.self_host && html.includes(spec.self_host)) refuse(`a self-link to ${spec.self_host} remains; rewrite it to a deep link`);
}
