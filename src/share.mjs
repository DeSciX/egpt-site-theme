// ./share — the site's share.json and its three images. The file's field contract is @descix/app-sdk/share (resolved
// from the app): every object written passes its validateShareJson, and every key written is a SHARE_CONTRACT field,
// so the accepted fields and views are the platform's list, never one restated here. What this module owns is the
// share BLOCK an app declares (SHARE_BLOCK_KEYS) and the bundle layout of the images (SHARE_ASSETS under SHARE_DIR).
import fs from 'node:fs';
import path from 'node:path';
import { refuse } from './html.mjs';
import { importFrom } from './resolve.mjs';
import { IMAGES_OUT } from './outputs.mjs';

export const SHARE_DIR = `${IMAGES_OUT}/share`;
export const SHARE_ASSETS = Object.freeze({ icon: 'favicon.ico', apple_touch_icon: 'icon-180.png', og_image: 'share-1200x630.png' });
/** The block's keys: the five the share renderer needs, and the optional starting view. */
export const SHARE_BLOCK_KEYS = Object.freeze({ required: Object.freeze(['site', 'title', 'description', 'icon', 'card']), optional: Object.freeze(['default_view', 'pages']) });

// Per-view share cards: share.json `pages` = { "<slug>": { title, description, image?, to } }, read by the DeSciX edge.
// Interim copy of the DeSciX edge's per-view card rules, the one owner the build and the tests read; deleted when
// @descix/app-sdk's share contract exports them (shareJson refuses from the day SHARE_CONTRACT lists `pages`). The edge
// silently skips a bad entry and the upload does not validate, so every rule refuses at build.
export const PAGES_KEY = 'pages';
export const PAGE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const PAGES_MAX = 200;
/** Slugs the edge reserves (it ignores a page under one): an exact, case-sensitive match, as the edge matches. The env
 *  labels (demo, dev, preview, prod) are edge config and can change with a deploy. */
