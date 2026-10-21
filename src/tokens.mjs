// ./tokens — the theme's CSS: the :root tokens and classes every page carries in its <style> (tokens.css, the file
// the ./tokens.css export is), and the one fact a writer reads off it: the proof grid's desktop column count.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { refuse } from './html.mjs';

export const TOKENS_FILE = fileURLToPath(new URL('./tokens.css', import.meta.url));
export const tokensCss = () => fs.readFileSync(TOKENS_FILE, 'utf8');

/**
 * The desktop column count of the top-level `.grid{…grid-template-columns:repeat(N,1fr)…}` rule of `css` (the @media
 * overrides are narrower and are skipped). Exactly one such rule, or a refusal: tiles past the first N load lazily, and
 * there is no default.
 */
export function gridColumns(css = tokensCss()) {
  const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const cols = [...topLevel.matchAll(/(?<![\w-])\.grid\{([^}]*)\}/g)]
    .map(m => /grid-template-columns:\s*repeat\((\d+),\s*1fr\)/.exec(m[1])).filter(Boolean);
  if (cols.length !== 1) refuse(`the theme CSS has ${cols.length} top-level .grid{grid-template-columns:repeat(N,1fr)} rules, needs exactly one — the tiles' lazy loading is derived from it`);
  return Number(cols[0][1]);
}
