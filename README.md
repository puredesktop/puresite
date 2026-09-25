<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="puresite icon"></p>

# PureSite

## App documentation

Build static websites as real files, with preview and publishing controls.

1. Create or open a `.site` project and edit its pages, styles, scripts, and assets.
2. Preview the site and follow its links to check the result.
3. Save the project and use a configured publishing destination when ready to publish. Hosting credentials and services are configured separately.

Read the [app guide](docs/app-guide.md) for usage and development requirements. This app runs within [puredesktop](https://puredesktop.ai).

## Open source and contributions

Create, preview, and publish static websites.

Anyone may use, study, modify, and share this software under the applicable licenses.
We welcome pull requests, bug reports, documentation improvements, and new ideas.
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

### License

Original code by pure.science inc is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 pure.science inc. Third-party code, dependencies, and assets retain their own licenses and copyright notices.

### Major open-source projects

| Project / source | Homepage or documentation | Support the maintainers |
| --- | --- | --- |
| [react/react](https://github.com/react/react) | [Homepage / docs](https://react.dev) | — |
| [styled-components/styled-components](https://github.com/styled-components/styled-components) | [Homepage / docs](https://styled-components.com) | [GitHub Sponsors](https://github.com/sponsors/quantizor) · [Open Collective](https://opencollective.com/styled-components) |

Thank you to these projects and their contributors. Additional direct dependencies,
upstream links, and asset notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


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

## Phase one

No bundler, no dev server, no `node_modules` in the site: a static site is
already the thing that gets published, so building is copying. No forms,
database or sign-ins — a static site cannot serve them, and agent tools run on
the author's machine for the builder, not on the host for a visitor.

## Working on it

```bash
npm run dev          # vite, port from plugin.json
npm run typecheck
npm run test
npm run build && npm run puredesktop:check
```

Inside the suite: `npm run dev:suite -- puresite`.
