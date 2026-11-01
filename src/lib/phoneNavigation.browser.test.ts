import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { analyseLayout, collectLayout, limitsFor, type LayoutRead } from './responsiveCheck'
import { previewDocument } from './preview'
import { siteHeaderHtml, withSiteFoundation, type SiteHeaderLink } from './siteFoundation'

vi.mock('@purescience/platform-ui/bridge/client', () => ({ bridge: { call: vi.fn() } }))

/**
 * The generated header and foundation, in a real browser: what ships, served
 * the way a host serves it, with JavaScript off unless a case says otherwise.
 */

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }

const LINKS: SiteHeaderLink[] = [
  { label: 'About', href: '/about/' },
  { label: 'Work', href: '/work/' },
  { label: 'Contact', href: '/contact/' },
]
const brand = { label: 'Opa', href: '/' }
const action = { label: 'Join', href: '/join/' }

// The kind of stylesheet a draft writes: its own look, after the foundation.
const AUTHOR = `
body { font: 17px/1.6 system-ui, sans-serif; background: #080e1a; color: #f8faff; }
a { color: inherit; }
.site-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-s) var(--gutter); }
.site-header nav { display: flex; gap: 28px; }
.button { background: #3f6fe5; color: #fff; padding: 12px 20px; }
main { padding: var(--space-section) var(--gutter); }
h1 { font-size: var(--step-5); }
`
const STYLES = withSiteFoundation(AUTHOR)

const pageHtml = (header: string, title: string, stylesheet: string, styles = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="${stylesheet}">${styles && `<style>${styles}</style>`}</head><body>${header}<main><h1>${title}</h1><p><a href="#after">After the header</a></p></main></body></html>`

const siteHeader = (links = LINKS) => siteHeaderHtml({ brand, links, action })
const SITE: Record<string, string> = {
  '/': pageHtml(siteHeader(), 'Home', 'styles/site.css'),
  '/about/': pageHtml(siteHeader(), 'About', '../styles/site.css'),
  '/work/': pageHtml(siteHeader(), 'Work', '../styles/site.css'),
  '/contact/': pageHtml(siteHeader(), 'Contact', '../styles/site.css'),
  '/join/': pageHtml(siteHeader(), 'Join', '../styles/site.css'),
  '/deep/down/': pageHtml(siteHeader(), 'Deep', '../../styles/site.css'),
}

// Use only the browser revision supplied for this playwright-core installation.
// Cache the single startup attempt, including rejection: a denied startup must
// fail the checks without trying another binary or changing sandbox/process mode.
let browserPromise: Promise<Browser> | undefined
const launch = (): Promise<Browser> => (browserPromise ??= chromium.launch({ headless: true, chromiumSandbox: true }))

let server: Server
let origin: string

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://site').pathname
    if (path === '/styles/site.css') return response.writeHead(200, { 'content-type': 'text/css' }).end(STYLES)
    const html = SITE[path]
    if (html) return response.writeHead(200, { 'content-type': 'text/html' }).end(html)
    return response.writeHead(404).end('not here')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await browserPromise?.then(browser => browser.close(), () => {})
  await new Promise(resolve => server ? server.close(resolve) : resolve(null))
})

async function withPage<T>(options: { viewport: { width: number; height: number }; javaScript?: boolean }, use: (page: Page) => Promise<T>): Promise<T> {
  const browser = await launch()
  const context = await browser.newContext({ viewport: options.viewport, javaScriptEnabled: options.javaScript ?? false })
  try {
    return await use(await context.newPage())
  } finally {
    await context.close()
  }
}

/** Is this link really on screen and pressable: inside the viewport, and the top thing at its middle? */
const usable = (page: Page, selector: string) =>
  page.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(a => {
    const r = a.getBoundingClientRect()
    const hit = r.width > 1 && r.height > 1 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
    return { label: a.textContent.trim(), href: a.getAttribute('href'), url: a.href, inView: r.left >= 0 && r.right <= innerWidth && r.width > 1 && r.height > 1, onTop: !!hit && (hit === a || a.contains(hit)), whole: a.scrollWidth <= a.clientWidth + 1 || a.clientWidth === 0 }
  })`) as Promise<{ label: string; href: string; url: string; inView: boolean; onTop: boolean; whole: boolean }[]>

const noSidewaysScroll = (page: Page) => page.evaluate('document.documentElement.scrollWidth <= innerWidth') as Promise<boolean>

