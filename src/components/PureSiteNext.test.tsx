// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { orderedPages, type SiteDocument } from '../lib/siteDocument'
import { createSiteFromTemplate } from '../lib/siteTemplates'
import { NewSiteWizard } from './NewSiteWizard'
import { SiteBoardView } from './SiteBoardView'

const cloudCallMock = vi.hoisted(() => vi.fn())
vi.mock('./PageFrame', () => ({
  PageFrame: () => <div data-testid="page-frame" />,
}))
vi.mock('../bridge/platformBridge', () => ({
  fetchLivePage: vi.fn(async () => null),
  bridge: { call: cloudCallMock },
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  cloudCallMock.mockReset()
  cloudCallMock.mockRejectedValue(new Error('PureServer not connected'))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    btn => btn.textContent?.trim() === text || btn.textContent?.trim().startsWith(text),
  )
}

function renderBoard(
  site: SiteDocument,
  overrides: Partial<React.ComponentProps<typeof SiteBoardView>> = {},
) {
  const noop = () => {}
  const props: React.ComponentProps<typeof SiteBoardView> = {
    document: site,
    pages: orderedPages(site),
    material: [],
    previews: {},
    collections: [],
    dataProvider: undefined,
    onAddFormForCollection: noop,
    onDeleteCollection: noop,
    selectedPage: 'index.html',
    pageSelection: [],
    onPageSelection: noop,
    selection: null,
    findings: [],
    verification: { state: 'verified', reasons: [], pages: {} },
    onRecheck: noop,
    revisions: [],
    onRestoreRevision: noop,
    statusAction: null,
    status: '',
    asking: false,
    viewport: 'desktop',
    onViewport: noop,
    onPreviewViewport: noop,
    onSelectPage: noop,
    onSelectElement: noop,
    onEditElement: noop,
    onAddPage: noop,
    onBuildPromise: noop,
    onRepointPromise: noop,
    onUnlinkPromise: noop,
    onBuildAllPromises: noop,
    onLinkSelection: noop,
    onSetGoal: noop,
    onDeletePage: noop,
    onMovePage: noop,
    onSetPageTitle: noop,
    onSetElementText: noop,
    onSetElementSrc: noop,
    onAddFiles: noop,
    onSetRole: noop,
    onDescribe: noop,
    onRenameFile: noop,
    onUseFileInstead: noop,
    onDescribeAll: noop,
    describing: false,
    onAsk: noop,
    onOpenHtml: noop,
    onOpenInBrowser: noop,
    onPublish: noop,
    onExport: noop,
    exporting: false,
    brandChip: null,
    onOpenBrand: noop,
    ...overrides,
  }
  return act(async () => {
    root.render(<SiteBoardView {...props} />)
  })
}

describe('PureSite Next UI Integration', () => {
  it('opens the persistent Pages rail to browse, switch, add, duplicate, and reorder pages', async () => {
    const site = createSiteFromTemplate('studio-agency')
    const onSelectPage = vi.fn()
    const onAddPage = vi.fn()
    const onDuplicatePage = vi.fn()
    const onMovePage = vi.fn()

    await renderBoard(site, { onSelectPage, onAddPage, onDuplicatePage, onMovePage })

    await act(async () => {
      findButton('Pages')!.click()
    })

    const rail = host.querySelector('[aria-label="Site pages"]')
    expect(rail).not.toBeNull()
    expect(rail?.textContent).toContain('4 pages')
    expect(rail?.textContent).toContain('/work.html')

    await act(async () => {
      const workBtn = Array.from(rail!.querySelectorAll('button')).find(b =>
        b.textContent?.includes('/work.html'),
      )!
      workBtn.click()
    })
    expect(onSelectPage).toHaveBeenCalledWith('work.html')

    await act(async () => {
      findButton('+ New page')!.click()
    })
    expect(onAddPage).toHaveBeenCalledTimes(1)

    await act(async () => {
      const dupBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Duplicate index.html"]')!
      dupBtn.click()
    })
    expect(onDuplicatePage).toHaveBeenCalledWith('index.html')

    await act(async () => {
      const downBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Move index.html down"]')!
      downBtn.click()
    })
    expect(onMovePage).toHaveBeenCalledWith(0, 1)
  })

  it('inserts sections from SectionPickerModal and applies presets in DesignStudioDrawer', async () => {
    const site = createSiteFromTemplate('studio-agency')
    const onInsertSection = vi.fn()
    const onApplyDesignTokens = vi.fn()

    await renderBoard(site, { onInsertSection, onApplyDesignTokens })

    // Insert Section modal
    await act(async () => {
      findButton('Insert section')!.click()
    })
    expect(host.querySelector('[aria-label="Insert section"]')).not.toBeNull()
    expect(host.textContent).toContain('PureCloud Contact Form')
    expect(host.textContent).toContain('FAQ Accordion')

    await act(async () => {
      const firstInsert = Array.from(
        host.querySelectorAll<HTMLButtonElement>('[aria-label="Insert section"] button'),
      ).find(b => b.textContent?.trim() === 'Insert section')!
      firstInsert.click()
    })
    expect(onInsertSection).toHaveBeenCalledWith('index.html', 'hero')

    // Design Studio drawer
    await act(async () => {
      findButton('Design')!.click()
    })
    const drawer = host.querySelector('[aria-label="Design studio"]')
    expect(drawer).not.toBeNull()
    expect(drawer?.textContent).toContain('AAA')
    expect(drawer?.textContent).toContain('Obsidian Ink')

    await act(async () => {
      const obsidian = Array.from(drawer!.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Obsidian Ink'),
      )!
      obsidian.click()
    })
    expect(onApplyDesignTokens).toHaveBeenCalledWith(
      expect.objectContaining({ ground: '#111315', displayFont: 'Space Grotesk' }),
    )
  })

  it('renders rich ElementQuickControls with breadcrumb, move, duplicate, delete, link, and layout pills', async () => {
    const site = createSiteFromTemplate('studio-agency')
    const onMoveElement = vi.fn()
    const onDuplicateElement = vi.fn()
    const onDeleteElement = vi.fn()
    const onSetElementLayout = vi.fn()

    await renderBoard(site, {
      selection: { page: 'index.html', path: '1/0/0/1', label: 'h1' },
      onMoveElement,
      onDuplicateElement,
      onDeleteElement,
      onSetElementLayout,
    })

    const inspector = host.querySelector('[data-element-inspector]')
    expect(inspector).not.toBeNull()
    expect(inspector?.textContent).toContain('<h1>')

    await act(async () => {
      findButton('Duplicate')!.click()
    })
    expect(onDuplicateElement).toHaveBeenCalledWith('index.html', '1/0/0/1')

    await act(async () => {
      const centerPill = Array.from(inspector!.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Center',
      )!
      centerPill.click()
    })
    expect(onSetElementLayout).toHaveBeenCalledWith('index.html', '1/0/0/1', { align: 'center' })
  })

  it('opens Pre-Flight Audit drawer with Google/OG preview and executes 1-click fixes', async () => {
    const site = createSiteFromTemplate('studio-agency')
    const onAdd404Page = vi.fn()

    await renderBoard(site, { onAdd404Page })

    await act(async () => {
      findButton('Audit ·')!.click()
    })

    const audit = host.querySelector('[aria-label="Pre-flight audit"]')
    expect(audit).not.toBeNull()
    expect(audit?.textContent).toContain('LIVE GOOGLE SEARCH PREVIEW')
    expect(audit?.textContent).toContain('LIVE OPENGRAPH SOCIAL CARD')
    expect(audit?.textContent).toContain('Atelier Nord — Design & Digital Systems')

    await act(async () => {
      const fixBtn = Array.from(audit!.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Create 404.html',
      )!
      fixBtn.click()
    })
    expect(onAdd404Page).toHaveBeenCalledTimes(1)
  })

  it('opens PureCloud Share drawer gracefully offline and supports live publish, rollback & Form Inbox when connected', async () => {
    const site = createSiteFromTemplate('studio-agency')
    await renderBoard(site)

    // 1. Offline mode
    await act(async () => {
      findButton('Cloud link')!.click()
    })
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve()
    })
    const drawer = host.querySelector('[aria-label="PureCloud share"]')
    expect(drawer).not.toBeNull()
    expect(drawer?.textContent).toContain('PureServer is not connected right now.')

    // Close and reopen with connected mock
    await act(async () => {
      Array.from(drawer!.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Close')!.click()
    })

    cloudCallMock.mockImplementation(async (_method: string, args: Array<{ action: string }>) => {
      const action = args[0]?.action
      if (action === 'status') return { connected: true, publicUrl: 'https://cloud.example' }
      if (action === 'list') {
        return {
          publicUrl: 'https://cloud.example',
          items: [
            {
              id: 's1',
              slug: 'atelier-nord',
              title: 'Atelier Nord',
              url: 'https://cloud.example/s/atelier-nord/',
              active: true,
              activeVersion: 2,
            },
          ],
        }
      }
      if (action === 'get') {
        return {
          item: {
            id: 's1',
            slug: 'atelier-nord',
            title: 'Atelier Nord',
            url: 'https://cloud.example/s/atelier-nord/',
            active: true,
            activeVersion: 2,
          },
          versions: [
            { version: 2, note: 'Latest', createdAt: '2026-11-22T12:00:00Z' },
            { version: 1, note: 'Initial', createdAt: '2026-11-21T12:00:00Z' },
          ],
          formSubmissions: [
            {
              id: 'sub1',
              formName: 'contact',
              fields: { name: 'Ada Lovelace', email: 'ada@example.org', message: 'Hello!' },
              createdAt: '2026-11-22T13:00:00Z',
            },
          ],
        }
      }
      if (action === 'rollbackVersion') {
        return {
          item: {
            id: 's1',
            slug: 'atelier-nord',
            title: 'Atelier Nord',
            url: 'https://cloud.example/s/atelier-nord/',
            active: true,
            activeVersion: 1,
          },
        }
      }
      return {}
    })

    await act(async () => {
      findButton('Cloud link')!.click()
    })
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })

    const liveDrawer = host.querySelector('[aria-label="PureCloud share"]')!
    expect(liveDrawer.textContent).toContain('https://cloud.example/s/atelier-nord/')

    // Switch to Versions tab and click Rollback
    await act(async () => {
      Array.from(liveDrawer.querySelectorAll('button')).find(b =>
        b.textContent?.startsWith('Versions'),
      )!.click()
    })
    await act(async () => {
      Array.from(liveDrawer.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Rollback',
      )!.click()
    })
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })
    expect(cloudCallMock).toHaveBeenCalledWith('cloud.call', [
      { service: 'publish', action: 'rollbackVersion', input: { id: 's1', version: 1 } },
    ])

    // Switch to Form Inbox tab
    await act(async () => {
      Array.from(liveDrawer.querySelectorAll('button')).find(b =>
        b.textContent?.startsWith('Form Inbox'),
      )!.click()
    })
    expect(liveDrawer.textContent).toContain('Ada Lovelace')
    expect(liveDrawer.textContent).toContain('Hello!')
  })

  it('opens upgraded CommandPalette with ⌘K fallback and runs viewport & drawer actions', async () => {
    const site = createSiteFromTemplate('studio-agency')
    const onViewport = vi.fn()
    await renderBoard(site, {
      onViewport,
      onInsertSection: vi.fn(),
      onApplyDesignTokens: vi.fn(),
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    })
    const palette = host.querySelector('[aria-label="Find anything"]')
    expect(palette).not.toBeNull()
    expect(palette?.textContent).toContain('Insert section')
    expect(palette?.textContent).toContain('Design Studio')
    expect(palette?.textContent).toContain('Pre-Flight Audit')

    await act(async () => {
      const phoneCmd = Array.from(palette!.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Phone (390px)'),
      )!
      phoneCmd.click()
    })
    expect(onViewport).toHaveBeenCalledWith('phone')
  })

  it('offers all 5 starter templates inside NewSiteWizard with zero AI required', async () => {
    const onUseTemplate = vi.fn()
    await act(async () => {
      root.render(
        <NewSiteWizard
          open
          brief=""
          onBrief={() => {}}
          target="static-host"
          onTarget={() => {}}
          look="auto"
          onLook={() => {}}
          houseStyle={null}
          material={[]}
          previews={{}}
          onAddFiles={() => {}}
          onSetRole={() => {}}
          onRenameFile={() => {}}
          busy={false}
          busyLabel=""
          onUseTemplate={onUseTemplate}
          onCreate={() => {}}
          onSkip={() => {}}
          onCancel={() => {}}
        />,
      )
    })

    expect(host.textContent).toContain('Studio / Agency')
    expect(host.textContent).toContain('Research Lab')
    expect(host.textContent).toContain('SaaS Product')
    expect(host.textContent).toContain('Personal Portfolio')
    expect(host.textContent).toContain('Event / Symposium')

    await act(async () => {
      const btn = Array.from(host.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Research Lab'),
      )!
      btn.click()
    })
    expect(onUseTemplate).toHaveBeenCalledWith('research-lab')
  })
})
