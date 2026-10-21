// Holds one built page directory to its fixture's expected output (test/lib/expected.mjs diffOf) and its stamp line to
// the app, theme version, roster version and build commit named. Exit 0 when both hold; 1, naming every difference.
//
//   node test/tools/check-built-page.mjs <app> <out dir> --theme <version> --roster <version> --build <full sha>
import fs from 'node:fs';
import path from 'node:path';
import { STAMP, diffOf, stampFor } from '../lib/expected.mjs';

const [app, out, ...rest] = process.argv.slice(2);
const opt = n => { const i = rest.indexOf(n); if (i < 0 || !rest[i + 1]) throw new Error(`${n} is required`); return rest[i + 1]; };
if (!app || !out) throw new Error('usage: check-built-page.mjs <app> <out dir> --theme <v> --roster <v> --build <sha>');
const want = stampFor({ app, theme: opt('--theme'), roster: opt('--roster'), build: opt('--build') });
const d = diffOf(app, out);
const got = (fs.readFileSync(path.join(out, 'index.html'), 'utf8').match(STAMP) || [''])[0];
if (got !== want) d.push(`stamp: got ${got || '<none>'}, want ${want}`);
if (d.length) { console.error(`${app}: the built page differs from test/fixtures/egpt/expected/${app}:\n  ${d.join('\n  ')}`); process.exit(1); }
console.log(`${app}: equal to the expected output (stamp ${want})`);
