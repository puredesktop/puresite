import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PICK_SCRIPT, PageFrame } from './PageFrame'

vi.mock('@purescience/platform-ui/components/assets/EmbeddedVideoPreview', () => ({
  EmbeddedVideoPreview: () => null,
  prepareEmbeddedVideoPreview: (html: string) => html,
  restoreEmbeddedVideoPreview: (html: string) => html,
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the script in the frame', () => {
  let posted: Array<{ type?: string; path?: string; outerHtml?: string; to?: string }>
  const tell = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }))
  const click = (el: Element, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
  const leave = (el: Element) => el.dispatchEvent(new FocusEvent('blur'))
  const editable = () => document.querySelector('[contenteditable]')

  beforeAll(() => {
    // The script installs its listeners once, as it does in a frame; each test sets its own mode and page.
    new Function(PICK_SCRIPT.replace(/<\/?script>/g, ''))()
  })
  beforeEach(() => {
    posted = []
    vi.spyOn(window.parent, 'postMessage').mockImplementation(((message: never) => { posted.push(message) }) as never)
    vi.stubGlobal('parent', window.parent)
  })
  afterEach(() => {
    const open = editable()
    if (open) leave(open)
    tell({ type: 'puresite:edit-in-place', on: false })
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })
  const inPlace = (html: string) => {
    document.body.innerHTML = html
    tell({ type: 'puresite:edit-in-place', on: true })
  }

  it('a click on a bold word opens the whole sentence, as words only', () => {
    inPlace('<p>Hello <strong>world</strong></p>')
    click(document.querySelector('strong')!)
    expect(editable()?.tagName).toBe('P')
    expect(editable()?.getAttribute('contenteditable')).toBe('plaintext-only')
  })

  it('a row of links stays separate, and a click on one edits it rather than leaving', () => {
    inPlace('<nav><a href="a.html" data-site-link="a.html">One</a><a href="b.html" data-site-link="b.html">Two</a></nav>')
    click(document.querySelector('a')!)
    expect(editable()?.textContent).toBe('One')
    expect(posted.some(item => item.type === 'puresite:navigate')).toBe(false)
  })

  it('command-click still follows a link', () => {
    inPlace('<nav><a href="a.html" data-site-link="a.html" data-site-state="built">One</a></nav>')
    click(document.querySelector('a')!, { metaKey: true })
    expect(editable()).toBeNull()
    expect(posted.find(item => item.type === 'puresite:navigate')?.to).toBe('a.html')
  })

  it('a box of boxes and an empty box offer nothing to type in', () => {
    inPlace('<section><h1>Title</h1><p>Body</p><div id="empty"></div></section>')
    click(document.querySelector('section')!)
    click(document.getElementById('empty')!)
    expect(editable()).toBeNull()
  })

  it('leaving the words commits them, without anything the preview marked', () => {
    inPlace('<p>See <a href="a.html" data-site-link="a.html" data-site-state="built">this</a></p>')
    const p = document.querySelector('p')!
    click(p)
    p.firstChild!.nodeValue = 'Read '
    leave(p)
    const edited = posted.find(item => item.type === 'puresite:edited')
    expect(edited?.outerHtml).toBe('<p>Read <a href="a.html">this</a></p>')
    expect(editable()).toBeNull()
  })

  it('words all taken out leave a truly empty element, which the app reads as a deletion', () => {
    inPlace('<p>Going</p>')
    const p = document.querySelector('p')!
    click(p)
    p.innerHTML = '<br>'
    leave(p)
    expect(posted.find(item => item.type === 'puresite:edited')?.outerHtml).toBe('<p></p>')
  })

  it('leaving unchanged words posts nothing', () => {
    inPlace('<p>Same</p>')
    const p = document.querySelector('p')!
    click(p)
    leave(p)
    expect(posted.some(item => item.type === 'puresite:edited')).toBe(false)
  })

  it('Escape puts the words back and keeps the same element', () => {
    inPlace('<p>Keep <a href="a.html" data-site-link="a.html">me</a></p>')
    const p = document.querySelector('p')!
    click(p)
    p.firstChild!.nodeValue = 'Lost '
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(p.isConnected).toBe(true)
    expect(p.innerHTML).toBe('Keep <a href="a.html" data-site-link="a.html">me</a>')
    expect(editable()).toBeNull()
    expect(posted.some(item => item.type === 'puresite:edited')).toBe(false)
  })

  it('asked to commit, it hands over what is being typed and then answers', () => {
    inPlace('<p>Before</p>')
    const p = document.querySelector('p')!
    click(p)
    p.firstChild!.nodeValue = 'After'
    tell({ type: 'puresite:commit' })
    expect(posted.filter(item => item.type?.startsWith('puresite:ed') || item.type === 'puresite:committed').map(item => item.type)).toEqual(['puresite:edited', 'puresite:committed'])
  })

  it('off, a click types in nothing and a link navigates, as today', () => {
    document.body.innerHTML = '<p>Words <a href="a.html" data-site-link="a.html" data-site-state="built">link</a></p>'
    click(document.querySelector('p')!)
    expect(editable()).toBeNull()
    click(document.querySelector('a')!)
    expect(editable()).toBeNull()
    expect(posted.find(item => item.type === 'puresite:navigate')?.to).toBe('a.html')
  })
})

