// ./tiles — the one tile writer. A tile is a bag of TILE_FIELDS built by tileOf(row, ctx) from one showcase-roster
// row, and tileHtml(bag) is the only markup. The rows are the app's pinned @descix/frqtl-web/registry's: the EXHIBITS it
// ships (0.6), or, for a registry that ships none (0.7: normalizeRoster), the showcase cards of the app's own roster
// file (spec "roster"), read through the registry's readers (rosterView).
//   href      the roster's own link writer: showcaseHref(row) (relative) on the showcase app's page, else
//             showcaseUrl(row) (absolute on SHOWCASE_SITE.origin); the page is the showcase app's iff
//             ctx.app === SHOWCASE_SITE.app
//   external  true iff the link leaves the page's site (new tab)
//   title     row.title;   line  row.tile (required)
//   img       { src: images/<sceneKey>.png, alt: row.still.alt, lazy: index >= the grid's column count } | null
//   cta       the copy slot proof.tile.cta
import { esc, refuse } from './html.mjs';
import { importFrom, resolveFrom, versionFrom } from './resolve.mjs';
import { IMAGES_OUT } from './outputs.mjs';

export const ROSTER_PKG = '@descix/frqtl-web';
export const ROSTER_EXPORT = `${ROSTER_PKG}/registry`;
export const TILE_FIELDS = Object.freeze(['href', 'external', 'title', 'line', 'img', 'cta']);
export const TILE_IMG_FIELDS = Object.freeze(['src', 'alt', 'lazy']);
/** The roster row field that is the tile's caption line. */
export const TILE_LINE = 'tile';

/**
 * The pinned roster, imported by package name from `fromDir` (the app). `file` is the app's roster file
 * ({ path, json, url }: the spec's "roster", read from the app's committed inputs) or null. Returns { X, release,
 * version }; refuses a package that is not installed (naming npm ci), one that fails to load (as itself), one that lacks
 * the rows, sceneKey or the link writer, a registry that ships no rows when the spec names no roster file (and one that
 * ships rows when it does), and a roster file the registry's normalizeRoster refuses (naming the file).
 */
export async function loadRoster(fromDir, file = null) {
  let X;
  try { X = await importFrom(fromDir, ROSTER_EXPORT); }
  catch (e) {
    if (!resolveFrom(fromDir, ROSTER_EXPORT)) refuse(`roster unreadable: ${ROSTER_EXPORT} is not installed — run npm ci (package.json pins ${ROSTER_PKG}): ${e.message}`);
    refuse(`roster unreadable: ${ROSTER_EXPORT} failed to load: ${e && e.stack ? e.stack : e}`);
  }
  const version = versionFrom(fromDir, ROSTER_PKG);
  const release = `${ROSTER_PKG}@${version}`;
  if (typeof X.normalizeRoster === 'function') {
    if (!file) refuse(`roster unreadable: ${ROSTER_EXPORT} (${release}) ships no rows (normalizeRoster); declare the app's roster file in the spec: "roster": "<path in the app dir>"`);
    X = rosterView(X, file, release);
  } else if (file) refuse(`${file.path}: ${ROSTER_EXPORT} (${release}) ships its own rows (EXHIBITS), so the spec's "roster" file would not be read — drop "roster", or pin a release with normalizeRoster`);
  if (!Array.isArray(X.EXHIBITS) || !X.EXHIBITS.length || typeof X.sceneKey !== 'function') refuse(`roster unreadable: ${ROSTER_EXPORT} (${release}) exports no EXHIBITS rows / sceneKey`);
  const lacks = ['showcaseHref', 'showcaseUrl'].filter(n => typeof X[n] !== 'function');
  const site = X.SHOWCASE_SITE;
  if (!site || typeof site.app !== 'string' || typeof site.origin !== 'string') lacks.push('SHOWCASE_SITE');
  if (lacks.length) refuse(`roster unreadable: ${ROSTER_EXPORT} (${release}) exports no ${lacks.join(', ')} — the tile link writer; pin ${ROSTER_PKG} exactly to the release egpt-frqtl serves (package.json), then npm ci`);
  for (const r of X.EXHIBITS) {
    if (r.still && (typeof r.still.alt !== 'string' || !r.still.alt.trim())) refuse(`roster row ${r.id} declares a still without its alt text (still.alt, roster ${release}) — a tile never ships alt=""`);
  }
  return { X, release, version };
}

/**
 * The registry's readers over the app's roster file, in the shape the tile writer reads: the rows are the showcase
 * cards, sceneKey/showcaseHref/showcaseUrl are bound to the normalized roster, SHOWCASE_SITE is the showcase's
 * siteOrigin (the app is its host's first label, the self_host rule) and the through-line is the showcase's. The roster's
 * href is the file's own URL: the tile links are written from siteOrigin, never from where the roster was read.
 */
function rosterView(R, file, release) {
  let roster;
  try { roster = R.normalizeRoster(file.json, file.url); }
  catch (e) { refuse(`roster file ${file.path}: ${release} normalizeRoster refuses it: ${e.message}`); }
  const sc = roster.showcase;
  if (!sc) refuse(`roster file ${file.path} declares no showcase: the tiles are its showcase cards`);
  return Object.freeze({
    EXHIBITS: sc.rows,
    sceneKey: k => R.sceneKey(roster, { id: k.id, modeId: k.modeId }),
    showcaseHref: row => R.showcaseHref(roster, row),
    showcaseUrl: row => R.showcaseUrl(roster, row),
    SHOWCASE_SITE: Object.freeze({ app: new URL(sc.siteOrigin).hostname.split('.')[0], origin: sc.siteOrigin }),
    SHOWCASE_THROUGH_LINE: sc.throughLine,
  });
}

/** A row's still file name: the roster's own sceneKey. */
export const stillName = (X, row) => `${X.sceneKey({ kind: row.kind, id: row.id, modeId: row.mode })}.png`;

/** ctx: { roster: X, app, index, columns, cta } */
export function tileOf(row, ctx) {
  const { roster: X, app, index, columns, cta } = ctx || {};
  if (!X || typeof app !== 'string' || !Number.isInteger(index) || !Number.isInteger(columns) || typeof cta !== 'string') refuse('tileOf(row, { roster, app, index, columns, cta }): every context key is required');
  const line = row[TILE_LINE];
  if (typeof line !== 'string' || !line.trim()) refuse(`roster row ${row.id} has no ${TILE_LINE} line — the tile caption is the row's ${TILE_LINE}`);
  const external = app !== X.SHOWCASE_SITE.app;
  return Object.freeze({
    href: external ? X.showcaseUrl(row) : X.showcaseHref(row),
    external,
    title: row.title,
    line,
    img: row.still ? Object.freeze({ src: `${IMAGES_OUT}/${stillName(X, row)}`, alt: row.still.alt, lazy: index >= columns }) : null,
    cta,
  });
}

export function tileHtml(bag) {
  const keys = Object.keys(bag);
  if (keys.join() !== TILE_FIELDS.join()) refuse(`tileHtml: a tile bag has exactly ${TILE_FIELDS.join(', ')} (got ${keys.join(', ')})`);
  const { href, external, title, line, img, cta } = bag;
  const im = img ? `<img src="${esc(img.src)}" alt="${esc(img.alt)}"${img.lazy ? ' loading="lazy" decoding="async"' : ''}>` : '';
  return `<a class="tile${im ? '' : ' dark'}" href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${im}<span class="cap"><b>${esc(title)}</b><span>${esc(line)}</span><i>${esc(cta)}</i></span></a>`;
}
