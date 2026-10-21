// The one escape and the one entity decoder every writer and gate in this package uses.
// esc: plain text → HTML text or attribute value. unent: the inverse for the five entities esc writes (and &#39;).
export const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const unent = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export const stripTags = h => h.replace(/<[^>]+>/g, '');

/** A build refusal: thrown by every check in this package, printed by the CLI as `ERROR: <message>`. */
export class ThemeError extends Error {}
export const refuse = msg => { throw new ThemeError(msg); };
