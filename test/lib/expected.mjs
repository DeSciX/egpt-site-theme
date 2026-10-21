// The one comparison of a built page directory with a fixture's expected output (test/fixtures/egpt/expected/<app>/):
// the file set and every file by sha256 (files.json), index.html byte for byte except the one provenance line, and
// share.json byte for byte. Used by test/zero-diff.test.mjs and by scripts/publish-gate.sh's install smoke test.
//
// What is normalised: ONLY the line `<body data-frontpage-…>` (the generator stamped data-frontpage-template and the
// library's HEAD; the theme stamps data-frontpage-theme, data-frontpage-roster and the app repository's HEAD).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED = fileURLToPath(new URL('../fixtures/egpt/expected/', import.meta.url));
export const STAMP = /^<body data-frontpage-app="[^"]*"[^>\n]*>$/m;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)).map(x => `${e.name}/${x}`) : [e.name])).sort();

// The differences of one app's output directory from its expected files: [] when zero.
export function diffOf(app, dir) {
  const exp = path.join(EXPECTED, app);
  const want = JSON.parse(fs.readFileSync(path.join(exp, 'files.json'), 'utf8'));
  const got = walk(dir);
  const d = [];
  if (got.join() !== Object.keys(want).sort().join()) d.push(`file set: missing ${Object.keys(want).filter(f => !got.includes(f))}, extra ${got.filter(f => !(f in want))}`);
  for (const f of got.filter(x => x in want)) {
    const bytes = fs.readFileSync(path.join(dir, f));
    if (f === 'index.html') {
      const a = fs.readFileSync(path.join(exp, 'index.html'), 'utf8'), b = bytes.toString('utf8');
      if ((b.match(new RegExp(STAMP.source, 'gm')) || []).length !== 1) d.push('index.html: the stamp line is not there exactly once');
      if (a.replace(STAMP, '<body>') !== b.replace(STAMP, '<body>')) d.push('index.html');
      if (sha(Buffer.from(a)) !== want[f]) d.push('fixture: expected/index.html is not the file files.json hashes');
    } else if (sha(bytes) !== want[f]) d.push(f);
  }
  if (fs.existsSync(path.join(exp, 'share.json')) && !fs.readFileSync(path.join(exp, 'share.json')).equals(fs.readFileSync(path.join(dir, 'share.json')))) d.push('share.json');
  return d;
}

// The stamp line a build of <app> must carry.
export const stampFor = ({ app, theme, roster, build }) =>
  `<body data-frontpage-app="${app}" data-frontpage-theme="${theme}" data-frontpage-roster="${roster}" data-frontpage-build="${build}">`;
