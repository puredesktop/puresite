# puresite technical reference

[Back to the README](../README.md) · [Development guide](development.md)

Build a static website as real files, preview it as it will ship, and publish
it. A [puredesktop](https://puredesktop.ai) app, port 5450.

## The document

A `.site` package is a folder you can open and read:

```text
My site.site/
  site.json          title, nav order, target, brief, what each file is for
  pages/index.html   one HTML file per page
  styles/site.css    one stylesheet, shared by every page
  assets/            images a page references
  build/             what gets published
```

Pages are real files rather than one document split at build time. That costs
a little — the app juggles a set of files instead of a string — and buys the
things that matter: what you preview is what ships, links between pages are
real, and an agent can be handed one page without the rest.

## The three surfaces

- **Wizard** — brief, files, how many pages, where it is going, and a look.
- **Board** — pages down the left in nav order, the page itself in the middle
  at a real viewport width, everything you can change to it on the right.
- **Publish** — checks the site, writes `build/`, and hands the manifest to
  the drawer agent, which uses whichever deploy tool is configured.

## Two rules worth knowing

**The package holds real files; the preview inlines them; the build copies
them.** A sandboxed preview frame cannot resolve `assets/hero.png` against a
folder on disk, so at view time the stylesheet is inlined and asset references
become data URLs. What is written to disk keeps clean relative paths.

**A page is never scaled to fit.** Unlike a slide, a web page is supposed to
change shape, so the stage renders at a real width — phone, tablet, desktop —
and lets the page be as tall as it is.

## Hosting capabilities

Pages are static files. Collections and forms require a compatible publishing target; app agent tools run on the author’s machine, not as a visitor-facing server. See [agents.md](../agents.md) for the current collection and form tools.

## Working on it

```bash
npm run dev          # vite, port from plugin.json
npm run typecheck
npm run test
npm run build && npm run puredesktop:check
```

Inside the suite: `npm run dev:suite -- puresite`.
