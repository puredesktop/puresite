/**
 * Visual Section Library & Block Composer for PureSite.
 *
 * 10 handcrafted, responsive, accessible Swiss-editorial HTML sections using
 * PureSite's foundation tokens (`--step-*`, `--space-*`, `--gutter`, `--max`,
 * `--measure`) and studio/brand design tokens (`--ground`, `--surface`,
 * `--ink`, `--ink-soft`, `--accent`, `--radius`, `--font-*`).
 *
 * Zero JavaScript required: interactive patterns use native HTML (`<details>`
 * for FAQ accordions, native `method="POST" action="_forms/contact"` with
 * `_gotcha` honeypot for PureCloud forms).
 */
import { insertElement, writePage } from './pages'
import type { SiteDocument } from './siteDocument'

export type SectionCategory =
  | 'Hero & Intro'
  | 'Content'
  | 'Social Proof'
  | 'Conversion'
  | 'Structure'

export interface SectionTemplate {
  id: string
  name: string
  category: SectionCategory
  summary: string
  /** Miniature wireframe hint for the visual picker card. */
  wireframe:
    | 'hero'
    | 'split'
    | 'grid-3'
    | 'metrics'
    | 'pricing'
    | 'quotes'
    | 'faq'
    | 'form'
    | 'cta'
    | 'footer'
  html: string
}

export const SECTION_CATEGORIES: readonly SectionCategory[] = [
  'Hero & Intro',
  'Content',
  'Social Proof',
  'Conversion',
  'Structure',
]

export const SECTION_STYLES_START = '/* section-library:start */'
export const SECTION_STYLES_END = '/* section-library:end */'

