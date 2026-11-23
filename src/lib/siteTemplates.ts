/**
 * Multi-Page Swiss-Editorial Starter Template Gallery for PureSite.
 *
 * 5 handcrafted, zero-AI, zero-JS multi-page sites using PureSite's foundation
 * tokens, accessible `siteHeaderHtml` responsive navigation, design tokens,
 * section library classes, and native PureCloud contact forms (`_forms/contact`).
 */
import { SITE_STYLESHEET } from '../constants'
import { DESIGN_PRESETS, withDesignTokens, type DesignTokens } from './designTokens'
import { withSectionLibraryStyles } from './sectionLibrary'
import { escapeHtml, type SiteDocument } from './siteDocument'
import { siteHeaderHtml, withSiteFoundation, type SiteHeaderLink } from './siteFoundation'

export interface SiteTemplate {
  id: string
  name: string
  category: string
  tagline: string
  pages: string[]
  palette: [string, string, string]
  presetId: string
  build: () => SiteDocument
}

const TEMPLATE_HEADER_CSS = `/* Template navigation & header layout */
.site-header {
  max-width: var(--max, 1180px);
  margin: 0 auto;
  padding: var(--space-s) var(--gutter, clamp(20px, 5vw, 56px));
  display: flex;
  align-items: center;
  gap: var(--space-m);
  border-bottom: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 14%, transparent));
}
.site-header .brand {
  font-family: var(--font-display, inherit);
  font-weight: 700;
  font-size: var(--step-0);
  letter-spacing: -0.02em;
  color: var(--ink, #14171a);
  text-decoration: none;
  margin-inline-end: auto;
}
.site-header .site-nav {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}
.site-header .site-nav a,
.site-header details.site-menu nav a {
  color: var(--ink-soft, #4e555e);
  text-decoration: none;
  font-size: var(--step--1);
  font-weight: 500;
}
.site-header .site-nav a:hover,
.site-header details.site-menu nav a:hover {
  color: var(--ink, #14171a);
}
.site-header .button {
  display: inline-flex;
  align-items: center;
  padding: 9px 15px;
  border-radius: var(--radius, 3px);
  background: var(--accent, #b3546c);
  color: var(--accent-ink, #ffffff);
  font-size: var(--step--1);
  font-weight: 600;
  text-decoration: none;
}
.ps-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: var(--space-m);
  font-size: var(--step--1);
}
.ps-table th,
.ps-table td {
  text-align: left;
  padding: 12px 10px;
  border-bottom: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 14%, transparent));
}
.ps-table th {
  font-family: var(--font-mono, ui-monospace, monospace);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft, #4e555e);
  font-weight: 600;
}
`

