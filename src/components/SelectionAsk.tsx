import { useEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { siteLinkTheme } from './siteLinkTheme'
import { normalizePagePath } from '../lib/pages'
import { orderedPages, urlPathFor, type SiteDocument } from '../lib/siteDocument'
import { hrefFrom } from '../lib/siteLinks'

/**
 * Say what this should be, where you are looking.
 *
 * The panel across the room asks you to describe what you already have your
 * finger on. This appears beside the thing itself, scoped to it, and its
 * first offer is a link — because a link is how a site grows: point a
 * sentence at a page that does not exist and the site now owes that page.
 */
export function SelectionAsk({
  document: siteDocument,
  page,
  label,
  text,
  at,
  busy,
  onAsk,
  onLink,
  onDismiss,
}: {
  document: SiteDocument
  /** The page the selection is on. */
  page: string
  /** The element's tag, for saying what is selected. */
  label: string
  /** What the element says, for naming a page after it. */
  text: string
  /** Where to sit, in stage coordinates. */
  at: { x: number; y: number; width: number; height: number }
  busy: boolean
  onAsk: (request: string) => void
  onLink: (href: string) => void
  onDismiss: () => void
}): React.ReactElement {
  const [request, setRequest] = useState('')
  const [linking, setLinking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const send = (): void => {
    const asked = request.trim()
    if (!asked) return
    setRequest('')
    onAsk(asked)
  }

  /** A page named after the words you selected, if there is no page like it. */
  const newPagePath = normalizePagePath(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 4)
      .join('-') || 'new-page',
  )
  const pages = orderedPages(siteDocument)
  const exists = pages.some(entry => entry.path === newPagePath)

  return (
    <Bar
      style={{ left: at.x, top: at.y + at.height + 10 }}
      role="dialog"
      aria-label={`Change this ${label}`}
    >
      {linking ? (
        <Stack>
          <Label>Link this to</Label>
          <Choices>
            {pages.map(entry => (
              <Choice key={entry.path} type="button" onClick={() => onLink(hrefFrom(page, entry.path))}>
                {entry.title || entry.path}
                <span className="path">{urlPathFor(entry.path)}</span>
              </Choice>
            ))}
            {exists ? null : (
              <Choice $promise type="button" onClick={() => onLink(hrefFrom(page, newPagePath))}>
                A new page called “{text.slice(0, 40)}”
                <span className="path">{urlPathFor(newPagePath)}</span>
              </Choice>
            )}
          </Choices>
          <Row>
            <Quiet>A page nobody has built yet is a promise, not a broken link.</Quiet>
            <span style={{ flex: 1 }} />
            <Ghost type="button" onClick={() => setLinking(false)}>
              Back
            </Ghost>
          </Row>
        </Stack>
      ) : (
        <Stack>
          <Row>
            <Input
              ref={inputRef}
              value={request}
              placeholder={`Say what this ${label} should be…`}
              aria-label={`Say what this ${label} should be`}
              disabled={busy}
              onChange={event => setRequest(event.currentTarget.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  send()
                }
              }}
            />
            <Send type="button" onClick={send} disabled={busy || !request.trim()}>
              {busy ? 'Working…' : 'Ask'}
            </Send>
          </Row>
          <Row>
            <Primary type="button" onClick={() => setLinking(true)}>
              Link this to…
            </Primary>
            <Ghost type="button" onClick={() => onAsk('Say this in fewer words, same meaning.')}>
              Shorten
            </Ghost>
            <Ghost type="button" onClick={() => onAsk('Turn this into a list.')}>
              Make it a list
            </Ghost>
            <span style={{ flex: 1 }} />
            <Ghost type="button" onClick={onDismiss}>
              Done
            </Ghost>
          </Row>
        </Stack>
      )}
    </Bar>
  )
}

const Bar = styled.div`
  ${siteLinkTheme}
  position: absolute;
  z-index: var(--platform-z-index-zi-app-menus);
  width: min(420px, 92%);
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--platform-colors-surface);
  border: 1px solid var(--platform-colors-border);
  box-shadow: var(--platform-shadow-lg);
  color: var(--platform-colors-text);
`
const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
`
const Label = styled.span`
  font-size: var(--platform-typography-font-size-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--platform-colors-text-secondary);
`
const Input = styled.input`
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: var(--platform-typography-font-size-sm);
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid var(--platform-colors-border);
  background: var(--pure-chrome-well);
  color: inherit;
`
const Ghost = styled.button`
  font: inherit;
  font-size: var(--platform-typography-font-size-xs);
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--platform-colors-border);
  background: transparent;
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
`
const Primary = styled(Ghost)`
  border-color: transparent;
  background: var(--site-accent);
  color: var(--pure-chrome-on-accent);
  font-weight: var(--platform-typography-font-weight-bold);
`
const Send = styled(Primary)`
  padding: 8px 14px;
  font-size: var(--platform-typography-font-size-sm);
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
const Choices = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 210px;
  overflow: auto;
`
const Choice = styled.button<{ $promise?: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 8px;
  font: inherit;
  font-size: var(--platform-typography-font-size-sm);
  padding: 7px 9px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  border: 1px ${({ $promise }) => ($promise ? 'dashed var(--site-promise-line)' : 'solid var(--platform-colors-border)')};
  background: ${({ $promise }) => ($promise ? 'var(--site-promise-wash)' : 'transparent')};
  .path {
    margin-left: auto;
    font-family: var(--platform-typography-font-family-mono);
    font-size: var(--platform-typography-font-size-xs);
    color: var(--platform-colors-text-secondary);
  }
`
const Quiet = styled.span`
  font-size: var(--platform-typography-font-size-xs);
  color: var(--platform-colors-text-secondary);
`
