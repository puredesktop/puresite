import { EmbeddedVideoPreview, prepareEmbeddedVideoPreview, restoreEmbeddedVideoPreview } from '@purescience/platform-ui/components/assets/EmbeddedVideoPreview'
/**
 * One page, rendered as it will ship.
 *
 * Every view of a page — the rail card, the stage, the publish preview — is
 * this component at a different size, so a card cannot show something the
 * published page will not.
 *
 * The one deliberate divergence from PureSlides4: a page is NEVER scaled to
 * fit. A website reflows, and its content is supposed to change shape, so the
 * stage renders at a real viewport width and lets the page be as tall as it
 * is. Scaling a page down to fit a box would show you a layout nobody will
 * ever see.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { previewDocument } from '../lib/preview'

export const PICK_SCRIPT = `<script>(function () {
  var picking = false;
  // Compact, in the room: a click on words starts typing in them, with no picking first. Off, none of this runs.
  var inPlace = false;
  var INLINE = /^(A|ABBR|B|BDI|BDO|BR|CITE|CODE|DFN|EM|I|KBD|MARK|Q|S|SAMP|SMALL|SPAN|STRONG|SUB|SUP|TIME|U|VAR|WBR)$/;
  var NOT_WORDS = /^(IMG|PICTURE|VIDEO|AUDIO|IFRAME|OBJECT|EMBED|CANVAS|SVG|MATH|INPUT|TEXTAREA|SELECT|OPTION|SCRIPT|STYLE|HTML|BODY)$/i;
  function holdsOnlyWords(el) {
    if (NOT_WORDS.test(el.tagName)) return false;
    for (var i = 0; i < el.children.length; i++) {
      if (!INLINE.test(el.children[i].tagName) || !holdsOnlyWords(el.children[i])) return false;
    }
    return true;
  }
  function hasOwnWords(el) {
    for (var node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3 && node.nodeValue.trim()) return true;
    }
    return false;
  }
  // What a click on this means: the running text it sits in, so a bold word edits its sentence, while a row of
  // separate links stays separate. Nothing for a box of other boxes, or an empty one.
  function wordsAt(el) {
    if (!el.tagName || !holdsOnlyWords(el) || !(el.textContent || '').trim()) return null;
    var parent = el.parentElement;
    while (parent && parent !== document.body && hasOwnWords(parent) && holdsOnlyWords(parent)) {
      el = parent;
      parent = el.parentElement;
    }
    return el;
  }
  function caretAt(x, y) {
    var range = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    var selection = window.getSelection && window.getSelection();
    if (range && selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  function clickInPlace(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var link = target.closest('a[href]');
    if (editing && (target === editing || editing.contains(target))) {
      if (link) event.preventDefault();
      return;
    }
    if (link && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (editing) commitEdit();
      var to = link.getAttribute('data-site-link');
      if (to) {
        parent.postMessage({
          type: 'puresite:navigate',
          to: to,
          state: link.getAttribute('data-site-state') || 'built',
          text: (link.textContent || '').trim()
        }, '*');
      }
      return;
    }
    if (editing) commitEdit();
    var words = wordsAt(target);
    if (!words) {
      // The page's own buttons and menus keep working; only leaving the preview is stopped.
      if (link) event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    words.classList.remove('__ps-can-edit');
    startEdit(words);
    caretAt(event.clientX, event.clientY);
  }
  function clearHover() {
    var hovered = document.querySelectorAll('.__ps-can-edit');
    for (var i = 0; i < hovered.length; i++) hovered[i].classList.remove('__ps-can-edit');
  }
  document.addEventListener('mouseover', function (event) {
    if (!inPlace) return;
    clearHover();
    var words = event.target && !editing ? wordsAt(event.target) : null;
    if (words) words.classList.add('__ps-can-edit');
  });
  document.documentElement.addEventListener('mouseleave', clearHover);
  function pathOf(el) {
    var parts = [];
    while (el && el.parentElement && el !== document.body) {
      parts.unshift(Array.prototype.indexOf.call(el.parentElement.children, el));
      el = el.parentElement;
    }
    return parts.join('/');
  }
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'puresite:commit') {
      if (editing) commitEdit();
      parent.postMessage({ type: 'puresite:committed' }, '*');
    }
    if (data.type === 'puresite:edit-in-place') {
      inPlace = !!data.on;
      // The link marks are for working on the site; compact shows the page as it will look.
      marks.media = inPlace ? 'not all' : '';
    }
    if (data.type === 'puresite:picking') {
      picking = !!data.on;
      document.body.style.cursor = picking ? 'crosshair' : '';
      if (!picking) {
        var marked = document.querySelectorAll('.__ps-picked');
        for (var i = 0; i < marked.length; i++) {
          marked[i].classList.remove('__ps-picked');
        }
      }
    }
    if (data.type === 'puresite:highlight') {
      var old = document.querySelectorAll('.__ps-picked');
      for (var i = 0; i < old.length; i++) old[i].classList.remove('__ps-picked');
      (data.paths || []).forEach(function (path) {
        var el = document.body;
        var parts = String(path).split('/').filter(Boolean);
        for (var j = 0; j < parts.length && el; j++) el = el.children[Number(parts[j])];
        if (el && el.classList) el.classList.add('__ps-picked');
      });
    }
  });
  var marks = document.createElement('style');
  marks.textContent = '\
    a[data-site-state="built"] { text-decoration-color: rgba(47,125,85,.85); text-underline-offset: 3px; }\
    a[data-site-state="promised"] { text-decoration: underline dashed rgba(167,106,18,.95); text-underline-offset: 3px; cursor: help; }\
    a[data-site-state]:hover { outline: 2px solid rgba(47,125,85,.4); outline-offset: 2px; border-radius: 3px; }\
    a[data-site-state="promised"]:hover { outline-color: rgba(167,106,18,.55); }';
  document.head.appendChild(marks);
  document.addEventListener('click', function (event) {
    if (inPlace) {
      clickInPlace(event);
      return;
    }
    // The frame takes the mouse so the page can be SCROLLED, which means a
    // link would otherwise navigate it away from the site being previewed.
    var link = event.target && event.target.closest
      ? event.target.closest('a[href]')
      : null;
    if (link) {
      event.preventDefault();
      // A link inside the site is how you get around: hand it back and let
      // the app move, rather than navigating this frame off the preview.
      var to = link.getAttribute('data-site-link');
      if (to && !picking) {
        parent.postMessage({
          type: 'puresite:navigate',
          to: to,
          state: link.getAttribute('data-site-state') || 'built',
          text: (link.textContent || '').trim()
        }, '*');
        return;
      }
    }
    if (!picking) return;
    var el = event.target;
    if (!el || el === document.body) return;
    if (editing && (el === editing || editing.contains(el))) return;
    if (editing) commitEdit();
    event.preventDefault();
    event.stopPropagation();
    // A second click on the picked element starts typing in the page
    // itself — editing directly, no form in the middle. Text leaves only:
    // typing into a container would eat its elements.
    if (el.classList && el.classList.contains('__ps-picked') &&
        el.children.length === 0 && el.tagName !== 'IMG') {
      startEdit(el);
      return;
    }
    // Where it sits, so the app can put the ask beside what you picked
    // rather than in a panel across the room.
    var box = el.getBoundingClientRect();
    parent.postMessage({
      type: 'puresite:picked',
      path: pathOf(el),
      label: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 120),
      rect: { x: box.left, y: box.top, width: box.width, height: box.height }
    }, '*');
  }, true);
  var editing = null;
  var editingOriginal = '';
  var editingWords = '';
  function serializeEdited(el) {
    var clone = el.cloneNode(true);
    if (inPlace) {
      // A sentence can hold links, and what the preview marks on a link must not reach the page that ships.
      clone.classList.remove('__ps-can-edit');
      // The browser leaves a <br> in an emptied element; empty it properly, since emptied means deleted.
      if (!(clone.textContent || '').trim()) clone.innerHTML = '';
      var marked = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('[data-site-link]')));
      marked.forEach(function (item) {
        item.removeAttribute('data-site-link');
        item.removeAttribute('data-site-state');
      });
    }
    clone.classList.remove('__ps-picked');
    if (!clone.classList.length) clone.removeAttribute('class');
    clone.removeAttribute('contenteditable');
    return clone.outerHTML;
  }
  function startEdit(el) {
    editing = el;
    editingOriginal = serializeEdited(el);
    editingWords = el.innerHTML;
    // In place it stays words: a paste from Word brings its text, not its formatting.
    el.setAttribute('contenteditable', inPlace ? 'plaintext-only' : 'true');
    el.focus();
  }
  function commitEdit() {
    if (!editing) return;
    var el = editing;
    editing = null;
    el.removeAttribute('contenteditable');
    var markup = serializeEdited(el);
    if (markup !== editingOriginal) {
      parent.postMessage({ type: 'puresite:edited', path: pathOf(el), outerHtml: markup }, '*');
    }
  }
  document.addEventListener('blur', function (event) {
    if (editing && event.target === editing) commitEdit();
  }, true);
  document.addEventListener('keydown', function (event) {
    if (inPlace && editing && event.key === 'Enter') {
      event.preventDefault();
      editing.blur();
      return;
    }
    if (inPlace && editing && event.key === 'Escape') {
      editing.removeAttribute('contenteditable');
      editing.innerHTML = editingWords;
      editing = null;
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape' && editing) {
      var el = editing;
      editing = null;
      el.removeAttribute('contenteditable');
      var holder = document.createElement('div');
      holder.innerHTML = editingOriginal;
      if (holder.firstElementChild) el.replaceWith(holder.firstElementChild);
      event.stopPropagation();
    }
  }, true);
  function reportSize() {
    var body = document.body;
    var html = document.documentElement;
    if (!body || !html) return;
    parent.postMessage({
      type: 'puresite:size',
      // Without layout the root still reports the viewport's height; only having no boxes tells.
      laidOut: body.getClientRects().length > 0,
      height: Math.max(
        body.scrollHeight, html.scrollHeight,
        body.offsetHeight, html.offsetHeight
      )
    }, '*');
  }
  window.addEventListener('load', reportSize);
  window.addEventListener('resize', reportSize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(reportSize).catch(function () {});
  }
  setTimeout(reportSize, 0);
  setTimeout(reportSize, 400);
  var style = document.createElement('style');
  style.textContent = '.__ps-picked { outline: 2px solid #1f6feb !important; outline-offset: 1px !important; }\
    .__ps-can-edit { cursor: text; outline: 1px dashed rgba(31,111,235,.45); outline-offset: 2px; }\
    [contenteditable="plaintext-only"] { cursor: text; outline: 2px solid rgba(31,111,235,.7); outline-offset: 2px; }';
  document.head.appendChild(style);
  parent.postMessage({ type: 'puresite:ready' }, '*');
})();</script>`

const COMMIT_WAIT_MS = 250
/** How long a page in the room gets to report a laid-out size before the frame is nudged, then replaced. */
const LAYOUT_WAIT_MS = 1200

