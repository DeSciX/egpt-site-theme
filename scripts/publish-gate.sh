#!/usr/bin/env bash
# publish-gate.sh — the one executor of the npm publish gates for @descix/egpt-site-theme. The release workflow
# (.github/workflows/publish.yml) runs it, and so does a local publish, so the bytes published by hand pass the same gate.
#
#   scripts/publish-gate.sh [--out <dir>] [--print-publish-command]
#       The gate. Runs the test suite, packs the package ONCE (`npm pack --ignore-scripts`) into <dir> (default: a new
#       temp dir), records the tarball's sha256, and gates THAT tarball:
#         1. its file list is exactly package.json + the tracked files under package.json "files" (no test/, .beast/,
#            .publish/, .github/, scripts/ or CLAUDE.md; LICENSE.md, README.md and package.json present);
#         2. every file in it byte-equals the committed file at HEAD (package.json: the same JSON), and its LICENSE.md
#            byte-equals the repository's LICENSE.md at HEAD;
#         3. install smoke: in a fresh temp project, `npm install` the tarball and its exact peer pins from the registry,
#            commit the vendored inputs of one fixture page (test/fixtures/egpt), run the INSTALLED `egpt-site-theme
#            build`, and hold the page to that fixture's expected output, stamp line normalised and itself checked;
#         4. the tarball's sha256 is unchanged after the smoke test.
#       Step 0 also holds `npm --version` to the npm floor (below). Only then writes <dir>/GATED.sha256 and prints the
#       tarball, its sha256 and the dist-tag the version derives. --print-publish-command also prints the exact local
#       `npm publish` command for these gated bytes. Exits non-zero at the first red gate, naming it; a red run leaves no
#       GATED.sha256.
#   scripts/publish-gate.sh npm-floor
#       THE npm floor every pack and publish runs at (11.21.0: npm's OIDC floor for `npm dist-tag`; 11.5.1 for publish).
#       Every path installs `npm@^<floor>`; the gate refuses any npm outside that range.
#   scripts/publish-gate.sh dist-tag <version>
#       THE dist-tag rule, derived from the version alone: a version containing '-' publishes to `next`; any other
#       version publishes to `latest`, and `next` is then moved to it too. Prints `dist_tag=…` and `also_next=…`.
#   scripts/publish-gate.sh release-target <repository> <tag>
#       The release guard: <repository> must be DeSciX/egpt-site-theme, <tag> must be egpt-site-theme-v<version>, and
#       <version> must equal package.json "version". Prints `version=…` and the dist-tag lines; any mismatch fails.
#   scripts/publish-gate.sh check-sha <dir> <tarball>
#       Exits 0 iff <tarball>'s sha256 equals its row in <dir>/GATED.sha256. Run immediately before `npm publish`.
#   scripts/publish-gate.sh registry-check <dir> <tarball>
#       What npm holds for the gated tarball's own name@version (read from the tarball). Prints `published=no` (npm has
#       no such version: empty `npm view`, or E404) or `published=same` (npm's dist.integrity is the gated tarball's,
#       or npm's tarball unpacks to the same files: every file byte-equal, package.json JSON-equal). FAILS when npm
#       holds different bytes (a published version is immutable: bump and re-tag), and on any other `npm view` failure.
#   scripts/publish-gate.sh move-next <version>
#       Points `next` at <version> (a `latest` release) and polls until npm shows latest and next both at it (10 min).
set -uo pipefail

PUBLIC_REPO='DeSciX/egpt-site-theme'
TAG_PREFIX='egpt-site-theme-v'
SMOKE_APP='egpt'
NPM_FLOOR='11.21.0'