describe('the generated header on a phone, JavaScript off', () => {
  for (const [path, depth] of [['/', 'the root'], ['/about/', 'a nested page'], ['/deep/down/', 'a deeper page']] as const) {
    it(`reaches every desktop destination from ${depth}`, async () => {
      const desktop = await withPage({ viewport: DESKTOP }, async page => {
        await page.goto(origin + path)
        expect(await page.locator('.site-menu').isVisible()).toBe(false)
        const links = await usable(page, '.site-nav a')
        expect(links.every(link => link.inView && link.onTop)).toBe(true)
        return links
      })
      expect(desktop.map(link => link.label)).toEqual(LINKS.map(link => link.label))

      await withPage({ viewport: PHONE }, async page => {
        await page.goto(origin + path)
        expect(await page.locator('.site-nav').isVisible()).toBe(false)
        await page.locator('.site-menu > summary').click()
        const phone = await usable(page, '.site-menu nav a')
        expect(phone.map(({ label, url }) => ({ label, url }))).toEqual(desktop.map(({ label, url }) => ({ label, url })))
        expect(phone.every(link => link.inView && link.onTop)).toBe(true)
        expect(await noSidewaysScroll(page)).toBe(true)
      })

      // Each one arrives, pressed from the phone menu.
      for (const link of LINKS) {
        await withPage({ viewport: PHONE }, async page => {
          await page.goto(origin + path)
          await page.locator('.site-menu > summary').click()
          const [response] = await Promise.all([page.waitForNavigation(), page.locator('.site-menu nav a', { hasText: link.label }).click()])
          expect(response?.status()).toBe(200)
          expect(new URL(page.url()).pathname).toBe(link.href)
          expect(await page.locator('h1').textContent()).toBe(link.label)
        })
      }
    })
  }

  it('opens and closes with the pointer', async () => {
    await withPage({ viewport: PHONE }, async page => {
      await page.goto(origin)
      const menu = page.locator('.site-menu')
      const first = page.locator('.site-menu nav a').first()
      expect(await first.isVisible()).toBe(false)
      await menu.locator('summary').click()
      expect(await first.isVisible()).toBe(true)
      await menu.locator('summary').click()
      expect(await first.isVisible()).toBe(false)
    })
  })

  it('names the control, and works from the keyboard with visible focus and no trap', async () => {
    await withPage({ viewport: PHONE }, async page => {
      await page.goto(origin)
      expect(await page.locator('.site-menu').ariaSnapshot()).toMatch(/Menu/)
      const focused = () => page.evaluate('document.activeElement.tagName + ":" + document.activeElement.textContent.trim().split(/\\s+/)[0]') as Promise<string>
      const ring = () => page.evaluate('(s => s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2)(getComputedStyle(document.activeElement))') as Promise<boolean>

      await page.keyboard.press('Tab')
      expect(await focused()).toBe('A:Opa')
      expect(await ring()).toBe(true)
      await page.keyboard.press('Tab')
      expect(await focused()).toBe('SUMMARY:Menu')
      expect(await ring()).toBe(true)

      // Closed, its links are not in the way: Tab goes past them.
      await page.keyboard.press('Tab')
      expect(await focused()).toBe('A:Join')
      await page.keyboard.press('Shift+Tab')
      expect(await focused()).toBe('SUMMARY:Menu')

      for (const key of ['Enter', 'Space']) {
        await page.keyboard.press(key)
        expect(await page.locator('.site-menu').evaluate(element => (element as HTMLDetailsElement).open)).toBe(true)
        await page.keyboard.press(key)
        expect(await page.locator('.site-menu').evaluate(element => (element as HTMLDetailsElement).open)).toBe(false)
      }

      await page.keyboard.press('Enter')
      for (const link of LINKS) {
        await page.keyboard.press('Tab')
        expect(await focused()).toBe(`A:${link.label}`)
        expect(await ring()).toBe(true)
      }
      // Out the far side and on through the page: focus is not held.
      await page.keyboard.press('Tab')
      expect(await focused()).toBe('A:Join')
      await page.keyboard.press('Tab')
      expect(await focused()).toBe('A:After')
      // And back up into the menu, then shut from the summary with focus kept.
      for (let i = 0; i < 2 + LINKS.length; i++) await page.keyboard.press('Shift+Tab')
      expect(await focused()).toBe('SUMMARY:Menu')
      await page.keyboard.press('Enter')
      expect(await focused()).toBe('SUMMARY:Menu')
    })
  })
})

