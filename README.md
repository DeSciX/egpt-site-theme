# @descix/egpt-site-theme

The EGPT community's site theme: one versioned package every community app's front page is built from. The theme
owns the look (CSS tokens, the nav/hero/footer/section partials), the default copy, the page assembler, the tile
writer, the view declarer, the share writer and the page gates. Each app owns its spec, its fragments and its copy
overrides, and builds its own page with the CLI.

```
npm i -D --save-exact @descix/egpt-site-theme@0.1.0-p8 @descix/frqtl-web@0.6.1-p3.1 @descix/app-sdk@0.9.0
npx egpt-site-theme build frontpage/<app>.json --out site
```

`@descix/frqtl-web` (the showcase roster: `./registry`) and `@descix/app-sdk` (the bridge file: `./scaffold`; the
share.json contract: `./share`) are peer dependencies, pinned exactly by the app; the build resolves both from the app's
directory, so the tiles are the roster release the app pins.

## Exports

One owner module per door.

| Door | Owner | Publishes |
|---|---|---|
| `./tokens` | `src/tokens.mjs` | `TOKENS_FILE`, `tokensCss()`, `gridColumns(css)` — the proof grid's desktop column count, read off the CSS |
| `./tokens.css` | `src/tokens.css` | the `:root` tokens and classes every page carries in its `<style>` |
| `./partials` | `src/partials.mjs` | `loadPartials()`, `SECTION_IDS`, `sectionOf`, `THEME_IMAGES`, `themeImage`, `PARTIALS_DIR`, `TOKENS_INCLUDE` |
| `./copy` | `src/copy.mjs` | `COPY_SLOTS`, `normalizeCopy(partial)`, `fillCopy`, `COPY_SCHEMA`, `COPY_KINDS`, `REFUSED_SLOTS`, `ROSTER_OWNED`, `HTML_ALLOWLIST` |
| `./page` | `src/page.mjs` | `buildPage(specFile, opts)`, `writePage`, `main` (the CLI), `pageOutputs(fromDir)`, `THEME_VERSION`, the import-map markers |
| `./tiles` | `src/tiles.mjs` | `TILE_FIELDS`, `tileOf(row, ctx)`, `tileHtml(bag)`, `loadRoster(fromDir)`, `stillName` |
| `./bridge` | `src/bridge.mjs` | `CODESITE_SCRIPT` (the page's one view declaration), `loadBridgeFile(fromDir)` |
| `./share` | `src/share.mjs` | `shareJson`, `shareFiles`, `validateShareBlock`, `loadShareContract(fromDir)`, `SHARE_ASSETS`, `SHARE_DIR` (the file name is `@descix/app-sdk/share` `SHARE_JSON_FILE`) |
| `./gates` | `src/gates.mjs` | `assertPage(html, ctx)` (the one check of an assembled page), `assertTheme(partials, css)`, `stampOf` |
| `./request` | `src/request.mjs` | `REQUEST_FIELDS` (the one table of the forms' controls and the record field each fills), `FORMS`, `formFields(key)`, `INTAKE`, `PROPOSAL_KINDS`, `TEXT_LIMITS`, `EXTRA_MAX_KEYS`, `RECORD_FIELDS`, `REFUSALS`, `SIGNED_OUT_MESSAGE`, `intakeOf`, `scriptConfig`, `normalizeProposal`, `REFUSED_SPEC_KEYS` |

## CLI

```
egpt-site-theme build <dir>/<app>.json --out <dir> [--dry-run]
                [--ground <git checkout>@<commit> | --ground-github <owner/name>@<full sha>]
```

The app id is the spec's file name. Every input is read from the app's git repository and must be committed; an
uncommitted input refuses, naming it. The output is `pageOutputs(fromDir)`: `index.html`, `images/` (theme images, tile stills,
declared images, `images/share/`), `DeSciXAppSDK.js` (when `scripts.sdk`), `share.json` (when the spec has a share
block). `<body>` carries the provenance stamp `data-frontpage-app`, `data-frontpage-theme` (this package's version),
`data-frontpage-roster` (the `@descix/frqtl-web` version, when the page has tiles) and `data-frontpage-build` (the app
repository's HEAD, the full sha).

The quotation ground is the library repository at one commit: quotations (`<q data-src>`, `<blockquote data-src>`),
verbatim cuts (`data-cut-src`), library deep links, shelves and ground-path images are checked against it. Declare it
in the spec (`quotes`) or pass it on the command line; a page that quotes nothing never needs one. A GitHub ground is
fetched once into a sha-keyed cache (`$EGPT_SITE_THEME_CACHE`, else `~/.cache/egpt-site-theme`).

## Spec

`<dir>/<app>.json`, read by `normalizeSpec` (the table is `SPEC_KEYS`). A key starting with `_` is a comment.

| Key | Required | Form |
|---|---|---|
| `title` | yes | the `<title>` (fills `page.title`) |
| `description` | yes | the meta description (fills `page.description`) |
| `brand` | yes | `"template"`, or `{name, tag}` for a generated nav |
| `nav` | yes | `"template"`, or `[{text, href, class?, style?, html?}]` |
| `hero` | yes | `"template"`; `{file}` (an app fragment, `<header class="hero…" id="top">`); or `{eyebrow, h1_html, lede \| lede_html, primary, secondary?, kicker_html?, art?, src?}` |
| `sections` | yes | `[{use: <theme section id>, links?, anchors?} \| {file: <fragment>} \| {hero: true}]`, in page order |
| `footer` | yes | `"template"`, or `{name, tag, links, legal_html}` |
| `scripts` | yes | `{sdk?, codesite?, template_scripts?, extra?, modules?, import_map?, forward?}` (`SCRIPT_KEYS`) |
| `links` | no | `[[from, to]]` rewrites over the theme nav, hero, footer and sections |
| `login` | no | `true`: the Powch login button in the theme nav, and the theme's login script (see "Login button") |
| `css` | no | app CSS appended to the theme `<style>` |
| `images` | no | `[{from: "frontpage:<path in the app dir>" \| "<path in the ground>", to: "images/<name>"}]` |
| `self_host` | with a proposal form | the app's own public origin (`https://<app id>.descix.net`): no link to it may remain on the page; a proposal form sends `self_host` + `/` as `page_url` (see "Proposal forms") |
| `through_line` | no | `{"source": "served-roster"}`: the proof grid's through-line is the roster's `SHOWCASE_THROUGH_LINE` |
| `share` | no | `{site, title, description, icon, card, default_view?, pages?}`: writes `share.json` and `images/share/` (see "Per-view share cards") |
| `copy` | no | the app's copy file (path in the app dir) |
| `proposal` | with the `proposal` section | `{"kinds": ["seat", "one-thing", "talk", "other"]}`: the kinds its form's chooser offers, in order, a subset of `./request` `PROPOSAL_KINDS` (see "Proposal forms") |
| `quotes` | no | `{"repo": ".", "commit": "HEAD" \| <sha>}` (the app's own repository) or `{"repo": "<owner/name>", "commit": "<full sha>"}` |

Theme sections (`use`): the files of `src/partials/sections/` (`SECTION_IDS`). The page's own fragments are any HTML
in the app dir. Tiles: a `<div … data-exhibits></div>` gets one tile per roster row (`./tiles`). A tile links with the
roster's `showcaseHref(row)` on the showcase app's own page (`app === SHOWCASE_SITE.app`), else `showcaseUrl(row)`.

## Copy slots

Every text a theme partial shows is a slot in `COPY_SLOTS` (`{id, kind, default}`; `src/copy/*.json`), placed in the
partials as `{{slot:<id>}}`, with one exception: the request-form script (`src/partials/scripts/request-form.js`)
writes four strings of its own, `Connect wallet (Powch)`, `Try the other balance`, `enough for the next licence` and
`short of the next licence`; they are not slots, and an override of `request.btn.1` does not reach the script's text. The
`intake.*` slots (the signed-out button label and the lines beside a form) and the `proposal.kind.<kind>` slots (the
kind chooser's labels) are placed by the builder, not a partial: in the script's config and the chooser's options. Ids are `<section>.<element>[.<n>]`. `text` is plain text, escaped where it is placed;
`html` is inline HTML (`HTML_ALLOWLIST`). An app overrides slots in its copy file:

```json
{ "schema": "egpt-site-theme/copy@1",
  "slots": { "proof.lede": "…", "technology.p.2": { "html": "…" } } }
```

`normalizeCopy` refuses an unknown or removed slot (`REFUSED_SLOTS` names the replacement), a roster-owned text
(`ROSTER_OWNED`), a wrong kind, placeholder text, or HTML outside the allowlist; the build refuses an override whose
slot is not on the page. A slot id is public contract: adding one is minor; renaming or removing one, or changing its
kind, is major.

## Per-view share cards

`share.pages` is ferried into `share.json` as `pages`: `{"<slug>": {"title", "description", "image"?, "to"}}`, one card
per view of the site. The pinned `@descix/app-sdk/share` does not publish this field, so `./share` holds its rules
(`PAGES_KEY`, `PAGE_SLUG`, `PAGES_MAX`, `RESERVED_SLUGS`, `PAGE_FIELDS`, `PAGE_TO`, `PAGE_TO_FORBIDDEN`, `pageToPath`, `PAGE_DOT_SEGMENT`, `PAGE_TO_BASE`, `PAGE_IMAGE`, `validatePages`), and the
build refuses any entry that breaks one, naming the slug and the field. The edge skips a bad entry without a word, and
the upload does not validate, so the build is the only check. The rules: a slug matches `^[a-z0-9][a-z0-9-]{0,63}$`
and is not reserved (an exact, case-sensitive match, as the edge does: `apifront`, `mcp`, `oauth`, `.well-known`, `api`,
`assets`, `Community`, `site`, `__descix`, and the env labels `demo`, `dev`, `preview`, `prod`, which are edge config); at most 200 pages; `title` (required, 200 max), `description` (required, 500 max), `to`
(required, 512 max, `#…` or a single leading `/`; the whole `to` matches no character of the edge's
`/[\s\u0000-\u001f\u007f\\]/` (`PAGE_TO_FORBIDDEN`); for a `/` target, no path segment as written (before `?` or `#`) is
`.` or `..` with each dot written plain or as `%2e`/`%2E` (`PAGE_DOT_SEGMENT`), and the path the URL API resolves it to
(against `PAGE_TO_BASE`) does not start with `//`, and the path is not `/<k>` or `/<k>/` for any key `k` of `pages`
of slug shape, its own included; percent-encoded slashes stay a path on the app's host, as the edge
keeps them), `image` (optional, 512 max, a bundle path written like `og_image`,
never under `assets/`, and a file the build writes). A card's image counts as a use of a spec-declared image
(`images: [{from, to}]`): the build copies it into the bundle even when the page body never shows it; a declared image
that neither the page nor any card references is still refused as unused. These rules are an interim copy of the DeSciX edge's per-view card
rules, deleted when `@descix/app-sdk`'s share contract exports them; from the day `@descix/app-sdk/share` lists `pages`,
the build refuses until the theme's copy is deleted and the platform's is read.

## Sign-in state

The theme's auth watcher (`src/partials/scripts/auth.js`) is the one reader of the shell's sign-in state on a page. It
is placed once, before the scripts that consume it, on a page with the login button (`"login": true`) or a proposal
form (`scripts.template_scripts`). It defines `window.egptSiteAuth.watch(cb)`; `cb` gets
`{shell, powch, signedIn, address}` at once with the current state, then on every change:

- `DeSciX.ready()` not in mode `shell` (or no bridge on the page): `shell: false`, once.
- In the shell, `powch` is `true` once `DeSciX.powch` is on the shell's bus: at `ready()` when its `members` name
  `powch`; otherwise when the shell fires `DESCX_BRIDGE_READY` on the shell's window (`DeSciX.bridgeLevel` frames up).
- Then `DeSciX.powch.on('auth')`, which calls back at once with `{signedIn, address}` and on each change, sets
  `signedIn` and `address`. The subscription is dropped at `pagehide` (kept for the back-forward cache).

The login and request-form scripts take the state only from `egptSiteAuth.watch`: the theme gate refuses either one
that subscribes to `on('auth')`, listens for `DESCX_BRIDGE_READY` or defines `egptSiteAuth` itself.

## Login button

`"login": true` puts the Powch login button (`#descix-login`, label `nav.login`) in the theme nav and the theme's login
script (`src/partials/scripts/login.js`) on the page, the one owner of the button's behaviour. The button sits in the
header after the nav links, not inside them, so it stays visible at every width: at 820px and below, where the links
collapse, it keeps the header's right end on one line and the brand drops its tag to keep one line too
(`src/partials/login.css`); below 375px both tighten so the header fits 320px. A page whose spec has no `login` has
no button. Once Powch is on the
shell's bus (the auth watcher's `powch`), a click opens Powch (`DeSciX.powch.login()`); before that and outside the
shell, the button is a plain link to the platform. The label follows the auth watcher: `nav.login.signedin` while
signed in, `nav.login` otherwise. An app script in `scripts.extra` that names `descix-login` refuses to build.

## Proposal forms

The `request` section carries the licence form (`#licence-form`, kind `licence`); the `proposal` section carries the
general form (`#proposal-form`), whose kind chooser offers the spec's `proposal.kinds`. Each sends one record to
DeSciX's proposal intake, from a signed-in visitor, through the shell's bus (`src/partials/scripts/request-form.js`):

```js
DeSciX.call('app_records_put', { app_id, kb_id: 'proposals',
  records: [{ type: 'proposal', kind, text, page_url, name, org, contact, extra }] })
```

`app_id` is the app id (the spec's file name). `page_url` is the spec's `self_host` + `/`: the page's public https
address on the app's own host, which the intake requires. A page with either form refuses to build without
`self_host`, with a `self_host` that is not an `https://` origin, or one whose host is not the app's own (its first
label is not the app id); it also needs `scripts.template_scripts` and `scripts.sdk`, and nothing else uses that script.
The server stamps the submitter and the time; the forms never send `status`, `note` or `decided_at`. A spec that still
declares `request` refuses, naming this replacement (`REFUSED_SPEC_KEYS`).

`./request` `REQUEST_FIELDS` is the one owner of the controls: each row names the control, the record field it fills
(`name`, `org`, `contact`, `text`, `kind`; or `extra`, under the control's own name) and the forms that carry it,
required or optional. `formFields(key)` derives one form's list; the theme gate holds each partial's controls and
`required` marks to it, and the script builds the record from that list alone (empty values are left out). The table
is checked when the module loads: one control per record field, a required `text`, at most `EXTRA_MAX_KEYS` (6) keys in
`extra`, and a `kind` control exactly on the form that sends no fixed kind. Before sending, the script checks the
required controls, the email, and `text` against `TEXT_LIMITS` (20 to 5000 characters).

| Control | Record | Licence form | General form |
|---|---|---|---|
| `kind` | `kind` | — (always `licence`) | required |
| `who` | `name` | required | required |
| `org` | `org` | required | optional |
| `use` | `text` | required | required |
| `scale`, `timeline`, `licence_type`, `role` | `extra` | optional | — |
| `contact` | `contact` | required | required |

`ref` is not sent: the shell captures a `?ref=` share link and claims it once the visitor signs in
(`@descix/app-sdk/share-link`), and the page reads no ref of its own.

Signed in is the shell's word, read from the auth watcher (see "Sign-in state"). Signed out, the controls stay
editable and the button reads `intake.signin`; pressing it keeps what was typed in `sessionStorage` (per tab, per
form) and opens Powch (`DeSciX.powch.login()`); the page puts the values back when it loads again, and the visitor
presses send. In the shell before Powch is on the bus, pressing it shows the `intake.signin` line. Outside the shell
the button shows `intake.outside` with a link to `page_url`. Nothing is sent without a sign-in.

The answer is the bus's. A refusal REJECTS: the error comes from the shell's window, so the script reads its fields
(`code`, `message`, `status`, `data`) and never tests `instanceof Error`.

- `err.code` one of `REFUSALS`' codes (`PROPOSAL_FIELD_INVALID`, `PROPOSAL_NEEDS_IDENTITY`, `PROPOSAL_ADMIN_ONLY`,
  `RATE_LIMITED`): that code's `intake.refused.*` line beside the form; for `PROPOSAL_FIELD_INVALID`, also the label
  of the control `err.data.field` names (its record field, `extra.<name>` for an extra, or its control name), marked
  `aria-invalid`. A marked control has the `--gold` border (`src/partials/forms.css`, placed in the head of a page
  with a form); editing it clears the mark.
- No code and `err.message` the shell's signed-out refusal (`./request` `SIGNED_OUT_MESSAGE`, `User not
  authenticated.`): the `intake.signin` line.
- Any other rejection (an unknown code, no code): the form's fail line (`request.fail`, `proposal.fail`).

Every rejection is logged to the console; the form stays for another try. A success resolves the whole envelope
`{status: 'OK', auth_status, message: <receipt>}`: the form hides and the done panel shows, with the record id (the one
key of `message.content_sha256_by_file_id`) beside the receipt slot; when the receipt names no one record, the receipt
line is hidden and the answer is logged.

The intake contract in `./request` (`INTAKE`, `PROPOSAL_KINDS`, `TEXT_LIMITS`, `EXTRA_MAX_KEYS`, `REFUSALS`) is a copy,
held to the platform's literals by `test/intake-contract.test.mjs`, and deleted when `@descix/app-sdk` exports it.

## Tests

`npm test` (Node 20+). The theme CSS ends with its phone-width rules (`/* phone width */` in `src/tokens.css`): no
column or table makes a page wider than a 320px viewport. `test/zero-diff.test.mjs` builds the five fixture pages (`test/fixtures/egpt/`, inputs from the
library repository at the commit `source.json` names) and holds them to the library generator's own output at that
commit; it reads the quotation ground from GitHub, so it needs the network. `DeSciXAppSDK.js` is held to the pinned
`@descix/app-sdk` bridge file instead of the fixture's hash (the fixtures were generated at app-sdk 0.6.0).

## Releases

A GitHub Release on this repository tagged `egpt-site-theme-v<version>` publishes that version to npm
(`.github/workflows/publish.yml`, npm trusted publishing with provenance; no npm token). The run fails on any other tag
form, and when `<version>` is not `package.json` `version` at the tagged commit. A version already on npm is compared
with the gated tarball: skipped when it is the same content, a failure when not.

The dist-tag comes from the version alone: a version containing `-` (`0.1.0-p5.1`) publishes to `next`; any other
version (`0.2.0`) publishes to `latest`, and `next` is moved to it too.

What is published is gated as published, by `scripts/publish-gate.sh`: `npm test`; one `npm pack`; the tarball holds
exactly `package.json` and the tracked files under `files` (`bin/`, `src/`, `LICENSE.md`, `README.md`), each equal to the
tagged commit; an install of the tarball with its exact peers into an empty project, whose `egpt-site-theme build` must
reproduce the `egpt` fixture page (`test/fixtures/egpt/expected/egpt/`); and the tarball's sha256, re-checked before
`npm publish` takes that file. `bash scripts/publish-gate.sh` runs the same gate locally and prints the sha256 and the
dist-tag.

## License

DeSciX Community License and Membership Agreement (DCMA) v1: [LICENSE.md](LICENSE.md).