usage() {
  cat <<'USAGE'
usage: scripts/publish-gate.sh [--out <dir>] [--print-publish-command]
       scripts/publish-gate.sh dist-tag <version>
       scripts/publish-gate.sh release-target <repository> <tag>
       scripts/publish-gate.sh npm-floor
       scripts/publish-gate.sh check-sha <dir> <tarball>
       scripts/publish-gate.sh registry-check <dir> <tarball>
       scripts/publish-gate.sh move-next <version>
       scripts/publish-gate.sh -h|--help
USAGE
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
say() { echo "[publish-gate] $*"; }
die() { echo "[publish-gate] FAIL: $*" >&2; exit 1; }
sha_of() { shasum -a 256 "$1" | cut -d' ' -f1; }
pkg_version() { node -p "require(process.argv[1]).version" "$ROOT/package.json"; }
pkg_name() { node -p "require(process.argv[1]).name" "$ROOT/package.json"; }

# npm within ^NPM_FLOOR: the floor's major, at or above the floor.
npm_at_floor() {
  local have
  have="$(npm --version 2>/dev/null)" || die "npm is not runnable"
  node -e '
    const [h, f] = process.argv.slice(1).map(v => v.split(".").map(Number));
    const ok = h[0] === f[0] && (h[1] > f[1] || (h[1] === f[1] && h[2] >= f[2]));
    process.exit(ok ? 0 : 1);' "$have" "$NPM_FLOOR" \
    || die "npm $have is outside ^$NPM_FLOOR, the floor every pack and publish runs at; install it: npm install -g npm@^$NPM_FLOOR"
  say "npm $have (floor ^$NPM_FLOOR)"
}

# tree_diff <a> <b>: the files of two unpacked package trees, compared (package.json as JSON); prints the differences.
tree_diff() {
  node - "$1" "$2" <<'NODE'
const [a, b] = process.argv.slice(2);
const fs = require('fs'), path = require('path'), util = require('util');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)).map(x => `${e.name}/${x}`) : [e.name]).sort();
const A = walk(a), B = walk(b), d = [];
for (const f of A.filter(x => !B.includes(x))) d.push(`only in ours: ${f}`);
for (const f of B.filter(x => !A.includes(x))) d.push(`only in npm's: ${f}`);
for (const f of A.filter(x => B.includes(x))) {
  const x = fs.readFileSync(path.join(a, f)), y = fs.readFileSync(path.join(b, f));
  if (f === 'package.json' ? !util.isDeepStrictEqual(JSON.parse(x), JSON.parse(y)) : !x.equals(y)) d.push(`differs: ${f}`);
}
if (d.length) { console.log(d.join('\n')); process.exit(1); }
NODE
}

# THE dist-tag rule (the only place it is written).
dist_tag_of() {
  case "$1" in
    '') die "dist-tag: empty version" ;;
    *-*) echo "dist_tag=next"; echo "also_next=false" ;;
    *) echo "dist_tag=latest"; echo "also_next=true" ;;
  esac
}