export const SECTION_LIBRARY_CSS = `${SECTION_STYLES_START}
.ps-section {
  padding: var(--space-section, clamp(56px, 9vw, 120px)) var(--gutter, clamp(20px, 5vw, 56px));
  border-bottom: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 14%, transparent));
}
.ps-wrap {
  max-width: var(--max, 1180px);
  margin: 0 auto;
}
.ps-eyebrow {
  margin: 0 0 var(--space-xs);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--step--1);
  letter-spacing: var(--tracking-label, 0.14em);
  text-transform: uppercase;
  color: var(--accent, #b3546c);
}
.ps-h1 {
  margin: 0 0 var(--space-s);
  font-family: var(--font-display, inherit);
  font-size: var(--step-5);
  line-height: 1.04;
  letter-spacing: var(--tracking-display, -0.03em);
  max-width: 18ch;
}
.ps-h2 {
  margin: 0 0 var(--space-s);
  font-family: var(--font-display, inherit);
  font-size: var(--step-3);
  line-height: 1.12;
  letter-spacing: var(--tracking-heading, -0.02em);
  max-width: 24ch;
}
.ps-h3 {
  margin: 0 0 var(--space-2xs);
  font-family: var(--font-display, inherit);
  font-size: var(--step-1);
  line-height: 1.25;
}
.ps-lead {
  margin: 0 0 var(--space-m);
  max-width: var(--measure, 66ch);
  font-size: var(--step-1);
  line-height: 1.55;
  color: var(--ink-soft, #4e555e);
}
.ps-muted {
  color: var(--ink-soft, #4e555e);
}
.ps-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
}
.ps-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 22%, transparent));
  border-radius: var(--radius, 3px);
  background: var(--ground, #ffffff);
  color: var(--ink, #14171a);
  font-size: var(--step--1);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.ps-btn-primary {
  border-color: var(--accent, #b3546c);
  background: var(--accent, #b3546c);
  color: var(--accent-ink, #ffffff);
}
.ps-split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: var(--space-l);
  align-items: start;
}
.ps-card {
  padding: var(--space-m);
  border: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 14%, transparent));
  border-radius: var(--radius, 3px);
  background: var(--surface, #f6f7f8);
}
.ps-grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: var(--space-m);
  margin-top: var(--space-m);
}
.ps-grid-4 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
  gap: var(--space-m);
}
.ps-index {
  display: block;
  margin-bottom: var(--space-xs);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--step--1);
  color: var(--accent, #b3546c);
}
.ps-stat-value {
  display: block;
  font-family: var(--font-display, inherit);
  font-size: var(--step-4);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
  letter-spacing: var(--tracking-heading, -0.02em);
}
.ps-stat-label {
  display: block;
  margin-top: var(--space-2xs);
  font-size: var(--step--1);
  color: var(--ink-soft, #4e555e);
}
.ps-tier-featured {
  border-color: var(--accent, #b3546c);
  background: var(--ground, #ffffff);
}
.ps-price {
  margin: var(--space-xs) 0 var(--space-s);
  font-size: var(--step-3);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ps-list {
  margin: var(--space-s) 0 var(--space-m);
  padding-left: 1.15em;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  color: var(--ink-soft, #4e555e);
}
.ps-quote {
  margin: 0;
  padding: var(--space-m);
  border: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 14%, transparent));
  border-left: 3px solid var(--accent, #b3546c);
  border-radius: var(--radius, 3px);
  background: var(--surface, #f6f7f8);
}
.ps-quote p {
  margin: 0 0 var(--space-s);
  font-size: var(--step-1);
  color: var(--ink, #14171a);
}
.ps-quote footer {
  font-size: var(--step--1);
  color: var(--ink-soft, #4e555e);
}
.ps-faq {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 14%, transparent));
  margin-top: var(--space-m);
}
.ps-faq details {
  border-bottom: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 14%, transparent));
  padding-block: var(--space-s);
}
.ps-faq summary {
  font-weight: 600;
  font-size: var(--step-1);
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  gap: var(--space-s);
}
.ps-faq summary::after {
  content: '+';
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--accent, #b3546c);
}
.ps-faq details[open] summary::after {
  content: '−';
}
.ps-faq details p {
  margin: var(--space-xs) 0 0;
  max-width: var(--measure, 66ch);
  color: var(--ink-soft, #4e555e);
}
.ps-form {
  display: grid;
  gap: var(--space-s);
  max-width: 560px;
  margin-top: var(--space-m);
}
.ps-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ps-field label {
  font-size: var(--step--1);
  font-weight: 600;
}
.ps-field input,
.ps-field textarea {
  padding: 11px 13px;
  border: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 22%, transparent));
  border-radius: var(--radius, 3px);
  background: var(--ground, #ffffff);
  color: var(--ink, #14171a);
  font: inherit;
  font-size: var(--step-0);
}
.ps-hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.ps-cta-band {
  background: var(--surface, #f6f7f8);
}
.ps-footer {
  padding: var(--space-l) var(--gutter, clamp(20px, 5vw, 56px));
  background: var(--surface, #f6f7f8);
}
.ps-footer-grid {
  max-width: var(--max, 1180px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: var(--space-m);
}
.ps-footer-links {
  list-style: none;
  margin: var(--space-xs) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ps-footer-links a {
  color: var(--ink-soft, #4e555e);
  text-decoration: none;
  font-size: var(--step--1);
}
.ps-footer-links a:hover {
  color: var(--ink, #14171a);
  text-decoration: underline;
}
.ps-colophon {
  max-width: var(--max, 1180px);
  margin: var(--space-m) auto 0;
  padding-top: var(--space-s);
  border-top: 1px solid var(--line, color-mix(in srgb, var(--ink, #14171a) 14%, transparent));
  font-size: var(--step--1);
  color: var(--ink-soft, #4e555e);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-xs);
}
${SECTION_STYLES_END}`

