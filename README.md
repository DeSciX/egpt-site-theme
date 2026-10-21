# @descix/egpt-site-theme

The EGPT community's site theme: one versioned package every community app's front page is built from. The theme
owns the look (CSS tokens, the nav/hero/footer/section partials), the default copy, the page assembler, the tile
writer, the view declarer, the share writer and the page gates. Each app owns its spec, its fragments and its copy
overrides, and builds its own page with the CLI.

```
npm i -D --save-exact @descix/egpt-site-theme@0.1.0-p4.1 @descix/frqtl-web@0.6.1-p2.1 @descix/app-sdk@0.6.0
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
| `login` | no | `true`: the Powch login button in the theme nav |
| `css` | no | app CSS appended to the theme `<style>` |
| `images` | no | `[{from: "frontpage:<path in the app dir>" \| "<path in the ground>", to: "images/<name>"}]` |
| `self_host` | no | the app's own public origin: no link to it may remain on the page |
| `through_line` | no | `{"source": "served-roster"}`: the proof grid's through-line is the roster's `SHOWCASE_THROUGH_LINE` |
| `share` | no | `{site, title, description, icon, card, default_view?}`: writes `share.json` and `images/share/` |
| `copy` | no | the app's copy file (path in the app dir) |
| `quotes` | no | `{"repo": ".", "commit": "HEAD" \| <sha>}` (the app's own repository) or `{"repo": "<owner/name>", "commit": "<full sha>"}` |

Theme sections (`use`): the files of `src/partials/sections/` (`SECTION_IDS`). The page's own fragments are any HTML
in the app dir. Tiles: a `<div … data-exhibits></div>` gets one tile per roster row (`./tiles`). A tile links with the
roster's `showcaseHref(row)` on the showcase app's own page (`app === SHOWCASE_SITE.app`), else `showcaseUrl(row)`.

## Copy slots

Every text a theme partial shows is a slot in `COPY_SLOTS` (`{id, kind, default}`; `src/copy/*.json`), placed in the
partials as `{{slot:<id>}}`, with one exception: the request-form script (`src/partials/scripts/request-form.js`)
writes four strings of its own, `Connect wallet (Powch)`, `Try the other balance`, `enough for the next licence` and
`short of the next licence`; they are not slots, and an override of `request.btn.1` does not reach the script's text. Ids are `<section>.<element>[.<n>]`. `text` is plain text, escaped where it is placed;
`html` is inline HTML (`HTML_ALLOWLIST`). An app overrides slots in its copy file:

```json
{ "schema": "egpt-site-theme/copy@1",
  "slots": { "proof.lede": "…", "technology.p.2": { "html": "…" } } }
```

`normalizeCopy` refuses an unknown or removed slot (`REFUSED_SLOTS` names the replacement), a roster-owned text
(`ROSTER_OWNED`), a wrong kind, placeholder text, or HTML outside the allowlist; the build refuses an override whose
slot is not on the page. A slot id is public contract: adding one is minor; renaming or removing one, or changing its
kind, is major.

## Tests

`npm test` (Node 20+). `test/zero-diff.test.mjs` builds the five fixture pages (`test/fixtures/egpt/`, inputs from the
library repository at the commit `source.json` names) and holds them to the library generator's own output at that
commit; it reads the quotation ground from GitHub, so it needs the network.

## License

DeSciX Community License and Membership Agreement (DCMA) v1: [LICENSE.md](LICENSE.md).
