<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="puresite icon"></p>

# puresite

## What puresite does

A static-site workspace that treats a website as real page, style, script, and asset files. Create pages, inspect the site visually, preview changes, and publish through a configured destination.

## App layout

| Area | What you use it for |
| --- | --- |
| **Site board** | See pages together and select the page you want to work on. |
| **Page frame** | Preview a page and inspect the selected content. |
| **Work and change views** | Track requested work, questions, and proposed changes. |
| **Site map and publishing** | Review the site’s structure and use the publishing dialog when the site is ready. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Getting started

1. Create or open a `.site` project and edit its pages, styles, scripts, and assets.
2. Preview the site and follow its links to check the result.
3. Save the project and use a configured publishing destination when ready to publish. Hosting credentials and services are configured separately.

Read the [app guide](docs/app-guide.md) for development, loading, and source-layout details.

## Develop and customize

We welcome **developers and vibecoders alike**. You can add features to puresite, develop a fork, or create a new app for [puredesktop](https://puredesktop.ai).

### Use Claude Code, Codex, or your own tools

Open a local source checkout or a purefactory project's folder in your preferred coding tool. Ask it to read this README, `plugin.json`, `package.json`, `agents.md`, and the [development guide](docs/development.md) before making changes. Review the changes, run the app's checks, and test it inside [puredesktop](https://puredesktop.ai). This source may require matching shared platform packages; a browser preview alone does not provide desktop services.

The [development guide](docs/development.md) explains how to start Claude Code or Codex in the project, work on this repository, and load your app into the desktop.

### Use purefactory inside the desktop

Open **purefactory** (Factory) to describe a new app, or select an available app project and request a feature. Use **Open folder** to continue with external tools and **Open app** to test the result. You can also request a local app change through the app's drawer where app-development integration is available; distinguish changing the app from editing its current document.

Use **Share** in purefactory to create a `.pureapp` package. In current builds, install it through **Settings → System → Install an app → Choose package…**. See the [development guide](docs/development.md#load-and-share-your-app) for the full workflow and version differences.

## Developer accounts and the marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

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