check_sha() {
  local record="$1" tgz="$2" want got
  [ -f "$record" ] || die "$(dirname "$record") has no GATED.sha256: these bytes were never gated (run scripts/publish-gate.sh to green first); refusing to publish."
  want="$(awk -v f="$(basename "$tgz")" '$2 == f { print $1 }' "$record")"
  got="$(sha_of "$tgz")"
  [ -n "$want" ] || die "$(basename "$tgz") has no row in $record"
  [ "$want" = "$got" ] || die "$(basename "$tgz") is $got, but the gated bytes were $want; refusing to publish other bytes."
  say "sha OK  $(basename "$tgz")  $got"
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  dist-tag)
    [ "$#" -eq 2 ] || { usage >&2; exit 2; }
    dist_tag_of "$2"; exit 0 ;;
  release-target)
    [ "$#" -eq 3 ] || { usage >&2; exit 2; }
    repo="$2" tag="$3"
    [ "$repo" = "$PUBLIC_REPO" ] || die "this workflow publishes only from $PUBLIC_REPO; it ran in '$repo'. A release here is a mistake; refusing."
    case "$tag" in
      "$TAG_PREFIX"*) ;;
      *) die "release tag '$tag' is not of the form ${TAG_PREFIX}<version>; refusing. Delete the release and tag it ${TAG_PREFIX}$(pkg_version)." ;;
    esac
    tag_version="${tag#"$TAG_PREFIX"}"
    version="$(pkg_version)"
    [ "$tag_version" = "$version" ] || die "release tag '$tag' names version '$tag_version' but package.json at the tag's commit is '$version'; refusing to publish a mismatch."
    echo "version=$version"; dist_tag_of "$version"; exit 0 ;;
  npm-floor)
    [ "$#" -eq 1 ] || { usage >&2; exit 2; }
    echo "$NPM_FLOOR"; exit 0 ;;
  check-sha)
    [ "$#" -eq 3 ] || { usage >&2; exit 2; }
    check_sha "$2/GATED.sha256" "$3"; exit $? ;;
  registry-check)
    [ "$#" -eq 3 ] || { usage >&2; exit 2; }
    dir="$2" tgz="$3"
    check_sha "$dir/GATED.sha256" "$tgz" >&2 || exit 1
    RC="$(mktemp -d "${TMPDIR:-/tmp}/egpt-site-theme-registry.XXXXXX")"
    mkdir -p "$RC/ours" "$RC/npm" && tar -xzf "$tgz" -C "$RC/ours" || die "cannot unpack $tgz"
    spec="$(node -p "const p=require(process.argv[1]); p.name+'@'+p.version" "$RC/ours/package/package.json")"
    if npm view "$spec" dist.integrity >"$RC/view.out" 2>"$RC/view.err"; then
      integrity="$(tr -d '[:space:]' < "$RC/view.out")"
      if [ -z "$integrity" ]; then say "$spec is not on npm" >&2; echo "published=no"; rm -rf "$RC"; exit 0; fi
    elif grep -q 'E404' "$RC/view.err"; then
      say "$spec is not on npm (E404)" >&2; echo "published=no"; rm -rf "$RC"; exit 0
    else
      cat "$RC/view.err" >&2; die "npm view $spec failed, and not with E404; whether npm holds this version is unknown, refusing to decide."
    fi
    ours="sha512-$(openssl dgst -sha512 -binary "$tgz" | openssl base64 -A)"
    if [ "$integrity" = "$ours" ]; then say "$spec on npm is the gated tarball (dist.integrity $integrity)" >&2; echo "published=same"; rm -rf "$RC"; exit 0; fi
    ( cd "$RC/npm" && npm pack "$spec" --json --pack-destination "$RC/npm" >"$RC/pack.json" 2>"$RC/pack.err" ) || { cat "$RC/pack.err" >&2; die "cannot fetch npm's tarball of $spec"; }
    theirs="$RC/npm/$(node -p "require(process.argv[1])[0].filename" "$RC/pack.json")"
    mkdir -p "$RC/npm/x" && tar -xzf "$theirs" -C "$RC/npm/x" || die "cannot unpack npm's tarball of $spec"
    if diffs="$(tree_diff "$RC/ours/package" "$RC/npm/x/package")"; then
      say "$spec on npm: same content, different packing (npm $integrity, ours $ours)" >&2; echo "published=same"; rm -rf "$RC"; exit 0
    fi
    echo "$diffs" >&2
    die "npm holds different bytes for $spec; a published version is immutable — bump the version and re-tag." ;;
  move-next)
    [ "$#" -eq 2 ] || { usage >&2; exit 2; }
    version="$2" name="$(pkg_name)"
    if [ "$(npm view "$name" dist-tags.next 2>/dev/null || true)" != "$version" ]; then
      npm dist-tag add "$name@$version" next || die "npm dist-tag add $name@$version next"
    fi
    # npm applies a dist-tag change in stages: poll up to 10 minutes before calling the move failed.
    for i in $(seq 1 40); do
      latest="$(npm view "$name" dist-tags.latest 2>/dev/null || true)"
      next="$(npm view "$name" dist-tags.next 2>/dev/null || true)"
      if [ "$latest" = "$version" ] && [ "$next" = "$version" ]; then say "$name latest=$latest next=$next"; exit 0; fi
      sleep 15
    done
    die "$name dist-tags read latest='$latest' next='$next' after 10 minutes, not both $version." ;;
esac

OUT='' PRINT_CMD=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out) [ -n "${2:-}" ] || { usage >&2; exit 2; }; OUT="$2"; shift 2 ;;
    --print-publish-command) PRINT_CMD=1; shift ;;
    *) echo "[publish-gate] unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
