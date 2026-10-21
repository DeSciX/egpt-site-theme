// The quotation ground: the one tree a page's quotations, library deep links, verbatim cuts, shelves, books and
// tracked-path images are checked against and read from. A ground is a repository AT ONE COMMIT, never a working tree.
//
//   gitGround(repoDir, commit)        a local git repository, read through git objects at <commit>
//   githubGround(owner/name, commit)  a public GitHub repository at a full commit sha, fetched once (blobs on demand)
//                                     into a sha-keyed cache (groundCacheDir), then read as a gitGround
//
// A ground records the paths read (`reads`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refuse } from './html.mjs';

export function gitGround(repoDir, commit) {
  if (!commit) refuse(`gitGround(${repoDir}): a ground is read at one commit; name it`);
  const git = (...a) => execFileSync('git', a, { cwd: repoDir, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  let sha;
  try { sha = git('rev-parse', '--verify', `${commit}^{commit}`).toString().trim(); }
  catch (e) { refuse(`ground ${repoDir}: commit ${commit} is not in that repository`); }
  const tracked = new Map(git('ls-tree', '-r', '-z', sha).toString('utf8').split('\0').filter(Boolean)
    .map(l => { const [meta, p] = l.split('\t'); return [p, meta.split(' ')[2]]; }));
  const reads = new Set();
  return {
    describe: `${repoDir}@${sha.slice(0, 7)}`, repo: repoDir, commit: sha, reads,
    has: p => tracked.has(p),
    read(p) {
      if (!tracked.has(p)) refuse(`ground ${repoDir}@${sha.slice(0, 7)} does not track ${p}`);
      reads.add(p);
      return git('cat-file', 'blob', tracked.get(p));
    },
  };
}

/** Where fetched grounds are cached: $EGPT_SITE_THEME_CACHE, else $XDG_CACHE_HOME (or ~/.cache)/egpt-site-theme. */
export const groundCacheDir = () => process.env.EGPT_SITE_THEME_CACHE || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'egpt-site-theme');

export function githubGround(repo, commit, cacheDir = groundCacheDir()) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) refuse(`a GitHub ground is owner/name, got ${JSON.stringify(repo)}`);
  if (!/^[0-9a-f]{40}$/.test(commit || '')) refuse(`a GitHub ground ${repo} is read at a full 40-hex commit sha, got ${JSON.stringify(commit)}`);
  const dir = path.join(cacheDir, `${repo.replace('/', '__')}@${commit}`);
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!fs.existsSync(path.join(dir, '.git', 'ok'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    try {
      git('init', '-q');
      git('remote', 'add', 'origin', `https://github.com/${repo}.git`);
      git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', commit);
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      refuse(`ground ${repo}@${commit.slice(0, 7)} could not be fetched from https://github.com/${repo}.git: ${String(e.stderr || e.message).trim()}`);
    }
    fs.writeFileSync(path.join(dir, '.git', 'ok'), `${commit}\n`);
  }
  const g = gitGround(dir, commit);
  return { ...g, describe: `${repo}@${commit.slice(0, 7)}`, repo };
}
