// ./chrome — the page chrome: the theme CSS (the self-hosted fonts, the tokens and, with a login button, the login
// CSS), the header (brand, nav links, optional login button) and the footer, rendered from data. renderChrome is the
// ONE renderer of them: buildPage renders its chrome through it, and an app that writes its own page (it cannot use
// buildPage) calls it for the same strings. The partials carry no links and no text: the brand, the links and the
// legal line are the caller's data (normalizeChrome), and the fonts the CSS names are files the caller places beside
// the page (renderChrome().files, under FONTS_OUT).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, refuse } from './html.mjs';
import { loadPartials } from './partials.mjs';
import { tokensCss } from './tokens.mjs';
import { assertTheme, assertNoRemote } from './gates.mjs';

export const FONTS_DIR = fileURLToPath(new URL('./fonts/', import.meta.url));
/** Where the font files sit beside a page: the CSS names them as `fonts/<file>`, relative to the page. */
export const FONTS_OUT = 'fonts';
/** The font files a page needs (the woff2 files fonts.css names, and their licences), enumerated from FONTS_DIR. */
export const FONT_FILES = Object.freeze(fs.readdirSync(FONTS_DIR).filter(f => /\.(?:woff2|txt)$/.test(f)).sort());
/** The @font-face rules (fonts/fonts.css), every url relative to the page. */
export const fontsCss = () => fs.readFileSync(path.join(FONTS_DIR, 'fonts.css'), 'utf8');

/** The chrome data: key → its form. A link is LINK_KEYS; `text` or `html` (inline HTML, as written) is its label. */
export const CHROME_KEYS = Object.freeze({
  brand: '{name, tag}: the header brand',
  nav: '[link]: the header links, in order',
  footer: '{name, tag, links: [link], legal_html}: the footer',
  login: 'optional: the label of the Powch login button (#descix-login) in the header, after the links; the button is markup only (buildPage places its script)',
  app_css: 'optional {name, css}: the app\'s own CSS, placed in the theme CSS after the tokens and before the login CSS, under a /* <name> */ line',
});
export const LINK_KEYS = Object.freeze(['text', 'html', 'href', 'class', 'style']);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string' && v.length > 0;

function normalizeLink(a, where) {
  if (!isObj(a)) refuse(`${where}: a link is an object {text | html, href, class?, style?}`);
  for (const k of Object.keys(a)) if (!LINK_KEYS.includes(k)) refuse(`${where}: unknown link key "${k}" (LINK_KEYS: ${LINK_KEYS.join(', ')})`);
  if (!str(a.href)) refuse(`${where}: a link needs an href`);
  if (!str(a.text) && !str(a.html)) refuse(`${where}: a link needs text or html`);
  for (const k of ['class', 'style']) if (a[k] !== undefined && !str(a[k])) refuse(`${where}: link ${k} is a non-empty string`);
  return Object.freeze({ ...a });
}
const pair = (v, where) => {
  if (!isObj(v) || !str(v.name) || !str(v.tag)) refuse(`${where} is {name, tag}, two non-empty strings`);
};

/** The one reader of chrome data: refuses an unknown key, a missing part or a malformed link; returns the frozen bag. */
export function normalizeChrome(partial, where = 'chrome') {
  if (!isObj(partial)) refuse(`${where}: the chrome is an object {${Object.keys(CHROME_KEYS).join(', ')}}`);
  for (const k of Object.keys(partial)) if (!(k in CHROME_KEYS)) refuse(`${where}: unknown chrome key "${k}" (CHROME_KEYS: ${Object.keys(CHROME_KEYS).join(', ')})`);
  const { brand, nav, footer, login, app_css: appCss } = partial;
  pair(brand, `${where} brand`);
  if (!Array.isArray(nav)) refuse(`${where} nav is an array of links`);
  if (!isObj(footer)) refuse(`${where} footer is {name, tag, links, legal_html}`);
  for (const k of Object.keys(footer)) if (!['name', 'tag', 'links', 'legal_html'].includes(k)) refuse(`${where} footer: unknown key "${k}" (name, tag, links, legal_html)`);
  pair(footer, `${where} footer`);
  if (!Array.isArray(footer.links)) refuse(`${where} footer.links is an array of links`);
  if (!str(footer.legal_html)) refuse(`${where} footer.legal_html is a non-empty string`);
  if (login !== undefined && !str(login)) refuse(`${where} login is the button's label, a non-empty string (omit it for no button)`);
  if (appCss !== undefined && (!isObj(appCss) || Object.keys(appCss).join() !== 'name,css' || !str(appCss.name) || !str(appCss.css))) refuse(`${where} app_css is {name, css}, two non-empty strings (omit it for none)`);
  return Object.freeze({
    brand: Object.freeze({ name: brand.name, tag: brand.tag }),
    nav: Object.freeze(nav.map((a, i) => normalizeLink(a, `${where} nav[${i}]`))),
    footer: Object.freeze({ name: footer.name, tag: footer.tag, links: Object.freeze(footer.links.map((a, i) => normalizeLink(a, `${where} footer.links[${i}]`))), legal_html: footer.legal_html }),
    login: login === undefined ? null : login,
    app_css: appCss === undefined ? null : Object.freeze({ name: appCss.name, css: appCss.css }),
  });
}