describe('around the navigation breakpoint', () => {
  const widths = [320, 559, 560, 561, 600, 768, 1024, 1280]

  for (const width of widths) {
    it(`always shows exactly one navigation at ${width}px`, async () => {
      await withPage({ viewport: { width, height: 800 } }, async page => {
        await page.goto(origin)
        const nav = await page.locator('.site-nav').isVisible()
        const menu = await page.locator('.site-menu').isVisible()
        expect(nav !== menu).toBe(true)
        expect(menu).toBe(width <= 560)
        expect(await noSidewaysScroll(page)).toBe(true)
      })
    })
  }

  // A min-width and max-width pair would leave a gap here, showing both or neither.
  it('leaves no gap at a fractional width between the two', async () => {
    await withPage({ viewport: { width: 1122, height: 800 } }, async page => {
      await page.setContent(`<!doctype html><iframe style="width:560.5px;height:600px;border:0" srcdoc="${previewDocument({ html: SITE['/'], styles: STYLES, assets: {}, page: 'index.html' }).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`)
      const frame = page.frames()[1]
      await frame.waitForLoadState()
      const shown = await frame.evaluate(() => ['.site-nav', '.site-menu'].filter(selector => getComputedStyle(document.querySelector(selector)!).display !== 'none'))
      expect(shown).toHaveLength(1)
    })
  })
})

describe('long labels', () => {
  const longLinks: SiteHeaderLink[] = [
    { label: 'Research integrity and publication ethics in practice', href: '/about/' },
    { label: 'Interdisciplinarycollaborationworkshopsandfellowshipsprogramme', href: '/work/' },
    { label: 'Contact the editorial and production teams', href: '/contact/' },
    { label: 'Annual reports and financial statements', href: '/join/' },
  ]
  const longStyles = STYLES

  for (const width of [390, 560, 561, 768, 1280]) {
    it(`stay whole and reachable at ${width}px`, async () => {
      await withPage({ viewport: { width, height: 900 } }, async page => {
        await page.setContent(pageHtml(siteHeader(longLinks), 'Home', 'x.css', longStyles))
        if (width <= 560) await page.locator('.site-menu > summary').click()
        const links = await usable(page, width <= 560 ? '.site-menu nav a' : '.site-nav a')
        expect(links).toHaveLength(longLinks.length)
        expect(links.filter(link => !link.inView || !link.onTop || !link.whole)).toEqual([])
        expect(await noSidewaysScroll(page)).toBe(true)
        // And the check agrees, by its own measure.
        const read = await page.evaluate(`(${collectLayout.toString()})(document, window, ${width})`) as LayoutRead
        expect(read.navigation).toMatchObject({ status: 'checked', missing: [] })
      })
    })
  }
})

describe('a plain nav in the conventional header, written before the menu existed', () => {
  it('keeps a site\'s own .site-nav when it has no menu, and its own .site-menu on a desktop', async () => {
    await withPage({ viewport: PHONE }, async page => {
      await page.setContent(pageHtml(`<header class="site-header"><nav class="site-nav">${LINKS.map(link => `<a href="${link.href}">${link.label}</a>`).join('')}</nav></header>`, 'Home', 'x.css', STYLES))
      expect((await usable(page, '.site-nav a')).filter(link => !link.inView || !link.onTop)).toEqual([])
    })
    await withPage({ viewport: DESKTOP }, async page => {
      await page.setContent(pageHtml('<header class="site-header"><div class="site-menu"><a href="/about/">About</a></div></header>', 'Home', 'x.css', STYLES))
      expect(await page.locator('.site-menu a').isVisible()).toBe(true)
    })
  })

  it('shows one navigation when the row and the menu sit in a wrapper of the site\'s own', async () => {
    const wrapped = siteHeader().replace('<nav class="site-nav"', '<div class="right"><nav class="site-nav"').replace('</details>', '</details></div>')
    for (const [viewport, shown] of [[PHONE, '.site-menu'], [DESKTOP, '.site-nav']] as const) {
      await withPage({ viewport }, async page => {
        await page.setContent(pageHtml(wrapped, 'Home', 'x.css', STYLES))
        expect(await page.locator(shown).isVisible()).toBe(true)
        expect(await page.locator(shown === '.site-menu' ? '.site-nav' : '.site-menu').isVisible()).toBe(false)
      })
    }
  })

  it('wraps its links on a phone instead of hiding them', async () => {
    const header = `<header class="site-header"><a class="brand" href="/">Opa</a><nav>${LINKS.map(link => `<a href="${link.href}">${link.label}</a>`).join('')}</nav><a class="button" href="/join/">Join</a></header>`
    await withPage({ viewport: PHONE }, async page => {
      await page.setContent(pageHtml(header, 'Home', 'x.css', STYLES))
      const links = await usable(page, '.site-header nav a')
      expect(links.filter(link => !link.inView || !link.onTop)).toEqual([])
    })
  })
})

