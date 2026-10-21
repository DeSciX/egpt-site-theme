// ./copy — the copy layer: every text a theme partial shows is a slot, `{ id, kind, default }`, and COPY_SLOTS is the
// one list. A slot id is public contract (`<section>.<element>[.<n>]`, as the partials spell it): adding one with a
// default is minor; renaming or removing one, or changing its kind, is major, and a removed id moves to REFUSED_SLOTS
// naming its replacement, so an override that still names it refuses.
//   text  plain text, escaped where it is placed
//   html  inline HTML, placed as written; an override is held to HTML_ALLOWLIST
// The defaults are the template page's text verbatim (copy/template-slots.json) plus the two texts the page writer
// itself shows (copy/theme-slots.json). An app overrides slots in its copy file:
//   { "schema": "egpt-site-theme/copy@1", "slots": { "<id>": "<text>" | { "html": "<inline html>" } } }
import fs from 'node:fs';
import { esc, refuse } from './html.mjs';

const data = f => JSON.parse(fs.readFileSync(new URL(`./copy/${f}`, import.meta.url), 'utf8'));
export const COPY_SCHEMA = 'egpt-site-theme/copy@1';
export const COPY_KINDS = Object.freeze(['text', 'html']);
export const COPY_SLOTS = Object.freeze([...data('template-slots.json'), ...data('theme-slots.json')].map(Object.freeze));
/** Removed slot ids → the id that replaced them (none removed yet). */
export const REFUSED_SLOTS = Object.freeze({});
/** Text the page shows that is NOT copy: the showcase roster owns it, and no copy file may override it. */
export const ROSTER_OWNED = Object.freeze({
  'proof.throughline': 'SHOWCASE_THROUGH_LINE', 'proof.tile.title': 'EXHIBITS[].title',
  'proof.tile.line': 'EXHIBITS[].tile', 'proof.tile.alt': 'EXHIBITS[].still.alt',
});
/** The inline tags (and the attributes on them) an html override may carry. */
export const HTML_ALLOWLIST = Object.freeze({
  tags: Object.freeze(['a', 'b', 'i', 'em', 'strong', 'code', 'br', 'q', 'span', 'small', 'sup', 'sub']),
  attrs: Object.freeze(['href', 'target', 'rel', 'class', 'style', 'id', 'tabindex', 'data-src']),
});
/** Text no shipped copy may carry: unfinished-draft markers. */
export const PLACEHOLDER = /\b(?:TODO|TBD|FIXME|XXX)\b|lorem ipsum|\{\{|\bfill (?:this|me) in\b/i;
export const SLOT_TOKEN = /\{\{slot:([^}]+)\}\}/g;

const BY_ID = new Map(COPY_SLOTS.map(s => [s.id, s]));
if (BY_ID.size !== COPY_SLOTS.length) throw new Error('COPY_SLOTS repeats an id');
for (const s of COPY_SLOTS) if (!COPY_KINDS.includes(s.kind) || typeof s.default !== 'string') throw new Error(`COPY_SLOTS row ${s.id} is malformed`);

function checkHtml(id, html) {
  for (const m of html.matchAll(/<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const tag = m[1].toLowerCase();
    if (!HTML_ALLOWLIST.tags.includes(tag)) refuse(`copy ${id}: <${tag}> is not inline copy (allowed: ${HTML_ALLOWLIST.tags.join(' ')}); structure belongs to the theme's partials`);
    for (const a of m[2].matchAll(/([a-zA-Z][\w-]*)\s*=/g)) if (!HTML_ALLOWLIST.attrs.includes(a[1].toLowerCase())) refuse(`copy ${id}: attribute ${a[1]} on <${tag}> is not allowed (allowed: ${HTML_ALLOWLIST.attrs.join(' ')})`);
  }
}

/**
 * The full copy bag: every COPY_SLOTS id → its value (the default, or the override). `partial` is a copy file's
 * object (or null). Refuses an unknown or removed id, a roster-owned id, a wrong kind, a placeholder, html outside the
 * allowlist, and a file with another schema. The bag's `overridden` lists the ids an override set.
 */
export function normalizeCopy(partial, where = 'copy') {
  const bag = Object.fromEntries(COPY_SLOTS.map(s => [s.id, s.default]));
  const overridden = [];
  if (partial != null) {
    if (typeof partial !== 'object' || Array.isArray(partial)) refuse(`${where}: a copy file is an object {"schema": "${COPY_SCHEMA}", "slots": {…}}`);
    for (const k of Object.keys(partial)) if (!['schema', 'slots'].includes(k) && !k.startsWith('_')) refuse(`${where}: unknown key ${k} (a copy file holds schema and slots)`);
    if (partial.schema !== COPY_SCHEMA) refuse(`${where}: schema ${JSON.stringify(partial.schema)} is not ${COPY_SCHEMA}`);
    for (const [id, v] of Object.entries(partial.slots || {})) {
      if (id in ROSTER_OWNED) refuse(`${where}: ${id} is the showcase roster's (${ROSTER_OWNED[id]} of @descix/frqtl-web/registry), not copy`);
      if (id in REFUSED_SLOTS) refuse(`${where}: slot ${id} was removed; its replacement is ${REFUSED_SLOTS[id]}`);
      const slot = BY_ID.get(id);
      if (!slot) refuse(`${where}: no slot ${id} (the theme's COPY_SLOTS are the one list; README "Copy slots")`);
      let value;
      if (slot.kind === 'text') {
        if (typeof v !== 'string') refuse(`${where}: ${id} is a text slot; its override is a string`);
        value = v;
      } else {
        if (!v || typeof v !== 'object' || typeof v.html !== 'string' || Object.keys(v).length !== 1) refuse(`${where}: ${id} is an html slot; its override is {"html": "…"}`);
        checkHtml(id, v.html);
        value = v.html;
      }
      if (!value.trim()) refuse(`${where}: ${id} is empty`);
      if (PLACEHOLDER.test(value)) refuse(`${where}: ${id} carries placeholder text ("${value.match(PLACEHOLDER)[0]}")`);
      bag[id] = value;
      overridden.push(id);
    }
  }
  return Object.freeze({ ...bag, [Symbol.for('egpt-site-theme.overridden')]: Object.freeze(overridden) });
}
export const overriddenOf = bag => bag[Symbol.for('egpt-site-theme.overridden')] || [];

/** A slot's value as it is placed in markup: text escaped, html as written. */
export const placed = (bag, id) => {
  const slot = BY_ID.get(id) || refuse(`a partial names slot ${id}, which COPY_SLOTS does not list`);
  return slot.kind === 'text' ? esc(bag[id]) : bag[id];
};
export const slotKind = id => (BY_ID.get(id) || refuse(`no slot ${id}`)).kind;

/** Fills every {{slot:<id>}} token of `markup`, recording the ids placed into `used` (a Set). */
export const fillCopy = (markup, bag, used) => markup.replace(SLOT_TOKEN, (m, id) => { const v = placed(bag, id); if (used) used.add(id); return v; });