export const SECTION_LIBRARY: readonly SectionTemplate[] = [
  {
    id: 'hero',
    name: 'Editorial Hero',
    category: 'Hero & Intro',
    summary: 'Display headline, disciplined measure lead copy, and primary + secondary calls to action.',
    wireframe: 'hero',
    html: `<section class="ps-section ps-hero" aria-label="Introduction">
  <div class="ps-wrap">
    <p class="ps-eyebrow">Edition 01 · Swiss Editorial</p>
    <h1 class="ps-h1">Clarity built to outlast trends.</h1>
    <p class="ps-lead">We design resilient digital systems, editorial publications, and research platforms grounded in typographic precision and open web standards.</p>
    <div class="ps-actions">
      <a class="ps-btn ps-btn-primary" href="#contact">Start a conversation</a>
      <a class="ps-btn" href="#work">Explore selected work</a>
    </div>
  </div>
</section>`,
  },
  {
    id: 'editorial-split',
    name: 'Editorial Split',
    category: 'Content',
    summary: 'Two-column asymmetric overview pairing narrative copy with a structured specification card.',
    wireframe: 'split',
    html: `<section class="ps-section" aria-label="Overview">
  <div class="ps-wrap ps-split">
    <div>
      <p class="ps-eyebrow">Approach</p>
      <h2 class="ps-h2">Structure before ornament.</h2>
      <p class="ps-lead">Every page starts from a clear reading order, semantic HTML, and fluid proportions that hold together from a 390px phone to a wide studio display.</p>
    </div>
    <aside class="ps-card">
      <h3 class="ps-h3">Deliverables at a glance</h3>
      <ul class="ps-list">
        <li>Fluid typographic scale and responsive gutters</li>
        <li>Self-hosted open-source fonts with zero tracking</li>
        <li>WCAG 2.1 AA/AAA verified colour tokens</li>
        <li>Clean static HTML that deploys anywhere</li>
      </ul>
    </aside>
  </div>
</section>`,
  },
  {
    id: 'feature-grid',
    name: '3-Col Feature Grid',
    category: 'Content',
    summary: 'Numbered 01 / 02 / 03 Swiss grid cards for capabilities, principles, or product pillars.',
    wireframe: 'grid-3',
    html: `<section class="ps-section" aria-label="Capabilities">
  <div class="ps-wrap">
    <p class="ps-eyebrow">Capabilities</p>
    <h2 class="ps-h2">Three pillars, zero bloat.</h2>
    <div class="ps-grid-3">
      <article class="ps-card">
        <span class="ps-index">01</span>
        <h3 class="ps-h3">Design Systems</h3>
        <p class="ps-muted">Tokenized colour, typography, and spacing scales that keep multi-page sites coherent as teams grow.</p>
      </article>
      <article class="ps-card">
        <span class="ps-index">02</span>
        <h3 class="ps-h3">Accessible Markup</h3>
        <p class="ps-muted">Semantic landmarks, keyboard-reachable menus, and audited contrast built directly into every template.</p>
      </article>
      <article class="ps-card">
        <span class="ps-index">03</span>
        <h3 class="ps-h3">Instant Publishing</h3>
        <p class="ps-muted">Static bundles with version history, rollback, and native form capture ready in a single click.</p>
      </article>
    </div>
  </div>
</section>`,
  },
  {
    id: 'metrics-strip',
    name: 'Metrics Strip',
    category: 'Social Proof',
    summary: 'Four-column tabular KPI row highlighting outcomes, speed, and reliability.',
    wireframe: 'metrics',
    html: `<section class="ps-section" aria-label="Key metrics">
  <div class="ps-wrap ps-grid-4">
    <div>
      <span class="ps-stat-value">100</span>
      <span class="ps-stat-label">Lighthouse accessibility &amp; SEO target</span>
    </div>
    <div>
      <span class="ps-stat-value">&lt;40 KB</span>
      <span class="ps-stat-label">Average initial page payload</span>
    </div>
    <div>
      <span class="ps-stat-value">0 JS</span>
      <span class="ps-stat-label">Required for navigation, FAQs, and forms</span>
    </div>
    <div>
      <span class="ps-stat-value">14 days</span>
      <span class="ps-stat-label">Typical sprint from brief to launch</span>
    </div>
  </div>
</section>`,
  },
  {
    id: 'pricing-tiers',
    name: 'Pricing Tiers',
    category: 'Conversion',
    summary: 'Three transparent tiers with a highlighted recommended plan and crisp feature lists.',
    wireframe: 'pricing',
    html: `<section class="ps-section" aria-label="Pricing">
  <div class="ps-wrap">
    <p class="ps-eyebrow">Transparent pricing</p>
    <h2 class="ps-h2">Straightforward plans for every team.</h2>
    <div class="ps-grid-3">
      <article class="ps-card">
        <h3 class="ps-h3">Starter</h3>
        <p class="ps-price">$0 <span class="ps-muted">/ mo</span></p>
        <p class="ps-muted">For personal sites, essays, and portfolios.</p>
        <ul class="ps-list">
          <li>Unlimited static pages</li>
          <li>All 10 bundled font families</li>
          <li>Built-in SEO &amp; contrast audit</li>
        </ul>
        <a class="ps-btn" href="#contact">Choose Starter</a>
      </article>
      <article class="ps-card ps-tier-featured">
        <span class="ps-index">RECOMMENDED</span>
        <h3 class="ps-h3">Studio</h3>
        <p class="ps-price">$29 <span class="ps-muted">/ mo</span></p>
        <p class="ps-muted">For studios, labs, and product launches.</p>
        <ul class="ps-list">
          <li>Instant PureCloud hosting &amp; rollback</li>
          <li>Native contact form inbox</li>
          <li>Passcode-protected preview links</li>
        </ul>
        <a class="ps-btn ps-btn-primary" href="#contact">Choose Studio</a>
      </article>
      <article class="ps-card">
        <h3 class="ps-h3">Organisation</h3>
        <p class="ps-price">$99 <span class="ps-muted">/ mo</span></p>
        <p class="ps-muted">For shared house styles and multi-team publishing.</p>
        <ul class="ps-list">
          <li>Organisation brand governance</li>
          <li>Dedicated PureServer deployment</li>
          <li>Scheduled releases &amp; audit trail</li>
        </ul>
        <a class="ps-btn" href="#contact">Talk to us</a>
      </article>
    </div>
  </div>
</section>`,
  },
  {
    id: 'testimonials',
    name: 'Testimonials',
    category: 'Social Proof',
    summary: 'Editorial pull-quotes with rose left rules and clear speaker attribution.',
    wireframe: 'quotes',
    html: `<section class="ps-section" aria-label="Testimonials">
  <div class="ps-wrap">
    <p class="ps-eyebrow">Endorsements</p>
    <h2 class="ps-h2">Trusted by teams that care about craft.</h2>
    <div class="ps-grid-3">
      <blockquote class="ps-quote">
        <p>“We migrated our entire institute site in an afternoon. Pages load instantaneously and our editors never break the grid.”</p>
        <footer>Dr. Hannah Vogel · Director, Alpine Research Group</footer>
      </blockquote>
      <blockquote class="ps-quote">
        <p>“Having live WCAG contrast checks and real HTML output means design and engineering finally speak the exact same language.”</p>
        <footer>Tomasz Kowalski · Principal Designer, Nordwerk</footer>
      </blockquote>
      <blockquote class="ps-quote">
        <p>“Zero third-party scripts, clean semantic markup, and one-click rollbacks—everything a publishing team actually needs.”</p>
        <footer>Maya Patel · Head of Communications, Veridian</footer>
      </blockquote>
    </div>
  </div>
</section>`,
  },
  {
    id: 'faq-accordion',
    name: 'FAQ Accordion',
    category: 'Content',
    summary: 'Accessible zero-JS disclosure accordion built with native <details> and <summary>.',
    wireframe: 'faq',
    html: `<section class="ps-section" aria-label="Frequently asked questions">
  <div class="ps-wrap">
    <p class="ps-eyebrow">Questions</p>
    <h2 class="ps-h2">Frequently asked questions</h2>
    <div class="ps-faq">
      <details open>
        <summary>Do I own the exported HTML and CSS files?</summary>
        <p>Yes. Every site is stored as clean, standard HTML pages and one shared CSS stylesheet with zero proprietary runtime lock-in.</p>
      </details>
      <details>
        <summary>How do contact forms work without JavaScript?</summary>
        <p>Forms submit directly to PureCloud’s built-in <code>_forms/contact</code> endpoint with honeypot spam protection, and submissions appear in your Form Inbox.</p>
      </details>
      <details>
        <summary>Are fonts self-hosted for privacy?</summary>
        <p>Yes. All bundled open-source WOFF2 font families ship inside your site’s <code>assets/fonts/</code> folder—never calling external CDNs.</p>
      </details>
    </div>
  </div>
</section>`,
  },
  {
    id: 'contact-form',
    name: 'PureCloud Contact Form',
    category: 'Conversion',
    summary: 'Zero-JS form posting to _forms/contact with hidden _gotcha spam honeypot.',
    wireframe: 'form',
    html: `<section class="ps-section" id="contact" aria-label="Contact">
  <div class="ps-wrap">
    <p class="ps-eyebrow">Get in touch</p>
    <h2 class="ps-h2">Send us a note.</h2>
    <p class="ps-lead">Tell us what you are building and when you aim to launch. We reply within one business day.</p>
    <form class="ps-form" method="POST" action="_forms/contact">
      <div class="ps-hp" aria-hidden="true">
        <label for="ps-gotcha">Leave this field empty</label>
        <input id="ps-gotcha" type="text" name="_gotcha" tabindex="-1" autocomplete="off" />
      </div>
      <div class="ps-field">
        <label for="ps-name">Your name</label>
        <input id="ps-name" type="text" name="name" required autocomplete="name" placeholder="Ada Lovelace" />
      </div>
      <div class="ps-field">
        <label for="ps-email">Email address</label>
        <input id="ps-email" type="email" name="email" required autocomplete="email" placeholder="ada@example.org" />
      </div>
      <div class="ps-field">
        <label for="ps-message">Message</label>
        <textarea id="ps-message" name="message" rows="5" required placeholder="Share a short summary of your project…"></textarea>
      </div>
      <div class="ps-actions">
        <button class="ps-btn ps-btn-primary" type="submit">Send message</button>
      </div>
    </form>
  </div>
</section>`,
  },
  {
    id: 'cta-banner',
    name: 'CTA Banner',
    category: 'Conversion',
    summary: 'Focused high-contrast closing band with a single decisive call to action.',
    wireframe: 'cta',
    html: `<section class="ps-section ps-cta-band" aria-label="Call to action">
  <div class="ps-wrap ps-split">
    <div>
      <p class="ps-eyebrow">Ready to publish</p>
      <h2 class="ps-h2">Ship a faster, cleaner website today.</h2>
    </div>
    <div class="ps-actions">
      <a class="ps-btn ps-btn-primary" href="#contact">Start your project</a>
      <a class="ps-btn" href="index.html">Back to top</a>
    </div>
  </div>
</section>`,
  },
  {
    id: 'site-footer',
    name: 'Site Footer',
    category: 'Structure',
    summary: 'Multi-column footer navigation with brand summary and colophon bar.',
    wireframe: 'footer',
    html: `<footer class="ps-footer" aria-label="Site footer">
  <div class="ps-footer-grid">
    <div>
      <h3 class="ps-h3">Studio</h3>
      <p class="ps-muted">Independent practice crafting editorial websites and digital systems.</p>
    </div>
    <div>
      <h3 class="ps-h3">Pages</h3>
      <ul class="ps-footer-links">
        <li><a href="index.html">Home</a></li>
        <li><a href="about.html">About</a></li>
        <li><a href="contact.html">Contact</a></li>
      </ul>
    </div>
    <div>
      <h3 class="ps-h3">Standards</h3>
      <ul class="ps-footer-links">
        <li><a href="index.html">Accessibility statement</a></li>
        <li><a href="index.html">Privacy &amp; zero tracking</a></li>
      </ul>
    </div>
  </div>
  <div class="ps-colophon">
    <span>© 2026 Studio. Built with open web standards.</span>
    <span>Published with PureSite</span>
  </div>
</footer>`,
  },
]