// A page as checkResponsive measures it: the preview copy, in a frame of that width.
async function check(body: { html: string; styles?: string; width?: number; javaScript?: boolean }) {
  const width = body.width ?? 390
  const styles = withSiteFoundation(AUTHOR + (body.styles ?? ''))
  const html = pageHtml(body.html, 'A page', 'styles/site.css')
  return withPage({ viewport: { width, height: Math.round(width * 1.9) }, javaScript: body.javaScript }, async page => {
    await page.setContent(previewDocument({ html, styles, assets: {}, page: 'index.html' }))
    const before = await page.content()
    const read = (await page.evaluate(`(${collectLayout.toString()})(document, window, ${width})`)) as LayoutRead
    const after = await page.content()
    const navFindings = analyseLayout(read, limitsFor(width), 'about/index.html').filter(finding => finding.code.startsWith('nav-'))
    return { read, navFindings, unchanged: strip(before) === strip(after) }
  })
}
// The checkbox and hash a check puts back leave no mark in the markup; a closed details has no `open`.
const strip = (html: string) => html.replace(/\s+/g, ' ')

const plainLinks = LINKS.map(link => `<a href="${link.href}">${link.label}</a>`).join('')
const BROKEN = '.site-header nav > a:not(.button):not(.btn) { display: none; }'

