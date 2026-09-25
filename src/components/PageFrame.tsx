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

const PICK_SCRIPT = `<script>(function () {
  var picking = false;
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
  function serializeEdited(el) {
    var clone = el.cloneNode(true);
    clone.classList.remove('__ps-picked');
    if (!clone.classList.length) clone.removeAttribute('class');
    clone.removeAttribute('contenteditable');
    return clone.outerHTML;
  }
  function startEdit(el) {
    editing = el;
    editingOriginal = serializeEdited(el);
    el.setAttribute('contenteditable', 'true');
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
  style.textContent = '.__ps-picked { outline: 2px solid #1f6feb !important; outline-offset: 1px !important; }';
  document.head.appendChild(style);
  parent.postMessage({ type: 'puresite:ready' }, '*');
})();</script>`

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
  /** Typing in the page itself: the edited element arrives serialized. */
  onEdit?: (path: string, outerHtml: string) => void
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
      if (data?.type === 'puresite:ready') setReady(count => count + 1)
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
        onEdit?.(data.path, restoreEmbeddedVideoPreview((data as { outerHtml: string }).outerHtml))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onPick, onEdit, onNavigate])

  // `ready` is in every dep list: a frame that has just loaded has not seen
  // anything sent before it existed.
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
        ref={frameRef}
        sandbox="allow-scripts allow-presentation"
        allow="fullscreen; encrypted-media; picture-in-picture"
        srcDoc={doc}
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
