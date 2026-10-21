// The one resolver for the packages a page build reads (the app pins them; the theme names them as peers): every
// specifier resolves from the APP's directory, so the roster, the bridge file and the share contract are the
// versions the app installed, never a second copy the theme carries.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function resolveFrom(fromDir, specifier) {
  try { return createRequire(path.join(path.resolve(fromDir), '_resolve_.js')).resolve(specifier); }
  catch (e) { return null; }
}
export async function importFrom(fromDir, specifier) {
  const file = resolveFrom(fromDir, specifier);
  if (!file) { const e = new Error(`${specifier} does not resolve from ${fromDir}`); e.code = 'ERR_UNRESOLVED'; throw e; }
  return import(pathToFileURL(file).href);
}
export function versionFrom(fromDir, pkg) {
  const file = resolveFrom(fromDir, `${pkg}/package.json`);
  return file ? createRequire(file)(file).version : null;
}