describe('checkResponsive on a real render', () => {
  it('reports the original pattern: links hidden on a phone with nothing in their place', async () => {
    const { navFindings, read } = await check({ html: `<header class="site-header"><a class="brand" href="/">Opa</a><nav>${plainLinks}</nav></header>`, styles: `@media (max-width: 560px) { ${BROKEN} }` })
    expect(read.navigation).toMatchObject({ status: 'checked', links: 4 })
    expect(navFindings.map(finding => finding.code)).toEqual(['nav-links-hidden'])
    expect(navFindings[0].message).toContain('on about/index.html at 390px')
    expect(navFindings[0].message).toContain('"About", "Work", "Contact" are hidden')
    expect(navFindings[0].fix).toContain('site-menu')
  })

  it('reports that same pattern from a stylesheet still carrying the old foundation', async () => {
    const old = `@media (max-width: 560px) { :where(.site-header nav > a:not(.button):not(.btn)) { display: none; } }`
    const { navFindings } = await withPage({ viewport: { width: 390, height: 741 } }, async page => {
      await page.setContent(`<!doctype html><style>${old}</style><header class="site-header"><nav>${plainLinks}</nav></header>`)
      const read = (await page.evaluate(`(${collectLayout.toString()})(document, window, 390)`)) as LayoutRead
      return { navFindings: analyseLayout(read, limitsFor(390), 'index.html').filter(finding => finding.code.startsWith('nav-')) }
    })
    expect(navFindings.map(finding => finding.code)).toEqual(['nav-links-hidden'])
  })

  it('reports links run off the screen, which the foundation clips rather than scrolls', async () => {
    const { navFindings } = await check({ html: `<header class="site-header"><nav style="flex-wrap:nowrap;width:900px">${plainLinks}<a href="/far/" style="margin-left:700px">Far away</a></nav></header>` })
    expect(navFindings.map(finding => finding.code)).toEqual(['nav-links-hidden'])
    expect(navFindings[0].message).toContain('"Far away" runs off the screen')
  })

  it('reports a menu with no name, and a menu that opens onto nothing', async () => {
    const unnamed = await check({ html: `<header class="site-header"><details><summary aria-hidden="false"><svg width="24" height="24"></svg></summary><nav>${plainLinks}</nav></details></header>` })
    expect(unnamed.navFindings[0].message).toContain('no name a screen reader')
    const empty = await check({ html: `<header class="site-header"><nav class="gone">${plainLinks}</nav><details><summary>Menu</summary><p>Nothing here</p></details></header>`, styles: '.gone { display: none !important; }' })
    expect(empty.navFindings.map(finding => finding.code)).toEqual(['nav-links-hidden'])
    const stillHidden = await check({ html: `<header class="site-header"><details><summary>Menu</summary><nav class="gone">${plainLinks}</nav></details></header>`, styles: '.gone { display: none !important; }' })
    expect(stillHidden.navFindings.map(finding => finding.code)).toEqual(['nav-links-hidden'])
  })

  it('does not report a site with no navigation, or a skip link parked off screen', async () => {
    expect((await check({ html: '<header><p>Just a page</p></header>' })).navFindings).toEqual([])
    expect((await check({ html: `<a class="skip" href="#main" style="position:absolute;left:-9999px">Skip to content</a><header class="site-header"><a class="skip" href="#main" style="position:absolute;left:-9999px">Skip to content</a><nav>${plainLinks}</nav></header>` })).navFindings).toEqual([])
  })

  // What the check should say it had to open to reach the links; none when they are in plain sight.
  describe('a menu a reader cannot open', () => {
    const CHECKBOX = '.t { position: absolute; opacity: 0; } .drawer { display: none !important; } .t:checked ~ .drawer { display: flex !important; }'
    const closedNav = `<nav id="m" hidden>${plainLinks}</nav>`
    const HIDDEN = '[hidden] { display: none !important; }'
    const UNUSABLE: [string, Parameters<typeof check>[0]][] = [
      ['a disabled checkbox behind its label', { styles: CHECKBOX, html: `<header class="site-header"><input id="t" type="checkbox" class="t" disabled><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></header>` }],
      ['a checkbox in a disabled fieldset', { styles: CHECKBOX, html: `<header class="site-header"><fieldset disabled style="display:contents"><input id="t" type="checkbox" class="t"><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></fieldset></header>` }],
      ['a label tied to no checkbox', { styles: CHECKBOX, html: `<header class="site-header"><input id="t" type="checkbox" class="t"><label for="other">Menu</label><nav class="drawer">${plainLinks}</nav></header>` }],
      ['a disabled popover button', { html: `<header><button popovertarget="m" disabled>Menu</button><nav id="m" popover>${plainLinks}</nav></header>` }],
      ['a popover button in a disabled fieldset', { html: `<header><fieldset disabled><button popovertarget="m">Menu</button></fieldset><nav id="m" popover>${plainLinks}</nav></header>` }],
      ['popovertarget on something that cannot activate it', { html: `<header><span popovertarget="m">Menu</span><nav id="m" popover>${plainLinks}</nav></header>` }],
      ['a disabled scripted button', { javaScript: true, styles: HIDDEN, html: `<header class="site-header"><button disabled aria-controls="m" onclick="document.getElementById('m').hidden = false">Menu</button>${closedNav}</header>` }],
      ['a scripted button marked aria-disabled', { javaScript: true, styles: HIDDEN, html: `<header class="site-header"><button aria-disabled="true" aria-controls="m" onclick="document.getElementById('m').hidden = false">Menu</button>${closedNav}</header>` }],
    ]
    for (const [name, fixture] of UNUSABLE) {
      it(`reports ${name}`, async () => {
        const { navFindings, read } = await check(fixture)
        expect(read.navigation).toMatchObject({ status: 'checked', menus: [] })
        expect(navFindings.map(finding => finding.code)).toEqual(['nav-links-hidden'])
      })
    }

    const POINTER_ONLY: [string, Parameters<typeof check>[0]][] = [
      ['a checkbox hidden with display: none behind its label', { styles: `${CHECKBOX} .t { display: none; }`, html: `<header class="site-header"><input id="t" type="checkbox" class="t"><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></header>` }],
      ['a checkbox hidden with visibility: hidden behind its label', { styles: `${CHECKBOX} .t { visibility: hidden; }`, html: `<header class="site-header"><input id="t" type="checkbox" class="t"><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></header>` }],
      ['a checkbox taken out of the tab order', { styles: CHECKBOX, html: `<header class="site-header"><input id="t" type="checkbox" class="t" tabindex="-1"><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></header>` }],
      ['a details summary taken out of the tab order', { html: `<header class="site-header"><details><summary tabindex="-1">Menu</summary><nav>${plainLinks}</nav></details></header>` }],
      ['a popover button taken out of the tab order', { html: `<header><button popovertarget="m" tabindex="-1">Menu</button><nav id="m" popover>${plainLinks}</nav></header>` }],
      ['a focusable role="button" that only listens for clicks', { javaScript: true, styles: HIDDEN, html: `<header class="site-header"><div role="button" tabindex="0" aria-controls="m" onclick="const m = document.getElementById('m'); m.hidden = !m.hidden">Menu</div>${closedNav}</header>` }],
      ['a scripted span that takes no focus', { javaScript: true, styles: HIDDEN, html: `<header class="site-header"><span role="button" aria-controls="m" onclick="const m = document.getElementById('m'); m.hidden = !m.hidden">Menu</span>${closedNav}</header>` }],
    ]
    for (const [name, fixture] of POINTER_ONLY) {
      it(`reports ${name}`, async () => {
        const { navFindings, read } = await check(fixture)
        expect(read.navigation).toMatchObject({ status: 'checked', menus: [], pointerOnlyMenu: true })
        expect(navFindings.map(finding => finding.code)).toEqual(['nav-links-hidden'])
        expect(navFindings[0].message).toContain('the keyboard cannot reach its control')
      })
    }

    it('accepts a role="button" that does listen for the key', async () => {
      const toggle = "const m = document.getElementById('m'); m.hidden = !m.hidden"
      const { navFindings, read } = await check({ javaScript: true, styles: HIDDEN, html: `<header class="site-header"><div role="button" tabindex="0" aria-controls="m" onclick="${toggle}" onkeydown="if (event.key === 'Enter') { ${toggle} }">Menu</div>${closedNav}</header>` })
      expect(navFindings).toEqual([])
      expect(read.navigation).toMatchObject({ status: 'checked', menus: ['Menu'] })
    })

    it('accepts a checkbox menu the keyboard can really operate, proved with the keyboard', async () => {
      const html = `<header class="site-header"><input id="t" type="checkbox" class="t" aria-label="Menu"><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></header>`
      expect((await check({ styles: CHECKBOX, html })).navFindings).toEqual([])
      await withPage({ viewport: PHONE }, async page => {
        await page.setContent(pageHtml(html, 'A page', 'x.css', withSiteFoundation(AUTHOR + CHECKBOX)))
        await page.keyboard.press('Tab')
        expect(await page.evaluate('document.activeElement.id')).toBe('t')
        const about = page.locator('.drawer a', { hasText: 'About' })
        expect(await about.isVisible()).toBe(false)
        await page.keyboard.press('Space')
        expect(await about.isVisible()).toBe(true)
      })
    })

    it('still accepts a checkbox menu whose box is pressed through its label, and leaves it as it was', async () => {
      const { navFindings, read, unchanged } = await check({ styles: CHECKBOX, html: `<header class="site-header"><label>Menu<input type="checkbox" class="t"><nav class="drawer">${plainLinks}</nav></label></header>` })
      expect(navFindings).toEqual([])
      expect(read.navigation).toMatchObject({ status: 'checked', menus: [expect.stringContaining('Menu')] })
      expect(unchanged).toBe(true)
    })
  })

  it('does not take a menu button parked on a desktop for a lost destination', async () => {
    const styles = '.burger { display: none !important; }'
    const hash = await check({ width: 1280, styles, html: `<header class="site-header"><a class="burger" href="#">Menu</a><nav>${plainLinks}</nav></header>` })
    expect(hash.navFindings).toEqual([])
    const toPanel = await check({ width: 1280, styles, html: `<header class="site-header"><a class="burger" href="#m">Menu</a><nav id="m">${plainLinks}</nav></header>` })
    expect(toPanel.navFindings).toEqual([])
    // A one-page site's own sections are destinations all the same.
    const onePage = await check({ styles: '.row { display: none !important; }', html: '<header class="site-header"><nav class="row"><a href="#about">About</a></nav></header><section id="about">About us</section>' })
    expect(onePage.navFindings.map(finding => finding.code)).toEqual(['nav-links-hidden'])
  })

  it('reads the way the app measures: inside a srcdoc frame, opening each kind of menu there', async () => {
    const menus = [
      [siteHeader(), ''],
      [`<header class="site-header"><a href="#m">Menu</a><nav id="m" class="panel">${plainLinks}</nav></header>`, '.panel { display: none !important; } .panel:target { display: flex !important; }'],
    ]
    for (const [html, styles] of menus) {
      await withPage({ viewport: PHONE, javaScript: true }, async page => {
        const srcdoc = previewDocument({ html: pageHtml(html, 'A page', 'styles/site.css'), styles: withSiteFoundation(AUTHOR + styles), assets: {}, page: 'index.html' })
        await page.setContent('<!doctype html><iframe id="f" style="width:390px;height:741px;border:0"></iframe>')
        await page.locator('#f').evaluate((frame, doc) => { (frame as HTMLIFrameElement).srcdoc = doc }, srcdoc)
        const frame = page.frames()[1]
        await frame.waitForSelector('header', { state: 'attached' })
        const read = (await frame.evaluate(`(${collectLayout.toString()})(document, window, 390)`)) as LayoutRead
        expect(read.navigation).toMatchObject({ status: 'checked', missing: [], menus: ['Menu'] })
      })
    }
  })

  const VALID: [string, Parameters<typeof check>[0], string[]][] = [
    ['visible links', { html: `<header class="site-header"><nav>${plainLinks}</nav></header>` }, []],
    ['the foundation disclosure', { html: siteHeader() }, ['Menu']],
    ['a custom details menu with its own classes', { html: `<div class="top"><header><nav class="row">${plainLinks}</nav><details class="burger"><summary aria-label="Open navigation"><svg width="24" height="24"></svg></summary><ul><li><a href="/about/">About</a></li><li><a href="/work/">Work</a></li><li><a href="/contact/">Contact</a></li></ul></details></header></div>`, styles: '@media (max-width: 700px) { .row { display: none !important; } }' }, ['Open navigation']],
    ['a checkbox menu', { html: `<header class="site-header"><input id="t" type="checkbox" class="t"><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></header>`, styles: '.t { position: absolute; opacity: 0; } .drawer { display: none !important; } .t:checked ~ .drawer { display: flex !important; }' }, ['Menu']],
    ['a checkbox menu that slides in', { html: `<header class="site-header"><input id="t" type="checkbox" class="t"><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></header>`, styles: '.t { position: absolute; opacity: 0; } .drawer { transform: translateX(120vw); transition: transform 300ms; position: fixed; top: 0; left: 0; } .t:checked ~ .drawer { transform: none; }' }, ['Menu']],
    ['a popover menu', { html: `<header><button popovertarget="m">Menu</button><nav id="m" popover>${plainLinks}</nav></header>` }, ['Menu']],
    ['a :target panel', { html: `<header class="site-header"><a href="#m">Menu</a><nav id="m" class="panel">${plainLinks}<a href="#">Close</a></nav></header>`, styles: '.panel { display: none !important; } .panel:target { display: flex !important; }' }, ['Menu']],
    ['the same links in the footer', { html: `<header class="site-header"><nav class="row">${plainLinks}</nav></header><footer>${plainLinks}</footer>`, styles: '.row { display: none !important; }' }, []],
    ['a row that scrolls by itself', { html: `<header class="site-header"><nav class="scroller">${plainLinks}<a href="/far/" style="margin-left:700px">Far</a></nav></header>`, styles: '.scroller { flex-wrap: nowrap; overflow-x: auto; }' }, []],
    ['a scripted menu that runs', { javaScript: true, html: `<header class="site-header"><button aria-expanded="false" aria-controls="m" onclick="document.getElementById('m').hidden = !document.getElementById('m').hidden">Menu</button><nav id="m" hidden>${plainLinks}</nav></header>`, styles: '[hidden] { display: none !important; }' }, ['Menu']],
  ]
  for (const [name, fixture, menus] of VALID) {
    it(`accepts ${name}, leaving the page as it found it`, async () => {
      const { navFindings, read, unchanged } = await check(fixture)
      expect(navFindings).toEqual([])
      expect(read.navigation).toMatchObject({ status: 'checked', menus })
      expect(unchanged).toBe(true)
    })
  }

  it('does not call a scripted menu it could not run a pass', async () => {
    const { navFindings } = await check({ javaScript: false, html: `<header class="site-header"><button aria-expanded="false" aria-controls="m" onclick="document.getElementById('m').hidden = false">Menu</button><nav id="m" hidden>${plainLinks}</nav></header>`, styles: '[hidden] { display: none !important; }' })
    expect(navFindings.map(finding => finding.code)).toEqual(['nav-check-incomplete'])
    expect(navFindings[0].message).toContain('relies on a script')
  })

  it('does not call a frame with no layout a pass', async () => {
    await withPage({ viewport: PHONE, javaScript: true }, async page => {
      await page.setContent(`<!doctype html><iframe style="display:none" srcdoc="<header><nav><a href='/a/'>A</a></nav></header>"></iframe>`)
      const frame = page.frames()[1]
      await frame.waitForLoadState()
      const read = (await frame.evaluate(`(${collectLayout.toString()})(document, window, 390)`)) as LayoutRead
      expect(read.navigation?.status).toBe('incomplete')
      expect(analyseLayout(read, limitsFor(390), 'index.html').map(finding => finding.code)).toContain('nav-check-incomplete')
    })
  })
})

