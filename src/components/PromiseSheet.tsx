import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { siteLinkTheme } from './siteLinkTheme'
import { promiseBrief, type PromisedPage } from '../lib/siteLinks'
import { orderedPages, urlPathFor, type SiteDocument } from '../lib/siteDocument'

/**
 * A link that goes nowhere yet, and what to do about it.
 *
 * The page is not described here by a form: it is described by the sentences
 * that already promised it, quoted back. Building starts from those, so what
 * arrives is what the site said would be there — and if the site never said,
 * the page comes back asking rather than inventing.
 */
export function PromiseSheet({
  promise,
  document: siteDocument,
  onBuild,
  onRepoint,
  onUnlink,
  onClose,
}: {
  promise: PromisedPage
  document: SiteDocument
  onBuild: () => void
  /** Send the promising links at a page that already exists. */
  onRepoint: (to: string) => void
  /** Keep the words, drop the link: a promise nobody means to keep. */
  onUnlink: () => void
  onClose: () => void
}): React.ReactElement {
  const home = siteDocument.manifest.pages[0]
  const [choosing, setChoosing] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label={`${promise.title}, not built yet`}>
        <Head>
          <Kicker>
            <Dash /> No page here yet
          </Kicker>
          <Title>{promise.title}</Title>
          <Path>{urlPathFor(promise.path)}</Path>
        </Head>

        <Body>
          <Label>
            {promise.promises.length === 1
              ? 'One link promises it'
              : `${promise.promises.length} links promise it`}
          </Label>
          {promise.promises.map((link, index) => (
            <Promise key={`${link.fromPage}-${index}`}>
              <span className="text">“{link.text || link.href}”</span>
              <span className="where">
                {link.inNav
                  ? 'in the site header, so every page promises it'
                  : `on ${link.fromPage === home ? 'the home page' : link.fromPage}`}
              </span>
            </Promise>
          ))}

          {choosing ? (
            <>
              <Label>Point them at</Label>
              {orderedPages(siteDocument).map(page => (
                <Choice key={page.path} type="button" onClick={() => onRepoint(page.path)}>
                  <span className="name">{page.title || page.path}</span>
                  <span className="path">{urlPathFor(page.path)}</span>
                </Choice>
              ))}
            </>
          ) : (
            <>
              <Label>What the builder is told</Label>
              <Brief>{promiseBrief(siteDocument, promise)}</Brief>
            </>
          )}
        </Body>

        <Foot>
          {choosing ? (
            <>
              <Quiet>The words stay; only where they lead changes.</Quiet>
              <span style={{ flex: 1 }} />
              <Button type="button" onClick={() => setChoosing(false)}>
                Back
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={() => setChoosing(true)}>
                Point elsewhere…
              </Button>
              <Button type="button" onClick={onUnlink}>
                Just words
              </Button>
              <span style={{ flex: 1 }} />
              <Button type="button" onClick={onClose}>
                Not now
              </Button>
              <Primary type="button" onClick={onBuild}>
                Build this page
              </Primary>
            </>
          )}
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
  width: min(520px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  background: var(--platform-colors-surface);
  border: 1px solid var(--platform-colors-border));
  box-shadow: 0 30px 70px var(--platform-shadow-lg);
  color: var(--platform-colors-text);
`
const Head = styled.div`
  padding: 18px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-bottom: 1px solid var(--platform-colors-border));
`
const Kicker = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--site-promise-ink);
`
const Dash = styled.i`
  width: 18px;
  height: 0;
  border-bottom: 2px dashed var(--site-promise-ink);
`
const Title = styled.div`
  font-size: 19px;
  font-weight: 600;
`
const Path = styled.div`
  font-family: var(--platform-typography-font-family-mono);
  font-size: 12px;
  color: var(--platform-colors-text-secondary);
`
const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`
const Label = styled.span`
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--platform-colors-text-secondary);
  margin-top: 6px;
`
const Promise = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px;
  border-radius: 10px;
  background: var(--platform-colors-bg);
  .text {
    font-size: 13.5px;
  }
  .where {
    font-size: 12px;
    color: var(--platform-colors-text-secondary);
  }
`
const Brief = styled.pre`
  margin: 0;
  padding: 11px 13px;
  border-radius: 10px;
  border: 1px solid var(--platform-colors-border));
  background: var(--platform-colors-bg);
  font-family: var(--platform-typography-font-family-mono);
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--platform-colors-text-secondary);
`
const Choice = styled.button`
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid var(--platform-colors-border);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
  &:hover {
    background: var(--platform-colors-bg);
  }
  .name {
    font-size: var(--platform-typography-font-size-sm);
    font-weight: var(--platform-typography-font-weight-bold);
  }
  .path {
    font-family: var(--platform-typography-font-family-mono);
    font-size: var(--platform-typography-font-size-xs);
    color: var(--platform-colors-text-secondary);
  }
`
const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 20px;
  border-top: 1px solid var(--platform-colors-border));
`
const Quiet = styled.span`
  font-size: 12.5px;
  color: var(--platform-colors-text-secondary);
`
const Button = styled.button`
  font: inherit;
  font-size: 13px;
  padding: 9px 14px;
  border-radius: 9px;
  border: 1px solid var(--platform-colors-border));
  background: transparent;
  color: inherit;
  cursor: pointer;
`
const Primary = styled(Button)`
  border-color: transparent;
  background: var(--site-accent);
  color: #ffffff;
  font-weight: 600;
`
