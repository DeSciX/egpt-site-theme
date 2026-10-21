## DeSciX lane
LANE: app          ENV: none (an npm package, not an app: no .descix/workspace.json, nothing uploaded)
SDK: the published @descix/cli and @descix/app-sdk only, as an external developer — the handbook below, never platform source
INDEX: this file — a standalone public package repo; the HANDBOOK below is its reference
HANDBOOK: 1 `npx -y -p @descix/cli@4.2.0 descix tell-me-how "<question>"`  2 the docs shipped inside @descix/cli (agent-assets/) and @descix/app-sdk (README.md)  3 the canonical app-developer runbook, live at https://descix.net/prod/daita-docs/site/app-sdk/app-developer-runbook.html
PLATFORM WALL: when the handbook does not answer — stop, write the question with evidence (command, output, the CLI's origin line), hand it to your orchestrator; the orchestrator asks the owner to open a platform session. Never open platform source to answer it.

# egpt-site-theme — the EGPT community's site theme, npm `@descix/egpt-site-theme`
Every EGPT-community front page is built from this package: an app pins it exactly, owns its spec, fragments and copy
overrides, and runs `egpt-site-theme build`. README.md owns the exports, the CLI, the spec and the copy slots.

## Rules
- One owner module per export (README "Exports"); a consumer reads the owner, never a copy. A second derivation of a
  fact owned here is a bug: delete it and import the owner.
- Partials carry no text: every text is a `{{slot:<id>}}` token whose default is in `src/copy/`. A slot id is public
  contract; removing or renaming one is a major version and its old id goes into `REFUSED_SLOTS`.
- Fail loud: every check throws a `ThemeError` naming the input and the remedy; nothing degrades silently.
- The showcase roster (tiles, through-line, tile stills' names, the tile link) is `@descix/frqtl-web/registry`'s; this
  package writes it, never restates it. The share.json contract is `@descix/app-sdk/share`'s.
- Byte identity is the gate for any change that is not meant to change a page: `npm test` holds the five fixture pages
  to their expected output (`test/zero-diff.test.mjs`); a change that moves a page byte re-vendors the fixtures
  (`test/tools/vendor-fixtures.mjs`) in the same change and says why.
- Vendored inputs carry no private repository name, local path or decider's words: vendor-fixtures drops the specs'
  `_…` comment keys, and the quotation ground is never vendored (the test reads it at its commit).
- Pins are exact (`peerDependencies` = `devDependencies`); `package-lock.json` is committed.
- Every repo file is under the DCMA: `LICENSE.md` is its render, never hand-edited; manifests say
  `"license": "SEE LICENSE IN LICENSE.md"`.

## Test
`npm ci && npm test` (Node 20+, network for the quotation ground). CI runs the same (`.github/workflows/ci.yml`).