if [ -z "$OUT" ]; then OUT="$(mktemp -d "${TMPDIR:-/tmp}/egpt-site-theme-pack.XXXXXX")"; fi
mkdir -p "$OUT" && OUT="$(cd "$OUT" && pwd)" || die "cannot create $OUT"
rm -f "$OUT/PACKED.sha256" "$OUT/GATED.sha256" "$OUT"/*.tgz
WORK="$(mktemp -d "${TMPDIR:-/tmp}/egpt-site-theme-gate.XXXXXX")"
VERSION="$(pkg_version)"
PKG_NAME="$(pkg_name)"
HEAD="$(git -C "$ROOT" rev-parse HEAD)" || die "$ROOT is not a git checkout"

red() { echo "[publish-gate] RED at $1 — nothing may be published." >&2; exit 1; }

# 0. The npm floor, then the suite at this checkout (zero-diff, conformance, share, exhibits).
say "── 0. npm floor; npm test"
npm_at_floor || red "0. npm floor"
( cd "$ROOT" && npm test >"$WORK/npm-test.log" 2>&1 ) || { tail -40 "$WORK/npm-test.log" >&2; red "npm test (full log: $WORK/npm-test.log)"; }

# Pack once; record the sha.
say "── pack $PKG_NAME@$VERSION"
( cd "$ROOT" && npm pack --ignore-scripts --json --pack-destination "$OUT" >"$WORK/pack.json" 2>"$WORK/pack.log" ) || { cat "$WORK/pack.log" >&2; die "npm pack"; }
TGZ="$OUT/$(node -p "const r=require(process.argv[1]); if (r.length !== 1) throw new Error('npm pack made '+r.length+' tarballs'); r[0].filename" "$WORK/pack.json")" || die "cannot read npm pack --json"
[ -f "$TGZ" ] || die "npm pack wrote no $(basename "$TGZ") in $OUT"
( cd "$OUT" && shasum -a 256 "$(basename "$TGZ")" > PACKED.sha256 )
say "packed: $(cat "$OUT/PACKED.sha256")"
mkdir -p "$WORK/unpacked" && tar -xzf "$TGZ" -C "$WORK/unpacked" || die "cannot unpack $TGZ"
PKGDIR="$WORK/unpacked/package"

# 1. The file list: package.json + the tracked files under package.json "files", nothing else.
say "── 1. tarball file list = package.json + tracked files under \"files\""
node - "$ROOT" "$PKGDIR" <<'NODE' || red "1. file list"
const [root, pkgDir] = process.argv.slice(2);
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)).map(x => `${e.name}/${x}`) : [e.name]);
const files = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).files;
if (!Array.isArray(files) || !files.length) { console.error('package.json has no "files" allowlist'); process.exit(1); }
const tracked = execFileSync('git', ['ls-files', '-z', '--', ...files], { cwd: root }).toString().split('\0').filter(Boolean);
const want = new Set(['package.json', ...tracked]);
const got = new Set(walk(pkgDir));
const extra = [...got].filter(f => !want.has(f)).sort(), missing = [...want].filter(f => !got.has(f)).sort();
const forbidden = [...got].filter(f => /^(test|scripts|\.beast|\.publish|\.github)\//.test(f) || /(^|\/)CLAUDE\.md$/.test(f) || /(^|\/)\.DS_Store$/.test(f)).sort();
const required = ['package.json', 'LICENSE.md', 'README.md'].filter(f => !got.has(f));
const bad = [];
if (extra.length) bad.push(`not a tracked file under "files": ${extra.join(', ')}`);
if (missing.length) bad.push(`tracked under "files" but not in the tarball: ${missing.join(', ')}`);
if (forbidden.length) bad.push(`forbidden in a publish: ${forbidden.join(', ')}`);
if (required.length) bad.push(`required but absent: ${required.join(', ')}`);
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log(`[publish-gate] ${got.size} files, exactly package.json + the tracked files under ${JSON.stringify(files)}`);
NODE

# 2. Every packed file is the committed file at HEAD; LICENSE.md byte-equal to the repository's.
say "── 2. packed bytes = committed bytes at HEAD $HEAD"
git -C "$ROOT" show "HEAD:LICENSE.md" > "$WORK/LICENSE.head.md" || red "2. LICENSE.md is not committed at HEAD"
cmp -s "$PKGDIR/LICENSE.md" "$WORK/LICENSE.head.md" || red "2. LICENSE.md in the tarball is not byte-equal to the repository's LICENSE.md at HEAD"
node - "$ROOT" "$PKGDIR" <<'NODE' || red "2. packed bytes"
const [root, pkgDir] = process.argv.slice(2);
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const util = require('util');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)).map(x => `${e.name}/${x}`) : [e.name]);
const bad = [];
for (const f of walk(pkgDir)) {
  let head;
  try { head = execFileSync('git', ['show', `HEAD:${f}`], { cwd: root, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { bad.push(`${f}: not committed at HEAD`); continue; }
  const packed = fs.readFileSync(path.join(pkgDir, f));
  if (f === 'package.json') { if (!util.isDeepStrictEqual(JSON.parse(packed), JSON.parse(head))) bad.push('package.json: not the committed JSON'); }
  else if (!packed.equals(head)) bad.push(`${f}: differs from HEAD (an uncommitted edit?)`);
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('[publish-gate] every packed file equals HEAD');
NODE

# 3. Install smoke: the installed bin, exports map and peer resolution, from a fresh app directory.
say "── 3. install smoke: npm install the tarball + exact peers, build fixture page '$SMOKE_APP' with the installed CLI"
SMOKE="$WORK/smoke"
mkdir -p "$SMOKE"
PEERS="$(node -e "const p=require(process.argv[1]).peerDependencies||{};console.log(Object.entries(p).map(([n,v])=>n+'@'+v).join(' '))" "$PKGDIR/package.json")"
node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({ name: 'egpt-site-theme-smoke', private: true }, null, 2) + '\n')" "$SMOKE/package.json"
# shellcheck disable=SC2086
( cd "$SMOKE" && npm install --save-exact --no-audit --no-fund --ignore-scripts "$TGZ" $PEERS >"$WORK/install.log" 2>&1 ) || { cat "$WORK/install.log" >&2; red "3. npm install of the tarball and its peers ($PEERS)"; }
INSTALLED="$(node -p "require(process.argv[1]).version" "$SMOKE/node_modules/$PKG_NAME/package.json")"
[ "$INSTALLED" = "$VERSION" ] || red "3. installed $PKG_NAME is $INSTALLED, not $VERSION"
ROSTER="$(node -p "require(process.argv[1]).version" "$SMOKE/node_modules/@descix/frqtl-web/package.json")" || red "3. @descix/frqtl-web is not installed"
FIX="$ROOT/test/fixtures/egpt"
SRC_DIR="$(node -p "require(process.argv[1]).dir" "$FIX/source.json")"
GROUND="$(node -p "const s=require(process.argv[1]); s.repo+'@'+s.commit" "$FIX/source.json")"
cp -R "$FIX/inputs/." "$SMOKE/"
printf 'node_modules/\n.out/\n' > "$SMOKE/.gitignore"
( cd "$SMOKE" && git init -q && git add -A && git -c user.name=gate -c user.email=gate@localhost commit -qm smoke ) || red "3. cannot commit the smoke app"
SMOKE_HEAD="$(git -C "$SMOKE" rev-parse HEAD)"
( cd "$SMOKE" && EGPT_SITE_THEME_CACHE="$WORK/ground-cache" ./node_modules/.bin/egpt-site-theme build "$SRC_DIR/$SMOKE_APP.json" --out .out/"$SMOKE_APP" --ground-github "$GROUND" >"$WORK/build.log" 2>&1 ) \
  || { cat "$WORK/build.log" >&2; red "3. the installed egpt-site-theme build refused fixture '$SMOKE_APP'"; }
node "$ROOT/test/tools/check-built-page.mjs" "$SMOKE_APP" "$SMOKE/.out/$SMOKE_APP" --theme "$VERSION" --roster "$ROSTER" --build "$SMOKE_HEAD" \
  || red "3. the installed build of '$SMOKE_APP' is not the fixture's expected output"

# 4. The gated bytes are still the packed bytes; only now is the record written that check-sha reads.
say "── 4. tarball sha unchanged after the smoke test"
check_sha "$OUT/PACKED.sha256" "$TGZ" || red "4. sha re-check"
cp "$OUT/PACKED.sha256" "$OUT/GATED.sha256"
rm -rf "$WORK"

DIST_TAG="$(dist_tag_of "$VERSION" | sed -n 's/^dist_tag=//p')"
say "GATES PASSED"
echo "tarball=$TGZ"
echo "sha256=$(sha_of "$TGZ")"
echo "version=$VERSION"
echo "dist_tag=$DIST_TAG"
if [ -n "$PRINT_CMD" ]; then
  echo "publish command (local, under the npm owner's login; run from $ROOT, with npm ^$NPM_FLOOR — this gate ran at $(npm --version);"
  echo "  if not: npm install -g npm@^$NPM_FLOOR and re-run this gate):"
  echo "  bash scripts/publish-gate.sh check-sha $OUT $TGZ && npm publish $TGZ --tag $DIST_TAG --access public --ignore-scripts --otp=<2FA code>"
fi