export const RESERVED_SLUGS = Object.freeze(['apifront', 'mcp', 'oauth', '.well-known', 'api', 'assets', 'Community', 'site', '__descix', 'demo', 'dev', 'preview', 'prod']);
/** A page's fields, in the order share.json carries them. */
export const PAGE_FIELDS = Object.freeze([
  Object.freeze({ name: 'title', required: true, max: 200 }),
  Object.freeze({ name: 'description', required: true, max: 500 }),
  Object.freeze({ name: 'image', required: false, max: 512 }),
  Object.freeze({ name: 'to', required: true, max: 512 }),
]);
/** `to`: an in-page '#…' or a same-host path with a single leading '/'. */
export const PAGE_TO = /^(?:#|\/(?!\/))/;
/** `to`'s character rule, the edge parser's own regex, tested against the whole `to`: no whitespace (JS \\s, so U+00A0 and
 *  U+2028 too), no C0 control, no U+007F, no backslash. C1 controls (U+0085) and U+200B are accepted, as the edge accepts them. */
export const PAGE_TO_FORBIDDEN = /[\s\u0000-\u001f\u007f\\]/;
/** The path part of a '/' target as written: `to` up to its query or fragment. */
export const pageToPath = to => to.split(/[?#]/)[0];
/** A dot segment as written: '.' or '..', each dot written as '.' or %2e/%2E, in every mix. */
export const PAGE_DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
/** The base a '/' target is resolved against (URL API); the resolved pathname may not start with '//'. */
export const PAGE_TO_BASE = 'https://h.invalid/';
/** `image`: a bundle-relative path written like og_image (no leading '/', no scheme, no '..'), never under assets/. */
export const PAGE_IMAGE = /^(?!\/)(?![a-z][a-z0-9+.-]*:)(?!assets\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s?#]+$/i;

/** The pages block, checked against every rule; returns it with each page's fields in PAGE_FIELDS order. */
export function validatePages(app, pages) {
  const where = `${app}: share.pages`;
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) refuse(`${where} is an object {"<slug>": {${PAGE_FIELDS.map(f => f.name).join(', ')}}}`);
  const slugs = Object.keys(pages);
  if (slugs.length > PAGES_MAX) refuse(`${where} has ${slugs.length} pages; at most ${PAGES_MAX}`);
  // every key of the right slug shape, valid entry or not, is a path no `to` may point at (the edge serves it)
  const loopKeys = slugs.filter(k => PAGE_SLUG.test(k));
  const out = {};
  for (const slug of slugs) {
    if (RESERVED_SLUGS.includes(slug)) refuse(`${where}.${slug}: "${slug}" is a reserved slug (${RESERVED_SLUGS.join(', ')}); the edge ignores it`);
    if (!PAGE_SLUG.test(slug)) refuse(`${where}.${slug}: slug "${slug}" does not match ${PAGE_SLUG}`);
    const p = pages[slug];
    if (!p || typeof p !== 'object' || Array.isArray(p)) refuse(`${where}.${slug} is an object {${PAGE_FIELDS.map(f => f.name).join(', ')}}`);
    for (const k of Object.keys(p)) if (!PAGE_FIELDS.some(f => f.name === k)) refuse(`${where}.${slug}: unknown field "${k}" (${PAGE_FIELDS.map(f => f.name).join(', ')})`);
    const page = {};
    for (const f of PAGE_FIELDS) {
      const v = p[f.name];
      if (v === undefined) { if (f.required) refuse(`${where}.${slug}.${f.name} is required`); continue; }
      if (typeof v !== 'string' || !v.trim()) refuse(`${where}.${slug}.${f.name} must be a non-empty string`);
      if (v.length > f.max) refuse(`${where}.${slug}.${f.name} is ${v.length} characters; at most ${f.max}`);
      page[f.name] = v;
    }
    if (PAGE_TO_FORBIDDEN.test(page.to)) refuse(`${where}.${slug}.to ${JSON.stringify(page.to)} carries a backslash, whitespace or control character`);
    if (!PAGE_TO.test(page.to)) refuse(`${where}.${slug}.to "${page.to}" must start with '#' or a single '/' (same host)`);
    if (page.to.startsWith('/')) {
      const resolved = new URL(page.to, PAGE_TO_BASE).pathname;
      if (resolved.startsWith('//')) refuse(`${where}.${slug}.to "${page.to}" resolves to the path "${resolved}", which starts with '//'`);
      const dot = pageToPath(page.to).split('/').find(x => PAGE_DOT_SEGMENT.test(x));
      if (dot !== undefined) refuse(`${where}.${slug}.to "${page.to}" has the dot segment "${dot}" ('.' or '..', written plain or as %2e)`);
      const loop = loopKeys.find(k => pageToPath(page.to) === `/${k}` || pageToPath(page.to) === `/${k}/`);
      if (loop !== undefined) refuse(`${where}.${slug}.to "${page.to}" is the path of the page "${loop}" (a card cannot send to a card)`);
    }
    if (page.image !== undefined && !PAGE_IMAGE.test(page.image)) refuse(`${where}.${slug}.image "${page.image}" must be a path inside the site bundle written like og_image (no leading '/', no scheme, no '..'), never under assets/`);
    out[slug] = page;
  }
  return out;
}
export const DESCRIPTION_LIMIT = 160;
/** og_image byte ceiling: "under 1 MB" (the canonical app-developer runbook). */
export const OG_IMAGE_LIMIT = 1000000;

export async function loadShareContract(fromDir) {
  try { return await importFrom(fromDir, '@descix/app-sdk/share'); }
  catch (e) { refuse(`@descix/app-sdk/share is not installed (npm ci): ${e.message}`); }
}

export function validateShareBlock(app, sh) {
  if (!sh) refuse(`${app}: no share block`);
  for (const k of SHARE_BLOCK_KEYS.required) if (!sh[k]) refuse(`${app}: share block lacks ${k}`);
  for (const k of Object.keys(sh)) if (!SHARE_BLOCK_KEYS.required.includes(k) && !SHARE_BLOCK_KEYS.optional.includes(k) && !k.startsWith('_')) refuse(`${app}: share block key "${k}" is not one of ${[...SHARE_BLOCK_KEYS.required, ...SHARE_BLOCK_KEYS.optional].join(', ')}`);
  if (sh.description.length >= DESCRIPTION_LIMIT) refuse(`${app}: share description is ${sh.description.length} characters; it must be under ${DESCRIPTION_LIMIT}`);
  return sh;
}

/** The share.json object for a block, held to the platform's contract before anything is written. */
export function shareJson(app, sh, contract) {
  validateShareBlock(app, sh);
  const json = { title: sh.title, description: sh.description, icon: `${SHARE_DIR}/${SHARE_ASSETS.icon}`, og_image: `${SHARE_DIR}/${SHARE_ASSETS.og_image}`,
    twitter_card: 'summary_large_image', apple_touch_icon: `${SHARE_DIR}/${SHARE_ASSETS.apple_touch_icon}` };
  if (sh.default_view !== undefined) json.default_view = sh.default_view;
  const fields = contract.SHARE_CONTRACT.map(f => f.name);
  if (fields.includes(PAGES_KEY)) refuse(`${app}: @descix/app-sdk/share now lists ${PAGES_KEY}; delete the theme's pages rules (./share PAGE_FIELDS, PAGE_SLUG, RESERVED_SLUGS) and read the platform's`);
  if (sh.pages !== undefined) json[PAGES_KEY] = validatePages(app, sh.pages);
  for (const k of Object.keys(json)) if (k !== PAGES_KEY && !fields.includes(k)) refuse(`${app}: share.json key ${k} is not a field of @descix/app-sdk/share SHARE_CONTRACT`);
  try { contract.validateShareJson(json); } catch (e) { refuse(`${app}: share block refused by @descix/app-sdk/share: ${e.message}`); }
  return json;
}

/** The files a share block puts in the bundle: Map(relative path → bytes), read from `assetsDir` (the rendered images). */
export function shareFiles(app, sh, contract, assetsDir) {
  const json = shareJson(app, sh, contract);
  for (const f of Object.values(SHARE_ASSETS)) if (!fs.existsSync(path.join(assetsDir, f))) refuse(`${app}: share asset not rendered: ${path.join(assetsDir, f)}`);
  const og = fs.statSync(path.join(assetsDir, SHARE_ASSETS.og_image)).size;
  if (og >= OG_IMAGE_LIMIT) refuse(`${app}: share image is ${og} bytes; it must be under 1 MB`);
  const files = new Map([[contract.SHARE_JSON_FILE, Buffer.from(JSON.stringify(json, null, 1) + '\n')]]);
  for (const f of Object.values(SHARE_ASSETS)) files.set(`${SHARE_DIR}/${f}`, fs.readFileSync(path.join(assetsDir, f)));
  return { json, files };
}
