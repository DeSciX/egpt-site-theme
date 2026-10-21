// share.json from a spec's share block: ./share shareJson/shareFiles, held to the platform's own parser
// (@descix/app-sdk/share SHARE_CONTRACT / validateShareJson / parseShareJson, the pinned peer). The accepted views come
// from the parser's SHARE_CONTRACT, never a list typed here. The parser not installed is a FAILURE, never a skip.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { THEME, FIXTURE_DIR } from './lib/world.mjs';
import { loadShareContract, shareJson, shareFiles, validateShareBlock, SHARE_DIR, SHARE_ASSETS } from '../src/share.mjs';

const C = await loadShareContract(THEME);
const specShare = app => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${app}.json`), 'utf8')).share;
const VIEWS = () => C.SHARE_CONTRACT.find(f => f.name === 'default_view').oneOf.values;

test('every view the parser accepts is ferried into share.json verbatim', () => {
  assert.ok(VIEWS().length > 0, 'the parser lists no views');
  for (const v of VIEWS()) assert.strictEqual(shareJson('t', { ...specShare('egpt'), default_view: v }, C).default_view, v);
});

test('a view the parser does not list is refused, naming the field and the value', () => {
  assert.throws(() => shareJson('t', { ...specShare('egpt'), default_view: 'Sidebar' }, C),
    /t: share block refused by @descix\/app-sdk\/share: share\.json: default_view 'Sidebar' is not a view/);
});

test('a block without default_view emits no default_view key; the egpt fixture starts in CodeSite', () => {
  const { default_view, ...rest } = specShare('egpt');
  assert.ok(!('default_view' in shareJson('t', rest, C)));
  assert.strictEqual(shareJson('egpt', specShare('egpt'), C).default_view, 'CodeSite');
});

test('every key written is a SHARE_CONTRACT field; the block is refused when it lacks a required key, carries an unknown one, or runs long', () => {
  const fields = C.SHARE_CONTRACT.map(f => f.name);
  for (const k of Object.keys(shareJson('egpt', specShare('egpt'), C))) assert.ok(fields.includes(k), k);
  const { card, ...noCard } = specShare('egpt');
  assert.throws(() => validateShareBlock('t', noCard), /share block lacks card/);
  assert.throws(() => validateShareBlock('t', { ...specShare('egpt'), og: 'x' }), /share block key "og" is not one of/);
  assert.throws(() => validateShareBlock('t', { ...specShare('egpt'), description: 'x'.repeat(160) }), /160 characters; it must be under 160/);
});

test('shareFiles: share.json is the validated object and parses back through the platform parser; the three images ride along', () => {
  const { json, files } = shareFiles('egpt', specShare('egpt'), C, path.join(FIXTURE_DIR, 'egpt', 'share'));
  const text = files.get(C.SHARE_JSON_FILE).toString('utf8');
  assert.deepStrictEqual(JSON.parse(text), json);
  assert.strictEqual(C.parseShareJson(text).default_view, 'CodeSite');
  assert.deepEqual([...files.keys()].sort(), [C.SHARE_JSON_FILE, ...Object.values(SHARE_ASSETS).map(f => `${SHARE_DIR}/${f}`)].sort());
  assert.throws(() => shareFiles('egpt', specShare('egpt'), C, path.join(FIXTURE_DIR, 'exhibits')), /share asset not rendered/);
});