describe('what the frame loads', () => {
  let root: Root, host: HTMLDivElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => { await act(async () => root.unmount()); host.remove() })
  const loaded = () => host.querySelector('iframe')!.getAttribute('srcdoc') ?? ''
  const render = (html: string, props: Partial<React.ComponentProps<typeof PageFrame>> = {}) =>
    act(async () => root.render(<PageFrame html={html} styles="" assets={{}} page="index.html" width={600} height={400} {...props} />))
  const edit = (markup: string) => act(async () => {
    window.dispatchEvent(new MessageEvent('message', {
      source: host.querySelector('iframe')!.contentWindow,
      data: { type: 'puresite:edited', path: '0', outerHtml: markup },
    }))
  })
  const A = '<p>First</p>', B = '<p>Second</p>', C = '<p>Third</p>'

  it('in place, the frame keeps its own edit and takes in anything else', async () => {
    const onEdit = vi.fn(() => true)
    await render(A, { editInPlace: true, onEdit })
    const first = loaded()
    await edit(B)
    expect(onEdit).toHaveBeenCalledWith('0', B, 'index.html')
    await render(B, { editInPlace: true, onEdit })
    expect(loaded()).toBe(first)
    await render(C, { editInPlace: true, onEdit })
    expect(loaded()).toContain('Third')
  })

  it('going back to the text it loaded still reloads, or the frame would keep the undone edit', async () => {
    const onEdit = vi.fn(() => true)
    await render(A, { editInPlace: true, onEdit })
    const first = loaded()
    await edit(B)
    await render(B, { editInPlace: true, onEdit })
    await render(A, { editInPlace: true, onEdit })
    expect(loaded()).not.toBe(first)
    expect(loaded()).toContain('First')
  })

  it('an edit the frame does not show, such as a deletion, reloads', async () => {
    const onEdit = vi.fn(() => false)
    await render(A, { editInPlace: true, onEdit })
    await edit('<p></p>')
    await render(B, { editInPlace: true, onEdit })
    expect(loaded()).toContain('Second')
  })

  it('moving to another page always loads it, even straight after an edit', async () => {
    const onEdit = vi.fn(() => true)
    await render(A, { editInPlace: true, onEdit })
    await edit(B)
    await render(C, { editInPlace: true, onEdit, page: 'about.html' })
    expect(loaded()).toContain('Third')
  })

  it('words committed while moving to another page go to the page they were typed on', async () => {
    const onEdit = vi.fn((_path: string, _html: string, _from: string | undefined) => true)
    await render(A, { editInPlace: true, onEdit })
    await render(C, { editInPlace: true, onEdit, page: 'about.html' })
    await edit('<p>Typed on the first page</p>')
    expect(onEdit.mock.lastCall?.[2]).toBe('index.html')
    // Its echo through the document is not mistaken for this page's own edit: going on to another still loads it.
    await render(B, { editInPlace: true, onEdit, page: 'about.html' })
    expect(loaded()).toContain('Second')
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: host.querySelector('iframe')!.contentWindow, data: { type: 'puresite:ready' } }))
    })
    await edit('<p>Typed on the second page</p>')
    expect(onEdit.mock.lastCall?.[2]).toBe('about.html')
  })

  it('a move waits for the commit, and goes ahead by itself if the frame cannot answer', async () => {
    const commitRef = { current: null as null | ((then: () => void) => void) }
    await render(A, { editInPlace: true, commitRef })
    const then = vi.fn()
    commitRef.current!(then)
    expect(then).not.toHaveBeenCalled()
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: host.querySelector('iframe')!.contentWindow, data: { type: 'puresite:committed' } }))
    })
    expect(then).toHaveBeenCalledOnce()
    const silent = vi.fn()
    commitRef.current!(silent)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)) })
    expect(silent).toHaveBeenCalledOnce()
  })

  describe('a frame left without layout', () => {
    const size = (laidOut: boolean) => act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: host.querySelector('iframe')!.contentWindow, data: { type: 'puresite:size', height: 584, laidOut } }))
    })
    const iframe = () => host.querySelector('iframe')!
    afterEach(() => { vi.useRealTimers() })

    it('is hidden and shown again, without a reload, when it reports no boxes', async () => {
      vi.useFakeTimers()
      await render(A, { editInPlace: true })
      const before = iframe()
      await size(false)
      expect(before.style.display).toBe('none')
      await act(async () => { vi.advanceTimersByTime(60) })
      expect(before.style.display).toBe('')
      expect(iframe()).toBe(before)
    })

    it('is nudged, then replaced, when it never reports at all', async () => {
      vi.useFakeTimers()
      await render(A, { editInPlace: true })
      const before = iframe()
      await act(async () => { vi.advanceTimersByTime(1200) })
      expect(before.style.display).toBe('none')
      await act(async () => { vi.advanceTimersByTime(60) })
      expect(iframe()).toBe(before)
      await act(async () => { vi.advanceTimersByTime(1200) })
      expect(iframe()).not.toBe(before)
      expect(loaded()).toContain('First')
      const replaced = iframe()
      await act(async () => { vi.advanceTimersByTime(5000) })
      expect(iframe()).toBe(replaced)
    })

    it('is left alone once it reports boxes', async () => {
      vi.useFakeTimers()
      await render(A, { editInPlace: true })
      const before = iframe()
      await size(true)
      await act(async () => { vi.advanceTimersByTime(5000) })
      expect(iframe()).toBe(before)
      expect(before.style.display).toBe('')
    })

    it('off, none of this happens, as today', async () => {
      vi.useFakeTimers()
      await render(A)
      const before = iframe()
      await size(false)
      await act(async () => { vi.advanceTimersByTime(5000) })
      expect(before.style.display).toBe('')
      expect(iframe()).toBe(before)
    })
  })

  it('off, every change loads, as today', async () => {
    const onEdit = vi.fn(() => true)
    await render(A, { onEdit })
    await edit(B)
    await render(B, { onEdit })
    expect(loaded()).toContain('Second')
  })
})