/** One link: an absolute http(s) href opens in a new tab. */
export const linkHtml = a => `<a href="${esc(a.href)}"${/^https?:/.test(a.href) ? ' target="_blank" rel="noopener"' : ''}${a.class ? ` class="${esc(a.class)}"` : ''}${a.style ? ` style="${esc(a.style)}"` : ''}>${a.html || esc(a.text)}</a>`;

/** The chrome's tokens: each filled exactly once, in the partial that carries it (assertTheme holds the partials to it). */
export const CHROME_TOKENS = Object.freeze({
  nav: ['brand.name', 'brand.tag', 'nav.links', 'nav.login'],
  footer: ['footer.name', 'footer.tag', 'footer.links', 'footer.legal'],
  login: ['login.label'],
});
const fillTokens = (html, part, values) => {
  for (const t of CHROME_TOKENS[part]) {
    const tok = `{{chrome:${t}}}`;
    if (html.split(tok).length !== 2) refuse(`the theme's ${part} partial carries ${tok} ${html.split(tok).length - 1} times, needs exactly once`);
    html = html.replace(tok, () => values[t]);
  }
  return html;
};

/**
 * Renders the chrome from data (normalizeChrome). Returns { css, nav, footer, files }:
 *   css     the theme CSS for one <style>: fonts.css, tokens.css, the app's CSS (app_css) and, with a login button,
 *           the login CSS, in that order
 *   nav     the <nav class="nav"> header
 *   footer  the <footer>
 *   files   Map(`fonts/<file>` → Buffer): the font files the css names and their licences, to write beside the page
 */
export function renderChrome(partial, opts = {}) {
  const c = normalizeChrome(partial, opts.where);
  const partials = opts.partials || loadPartials();
  const login = c.login === null ? '' : `\n  ${fillTokens(partials.login, 'login', { 'login.label': esc(c.login) })}`;
  if (c.login !== null && !tokensCss().includes('--cyan-ink:')) refuse('login button: the theme CSS has no --cyan-ink token');
  const appCss = c.app_css === null ? '' : `\n/* ${c.app_css.name} */\n${c.app_css.css}\n`;
  const loginCss = c.login === null ? '' : `\n/* login */\n${partials.loginCss}\n`;
  assertTheme(partials, `${fontsCss()}${tokensCss()}${loginCss}`);
  if (c.app_css !== null) assertNoRemote(c.app_css.css, `${opts.where || 'chrome'} app_css`);
  const css = `${fontsCss()}${tokensCss()}${appCss}${loginCss}`;
  const nav = fillTokens(partials.nav, 'nav', {
    'brand.name': esc(c.brand.name), 'brand.tag': esc(c.brand.tag), 'nav.links': c.nav.map(linkHtml).join(''), 'nav.login': login,
  });
  const footer = fillTokens(partials.footer, 'footer', {
    'footer.name': esc(c.footer.name), 'footer.tag': esc(c.footer.tag), 'footer.links': c.footer.links.map(linkHtml).join(''), 'footer.legal': c.footer.legal_html,
  });
  const files = new Map(FONT_FILES.map(f => [`${FONTS_OUT}/${f}`, fs.readFileSync(path.join(FONTS_DIR, f))]));
  return Object.freeze({ css, nav, footer, files });
}
