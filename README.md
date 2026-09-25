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

You can develop this app outside [puredesktop](https://puredesktop.ai), using your preferred editor, terminal, and coding tools, then load the module into [puredesktop](https://puredesktop.ai) to use and test it. You can also change your local version from **purefactory** or through **the app’s drawer agent**.

### Use your own development tools

1. Fork or clone this repository and work on a local copy in your editor.
2. Set up the app’s dependencies and run its development server or build. See the [app guide](docs/app-guide.md#development-and-loading) for this repository’s requirements and scripts.
3. Load the module into [puredesktop](https://puredesktop.ai). For a local web development server, the platform guide describes **File → Register App…**: register its URL, app name, and required permissions, then open it from **Browse Apps**. Keep the development server running while using that entry point.
4. Make changes in your editor, reload the app as needed, and test its file, account, and agent integrations inside the desktop. A distributable `.pureapp` package can be loaded through **File → Install App…**.

See the [app development and integration guide](https://puredesktop.ai/docs/apps/) for registration, the app manifest, the bridge, and packaging. Editing outside the desktop does not remove this module’s shared-dependency requirements.

### Use purefactory or the app’s drawer agent

Open your local app project in **purefactory** to develop it there, or open the app’s **drawer agent** and describe the change you want to make to your local version. Specify whether you want to change the app itself or work on the document or data currently open. Review the resulting source changes, run the relevant checks, and reload your local app to try them. You can keep the changes for yourself, develop a fork, or contribute them back with a pull request.

## Developer accounts and the marketplace

[Create a developer account on puredesktop.ai](https://puredesktop.ai/developers) to take part in the developer community and submit apps for review. We welcome contributions to this app, forks that take it in a different direction, and entirely new apps to offer on [puredesktop](https://puredesktop.ai).

We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. A marketplace with support for **paid apps is coming soon**, so developers will be able to charge for their apps if they choose. When distributing a fork, follow the licenses of the code and dependencies you use.

For more information about developer accounts, app submissions, or the upcoming marketplace, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

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