export function sectionById(id: string): SectionTemplate | undefined {
  return SECTION_LIBRARY.find(section => section.id === id)
}

/** Ensure the stylesheet includes the section library layout rules once. */
export function withSectionLibraryStyles(css: string): string {
  const start = css.indexOf(SECTION_STYLES_START)
  const end = css.indexOf(SECTION_STYLES_END)
  if (start >= 0 && end > start) {
    return css
  }
  const trimmed = css.replace(/\s+$/, '')
  return trimmed ? `${trimmed}\n\n${SECTION_LIBRARY_CSS}\n` : `${SECTION_LIBRARY_CSS}\n`
}

/** Pure transform: insert a section into a page and attach the section CSS if absent. */
export function insertSectionIntoPage(
  document: SiteDocument,
  page: string,
  sectionId: string,
  anchor?: { beforePath?: string; afterPath?: string },
): SiteDocument {
  const section = sectionById(sectionId)
  const html = document.pages[page]
  if (!section || html === undefined) return document
  const nextHtml = insertElement(html, {
    markup: section.html,
    ...(anchor?.beforePath ? { beforePath: anchor.beforePath } : {}),
    ...(anchor?.afterPath ? { afterPath: anchor.afterPath } : {}),
  })
  const nextStyles = withSectionLibraryStyles(document.styles)
  const updated = writePage(document, page, nextHtml)
  return nextStyles === updated.styles ? updated : { ...updated, styles: nextStyles }
}
