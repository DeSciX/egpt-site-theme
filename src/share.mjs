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
export const SHARE_BLOCK_KEYS = Object.freeze({ required: Object.freeze(['site', 'title', 'description', 'icon', 'card']), optional: Object.freeze(['default_view']) });
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
  for (const k of Object.keys(json)) if (!fields.includes(k)) refuse(`${app}: share.json key ${k} is not a field of @descix/app-sdk/share SHARE_CONTRACT`);
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