describe('the checkResponsive tool', () => {
  it('runs the real handler: names the page, is not clean, and leaves a custom site byte for byte', async () => {
    const { checkResponsiveHandler } = await import('../agents/brandTools')
    const site = {
      title: 'Custom',
      pages: { 'about/index.html': pageHtml(`<header class="site-header"><nav>${plainLinks}</nav></header>`, 'About', '../styles/site.css') },
      styles: withSiteFoundation(`${AUTHOR}@media (max-width: 560px) { ${BROKEN} }`),
      manifest: { title: 'Custom', pages: ['about/index.html'], target: 'static-host', brief: '', assets: ['logo.png'] },
      collections: [],
    }
    const frozen = JSON.stringify(site)
    const measure = async (document: typeof site, page: string, widths: number[]) =>
      Promise.all(
        widths.map(width =>
          withPage({ viewport: { width, height: Math.round(width * 1.9) } }, async tab => {
            await tab.setContent(previewDocument({ html: document.pages[page as 'about/index.html'], styles: document.styles, assets: {}, page }))
            return { width, read: (await tab.evaluate(`(${collectLayout.toString()})(document, window, ${width})`)) as LayoutRead }
          }),
        ),
      )
    const context = { document: site, selectedPage: 'about/index.html', checkResponsive: (page: string, widths: number[]) => measure(site, page, widths) }
    const run = async (over = {}, args = {}) => JSON.parse((await checkResponsiveHandler({ ...context, ...over } as never, args)).content as string)

    const broken = await run()
    expect(broken.clean).toBe(false)
    const finding = broken.results[0].findings.find((f: { code: string }) => f.code === 'nav-links-hidden')
    expect(finding).toMatchObject({ page: 'about/index.html', message: expect.stringContaining('on about/index.html at 390px') })
    expect(JSON.stringify(site)).toBe(frozen)

    // A menu that cannot open is not clean either.
    const shut = { ...site, pages: { 'about/index.html': pageHtml(`<header class="site-header"><input id="t" type="checkbox" disabled><label for="t">Menu</label><nav class="drawer">${plainLinks}</nav></header>`, 'About', '../styles/site.css') }, styles: withSiteFoundation(`${AUTHOR}.drawer { display: none !important; } #t:checked ~ .drawer { display: flex !important; }`) }
    const disabledMenu = await run({ document: shut, checkResponsive: (page: string, widths: number[]) => measure(shut, page, widths) })
    expect(disabledMenu.clean).toBe(false)
    expect(disabledMenu.results[0].findings.map((f: { code: string }) => f.code)).toContain('nav-links-hidden')

    const keyless = { ...shut, styles: withSiteFoundation(`${AUTHOR}.drawer { display: none !important; } #t { display: none; } #t:checked ~ .drawer { display: flex !important; }`), pages: { 'about/index.html': shut.pages['about/index.html'].replace(' disabled>', '>') } }
    const keylessMenu = await run({ document: keyless, checkResponsive: (page: string, widths: number[]) => measure(keyless, page, widths) })
    expect(keylessMenu.clean).toBe(false)
    expect(keylessMenu.results[0].findings.map((f: { code: string }) => f.code)).toContain('nav-links-hidden')

    // Nothing measured, or one width not measured, is never clean.
    expect((await run({ checkResponsive: async () => [] })).clean).toBe(false)
    expect((await run({ checkResponsive: async (_: string, widths: number[]) => widths.map(width => ({ width, read: null, why: 'hidden' })) })).clean).toBe(false)
  })
})
