import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { siteLinkTheme } from './siteLinkTheme'
import type { PromisedPage, SiteLinkGraph } from '../lib/siteLinks'
import { urlPathFor, type SiteDocument } from '../lib/siteDocument'
import type { CheckFinding } from '../lib/buildSite'
import { nameOf } from '../lib/assetNames'
import type { MaterialItem } from '../lib/material'

/**
 * What the site still owes, in one list.
 *
 * Two kinds of work, and the difference between them matters: a page the
 * writing promised is optional — the words ship either way — while something
 * that would ship broken holds publishing. They are shown together because
 * they are both "what is left", and apart because only one of them stops you.
 */
export function WorkList({
  document: siteDocument,
  graph,
  findings,
  material,
  onBuild,
  onBuildAll,
  onOpenPage,
  onAddFiles,
  onUseFileInstead,
  onClose,
}: {
  document: SiteDocument
  graph: SiteLinkGraph
  findings: CheckFinding[]
  /** The files this site has, for pointing a broken reference at one. */
  material: MaterialItem[]
  onBuild: (promise: PromisedPage) => void
  onBuildAll: (promises: PromisedPage[]) => void
  onOpenPage: (page: string) => void
  onAddFiles: () => void
  /** Point every reference to a missing file at one that is here. */
  onUseFileInstead: (missing: string, file: string) => void
  onClose: () => void
}): React.ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const home = siteDocument.manifest.pages[0]
  /** Which missing file the person is choosing a replacement for. */
  const [replacing, setReplacing] = useState<string | null>(null)
  const missingFile = (message: string): string =>
    message.match(/assets\/([^\s,]+)/)?.[1] ?? ''
  const breaking = findings.filter(finding => finding.severity === 'error')
  const warnings = findings.filter(
    finding => finding.severity === 'warning' && finding.code !== 'promised-page',
  )
  // The same words on every page is one promise worth naming once.
  const quotes = (promise: PromisedPage): string => {
    const said = promise.promises
      .map(link => link.text || link.href)
      .filter((text, index, all) => all.indexOf(text) === index)
    return said.slice(0, 2).map(text => `“${text}”`).join(', ')
  }
  const where = (promise: PromisedPage): string =>
    promise.promises
      .map(link =>
        link.inNav
          ? 'the site header'
          : link.fromPage === home
            ? 'the home page'
            : link.fromPage,
      )
      .filter((value, index, all) => all.indexOf(value) === index)
      .join(', ')

  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label="What the site still owes">
        <Head>
          <div>
            <Title>What is still owed</Title>
            <Sub>
              {graph.promised.length} promised by a link · {breaking.length} would ship broken
            </Sub>
          </div>
          <span style={{ flex: 1 }} />
          <Close type="button" aria-label="Close this list" onClick={onClose}>
            ×
          </Close>
        </Head>

        <Body>
          {graph.promised.length ? (
            <>
              <Group>
                <Dash />
                <span className="name">Promised by a link</span>
                <span className="count">{graph.promised.length}</span>
                <span style={{ flex: 1 }} />
                {graph.promised.length > 1 ? (
                  <Quiet as="button" type="button" onClick={() => onBuildAll(graph.promised)}>
                    Build them all as drafts
                  </Quiet>
                ) : null}
              </Group>
              {graph.promised.map(promise => (
                <Row key={promise.path}>
                  <div className="what">
                    <span className="name">{promise.title}</span>
                    <span className="detail">
                      {quotes(promise)} on {where(promise)}
                    </span>
                  </div>
                  <span className="path">{urlPathFor(promise.path)}</span>
                  <Primary type="button" onClick={() => onBuild(promise)}>
                    Build
                  </Primary>
                </Row>
              ))}
            </>
          ) : null}

          {breaking.length ? (
            <>
              <Group $bad>
                <span className="name">Would ship broken</span>
                <span className="count">{breaking.length}</span>
                <span style={{ flex: 1 }} />
                <span className="note">Publishing waits for these</span>
              </Group>
              {breaking.map((finding, index) => (
                <Row key={`${finding.code}-${index}`}>
                  <div className="what">
                    <span className="name">{finding.message}</span>
                    <span className="detail">{finding.fix}</span>
                  </div>
                  {finding.code === 'missing-asset' ? (
                    <>
                      <Button type="button" onClick={onAddFiles}>
                        Add the file
                      </Button>
                      {material.length ? (
                        <Button
                          type="button"
                          onClick={() =>
                            setReplacing(current =>
                              current === missingFile(finding.message)
                                ? null
                                : missingFile(finding.message),
                            )
                          }
                        >
                          Use one that is here…
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {finding.page ? (
                    <Button type="button" onClick={() => onOpenPage(finding.page!)}>
                      Open the page
                    </Button>
                  ) : null}
                  {replacing && replacing === missingFile(finding.message) ? (
                    <Choices>
                      {material.map(item => (
                        <Button
                          key={item.name}
                          type="button"
                          onClick={() => {
                            setReplacing(null)
                            onUseFileInstead(replacing, item.name)
                          }}
                        >
                          {nameOf(item)}
                        </Button>
                      ))}
                    </Choices>
                  ) : null}
                </Row>
              ))}
            </>
          ) : null}

          {warnings.length ? (
            <>
              <Group>
                <span className="name">Worth a look</span>
                <span className="count">{warnings.length}</span>
              </Group>
              {warnings.map((finding, index) => (
                <Row key={`warn-${index}`}>
                  <div className="what">
                    <span className="name">{finding.message}</span>
                    <span className="detail">{finding.fix}</span>
                  </div>
                  {finding.page ? (
                    <Button type="button" onClick={() => onOpenPage(finding.page!)}>
                      Open the page
                    </Button>
                  ) : null}
                </Row>
              ))}
            </>
          ) : null}

          {!graph.promised.length && !breaking.length && !warnings.length ? (
            <Empty>Nothing owed. Every link goes somewhere and nothing would ship broken.</Empty>
          ) : null}
        </Body>

        <Foot>
          <Quiet>
            {breaking.length
              ? 'Clear what would ship broken and the site can go out.'
              : 'A promised page never stops a publish: its words ship as plain text.'}
          </Quiet>
          <span style={{ flex: 1 }} />
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
  width: min(720px, 100%);
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
  padding: 6px 20px 14px;
  display: flex;
  flex-direction: column;
`
const Group = styled.div<{ $bad?: boolean }>`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 16px 0 8px;
  .name {
    font-size: var(--platform-typography-font-size-sm);
    font-weight: var(--platform-typography-font-weight-bold);
    color: ${({ $bad }) => ($bad ? 'var(--pure-danger-text)' : 'inherit')};
  }
  .count,
  .note {
    font-family: var(--platform-typography-font-family-mono);
    font-size: var(--platform-typography-font-size-xs);
    color: var(--platform-colors-text-secondary);
  }
`
const Dash = styled.i`
  width: 18px;
  height: 0;
  border-bottom: 2px dashed var(--site-promise-line);
`
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
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
    font-weight: var(--platform-typography-font-weight-medium);
  }
  .detail {
    font-size: var(--platform-typography-font-size-sm);
    color: var(--platform-colors-text-secondary);
  }
  .path {
    font-family: var(--platform-typography-font-family-mono);
    font-size: var(--platform-typography-font-size-xs);
    color: var(--platform-colors-text-secondary);
    white-space: nowrap;
  }
`
const Choices = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-basis: 100%;
  padding-top: 8px;
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
`
const Empty = styled.div`
  padding: 40px 0;
  text-align: center;
  color: var(--platform-colors-text-secondary);
  font-size: var(--platform-typography-font-size-base);
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
  background: none;
  border: 0;
  padding: 0;
  font-family: inherit;
  cursor: inherit;
`
