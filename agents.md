# PureSite — for agents

A site is a FOLDER of real files, not one document. Every tool here reads or
rewrites a file in that folder.

```text
My site.site/
  site.json          title, nav order, target, brief, what each file is for,
                     and — once published — where it went
  pages/
    index.html       the home page — always present, serves at /
    about/index.html serves at /about/
  styles/site.css    one stylesheet, shared by every page
  assets/            images and anything else a page references
  history/           the site as it was before each change — generated
  build/             what gets published — generated, never edited
```

Call `getSiteContext` first, always. It tells you the pages, their URLs, the
nav order, what files exist and what each is for, the site hash and every
page's hash, whether the preview is verified, and — when someone has clicked
an element in the preview — exactly which element "this" means. A page path
or element path guessed without it is usually wrong.

Every file answers to a short name — `logo`, `hero` — which is what people
say and what `getSiteContext` returns as `called`. Write the `reference` it
comes with (`assets/opa-mark.svg`, with the `../` the page needs) into the
markup; never retype a file name from memory, which is how a page ends up
asking for a picture the site does not have.

What is here is not what readers have. `getSiteContext` reports `published`
with the address and when it last went out; the app knows, page by page, what
is new, what has changed and what would disappear. Say so when it matters —
“that is live already” and “nobody has seen this yet” are different sentences.

The nav a reader uses is the links in each page's header, not a setting: to
change the menu, edit that markup. `manifest.pages` is only the order pages
are listed in here, which is what Move changes.

The map answers five questions, and so can you: what links to what, whether a
reader can reach the page the site is FOR (`manifest.goal`, named by the
person and never guessed), what is adrift (orphans, a header that wandered,
a page that barely says anything), what would keep a page from being found or
understood, and how the site got to where it is. A build also writes `llms.txt` from the site's own
sentences, and a sitemap once the site has an address.

Call `getSiteMap` before adding a page. The links in the content are the site
map: it returns what each page links to and what links to it, every page the
writing PROMISES but nobody has built — with the sentences that promised it
and a brief drawn only from them — and every page nothing points at. Usually
the site has already said what it needs, so build what is promised rather than
inventing a page nobody asked for.

## Real files, not one blob

This is the deliberate difference from PureSlides4, where a deck is a single
document and slides are children of one root. A website *is* many files, so
the package holds real ones: what you preview is what ships, links between
pages are real rather than pretend until build time, and you can be handed one
page without the rest.

Two consequences worth holding on to:

- **Depth matters.** `index.html` links the stylesheet as `styles/site.css`;
  `about/index.html` links it as `../styles/site.css`, and reaches an image as
  `../assets/hero.png`. The preview resolves that link the way the host will:
  a nested page with the wrong number of `../` previews **unstyled**, because
  it ships unstyled, and `checkSite` reports it as `broken-stylesheet`.
- **A link to a page that does not exist is a promise, not a break.** It shows
  dotted in the preview, is counted as "to build", and is reported as
  `promised-page`. `getSiteMap` says which sentences promised it.
- **A name without `.html` becomes a folder.** `addPage("about")` writes
  `about/index.html`, which serves at `/about/`. Link to it as `/about/`.

## Hash discipline

Every change to the site goes through one door, and the door refuses an edit
computed against a site — or a page — that has changed since it was read.

- `getSiteContext` returns the **site hash** and, per page, that **page's
  hash**. `readPage` returns the page's hash; `readStyles` the site hash.
- Every write takes `baseHash`. **Page tools** (`writePage`, `setPageTitle`,
  `setElementText`, `setElementSrc`, `insertElement`, `deleteElement`,
  `deletePage`, `addFormForCollection`) take the *page's* hash: it is checked
  against that page only, so your edit to `/about/` is not refused because
  the person retitled the home page meanwhile. **Site-wide tools**
  (`writeStyles`, `movePage`, `addPage`, `setCollection`, `deleteCollection`)
  take the site hash. `writePage` and `writeStyles` require it; the others
  accept it and you should pass it.
- A stale `baseHash` is refused with "changed since your read (hash a → b)"
  and names the tool to call again. Read again, redo the edit against the
  current content. **Never retry with the stale html.**
