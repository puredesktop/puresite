import { useEffect } from 'react'
import { styled } from 'styled-components'
import { siteLinkTheme } from './siteLinkTheme'
import type { DraftState } from '../lib/draftState'
import { titleFromPage, urlPathFor, type SiteDocument } from '../lib/siteDocument'

/**
 * What a reader would notice.
 *
 * Not a list of files and bytes: the pages someone would meet for the first
 * time, the ones that read differently now, and the ones they can reach today
 * and could not tomorrow. That last kind is the one worth pausing over, so it
 * is named as a loss rather than counted as a change.
 */
export function ChangesSheet({
  document: siteDocument,
  draft,
  onOpenPage,
  onCompare,
  onPublish,
  onClose,
}: {
  document: SiteDocument
  draft: DraftState
  onOpenPage: (page: string) => void
  /** Show this page beside the published one. */
  onCompare: (page: string) => void
  onPublish: () => void
  onClose: () => void
}): React.ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const published = siteDocument.manifest.published
  const name = (page: string): string =>
    titleFromPage(siteDocument.pages[page] ?? '') || page

  const group = (
    label: string,
    pages: string[],
    tone: 'new' | 'edit' | 'gone',
    note: string,
  ): React.ReactElement | null =>
    pages.length ? (
      <>
        <Group>
          <Tag $tone={tone}>{label}</Tag>
          <span className="count">{pages.length}</span>
          <span className="note">{note}</span>
        </Group>
        {pages.map(page => (
          <Row key={`${tone}-${page}`}>
            <div className="what">
              <span className="name">{tone === 'gone' ? page : name(page)}</span>
              <span className="path">{urlPathFor(page)}</span>
            </div>
            {tone === 'gone' ? null : (
              <>
                {published?.url && tone === 'edit' ? (
                  <Button type="button" onClick={() => onCompare(page)}>
                    Beside the live one
                  </Button>
                ) : null}
                <Button type="button" onClick={() => onOpenPage(page)}>
                  Open
                </Button>
              </>
            )}
          </Row>
        ))}
      </>
    ) : null

  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label="What a reader would notice">
        <Head>
          <div>
            <Title>What a reader would notice</Title>
            <Sub>
              {draft.neverPublished
                ? 'Nothing is published yet, so all of it would be new.'
                : published?.at
                  ? `Published ${new Date(published.at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'long',
                    })}`
                  : 'Published once already'}
            </Sub>
          </div>
          <span style={{ flex: 1 }} />
          <Close type="button" aria-label="Close" onClick={onClose}>
            ×
          </Close>
        </Head>

        <Body>
          {draft.matchesLive ? (
            <Empty>Nothing. What is here is exactly what readers have.</Empty>
          ) : (
            <>
              {group('New', draft.added, 'new', 'pages nobody has seen')}
              {group('Changed', draft.edited, 'edit', 'pages that read differently')}
              {group(
                'Gone',
                draft.removed,
                'gone',
                'reachable today, not after publishing',
              )}
            </>
          )}
        </Body>

        <Foot>
          <Quiet>
            {draft.removed.length
              ? 'Anyone holding an address you remove will meet nothing there.'
              : 'Publishing sends the whole site; unchanged pages are not re-sent.'}
          </Quiet>
          <span style={{ flex: 1 }} />
          <Primary type="button" onClick={onPublish} disabled={draft.matchesLive}>
            Publish…
          </Primary>
        </Foot>
      </Sheet>
    </Scrim>
  )
}

const Scrim = styled.div`
  ${siteLinkTheme}
  position: fixed;
  inset: 0;
  z-index: var(--platform-z-index-zi-app-modal);
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--platform-colors-text) 38%, transparent);
  backdrop-filter: blur(6px);
`
const Sheet = styled.section`
  width: min(620px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  background: var(--platform-colors-surface);
  border: 1px solid var(--platform-colors-border);
  box-shadow: var(--platform-shadow-lg);
  color: var(--platform-colors-text);
`
const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--platform-colors-border);
`
const Title = styled.div`
  font-size: var(--platform-typography-font-size-lg);
  font-weight: var(--platform-typography-font-weight-bold);
`
const Sub = styled.div`
  font-size: var(--platform-typography-font-size-sm);
  color: var(--platform-colors-text-secondary);
`
const Close = styled.button`
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid var(--platform-colors-border);
  background: transparent;
  color: inherit;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
`
const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 20px 14px;
  display: flex;
  flex-direction: column;
`
const Group = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 16px 0 6px;
  .count,
  .note {
    font-size: var(--platform-typography-font-size-xs);
    color: var(--platform-colors-text-secondary);
  }
`
const Tag = styled.span<{ $tone: 'new' | 'edit' | 'gone' }>`
  font-size: var(--platform-typography-font-size-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 6px;
  background: ${({ $tone }) =>
    $tone === 'new'
      ? 'var(--site-accent-wash)'
      : $tone === 'edit'
        ? 'var(--pure-attention-muted)'
        : 'var(--pure-danger-muted)'};
  color: ${({ $tone }) =>
    $tone === 'new'
      ? 'var(--platform-colors-text)'
      : $tone === 'edit'
        ? 'var(--pure-attention-text)'
        : 'var(--pure-danger-text)'};
`
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--platform-colors-border);
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-size: var(--platform-typography-font-size-base);
  }
  .path {
    font-family: var(--platform-typography-font-family-mono);
    font-size: var(--platform-typography-font-size-xs);
    color: var(--platform-colors-text-secondary);
  }
`
const Button = styled.button`
  font: inherit;
  font-size: var(--platform-typography-font-size-sm);
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--platform-colors-border);
  background: transparent;
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
`
const Primary = styled(Button)`
  border-color: transparent;
  background: var(--site-accent);
  color: var(--pure-chrome-on-accent);
  font-weight: var(--platform-typography-font-weight-bold);
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
const Empty = styled.div`
  padding: 40px 0;
  text-align: center;
  color: var(--platform-colors-text-secondary);
`
const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--platform-colors-border);
`
const Quiet = styled.span`
  font-size: var(--platform-typography-font-size-sm);
  color: var(--platform-colors-text-secondary);
`
