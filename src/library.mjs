// The library gate: what a page may quote, cut and deep-link from the EGPT library, checked against a ground
// (ground.mjs) — the library repository at one commit. A fragment's quotations must be found, folded, in the file
// they name; a <div data-cut-src …> is filled from the held file and gated block by block; every library deep link
// (library.html#<target>, or the library site's own origin #<target>) names something the ground holds; a
// <nav data-shelves> is filled from the ground's shelves. The layout of the library repository is LIBRARY below.
import { esc, unent, stripTags, refuse } from './html.mjs';

/** Where the library keeps what the gate reads, relative to its repository root. */
export const LIBRARY = Object.freeze({
  corpus: '05_CORPUS/corpus/quotes.json',
  shelves: 'site-src/shelves.json',
  books: 'site-src/books',
  viewer: 'library.html',
  origin: 'https://egpt.descix.net/',
});

export function fold(s) {
  return s.normalize('NFKC')
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-').replace(/…/g, '...').replace(/ /g, ' ')
    .replace(/-\n\s*/g, '').replace(/[*_`>#|]/g, '').replace(/\s+/g, ' ').trim();
}

const inline = t => esc(t)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>')
  .replace(/\[\[([^\]]+)\]\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

/**
 * A library bound to one ground. `need()` returns the ground or refuses naming how to declare one: a page that
 * quotes nothing and links nothing never needs a ground. `gated` counts the quotations and cut blocks checked.
 */
export function library(ground, howToDeclare) {
  const need = () => ground || refuse(`this page quotes or deep-links the library, but no quotation ground is declared — ${howToDeclare}`);
  const held = new Map();
  const state = { gated: 0 };
  let recordIds = null;
  const json = p => JSON.parse(need().read(p).toString('utf8'));
  function heldText(p) {
    const g = need();
    if (!g.has(p)) refuse(`quotation source is not tracked at ${g.describe}: ${p}`);
    if (!held.has(p)) {
      const text = g.read(p).toString('utf8');
      // a JSON corpus file stores its text with \u escapes: fold the decoded strings, not the bytes
      const strings = [];
      const walk = v => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
      if (p.endsWith('.json')) { walk(JSON.parse(text)); held.set(p, fold(strings.join('\n'))); }
      else held.set(p, fold(text));
    }
    return held.get(p);
  }
  // Why a library deep link is dead, or '' when it is live: a path tracked in the ground, a corpus record
  // (record:<id>), a shelf (shelf:<id>) or a place in a book (book:<id>[/<part>[/<ref>]]).
  function deadLink(target) {
    const g = need();
    if (target.startsWith('record:')) {
      if (!g.has(LIBRARY.corpus)) return `deep link to a corpus record, but ${LIBRARY.corpus} is not tracked at ${g.describe}`;
      if (!recordIds) recordIds = new Set(json(LIBRARY.corpus).records.map(r => r.id));
      const id = target.slice('record:'.length);
      return recordIds.has(id) ? '' : `deep link to a corpus record the corpus does not hold: ${id}`;
    }
    if (target.startsWith('shelf:')) {
      const id = target.slice('shelf:'.length);
      if (!g.has(LIBRARY.shelves)) return `deep link to a shelf, but ${LIBRARY.shelves} is not tracked at ${g.describe}`;
      return json(LIBRARY.shelves).shelves.some(x => x.id === id) ? '' : `deep link to a shelf that shelves.json does not hold: ${id}`;
    }
    if (target.startsWith('book:')) {
      const [id, part, ref] = target.slice('book:'.length).split('/');
      const f = `${LIBRARY.books}/${id}.json`;
      if (!g.has(f)) return `deep link to a book that ${LIBRARY.books}/ does not hold: ${id}`;
      if (part === undefined) return '';
      const pt = json(f).parts.find(x => x.id === part);
      if (!pt) return `deep link to a part the book ${id} does not have: ${part}`;
      if (ref === undefined) return '';
      const refs = new Set(), frag = h => (h || '').split('#')[1];
      const add = it => { if (it.key !== undefined) refs.add(String(it.key).replace(/[^A-Za-z0-9]/g, '').toLowerCase());
        if (it.message !== undefined) refs.add(`m${it.message}`); if (frag(it.href)) refs.add(frag(it.href));
        for (const a of it.answers || []) if (frag(a.href)) refs.add(frag(a.href)); for (const sp of it.parts || []) add(sp); };
      pt.items.forEach(add);
      return refs.has(ref) ? '' : `deep link to a place the book ${id} does not have: ${part}/${ref}`;
    }
    const p = target.split('#')[0];
    return g.has(p) ? '' : `deep link to a path not tracked at ${g.describe}: ${p}`;
  }
  // <div data-cut-src="<path>" data-cut-from="<first line>" data-cut-to="<last line>" data-cut-mark="<line>|…"></div>:
  // the span between the two lines (inclusive) of the held file becomes the element's content, every block gated.
  function renderCut(el, file) {
    const attr = n => { const m = el.match(new RegExp(`data-cut-${n}="([^"]*)"`)); return m ? unent(m[1]) : ''; };
    const src = attr('src'), from = attr('from'), to = attr('to'), marks = attr('mark').split('|').map(x => x.trim()).filter(Boolean);
    if (!src || !from || !to) refuse(`${file}: a data-cut needs src, from and to`);
    const g = need();
    if (!g.has(src)) refuse(`${file}: cut source is not tracked at ${g.describe}: ${src}`);
    const lines = g.read(src).toString('utf8').split('\n');
    const a = lines.findIndex(l => l.trim() === from), b = lines.findIndex((l, i) => i >= a && l.trim() === to);
    if (a < 0) refuse(`${file}: cut start not found in ${src}: "${from}"`);
    if (b < 0) refuse(`${file}: cut end not found in ${src} after its start: "${to}"`);
    const blocks = lines.slice(a, b + 1).join('\n').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    const heldF = heldText(src);
    let n = 0;
    const html = blocks.map(block => {
      const text = fold(block);
      if (!heldF.includes(text)) refuse(`${file}: cut block not found in ${src}: "${text.slice(0, 80)}…"`);
      n++;
      const mark = marks.some(m => block.replace(/^#+\s*/, '').replace(/[*_]/g, '').trim() === m) ? ' class="cut-mark"' : '';
      const h = block.match(/^(#{1,6})\s+(.*)$/);
      if (h) return `<h${Math.min(6, h[1].length + 1)}${mark}>${inline(h[2])}</h${Math.min(6, h[1].length + 1)}>`;
      return `<p${mark}>${inline(block.replace(/\s*\n\s*/g, ' '))}</p>`;
    }).join('\n');
    const unmarked = marks.filter(m => !blocks.some(bk => bk.replace(/^#+\s*/, '').replace(/[*_]/g, '').trim() === m));
    if (unmarked.length) refuse(`${file}: cut mark not a block of the cut: "${unmarked[0]}"`);
    state.gated += n;
    return el.replace(/>\s*<\/div>$/, `>${html}</div>`);
  }
  // <nav … data-shelves …></nav>: one numbered card per shelf of the ground's shelves.json, linking its viewer page.
  function renderShelves(html, file) {
    return html.replace(/<nav\b([^>]*)\bdata-shelves\b([^>]*)>\s*<\/nav>/g, (m, a, b) => {
      const g = need();
      if (!g.has(LIBRARY.shelves)) refuse(`${file}: data-shelves, but ${LIBRARY.shelves} is not tracked at ${g.describe}`);
      const shelves = json(LIBRARY.shelves).shelves;
      if (!shelves.length) refuse(`${file}: data-shelves, but shelves.json holds no shelf`);
      const cards = shelves.map((sh, i) => `      <a class="jcard${sh.thumb ? ' jcard--thumb' : ''}" href="${LIBRARY.viewer}#shelf:${esc(sh.id)}"><span class="jcard-n">${String(i + 1).padStart(2, '0')}</span>${sh.thumb ? `<img src="${esc(sh.thumb)}" alt="${esc(sh.thumb_alt || sh.title)}">` : ''}<p class="tag">${esc(sh.title)}</p><p>${esc(sh.card || sh.line)}</p></a>`);
      return `<nav${a}${b}>\n${cards.join('\n')}\n    </nav>`.replace(/\s+>/, '>');
    });
  }
  // A cut, then every quotation and every viewer deep link in an app-authored fragment.
  function gateFragment(html, file) {
    html = html.replace(/<div\b[^>]*data-cut-src="[^"]+"[^>]*>\s*<\/div>/g, m => renderCut(m, file));
    gateQuotes(html, file);
    for (const m of html.matchAll(new RegExp(`href="${LIBRARY.viewer.replace('.', '\\.')}#([^"]+)"`, 'g'))) {
      const why = deadLink(decodeURIComponent(m[1]));
      if (why) refuse(`${file}: ${why}`);
    }
    return html;
  }
  function gateQuotes(html, file) {
    for (const m of html.matchAll(/<(blockquote|q)\b[^>]*data-src="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
      const quote = fold(unent(stripTags(m[3])));
      if (quote.length < 12) refuse(`${file}: quotation too short to gate: "${quote}"`);
      if (!heldText(m[2]).includes(quote)) refuse(`${file}: quotation not found in ${m[2]}: "${quote.slice(0, 80)}…"`);
      state.gated++;
    }
    for (const m of html.matchAll(/<(blockquote|q)\b(?![^>]*data-src=)[^>]*>/g)) refuse(`${file}: a <${m[1]}> without data-src (every quotation names its held file)`);
  }
  // Every library deep link on an assembled page (reused sections included).
  function sweepDeepLinks(html) {
    const re = new RegExp(`href="(?:${LIBRARY.viewer.replace('.', '\\.')}|${LIBRARY.origin.replace(/[.\/]/g, '\\$&')})#([^"]+)"`, 'g');
    for (const m of html.matchAll(re)) {
      const why = deadLink(decodeURIComponent(m[1]));
      if (why) refuse(why);
    }
  }
  // A hero h1 declared from a held file must be found in it.
  const assertHeld = (src, html, what) => { if (!heldText(src).includes(fold(unent(stripTags(html))))) refuse(`${what} not found in ${src}`); };
  return { state, renderShelves, gateFragment, gateQuotes, sweepDeepLinks, assertHeld, read: p => need().read(p), has: p => need().has(p), need };
}