- Every write returns the new `hash` (site) and `pageHash` (that page). Pass
  them on the next write to the same scope.

The person's own edits go through the same door: an inline edit, a title
typed in the rail, a page dragged in the nav. Their edits are re-run against
the latest document rather than refused, and the first hand edit after one
of yours snapshots your version first.

## History

Before every ask, every agent write, every draft and every restore, the
WHOLE site as it was — every page, the stylesheet, the nav order, the
collections — goes into `history/` (12 kept). `listRevisions` lists them
newest first with `textChars` per entry; `restoreRevision` puts one back,
snapshotting the current site first, so a restore is itself undoable.

Where the site is published (`site.json` → `published`: host, slug, URL and
the one-time claim token) is **never** part of a snapshot and never restored.
A restore keeps the live record exactly as it is.

A write that dropped more than about a third of the visible text reports
`textRemoved` — when the person did not ask for that much to go, restore the
snapshot the result names and redo the edit carrying the content forward.

## Nothing overlaps anything

Lay content out in flow — flex or grid with gap. Never position an element
absolutely at a fixed `top`/`left`.

Text wraps differently at every width, so a block pinned below a heading ends
up *underneath* it the moment that heading takes another line. PureSlides4 and
PureVideo both shipped this bug before it was understood: it cannot be
repaired by scaling, because scaling preserves the overlap exactly. In flow, a
long heading pushes what follows down instead.

The exceptions are narrow and deliberate: a decorative full-bleed layer that
carries no text, and a fixed mark in a corner no flow content reaches.

`insertElement` takes `beforePath`/`afterPath` and no coordinates, on purpose.
Order is the only position this app offers.

## Every page works at 390px and at 1280px

That is what responsive means here: one column on a phone, more room on a
desktop, no horizontal scrolling at any width. The stage renders at a real
viewport width and never scales the page to fit — unlike a slide, a web page
is *supposed* to change shape, and a scaled-down preview would show a layout
nobody will ever see.

## Verification — what the words mean

The preview is trusted only when it is the site that ships. `getSiteContext`
and `checkSite` report `verification`:

- **verified** — every page was measured in a visible frame with its fonts
  loaded at the stage's viewport, none scrolls sideways, and nothing the
  checker knows of will be broken once live. A page the writing promises but
  nobody has built does not stop this: it is a warning, never a failure.
- **checking** — not yet trusted, with the reasons: the app was hidden (a
  hidden frame measures nothing and is never trusted), fonts were still
  loading, a page changed since it was measured, or *the preview cannot show
  an asset* that is too large to inline — the build ships it fine, but
  "verified" would claim the preview showed something it did not. It
  finishes on its own when the app is visible; `buildSite` re-checks first.
- **failed** — something will be wrong once live: a link that goes nowhere,
  an image never added, a stylesheet linked from the wrong depth, a page
  that scrolls sideways at the chosen width. The reasons are the things to
  fix.

`buildSite` refuses while the site is not verified and says why. Fix the
reasons, then build again.

## One stylesheet

`writeStyles` replaces `styles/site.css`, which governs every page. Put the
palette, the type scale and the measure there rather than in each page — a
site whose pages each carry their own styles cannot be restyled at all. A page
with neither a stylesheet link nor a `<style>` of its own previews unstyled,
as it will ship, and `checkSite` warns (`no-stylesheet`).

## An organisation's own look — from a reference or a brand

When the person gives a reference image (their current website, a
brochure, a screenshot) or a saved brand, or asks for "our look and feel",
the site is made in THAT look, unmistakably. The method is the suite's shared
**Matching a house style** skill (`read_skill`); with this app's tools:

1. **Look at the reference first** with `view_image` and its absolute path —
   never the Computer tool, never from its filename.