export function PageFrame({
  html,
  styles,
  assets,
  page,
  width,
  height,
  scale,
  picking = false,
  highlight = [],
  onPick,
  onEdit,
  onNavigate,
  knownPages,
  interactive = false,
  editInPlace = false,
  commitRef,
}: {
  html: string
  styles: string
  assets: Record<string, string>
  /**
   * The page's path under `pages/`. The preview resolves the stylesheet link
   * from here the way the host will, so a nested page with the wrong number
   * of `../` previews unstyled — as it ships.
   */
  page?: string
  width: number
  /** When absent, the frame is as tall as the box it is given. */
  height?: number
  /** Rail cards shrink the WHOLE frame; the stage never does. */
  scale?: number
  picking?: boolean
  highlight?: string[]
  onPick?: (
    path: string,
    label: string,
    at: { text: string; rect?: { x: number; y: number; width: number; height: number } },
  ) => void
  /**
   * Typing in the page itself: the edited element arrives serialized. Answers true when the frame already shows the
   * result, so that in place the page need not reload under the person typing. `from` is the page the frame held when
   * the words were typed, which is not always the page on screen by the time they arrive.
   */
  onEdit?: (path: string, outerHtml: string, from: string | undefined) => boolean | void
  /** A link was followed inside the preview: where it goes, and whether it exists. */
  onNavigate?: (to: string, state: 'built' | 'promised', text: string) => void
  /** Pages that exist, so the frame can tell a link from a promise. */
  knownPages?: string[]
  /**
   * The frame takes the mouse, so the page can be scrolled and links are
   * safely swallowed. The stage wants this; a rail card must not have it, or
   * every thumbnail would eat scrolls meant for the strip behind it.
   */
  interactive?: boolean
  /** Compact: a click on words types in them, links stay put, and the person's own edit does not reload the page. */
  editInPlace?: boolean
  /** Filled in with: commit whatever is being typed, then do this. Moving away must not outrun the words. */
  commitRef?: React.MutableRefObject<((then: () => void) => void) | null>
}): React.ReactElement {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(0)

  const doc = useMemo(() => {
    const prepared = previewDocument({
      html,
      styles,
      assets,
      ...(page ? { page } : {}),
      ...(knownPages ? { knownPages } : {}),
    })
    const closing = prepared.lastIndexOf('</body>')
    return prepareEmbeddedVideoPreview(closing === -1
      ? `${prepared}\n${PICK_SCRIPT}`
      : `${prepared.slice(0, closing)}${PICK_SCRIPT}\n${prepared.slice(closing)}`)
  }, [html, styles, assets, page, knownPages])

  // A reload jumps to the top and drops the next click. So in place, the edit the frame itself made is not loaded back
  // into it; anything else that changes the page is. Coming back to the very text it loaded, after such an edit, must
  // still load: the frame holds the edit, and the same srcDoc would not replace it.
  const seenDoc = useRef(doc)
  const loadedDoc = useRef(doc)
  const ownEdit = useRef<string | null>(null)
  // Leaving the frame commits what is being typed, and that can arrive after the move to another page has begun. The
  // old page is in the frame until the new one says it is ready, so until then an edit belongs to the old page.
  const framePage = useRef(page)
  const afterCommit = useRef<(() => void) | null>(null)
  // A sandboxed frame runs in its own process. If its srcdoc changes just after the first page lands there, Chromium can
  // leave it believing it is display:none: the document is present but never laid out, so the page stays blank. Hiding
  // and showing the element corrects that without a reload; replacing the frame is the last resort.
  const laidOut = useRef(false)
  const [frameKey, setFrameKey] = useState(0)
  const nudgeFrame = useCallback(() => {
    const element = frameRef.current
    if (!element) return
    element.style.display = 'none'
    window.setTimeout(() => { element.style.display = '' }, 50)
  }, [])
  if (doc !== seenDoc.current) {
    seenDoc.current = doc
    if (!(editInPlace && ownEdit.current === (page ?? ''))) {
      loadedDoc.current = doc === loadedDoc.current ? `${doc}\n<!-- reloaded -->` : doc
    }
    ownEdit.current = null
  }

  const post = useCallback((message: unknown) => {
    frameRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as {
        type?: string
        path?: string
        label?: string
        height?: number
      }
      if (data?.type === 'puresite:size') {
        if ((data as { laidOut?: boolean }).laidOut) laidOut.current = true
        else if (editInPlace) nudgeFrame()
      }
      if (data?.type === 'puresite:committed') {
        const then = afterCommit.current
        afterCommit.current = null
        then?.()
      }
      if (data?.type === 'puresite:ready') {
        framePage.current = page
        setReady(count => count + 1)
      }
      if (data?.type === 'puresite:navigate' && typeof (data as { to?: unknown }).to === 'string') {
        const move = data as { to: string; state?: string; text?: string }
        onNavigate?.(move.to, move.state === 'promised' ? 'promised' : 'built', move.text ?? '')
      }
      if (data?.type === 'puresite:picked' && typeof data.path === 'string') {
        const picked = data as {
          path: string
          label?: string
          text?: string
          rect?: { x: number; y: number; width: number; height: number }
        }
        onPick?.(picked.path, picked.label ?? '', {
          text: picked.text ?? '',
          ...(picked.rect ? { rect: picked.rect } : {}),
        })
      }
      if (
        data?.type === 'puresite:edited' &&
        typeof data.path === 'string' &&
        typeof (data as { outerHtml?: unknown }).outerHtml === 'string'
      ) {
        const from = framePage.current
        const shown = onEdit?.(data.path, restoreEmbeddedVideoPreview((data as { outerHtml: string }).outerHtml), from)
        if (editInPlace && shown === true && from === page) ownEdit.current = page ?? ''
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onPick, onEdit, onNavigate, editInPlace, page, nudgeFrame])

  // `ready` is in every dep list: a frame that has just loaded has not seen
  // anything sent before it existed.
  const frameDoc = editInPlace ? loadedDoc.current : doc
  useEffect(() => {
    laidOut.current = false
  }, [frameDoc])
  useEffect(() => {
    if (!editInPlace) return undefined
    let attempts = 0
    const timer = window.setInterval(() => {
      if (laidOut.current || attempts === 2) {
        window.clearInterval(timer)
        return
      }
      attempts += 1
      if (attempts === 1) nudgeFrame()
      else setFrameKey(key => key + 1)
    }, LAYOUT_WAIT_MS)
    return () => window.clearInterval(timer)
  }, [editInPlace, frameDoc, nudgeFrame])
  useEffect(() => {
    if (!commitRef) return undefined
    commitRef.current = then => {
      afterCommit.current = then
      post({ type: 'puresite:commit' })
      // A frame still loading has nothing being typed, and will not answer.
      window.setTimeout(() => {
        if (afterCommit.current !== then) return
        afterCommit.current = null
        then()
      }, COMMIT_WAIT_MS)
    }
    return () => { commitRef.current = null }
  }, [commitRef, post])
  useEffect(() => {
    post({ type: 'puresite:edit-in-place', on: editInPlace })
  }, [post, editInPlace, ready])
  useEffect(() => {
    post({ type: 'puresite:picking', on: picking })
  }, [post, picking, ready])
  useEffect(() => {
    post({ type: 'puresite:highlight', paths: highlight })
  }, [post, highlight, ready])

  const factor = scale ?? 1
  /**
   * The frame is the VIEWPORT, and the page scrolls inside it.
   *
   * Growing the frame to the document's height seemed kinder — the whole page
   * visible, the stage scrolling — but it silently breaks the page: `vh` is
   * relative to the frame, so a hero styled `min-height: 100vh` becomes as
   * tall as the entire document, and sticky headers and viewport media
   * queries stop meaning anything. A page previewed that way is not the page
   * that ships.
   *
   * So the frame stays viewport-sized and scrolls internally, exactly as a
   * browser window does.
   */
  const frameHeight = height ?? 0
  return (
    <Box
      style={{
        width: width * factor,
        height: frameHeight ? frameHeight * factor : '100%',
      }}
    >
      <Frame
        key={frameKey}
        ref={frameRef}
        sandbox="allow-scripts allow-presentation"
        allow="fullscreen; encrypted-media; picture-in-picture"
        srcDoc={frameDoc}
        title="Page preview"
        $interactive={picking || interactive}
        style={{
          width,
          height: frameHeight || `${100 / factor}%`,
          transform: factor === 1 ? undefined : `scale(${factor})`,
        }}
      />
      <EmbeddedVideoPreview frame={frameRef} scale={factor} documentKey={doc} interactive={!!interactive && !picking} />
    </Box>
  )
}

const Box = styled.div`
  position: relative;
  overflow: hidden;
  background: #ffffff;
`

/**
 * The stage frame takes the mouse; the rail cards do not.
 *
 * The stage needs it so the page can be scrolled the way a browser scrolls —
 * clicks on links are cancelled inside the frame so it cannot navigate away.
 * A card must NOT take it, or every thumbnail would swallow scrolls meant for
 * the strip behind it.
 */
const Frame = styled.iframe<{ $interactive: boolean }>`
  border: 0;
  display: block;
  transform-origin: top left;
  pointer-events: ${props => (props.$interactive ? 'auto' : 'none')};
`
