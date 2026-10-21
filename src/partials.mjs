// ./partials — the theme's markup: the page head, nav, hero, footer, the sections by id, the login button and the
// template's own request-form script. Partials carry NO copy: every text is a {{slot:<id>}} token the copy layer
// (./copy) fills; the head carries one {{theme:tokens.css}} include. The section ids are the files present
// (enumerated, never listed by hand).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refuse } from './html.mjs';

export const PARTIALS_DIR = fileURLToPath(new URL('./partials/', import.meta.url));
export const IMAGES_DIR = fileURLToPath(new URL('./images/', import.meta.url));
/** The include token the head carries where the theme CSS goes. */
export const TOKENS_INCLUDE = '{{theme:tokens.css}}';
const read = rel => fs.readFileSync(path.join(PARTIALS_DIR, rel), 'utf8');

/** The section ids, in file-name order (the page's order is its spec's). */
export const SECTION_IDS = Object.freeze(fs.readdirSync(path.join(PARTIALS_DIR, 'sections')).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).sort());

/** Every partial, read once: { head, nav, hero, footer, login, loginCss, requestForm, sections: {id: html} }. */
export function loadPartials() {
  return Object.freeze({
    head: read('head.html'), nav: read('nav.html'), hero: read('hero.html'), footer: read('footer.html'),
    login: read('login.html'), loginCss: read('login.css'), requestForm: read('scripts/request-form.js'),
    sections: Object.freeze(Object.fromEntries(SECTION_IDS.map(id => [id, read(`sections/${id}.html`)]))),
  });
}
export const sectionOf = (partials, id) => partials.sections[id] || refuse(`the theme has no section "${id}" (has: ${SECTION_IDS.join(', ')})`);

/** The theme images a page may use (images/<name>), by name. */
export const THEME_IMAGES = Object.freeze(fs.readdirSync(IMAGES_DIR).filter(f => !f.startsWith('.')).sort());
export const themeImage = name => (THEME_IMAGES.includes(name) ? fs.readFileSync(path.join(IMAGES_DIR, name)) : null);