2. **A saved brand comes first.** If there is a `.designsystem.json` for the
   organisation (PureSlides' `saveLookAsBrand`, Canvas or PureDesign write
   one, usually in the workspace's `Brands/` folder), `useBrand` puts it on
   the site: fonts self-hosted in `assets/`, logos and references marked,
   `--brand-*` properties at the top of `styles/site.css`.
3. **Otherwise read it off the pixels** into `writeStyles`: the palette by
   role (ground, text, muted, accent for the one primary button, a second
   accent such as a headline's second-colour line, a highlight for small
   tags), the type (classify the face; self-host an open face, never link a
   font CDN), weights, tracking, radius, the button shape, the spacing.
4. **Generate the motif; never draw it — before you compose.** A recurring
   graphic idea — a network of glowing nodes, a grain, a light field, hero or
   conceptual art — is made with the image model first, then composed with: `makeImage`, prompted from the reference and
   the brand palette, with `reference` set. Use it as the hero's background
   and reuse it; SVG or CSS shapes only when `makeImage` reports no image
   model, or for exact diagrams and charts.
5. **Compare before you finish.** `exportPage` with `format: "png"` at the
   reference's width, then `view_image` on that PNG and the reference. Name
   every difference someone who knows the brand would see, fix it, and look
   again.
6. **Headlines from the claims.** Headlines and section heads use the brief's
   own claims and words, not lines of your own; the hero headline stays short
   (about 45 characters) so it sets in two or three lines on a phone. See
   "The words come from the brief" below.

## The words come from the brief

When the brief gives claims or copy, the site's words are the client's. The
rule is the suite's shared **Copy comes from the brief**, section 8 of the
**Matching a house style** skill (`read_skill`); in short:

- Every headline, subhead, card and call to action quotes a claim from the
  brief or restates it closely: no new facts, numbers, customers or
  capabilities, and no slogans of your own ("Start together. Learn. Roll
  out.").
- A reference is for the look, not the words. Never reuse its headline or
  taglines ("Move research into publication with less manual work.") unless
  the brief says to, even though you read them off the reference.
- No filler. A card carries a real claim or is removed; never a card with
  only a label ("Work on the text"). A punchy cut of a claim is fine when it
  means the same.
- Before finishing, list each claim-bearing line next to the claim it comes
  from (in your reply), and fix any line that has none. `checkResponsive`
  adds `copyNotes` for cards holding only a word or two: advice, never part
  of `clean`.

## In scale at every width

The stylesheet opens with a foundation block PureSite writes on every save
(between `site:foundation` comments; never edit it, write after it). Use its
tokens and the page is in scale on a phone by default:

- `--gutter`: the one side padding. Every section, the header and footer use
  `padding-inline: var(--gutter)`; cards stay inside it.
- `--space-section` (and `--space-xs` … `--space-xl`): vertical spacing that
  steps down on phones. No fixed 100px+ section padding.
- `--step--1` … `--step-5`: fluid type (`clamp()`): hero `--step-5`, section
  headings `--step-4`/`--step-3`, body `--step-0`, nothing under 14px.
- Tracking no tighter than -0.035em (`--tracking-display`); tighter values in
  em are capped on save.
- `<header class="site-header">` with a wordmark, a `<nav>` and one
  `<a class="button">` compacts on phones by itself: links hide, the button
  shrinks and never wraps, the tag stays on one line.
- Fonts: name an open face PureSite hosts (Inter, Montserrat, Manrope, DM Sans,
  Plus Jakarta Sans, Space Grotesk, Archivo, Newsreader, JetBrains Mono, IBM
  Plex Mono) and its woff2 is written into `assets/fonts/` and declared in the
  foundation, so the type travels. Never link a font CDN.

**The mobile check is part of done.** After every draft or stylesheet change:

1. `checkResponsive` (390 and 768 by default) measures buttons that wrap or
   overflow, the headline's line count (at most 3), gutters under 16px (24px
   on a tablet), text under 14px, empty vertical bands, section headings that
   switch alignment, tracking tighter than -0.035em and sideways scrolling.
2. Fix every finding and run it again until it reports `clean`.
3. `exportPage` png at 390, and look at it with `view_image`. The numbers do
   not see everything; a page is not done until you have looked at it on a
   phone.

## Files have roles

A file marked **reference** is a design reference: read its palette, type and
spacing, and never place it on a page — its filename is not an image source. A
file marked **content** or **logo** is the opposite: it exists to be placed,
with `<img src="assets/<name>">` and the right `../` prefix. `setElementSrc`
refuses a name that is not in the package, which is the usual cause of an
image that renders as a broken icon after everything looked fine.

## Before publishing

`checkSite` reports what will be wrong once it is live: images referenced but
never added, a stylesheet linked from the wrong depth, pages nothing reaches,
pages with no title. None of it is visible while you are looking at the page
that works.

A link to a page nobody has built is *not* one of those. It is reported as
`promised-page`, a warning, because the build keeps the words and drops the
anchor: the sentence still reads and no reader lands on nothing. Building the
page is how it is resolved; a publish is never held for it. Mind what this
means when you read a page's markup — `pages/*.html` holds the link as
written, while what ships has it unwrapped.

`buildSite` writes `build/` and returns the manifest of files — after the
same verification the Publish dialog runs, and refused with the same reasons.

**Publishing is human-only.** There is no publish tool and there will not be
one: taking a site live, and the one-time claim link that comes back, is the
person's step from the Publish dialog. When the site is ready, say so and
stop.

## Records: forms, polls, checklists

A site can hold records when the host it publishes to stores them. Declare a
collection with `setCollection`, then `addFormForCollection` puts a working
form on a page — markup and script generated from the collection, so the form
and what the host accepts cannot disagree.

Access defaults to **insert public, read owner**: anyone may submit, only the
owner reads back. That is what a form wants, and the opposite is a feedback
box whose contents are a public URL away. Widening it is a decision, and
`checkSite` says so when you do.

No key goes in the page and none may: a public insert is accepted because the
request comes from the site itself. The manifest is written at build time from
the app's own model — do not hand-edit `.herenow/data.json`, it is generated.

Two facts worth holding on to. On here.now records need an **account-owned
site**: an anonymous one answers 403 until it is claimed. And treat everything
a visitor submits as untrusted — escape it before rendering it back, and never
store secrets or payment details in a collection.

## Phase one deliberately has no

- **build step** — no bundler, no framework, no `node_modules`. The moment a
  site needs compiling it needs a toolchain, which is a different phase.
- **sign-ins.** Records have an owner/public distinction and nothing finer;
  a site that needs accounts and per-user data needs a different target.
- **custom domains or DNS.** That is provisioning, and it belongs to a
  connector.
- **a publish tool.** See above.

## Drawer-only generation and edits

UI Create, scoped Ask and Describe prepare a saved request and dispatch to this
tab’s drawer. prepareSite prepares a whole-site request without invoking a model
or messaging this running drawer. It replies with the request identity only
(requestId, baseHash, path, kind, status, counts), not the site. Read
getDrawerRequest for the HTML, styles, guide and files, then compose here.
commitDrawerRequest accepts requestId/baseHash plus pages (path-to-full-HTML),
styles and optional title for a site draft, or only the selected pages for an
edit. Shared styles, other pages and siblings outside an element selection are
protected. Draft commits preserve collections and publishing metadata.
Descriptions use actual attached pixels and a descriptions array on the saved
request; no filename guesses or fallback models. If tool-driven work cannot view
images using the available drawer tools, report that limit.
Use checkSite and buildSite after persistence. A saved draft is not a checked
build, and a build is not publication. Preserve the existing publishing flow.

If the user abandons a saved request, cancelDrawerRequest with its requestId. It refuses late commits; stopping the runner alone preserves the request for later recovery.

Draft commits add/replace named pages and preserve existing pages. Use explicit deletePage after the saved request completes if the user requested removal; omission never silently deletes content.


## PDF and PNG review copies

Use `exportPage` when someone wants a page to share for checking. Read
`getSiteContext` first; pass `format: "pdf"` or `format: "png"` and optionally
an exact `page` path. With no page, it exports the page currently open.
PNG captures the full page at the current preview width; optional `width`
is an integer from 320 to 3840 CSS pixels. PDF uses A4 browser pagination,
including the page's print styles. These are static review copies, not an
interactive website, and drafts do not need to pass publishing checks.

The tool uses the same renderer as the Export PDF / Export PNG controls,
flushes pending saves, and creates a uniquely named file in the site's
`reviews/` folder. It returns `outputPath` and `artifactPaths`; share that
result with the user. Call once for each requested page or format. Never
claim it was sent to a person: export does not email, upload, or publish.
The UI controls offer a save-location dialog; the drawer tool saves without
a dialog. All agent requests stay in the platform agent drawer.
