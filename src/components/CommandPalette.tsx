import { useEffect, useMemo, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { siteLinkTheme } from './siteLinkTheme'
import type { SiteLinkGraph } from '../lib/siteLinks'
import { orderedPages, titleFromPage, urlPathFor, type SiteDocument } from '../lib/siteDocument'

/** One thing the box can do with what has been typed. */
interface Command {
  id: string
  kind: 'page' | 'promise' | 'ask' | 'do'
  label: string
  detail: string
  run: () => void
}

/**
 * One box for finding, going, building and asking.
 *
 * Four places to look becomes one: pages by name, promises the writing has
 * made, the things the app can do, and — when nothing matches — the words
 * themselves, handed to the drawer. Typing is how you get anywhere, so there
 * is never a second place to look for the thing you half remember.
 */
export function CommandPalette({
  document: siteDocument,
  graph,
  onOpenPage,
  onBuildPromise,
  onOpenMap,
  onOpenWork,
  onAddPage,
  onAsk,
  onClose,
}: {
  document: SiteDocument
  graph: SiteLinkGraph
  onOpenPage: (page: string) => void
  onBuildPromise: (path: string) => void
  onOpenMap: () => void
  onOpenWork: () => void
  onAddPage: () => void
  onAsk: (request: string) => void
  onClose: () => void
}): React.ReactElement {
  const [typed, setTyped] = useState('')
  const [at, setAt] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // The thing in front answers Escape. It says so by marking the event
  // handled, so the sheet or the selection behind it keeps its own.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const commands = useMemo<Command[]>(() => {
    const query = typed.trim().toLowerCase()
    const pages: Command[] = orderedPages(siteDocument).map(page => ({
      id: `page:${page.path}`,
      kind: 'page',
      label: titleFromPage(siteDocument.pages[page.path] ?? '') || page.path,
      detail: urlPathFor(page.path),
      run: () => onOpenPage(page.path),
    }))
    const promises: Command[] = graph.promised.map(promise => ({
      id: `promise:${promise.path}`,
      kind: 'promise',
      label: promise.title,
      detail: `${urlPathFor(promise.path)} · promised, not built`,
      run: () => onBuildPromise(promise.path),
    }))
    const doing: Command[] = [
      {
        id: 'do:map',
        kind: 'do',
        label: 'The map',
        detail: 'The whole site as its links draw it',
        run: onOpenMap,
      },
      {
        id: 'do:work',
        kind: 'do',
        label: 'What is still owed',
        detail: 'Promises, and anything that would ship broken',
        run: onOpenWork,
      },
      {
        id: 'do:add',
        kind: 'do',
        label: 'New page',
        detail: 'A page nothing asked for yet',
        run: onAddPage,
      },
    ]
    const matching = [...pages, ...promises, ...doing].filter(
      command =>
        !query || `${command.label} ${command.detail}`.toLowerCase().includes(query),
    )
    // Anything typed that matches nothing is a request, not a dead end.
    const asking: Command[] = query
      ? [
          {
            id: 'ask',
            kind: 'ask',
            label: `Ask: “${typed.trim()}”`,
            detail: 'Hand this to the assistant, about the page on screen',
            run: () => onAsk(typed.trim()),
          },
        ]
      : []
    return [...matching.slice(0, 8), ...asking]
  }, [typed, siteDocument, graph, onOpenPage, onBuildPromise, onOpenMap, onOpenWork, onAddPage, onAsk])

  useEffect(() => {
    setAt(0)
  }, [typed])

  const run = (command: Command | undefined): void => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label="Find anything">
        <Field>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.5-3.5"></path>
          </svg>
          <input
            ref={inputRef}
            value={typed}
            placeholder="Find a page, build a promise, or ask"
            aria-label="Find a page, build a promise, or ask"
            onChange={event => setTyped(event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setAt(index => Math.min(index + 1, commands.length - 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setAt(index => Math.max(index - 1, 0))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                run(commands[at])
              }
            }}
          />
        </Field>
        <Results>
          {commands.map((command, index) => (
            <Result
              key={command.id}
              type="button"
              $on={index === at}
              onMouseEnter={() => setAt(index)}
              onClick={() => run(command)}
            >
              <Kind $kind={command.kind}>
                {command.kind === 'promise'
                  ? 'build'
                  : command.kind === 'page'
                    ? 'go'
                    : command.kind === 'ask'
                      ? 'ask'
                      : 'open'}
              </Kind>
              <span className="label">{command.label}</span>
              <span className="detail">{command.detail}</span>
            </Result>
          ))}
          {!commands.length ? <Empty>Nothing by that name yet.</Empty> : null}
        </Results>
      </Sheet>
    </Scrim>
  )
}

const Scrim = styled.div`
  ${siteLinkTheme}
  position: fixed;
  inset: 0;
  z-index: var(--platform-z-index-zi-app-modal);
  display: flex;
  justify-content: center;
  padding: 12vh 24px 24px;
  background: color-mix(in srgb, var(--platform-colors-text) 32%, transparent);
  backdrop-filter: blur(6px);
`
const Sheet = styled.section`
  width: min(560px, 100%);
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  background: var(--platform-colors-surface);
  border: 1px solid var(--platform-colors-border);
  box-shadow: var(--platform-shadow-lg);
  color: var(--platform-colors-text);
`
const Field = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--platform-colors-border);
  color: var(--platform-colors-text-secondary);
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    font: inherit;
    font-size: var(--platform-typography-font-size-lg);
    color: var(--platform-colors-text);
  }
`
const Results = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 46vh;
  overflow: auto;
  padding: 6px;
`
const Result = styled.button<{ $on: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 9px;
  background: ${({ $on }) => ($on ? 'var(--site-accent-wash)' : 'transparent')};
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  .label {
    font-size: var(--platform-typography-font-size-base);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .detail {
    margin-left: auto;
    font-size: var(--platform-typography-font-size-xs);
    color: var(--platform-colors-text-secondary);
    white-space: nowrap;
  }
`
const Kind = styled.span<{ $kind: string }>`
  flex: none;
  width: 42px;
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--platform-typography-font-size-xs);
  color: ${({ $kind }) =>
    $kind === 'promise' ? 'var(--pure-attention-text)' : 'var(--platform-colors-text-secondary)'};
`
const Empty = styled.div`
  padding: 22px;
  text-align: center;
  color: var(--platform-colors-text-secondary);
  font-size: var(--platform-typography-font-size-sm);
`