function buildPage(options: {
  title: string
  description: string
  brand: string
  nav: SiteHeaderLink[]
  action?: SiteHeaderLink
  body: string
  footerNote: string
}): string {
  const header = siteHeaderHtml({
    brand: { label: options.brand, href: 'index.html' },
    links: options.nav,
    ...(options.action ? { action: options.action } : {}),
  })
  const safeTitle = escapeHtml(options.title)
  const safeDesc = escapeHtml(options.description)
  const footerLinks = options.nav
    .map(link => `          <li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <link rel="stylesheet" href="${SITE_STYLESHEET}" />
  </head>
  <body>
    ${header}
    <main>
${options.body}
    </main>
    <footer class="ps-footer" aria-label="Site footer">
      <div class="ps-footer-grid">
        <div>
          <h2 class="ps-h3">${escapeHtml(options.brand)}</h2>
          <p class="ps-muted">${escapeHtml(options.footerNote)}</p>
        </div>
        <div>
          <h2 class="ps-h3">Navigation</h2>
          <ul class="ps-footer-links">
${footerLinks}
          </ul>
        </div>
      </div>
      <div class="ps-colophon">
        <span>© 2026 ${escapeHtml(options.brand)}.</span>
        <span>Built with PureSite · Open web standards</span>
      </div>
    </footer>
  </body>
</html>
`
}

function contactSectionHtml(heading: string, lead: string, buttonLabel = 'Send message'): string {
  return `      <section class="ps-section" id="contact" aria-label="Contact form">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Contact</p>
          <h1 class="ps-h1">${escapeHtml(heading)}</h1>
          <p class="ps-lead">${escapeHtml(lead)}</p>
          <form class="ps-form" method="POST" action="_forms/contact">
            <div class="ps-hp" aria-hidden="true">
              <label for="contact-gotcha">Leave empty</label>
              <input id="contact-gotcha" type="text" name="_gotcha" tabindex="-1" autocomplete="off" />
            </div>
            <div class="ps-field">
              <label for="contact-name">Name</label>
              <input id="contact-name" type="text" name="name" required autocomplete="name" placeholder="Your full name" />
            </div>
            <div class="ps-field">
              <label for="contact-email">Email</label>
              <input id="contact-email" type="email" name="email" required autocomplete="email" placeholder="you@example.org" />
            </div>
            <div class="ps-field">
              <label for="contact-message">Message</label>
              <textarea id="contact-message" name="message" rows="5" required placeholder="Tell us about your timeline and goals…"></textarea>
            </div>
            <div class="ps-actions">
              <button class="ps-btn ps-btn-primary" type="submit">${escapeHtml(buttonLabel)}</button>
            </div>
          </form>
        </div>
      </section>`
}

function composeStyles(tokens: DesignTokens): string {
  const base = withSectionLibraryStyles(TEMPLATE_HEADER_CSS)
  return withSiteFoundation(withDesignTokens(base, tokens))
}

function presetTokens(id: string): DesignTokens {
  return DESIGN_PRESETS.find(preset => preset.id === id)?.tokens ?? DESIGN_PRESETS[0]!.tokens
}

function buildStudioAgency(): SiteDocument {
  const brand = 'Atelier Nord'
  const nav: SiteHeaderLink[] = [
    { label: 'Home', href: 'index.html' },
    { label: 'Work', href: 'work.html' },
    { label: 'About', href: 'about.html' },
    { label: 'Contact', href: 'contact.html' },
  ]
  const footerNote = 'Independent Swiss-editorial design and web architecture studio based in Basel and Zurich.'
  const pages: Record<string, string> = {
    'index.html': buildPage({
      title: 'Atelier Nord — Design & Digital Systems',
      description: 'Independent design studio crafting enduring websites, editorial systems, and brand architecture.',
      brand,
      nav,
      action: { label: 'Start a project', href: 'contact.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="Introduction">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Basel · Zurich · Est. 2019</p>
          <h1 class="ps-h1">Editorial precision for ambitious digital teams.</h1>
          <p class="ps-lead">Atelier Nord partners with cultural institutions, research groups, and technology founders to build crisp, durable web platforms without JavaScript bloat.</p>
          <div class="ps-actions">
            <a class="ps-btn ps-btn-primary" href="work.html">View selected work</a>
            <a class="ps-btn" href="contact.html">Book a discovery call</a>
          </div>
        </div>
      </section>
      <section class="ps-section" aria-label="Capabilities">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Practice</p>
          <h2 class="ps-h2">Disciplined systems across brand, editorial, and web.</h2>
          <div class="ps-grid-3">
            <article class="ps-card">
              <span class="ps-index">01</span>
              <h3 class="ps-h3">Brand Architecture</h3>
              <p class="ps-muted">Typographic systems, colour hierarchies, and living guidelines documented as open tokens.</p>
            </article>
            <article class="ps-card">
              <span class="ps-index">02</span>
              <h3 class="ps-h3">Static Web Craft</h3>
              <p class="ps-muted">Accessible multi-page sites engineered for sub-second loading and effortless editorial upkeep.</p>
            </article>
            <article class="ps-card">
              <span class="ps-index">03</span>
              <h3 class="ps-h3">Publishing Tooling</h3>
              <p class="ps-muted">Clean templates, review workflows, and versioned releases tailored to your team.</p>
            </article>
          </div>
        </div>
      </section>
      <section class="ps-section" aria-label="Studio numbers">
        <div class="ps-wrap ps-grid-4">
          <div><span class="ps-stat-value">42</span><span class="ps-stat-label">Launches shipped since 2019</span></div>
          <div><span class="ps-stat-value">99.4</span><span class="ps-stat-label">Mean accessibility &amp; SEO score</span></div>
          <div><span class="ps-stat-value">6 wks</span><span class="ps-stat-label">Standard identity-to-launch cadence</span></div>
          <div><span class="ps-stat-value">100%</span><span class="ps-stat-label">Open HTML &amp; CSS ownership</span></div>
        </div>
      </section>`,
    }),
    'work.html': buildPage({
      title: 'Selected Work — Atelier Nord',
      description: 'Case studies across scientific publishing, cultural archives, and product design systems.',
      brand,
      nav,
      action: { label: 'Start a project', href: 'contact.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="Selected projects">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Archive · 2024–2026</p>
          <h1 class="ps-h1">Selected case studies.</h1>
          <p class="ps-lead">Every commission ships as clean semantic HTML, self-hosted typography, and verifiable WCAG contrast.</p>
          <div class="ps-grid-3">
            <article class="ps-card">
              <span class="ps-index">2026 · Publishing</span>
              <h2 class="ps-h3">Kunsthalle Digital Catalogue</h2>
              <p class="ps-muted">Exhibition archive and bilingual reading room cutting page payload by 84%.</p>
            </article>
            <article class="ps-card">
              <span class="ps-index">2025 · Science</span>
              <h2 class="ps-h3">Helvetia Climate Atlas</h2>
              <p class="ps-muted">Public monograph portal and annual data summary built for zero-downtime static hosting.</p>
            </article>
            <article class="ps-card">
              <span class="ps-index">2025 · Software</span>
              <h2 class="ps-h3">Kinetik Field Platform</h2>
              <p class="ps-muted">Complete brand system, documentation hub, and conversion-focused product launch site.</p>
            </article>
          </div>
        </div>
      </section>`,
    }),
    'about.html': buildPage({
      title: 'About — Atelier Nord',
      description: 'How Atelier Nord works, our editorial principles, and the people behind the practice.',
      brand,
      nav,
      action: { label: 'Start a project', href: 'contact.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="About the studio">
        <div class="ps-wrap ps-split">
          <div>
            <p class="ps-eyebrow">Practice</p>
            <h1 class="ps-h1">Small senior team, direct collaboration.</h1>
            <p class="ps-lead">We work directly with founders, editors, and principal engineers—no hand-offs, no bloated frameworks, and no black-box hosting.</p>
          </div>
          <aside class="ps-card">
            <h2 class="ps-h3">Our standards</h2>
            <ul class="ps-list">
              <li>Content-first grids tuned for phone, tablet, and desktop</li>
              <li>Self-hosted OFL typefaces—zero third-party font beacons</li>
              <li>Full WCAG 2.1 AA/AAA colour verification before launch</li>
            </ul>
          </aside>
        </div>
      </section>`,
    }),
    'contact.html': buildPage({
      title: 'Contact — Atelier Nord',
      description: 'Start a project or request our studio credentials deck.',
      brand,
      nav,
      footerNote,
      body: contactSectionHtml(
        'Let us build something clear.',
        'Tell us about your project, scope, and ideal launch date. Messages land directly in our PureCloud inbox.',
      ),
    }),
  }

  return {
    title: brand,
    pages,
    styles: composeStyles(presetTokens('swiss-editorial')),
    manifest: {
      title: brand,
      pages: ['index.html', 'work.html', 'about.html', 'contact.html'],
      target: 'static-host',
      brief: 'Swiss-editorial design studio website with work showcase, about page, and PureCloud contact form.',
      assets: [],
      look: 'editorial',
    },
    collections: [],
  }
}

function buildResearchLab(): SiteDocument {
  const brand = 'Meridian Systems Lab'
  const nav: SiteHeaderLink[] = [
    { label: 'Overview', href: 'index.html' },
    { label: 'Publications', href: 'publications.html' },
    { label: 'People', href: 'about.html' },
    { label: 'Contact', href: 'contact.html' },
  ]
  const footerNote = 'Independent research group studying verifiable computation, open scientific publishing, and climate sensing.'
  const pages: Record<string, string> = {
    'index.html': buildPage({
      title: 'Meridian Systems Lab — Open Research',
      description: 'Independent scientific lab publishing open datasets, reproducible methods, and peer-reviewed papers.',
      brand,
      nav,
      action: { label: 'Read papers', href: 'publications.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="Lab mission">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Open Science · Geneva</p>
          <h1 class="ps-h1">Reproducible systems for earth &amp; computing science.</h1>
          <p class="ps-lead">Meridian Systems Lab develops open instrumentation, verifiable analytical pipelines, and long-lived digital monographs freely accessible to the public.</p>
          <div class="ps-actions">
            <a class="ps-btn ps-btn-primary" href="publications.html">Browse publications</a>
            <a class="ps-btn" href="about.html">Meet the researchers</a>
          </div>
        </div>
      </section>
      <section class="ps-section" aria-label="Research themes">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Active programs</p>
          <h2 class="ps-h2">Three multi-year research tracks.</h2>
          <div class="ps-grid-3">
            <article class="ps-card">
              <span class="ps-index">TRACK 01</span>
              <h3 class="ps-h3">Alpine Sensor Telemetry</h3>
              <p class="ps-muted">Low-power acoustic and snowpack stations publishing hourly calibrated open series.</p>
            </article>
            <article class="ps-card">
              <span class="ps-index">TRACK 02</span>
              <h3 class="ps-h3">Deterministic Notebooks</h3>
              <p class="ps-muted">Bit-for-bit reproducible figure generation and archival HTML publishing for peer review.</p>
            </article>
            <article class="ps-card">
              <span class="ps-index">TRACK 03</span>
              <h3 class="ps-h3">Open Benchmarks</h3>
              <p class="ps-muted">Transparent evaluation suites for scientific language and forecasting models.</p>
            </article>
          </div>
        </div>
      </section>`,
    }),
    'publications.html': buildPage({
      title: 'Publications — Meridian Systems Lab',
      description: 'Peer-reviewed papers, preprints, and open datasets from Meridian Systems Lab.',
      brand,
      nav,
      footerNote,
      body: `      <section class="ps-section" aria-label="Publications list">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Library · Open Access</p>
          <h1 class="ps-h1">Publications &amp; datasets.</h1>
          <p class="ps-lead">All manuscripts, code repositories, and replication datasets are released under CC-BY 4.0 and MIT licences.</p>
          <table class="ps-table">
            <thead>
              <tr><th>Year</th><th>Title</th><th>Venue</th></tr>
            </thead>
            <tbody>
              <tr><td>2026</td><td>Verifiable Static Publishing for Multi-Modal Research Objects</td><td>Open Science Quarterly</td></tr>
              <tr><td>2025</td><td>Sub-Kilogram Glacial Acoustic Arrays Across the Valais Basin</td><td>Earth Systems Data</td></tr>
              <tr><td>2025</td><td>Auditing Calibration Drift in Long-Horizon Climate Emulators</td><td>J. Comp. Climate</td></tr>
            </tbody>
          </table>
        </div>
      </section>`,
    }),
    'about.html': buildPage({
      title: 'People — Meridian Systems Lab',
      description: 'Principal investigators, fellows, and visiting collaborators at Meridian Systems Lab.',
      brand,
      nav,
      footerNote,
      body: `      <section class="ps-section" aria-label="Team">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Researchers</p>
          <h1 class="ps-h1">An interdisciplinary faculty.</h1>
          <div class="ps-grid-3">
            <article class="ps-card"><h2 class="ps-h3">Prof. Elena Rossi</h2><p class="ps-muted">Principal Investigator · Atmospheric Physics &amp; Telemetry</p></article>
            <article class="ps-card"><h2 class="ps-h3">Dr. Jonas Lindholm</h2><p class="ps-muted">Senior Fellow · Reproducible Computational Methods</p></article>
            <article class="ps-card"><h2 class="ps-h3">Dr. Amara Okafor</h2><p class="ps-muted">Research Scientist · Open Scientific Infrastructure</p></article>
          </div>
        </div>
      </section>`,
    }),
    'contact.html': buildPage({
      title: 'Contact — Meridian Systems Lab',
      description: 'Propose a collaboration, fellowship inquiry, or press request.',
      brand,
      nav,
      footerNote,
      body: contactSectionHtml(
        'Collaborate with the lab.',
        'We welcome visiting fellows, dataset inquiries, and joint grant proposals.',
        'Submit inquiry',
      ),
    }),
  }

  return {
    title: brand,
    pages,
    styles: composeStyles(presetTokens('warm-paper')),
    manifest: {
      title: brand,
      pages: ['index.html', 'publications.html', 'about.html', 'contact.html'],
      target: 'static-host',
      brief: 'Research lab site with open publications table, team profiles, and fellowship contact form.',
      assets: [],
      look: 'editorial',
    },
    collections: [],
  }
}

function buildSaasProduct(): SiteDocument {
  const brand = 'Vektor Field'
  const nav: SiteHeaderLink[] = [
    { label: 'Product', href: 'index.html' },
    { label: 'Features', href: 'features.html' },
    { label: 'Pricing', href: 'pricing.html' },
    { label: 'Contact', href: 'contact.html' },
  ]
  const footerNote = 'Deterministic release pipelines and observability for static and edge engineering teams.'
  const pages: Record<string, string> = {
    'index.html': buildPage({
      title: 'Vektor Field — Instant Verifiable Releases',
      description: 'Ship audited builds in seconds with zero-config previews, version rollbacks, and live telemetry.',
      brand,
      nav,
      action: { label: 'Get started', href: 'pricing.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="Product hero">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Release 4.2 · Now available</p>
          <h1 class="ps-h1">Ship audited releases with one-click rollback.</h1>
          <p class="ps-lead">Vektor Field checks links, accessibility, and asset budgets before every deploy—then serves immutable snapshots globally in under 30 milliseconds.</p>
          <div class="ps-actions">
            <a class="ps-btn ps-btn-primary" href="pricing.html">View plans</a>
            <a class="ps-btn" href="features.html">Explore architecture</a>
          </div>
        </div>
      </section>
      <section class="ps-section" aria-label="Metrics">
        <div class="ps-wrap ps-grid-4">
          <div><span class="ps-stat-value">24 ms</span><span class="ps-stat-label">Median global TTFB</span></div>
          <div><span class="ps-stat-value">1.2s</span><span class="ps-stat-label">Atomic version rollback</span></div>
          <div><span class="ps-stat-value">99.99%</span><span class="ps-stat-label">Verified uptime SLA</span></div>
          <div><span class="ps-stat-value">0</span><span class="ps-stat-label">Client-side tracking scripts</span></div>
        </div>
      </section>
      <section class="ps-section" aria-label="Testimonials">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Customer stories</p>
          <h2 class="ps-h2">Built for engineering and editorial speed.</h2>
          <div class="ps-grid-3">
            <blockquote class="ps-quote"><p>“Pre-flight checks caught broken links and contrast regressions before a single user saw them.”</p><footer>Liam Chen · VP Engineering, Strata</footer></blockquote>
            <blockquote class="ps-quote"><p>“Rollback took literally two seconds during a launch day typo fix. Worth every penny.”</p><footer>Sofia Morales · Product Lead, Kova</footer></blockquote>
            <blockquote class="ps-quote"><p>“Our marketing team ships multi-page updates without filing engineering tickets.”</p><footer>Henrik Berg · CTO, Nordica</footer></blockquote>
          </div>
        </div>
      </section>`,
    }),
    'features.html': buildPage({
      title: 'Features — Vektor Field',
      description: 'Pre-flight audits, immutable version history, and native form capture.',
      brand,
      nav,
      action: { label: 'Get started', href: 'pricing.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="Platform capabilities">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Architecture</p>
          <h1 class="ps-h1">Everything you need from draft to production.</h1>
          <div class="ps-grid-3">
            <article class="ps-card"><span class="ps-index">01</span><h2 class="ps-h3">Automated Pre-Flight</h2><p class="ps-muted">Checks SEO meta tags, OpenGraph cards, heading hierarchy, and WCAG 2.1 contrast automatically.</p></article>
            <article class="ps-card"><span class="ps-index">02</span><h2 class="ps-h3">Immutable Snapshots</h2><p class="ps-muted">Every deploy is content-hashed and retained so rollbacks are instant and deterministic.</p></article>
            <article class="ps-card"><span class="ps-index">03</span><h2 class="ps-h3">Zero-JS Form Capture</h2><p class="ps-muted">Collect leads and feedback through native POST endpoints with built-in spam protection.</p></article>
          </div>
        </div>
      </section>`,
    }),
    'pricing.html': buildPage({
      title: 'Pricing — Vektor Field',
      description: 'Simple, predictable plans with no per-seat surprises.',
      brand,
      nav,
      footerNote,
      body: `      <section class="ps-section" aria-label="Pricing tiers">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Pricing</p>
          <h1 class="ps-h1">Predictable plans that scale cleanly.</h1>
          <div class="ps-grid-3">
            <article class="ps-card">
              <h2 class="ps-h3">Hobby</h2>
              <p class="ps-price">$0 <span class="ps-muted">/ mo</span></p>
              <ul class="ps-list"><li>3 live sites</li><li>Automated pre-flight audit</li><li>Native form inbox</li></ul>
              <a class="ps-btn" href="contact.html">Start free</a>
            </article>
            <article class="ps-card ps-tier-featured">
              <span class="ps-index">MOST POPULAR</span>
              <h2 class="ps-h3">Team</h2>
              <p class="ps-price">$49 <span class="ps-muted">/ mo</span></p>
              <ul class="ps-list"><li>Unlimited sites &amp; versions</li><li>Passcode-protected staging</li><li>Priority support</li></ul>
              <a class="ps-btn ps-btn-primary" href="contact.html">Start 14-day trial</a>
            </article>
            <article class="ps-card">
              <h2 class="ps-h3">Enterprise</h2>
              <p class="ps-price">Custom</p>
              <ul class="ps-list"><li>Self-hosted PureServer node</li><li>SSO &amp; audit logs</li><li>Dedicated SLA</li></ul>
              <a class="ps-btn" href="contact.html">Contact sales</a>
            </article>
          </div>
        </div>
      </section>`,
    }),
    'contact.html': buildPage({
      title: 'Contact — Vektor Field',
      description: 'Request a walkthrough or enterprise deployment guide.',
      brand,
      nav,
      footerNote,
      body: contactSectionHtml(
        'Talk with our engineering team.',
        'Questions about self-hosting, custom domains, or volume pricing? Send us a message below.',
        'Request walkthrough',
      ),
    }),
  }

  return {
    title: brand,
    pages,
    styles: composeStyles(presetTokens('obsidian-ink')),
    manifest: {
      title: brand,
      pages: ['index.html', 'features.html', 'pricing.html', 'contact.html'],
      target: 'static-host',
      brief: 'SaaS product site with feature architecture, pricing tiers, and demo request form.',
      assets: [],
      look: 'studio',
    },
    collections: [],
  }
}

function buildPersonalPortfolio(): SiteDocument {
  const brand = 'Clara Lindqvist'
  const nav: SiteHeaderLink[] = [
    { label: 'Index', href: 'index.html' },
    { label: 'Selected Work', href: 'work.html' },
    { label: 'Profile', href: 'about.html' },
    { label: 'Contact', href: 'contact.html' },
  ]
  const footerNote = 'Staff product designer & creative technologist focusing on editorial tools and calm interfaces.'
  const pages: Record<string, string> = {
    'index.html': buildPage({
      title: 'Clara Lindqvist — Product Designer',
      description: 'Portfolio of Clara Lindqvist — design systems, creative software, and typography.',
      brand,
      nav,
      action: { label: 'Say hello', href: 'contact.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="Introduction">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Stockholm · Available Q3 2026</p>
          <h1 class="ps-h1">Designing quiet tools for thoughtful work.</h1>
          <p class="ps-lead">I am Clara Lindqvist, an independent product designer partnering with software makers on visual editors, design languages, and web publishing platforms.</p>
          <div class="ps-actions">
            <a class="ps-btn ps-btn-primary" href="work.html">Browse portfolio</a>
            <a class="ps-btn" href="about.html">Read biography</a>
          </div>
        </div>
      </section>
      <section class="ps-section" aria-label="Selected highlights">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Featured</p>
          <h2 class="ps-h2">Recent collaborations.</h2>
          <div class="ps-grid-3">
            <article class="ps-card"><span class="ps-index">01 · Tooling</span><h3 class="ps-h3">Folio Type Foundry</h3><p class="ps-muted">Interactive specimen tester and licensing store built in pure semantic HTML &amp; CSS.</p></article>
            <article class="ps-card"><span class="ps-index">02 · Interface</span><h3 class="ps-h3">Monolith Note</h3><p class="ps-muted">End-to-end redesign of a local-first research notebook used by 80,000 writers.</p></article>
            <article class="ps-card"><span class="ps-index">03 · Identity</span><h3 class="ps-h3">Nordic Print Archive</h3><p class="ps-muted">Digital exhibition index and high-contrast editorial reader.</p></article>
          </div>
        </div>
      </section>`,
    }),
    'work.html': buildPage({
      title: 'Selected Work — Clara Lindqvist',
      description: 'Detailed archive of software interfaces, editorial sites, and design systems.',
      brand,
      nav,
      footerNote,
      body: `      <section class="ps-section" aria-label="Work archive">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Archive</p>
          <h1 class="ps-h1">Selected projects, 2021–2026.</h1>
          <table class="ps-table">
            <thead><tr><th>Year</th><th>Project</th><th>Role</th></tr></thead>
            <tbody>
              <tr><td>2026</td><td>Folio Type Foundry</td><td>Design Systems &amp; Front-End</td></tr>
              <tr><td>2025</td><td>Monolith Note 3.0</td><td>Principal Product Designer</td></tr>
              <tr><td>2024</td><td>Nordic Print Archive</td><td>Art Direction &amp; Web Architecture</td></tr>
              <tr><td>2023</td><td>Linear Field Guide</td><td>Editorial Design</td></tr>
            </tbody>
          </table>
        </div>
      </section>`,
    }),
    'about.html': buildPage({
      title: 'Profile — Clara Lindqvist',
      description: 'Background, speaking engagements, and design principles.',
      brand,
      nav,
      footerNote,
      body: `      <section class="ps-section" aria-label="Biography">
        <div class="ps-wrap ps-split">
          <div>
            <p class="ps-eyebrow">Profile</p>
            <h1 class="ps-h1">Typography meets systems engineering.</h1>
            <p class="ps-lead">Over the past decade I have led design systems teams in Stockholm and Zurich, focusing on accessible interfaces that respect readers’ time and attention.</p>
          </div>
          <aside class="ps-card">
            <h2 class="ps-h3">Speaking &amp; Writing</h2>
            <ul class="ps-list">
              <li>Keynote · Nordic Design Systems Conf (2025)</li>
              <li>Essay · “Zero-JS Interactions That Last” (2025)</li>
              <li>Workshop · High-Contrast Editorial Grids (2024)</li>
            </ul>
          </aside>
        </div>
      </section>`,
    }),
    'contact.html': buildPage({
      title: 'Contact — Clara Lindqvist',
      description: 'Commission work, advisory roles, or speaking invitations.',
      brand,
      nav,
      footerNote,
      body: contactSectionHtml(
        'Available for select commissions.',
        'Share a note about what you are building, your team, and approximate timing.',
      ),
    }),
  }

  return {
    title: brand,
    pages,
    styles: composeStyles(presetTokens('high-contrast-clear')),
    manifest: {
      title: brand,
      pages: ['index.html', 'work.html', 'about.html', 'contact.html'],
      target: 'static-host',
      brief: 'Personal design portfolio with project index, biography, and contact form.',
      assets: [],
      look: 'plain',
    },
    collections: [],
  }
}

function buildEventSymposium(): SiteDocument {
  const brand = 'Zurich Design Symposium'
  const nav: SiteHeaderLink[] = [
    { label: 'Home', href: 'index.html' },
    { label: 'Program', href: 'program.html' },
    { label: 'Venue', href: 'about.html' },
    { label: 'Register', href: 'contact.html' },
  ]
  const footerNote = 'Two days of talks, critiques, and workshops on Swiss typography, open web craft, and digital permanence.'
  const pages: Record<string, string> = {
    'index.html': buildPage({
      title: 'Zurich Design Symposium 2026',
      description: 'October 14–15, 2026 in Zurich — talks and workshops on editorial web architecture.',
      brand,
      nav,
      action: { label: 'Register', href: 'contact.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="Event announcement">
        <div class="ps-wrap">
          <p class="ps-eyebrow">October 14–15, 2026 · Kunsthaus Auditorium, Zurich</p>
          <h1 class="ps-h1">Interfaces that endure.</h1>
          <p class="ps-lead">Two days gathering typographers, engineers, and publishers to examine open web standards, calm software, and tactile digital design.</p>
          <div class="ps-actions">
            <a class="ps-btn ps-btn-primary" href="contact.html">Reserve a seat</a>
            <a class="ps-btn" href="program.html">See full program</a>
          </div>
        </div>
      </section>
      <section class="ps-section" aria-label="Event facts">
        <div class="ps-wrap ps-grid-4">
          <div><span class="ps-stat-value">16</span><span class="ps-stat-label">Single-track invited speakers</span></div>
          <div><span class="ps-stat-value">240</span><span class="ps-stat-label">Total auditorium capacity</span></div>
          <div><span class="ps-stat-value">4</span><span class="ps-stat-label">Hands-on typography workshops</span></div>
          <div><span class="ps-stat-value">2 days</span><span class="ps-stat-label">No parallel rooms, no sponsor pitches</span></div>
        </div>
      </section>
      <section class="ps-section" aria-label="FAQ">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Details</p>
          <h2 class="ps-h2">Attendee FAQ</h2>
          <div class="ps-faq">
            <details open>
              <summary>Are talks recorded and published openly?</summary>
              <p>Yes. Full transcripts and captioned videos are published under CC-BY within two weeks of the event.</p>
            </details>
            <details>
              <summary>Are student and independent scholarships available?</summary>
              <p>We reserve 40 complimentary seats for students, educators, and independent researchers—indicate this on the registration form.</p>
            </details>
          </div>
        </div>
      </section>`,
    }),
    'program.html': buildPage({
      title: 'Program — Zurich Design Symposium 2026',
      description: 'Full two-day schedule of keynotes, panels, and studio workshops.',
      brand,
      nav,
      action: { label: 'Register', href: 'contact.html' },
      footerNote,
      body: `      <section class="ps-section" aria-label="Schedule">
        <div class="ps-wrap">
          <p class="ps-eyebrow">Schedule · Single Track</p>
          <h1 class="ps-h1">Two days of focused talks.</h1>
          <table class="ps-table">
            <thead><tr><th>Time</th><th>Session</th><th>Speaker</th></tr></thead>
            <tbody>
              <tr><td>Day 1 · 09:30</td><td>Opening Keynote: The Return of Static Craft</td><td>Prof. Lukas Meyer</td></tr>
              <tr><td>Day 1 · 11:00</td><td>Fluid Typography Without Breakpoint Soup</td><td>Nadia Berset</td></tr>
              <tr><td>Day 1 · 14:30</td><td>Accessible Navigation With Zero JavaScript</td><td>Kenji Takahashi</td></tr>
              <tr><td>Day 2 · 10:00</td><td>Designing Token Systems That Survive Five Years</td><td>Clara Lindqvist</td></tr>
            </tbody>
          </table>
        </div>
      </section>`,
    }),
    'about.html': buildPage({
      title: 'Venue & Travel — Zurich Design Symposium 2026',
      description: 'Location, transit access, and accessibility information for the symposium.',
      brand,
      nav,
      footerNote,
      body: `      <section class="ps-section" aria-label="Venue details">
        <div class="ps-wrap ps-split">
          <div>
            <p class="ps-eyebrow">Venue</p>
            <h1 class="ps-h1">Heimplatz, central Zurich.</h1>
            <p class="ps-lead">Ten minutes by tram from Zurich Hauptbahnhof. Fully step-free access, live captioning, and quiet reading rooms throughout both days.</p>
          </div>
          <aside class="ps-card">
            <h2 class="ps-h3">Practical information</h2>
            <ul class="ps-list">
              <li>Doors open at 08:30 with local coffee and pastries</li>
              <li>Real-time human captioning on the main screen</li>
              <li>Printed Swiss-grid program booklet included</li>
            </ul>
          </aside>
        </div>
      </section>`,
    }),
    'contact.html': buildPage({
      title: 'Register — Zurich Design Symposium 2026',
      description: 'Reserve your seat or apply for an independent scholarship pass.',
      brand,
      nav,
      footerNote,
      body: contactSectionHtml(
        'Reserve your seat.',
        'Submit your registration details below. We confirm seats and send invoice or scholarship details within 24 hours.',
        'Request registration',
      ),
    }),
  }

  return {
    title: brand,
    pages,
    styles: composeStyles(presetTokens('signal-bold')),
    manifest: {
      title: brand,
      pages: ['index.html', 'program.html', 'about.html', 'contact.html'],
      target: 'static-host',
      brief: 'Two-day design symposium website with single-track schedule, venue details, and registration form.',
      assets: [],
      look: 'editorial',
    },
    collections: [],
  }
}

export const SITE_TEMPLATES: readonly SiteTemplate[] = [
  {
    id: 'studio-agency',
    name: 'Studio / Agency',
    category: 'Creative Practice',
    tagline: 'Atelier Nord — Swiss-editorial agency with Work, About & Contact.',
    pages: ['index.html', 'work.html', 'about.html', 'contact.html'],
    palette: ['#ffffff', '#14171a', '#b3546c'],
    presetId: 'swiss-editorial',
    build: buildStudioAgency,
  },
  {
    id: 'research-lab',
    name: 'Research Lab',
    category: 'Science & Academia',
    tagline: 'Meridian Systems Lab — warm serif papers table, team & inquiry form.',
    pages: ['index.html', 'publications.html', 'about.html', 'contact.html'],
    palette: ['#faf7f2', '#1c1917', '#9a3412'],
    presetId: 'warm-paper',
    build: buildResearchLab,
  },
  {
    id: 'saas-product',
    name: 'SaaS Product',
    category: 'Software',
    tagline: 'Vektor Field — Obsidian dark launch site with features & pricing tiers.',
    pages: ['index.html', 'features.html', 'pricing.html', 'contact.html'],
    palette: ['#111315', '#f3f4f6', '#e06c88'],
    presetId: 'obsidian-ink',
    build: buildSaasProduct,
  },
  {
    id: 'personal-portfolio',
    name: 'Personal Portfolio',
    category: 'Individual',
    tagline: 'Clara Lindqvist — high-contrast portfolio index, bio & contact.',
    pages: ['index.html', 'work.html', 'about.html', 'contact.html'],
    palette: ['#ffffff', '#0b0d0f', '#0f4c81'],
    presetId: 'high-contrast-clear',
    build: buildPersonalPortfolio,
  },
  {
    id: 'event-symposium',
    name: 'Event / Symposium',
    category: 'Conference',
    tagline: 'Zurich Design Symposium — bold single-track program, FAQ & RSVP.',
    pages: ['index.html', 'program.html', 'about.html', 'contact.html'],
    palette: ['#f7f7f5', '#111111', '#c81e1e'],
    presetId: 'signal-bold',
    build: buildEventSymposium,
  },
]

export function createSiteFromTemplate(templateId: string): SiteDocument {
  const found = SITE_TEMPLATES.find(template => template.id === templateId) ?? SITE_TEMPLATES[0]!
  return found.build()
}
