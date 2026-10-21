// The page spec: an app's page STRUCTURE (which sections, in which order, the nav/hero/footer form, scripts, CSS,
// images, share block, the copy file and the quotation ground). SPEC_KEYS is the one table of top-level keys,
// normalizeSpec(partial, app) the one reader: it returns the full bag (absent optional keys at their defaults) and
// refuses an unknown key (a key starting with "_" is a comment), a wrong type, or a malformed nested entry.
// The `title`, `description`, `brand`, `nav`, `hero`, `footer`, `links` and per-section `links`/`anchors` keys carry
// the app's page text in the shape the page specs use today; their text moves to the copy file in a later release.
import { refuse } from './html.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const T = {
  string: v => typeof v === 'string',
  bool: v => typeof v === 'boolean',
  array: v => Array.isArray(v),
  object: isObj,
  'template|object': v => v === 'template' || isObj(v),
  'template|array': v => v === 'template' || Array.isArray(v),
  'string|null': v => v === null || typeof v === 'string',
};
export const SPEC_KEYS = Object.freeze([
  ['title', 'string', true, undefined, 'the <title> (fills page.title)'],
  ['description', 'string', true, undefined, 'the meta description (fills page.description)'],
  ['brand', 'template|object', true, undefined, '"template", or {name, tag} for a generated nav'],
  ['nav', 'template|array', true, undefined, '"template", or [{text, href, class?, style?, html?}]'],
  ['hero', 'template|object', true, undefined, '"template"; {file} (an app fragment); or {eyebrow, h1_html, lede|lede_html, primary, secondary?, kicker_html?, art?, src?}'],
  ['sections', 'array', true, undefined, '[{use: <theme section id>, links?, anchors?} | {file: <fragment>} | {hero: true}]'],
  ['footer', 'template|object', true, undefined, '"template", or {name, tag, links, legal_html}'],
  ['scripts', 'object', true, undefined, 'SCRIPT_KEYS'],
  ['links', 'array', false, [], '[[from, to]] rewrites over the theme nav, hero, footer and sections'],
  ['login', 'bool', false, false, 'the Powch login button in the theme nav'],
  ['css', 'string|null', false, null, 'app CSS appended to the theme <style>'],
  ['images', 'array', false, [], '[{from: "frontpage:<path in the app dir>" | "<path in the quotation ground>", to: "images/<name>"}]'],
  ['self_host', 'string|null', false, null, 'the app\'s own public origin: no link to it may remain on the page'],
  ['through_line', 'object', false, null, '{"source": "served-roster"}: the proof grid\'s through-line is the roster\'s'],
  ['share', 'object', false, null, 'the share block (./share SHARE_BLOCK_KEYS); absent: no share.json is written'],
  ['copy', 'string|null', false, null, 'the app\'s copy file (path in the app dir), {"schema": "egpt-site-theme/copy@1", "slots": {…}}'],
  ['quotes', 'object', false, null, '{"repo": ".", "commit": "HEAD"|<sha>} (the app\'s own repository) or {"repo": "<owner/name>", "commit": "<full sha>"} (a public GitHub repository): the quotation ground'],
].map(([key, type, required, dflt, doc]) => Object.freeze({ key, type, required, default: dflt, doc })));

export const SCRIPT_KEYS = Object.freeze({
  sdk: 'bool: the app-side DeSciX bridge file beside the page (@descix/app-sdk SITE_SCAFFOLD_BRIDGE)',
  codesite: 'bool: the inline CodeSite view declarer (./bridge); needs sdk',
  template_scripts: 'bool: the theme\'s request-form script',
  extra: '[<path in the app dir>]: inline scripts, in order',
  modules: '[<url>]: module scripts, last in the body',
  import_map: 'bool: an EMPTY import-map marker block last in the head, for the app\'s own generator; needs modules',
  forward: '{hash_to} | {query_to}: the first head script forwards such loads to that page',
});
export const SECTION_KEYS = Object.freeze(['use', 'file', 'hero', 'links', 'anchors']);
export const THROUGH_SOURCES = Object.freeze(['served-roster']);

export function normalizeSpec(partial, app) {
  const where = `${app}.json`;
  if (!isObj(partial)) refuse(`${where}: a spec is a JSON object`);
  const known = new Set(SPEC_KEYS.map(k => k.key));
  for (const k of Object.keys(partial)) if (!known.has(k) && !k.startsWith('_')) refuse(`${where}: unknown key "${k}" (SPEC_KEYS lists the keys; a comment key starts with "_")`);
  const oneForm = t => refuse(`${where} through_line ${JSON.stringify(t)}: the one form is {"source": ${THROUGH_SOURCES.map(x => JSON.stringify(x)).join(' | ')}} (omit it to leave the through-line slot empty)`);
  if (partial.through_line !== undefined && !isObj(partial.through_line)) oneForm(partial.through_line);
  const bag = {};
  for (const k of SPEC_KEYS) {
    if (!(k.key in partial)) { if (k.required) refuse(`${where}: spec lacks ${k.key}`); bag[k.key] = k.default; continue; }
    if (!T[k.type](partial[k.key])) refuse(`${where}: ${k.key} must be ${k.type}`);
    bag[k.key] = partial[k.key];
  }
  for (const k of Object.keys(bag.scripts)) if (!(k in SCRIPT_KEYS) && !k.startsWith('_')) refuse(`${where}: unknown scripts key "${k}" (SCRIPT_KEYS lists them)`);
  for (const s of bag.sections) {
    if (!isObj(s)) refuse(`${where}: a sections entry is an object`);
    for (const k of Object.keys(s)) if (!SECTION_KEYS.includes(k) && !k.startsWith('_')) refuse(`${where}: unknown sections key "${k}" in ${JSON.stringify(s)}`);
  }
  const heroAt = bag.sections.filter(s => s.hero !== undefined);
  if (heroAt.length > 1 || heroAt.some(s => s.hero !== true || Object.keys(s).length !== 1)) refuse(`sections: the hero is placed by exactly one {"hero": true} entry (got ${JSON.stringify(heroAt)})`);
  for (const s of bag.sections) if (s.hero === undefined && !s.use && !s.file) refuse(`section entry needs "use" or "file": ${JSON.stringify(s)}`);
  if (bag.through_line !== null) {
    const t = bag.through_line;
    if (Object.keys(t).join() !== 'source' || !THROUGH_SOURCES.includes(t.source)) oneForm(t);
  }
  if (bag.scripts.import_map && !(bag.scripts.modules || []).length) refuse(`${where}: scripts.import_map needs scripts.modules — an import map resolves a module script's imports, and this page loads none`);
  if (bag.scripts.codesite && !bag.scripts.sdk) refuse('scripts.codesite needs scripts.sdk: the CodeSite call goes through the SDK');
  const f = bag.scripts.forward;
  if (f && !f.hash_to && !f.query_to) refuse('scripts.forward needs hash_to or query_to');
  if (bag.quotes !== null && (typeof bag.quotes.repo !== 'string' || typeof bag.quotes.commit !== 'string' || Object.keys(bag.quotes).some(k => !['repo', 'commit'].includes(k)))) refuse(`${where}: quotes is {"repo": "." | "<owner/name>", "commit": "<sha>"}`);
  return Object.freeze(bag);
}
