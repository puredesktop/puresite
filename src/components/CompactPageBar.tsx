/**
 * The one thing kept above the page in compact: the pages, by name, and the last word on what just happened.
 * A click on a name goes there. Anything being typed is already saved by then, because leaving the frame commits it.
 */
import { useEffect, useRef } from 'react'
import { styled } from 'styled-components'
import type { SitePage } from '../lib/siteDocument'

export function CompactPageBar({
  pages,
  selectedPage,
  onSelectPage,
  status,
  statusAction,
}: {
  pages: SitePage[]
  selectedPage: string
  onSelectPage: (page: string) => void
  status: string
  statusAction: { label: string; title?: string; onClick: () => void } | null
}): React.ReactElement {
  const current = useRef<HTMLButtonElement>(null)
  // A long list scrolls sideways; the page on screen stays in sight. An agent can move it too.
  useEffect(() => {
    current.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [selectedPage])
  return (
    <Bar>
      <Names aria-label="Pages">
        {pages.map(page => (
          <Name
            key={page.path}
            ref={page.path === selectedPage ? current : undefined}
            type="button"
            title={page.title}
            aria-current={page.path === selectedPage ? 'page' : undefined}
            onClick={() => onSelectPage(page.path)}
          >
            {page.title}
          </Name>
        ))}
      </Names>
      <Said role="status" title={status}>{status}</Said>
      {statusAction ? (
        <Action
          type="button"
          title={statusAction.title}
          aria-label={statusAction.title ?? statusAction.label}
          onClick={statusAction.onClick}
        >
          {statusAction.label}
        </Action>
      ) : null}
    </Bar>
  )
}

const Bar = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--pure-chrome-line);
  background: light-dark(#ffffff, #1c1c1c);
  font-family: var(--platform-typography-font-family);
`

const Names = styled.nav`
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`

const Name = styled.button`
  flex: none;
  max-width: 180px;
  height: 26px;
  padding: 0 8px;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--pure-chrome-soft);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
  &:hover {
    background: var(--pure-chrome-hover);
    color: var(--platform-colors-text);
  }
  &[aria-current='page'] {
    color: var(--platform-colors-text);
    font-weight: 700;
  }
`

const Said = styled.span`
  flex: 1 1 0;
  min-width: 60px;
  overflow: hidden;
  color: var(--pure-chrome-muted);
  font-size: 12px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Action = styled.button`
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  color: var(--platform-colors-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  &:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
`
