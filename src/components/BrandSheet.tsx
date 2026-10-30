import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { siteLinkTheme } from './siteLinkTheme'
import { brandLine, type SiteBrand } from '../lib/siteBrand'

/**
 * The brand the site is in, and the way to hand it — or pages that show it
 * well — to the organisation.
 *
 * Proposing calls the same code the drawer's proposeBrandToOrganisation and
 * proposeSamplesToOrganisation tools do; what comes back (the server's answer,
 * or why it could not be sent) is shown as it is, in its own words.
 */
export function BrandSheet({
  brand,
  offered,
  houseStyle,
  pagesLabel,
  onProposeBrand,
  onProposeSamples,
  onUseHouseStyle,
  onClose,
}: {
  brand: SiteBrand | undefined
  /** Whether this desktop can send anything to an organisation at all. */
  offered: boolean
  /** The organisation's house style, when there is one. */
  houseStyle: string | null
  /** What a sample proposal captures: "the page on screen", "3 ticked pages". */
  pagesLabel: string
  onProposeBrand: (note: string) => Promise<string>
  onProposeSamples: (note: string) => Promise<string>
  /** Put the house style on the site — the same path as the useBrand tool. */
  onUseHouseStyle: () => Promise<void>
  onClose: () => void
}): React.ReactElement {
  const [proposing, setProposing] = useState(false)
  const canProposeBrand = !!brand && brand.source !== 'organisation'
  const [what, setWhat] = useState<'samples' | 'brand'>(canProposeBrand ? 'brand' : 'samples')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = async (): Promise<void> => {
    setBusy(true)
    setAnswer(null)
    try {
      const text = await (what === 'brand' ? onProposeBrand(note) : onProposeSamples(note))
      setAnswer({ ok: true, text })
    } catch (error) {
      setAnswer({ ok: false, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const useHouse = async (): Promise<void> => {
    setBusy(true)
    setAnswer(null)
    try {
      await onUseHouseStyle()
    } catch (error) {
      setAnswer({ ok: false, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const sampleFor = brand?.source === 'organisation' ? brand.name : houseStyle
  const from =
    brand?.source === 'organisation'
      ? `From ${brand.organisation ?? 'your organisation'}`
      : brand?.source === 'workspace'
        ? 'From the workspace’s Brands folder'
        : brand?.source === 'own'
          ? 'One of your own brands'
          : brand
            ? 'A brand file'
            : null

  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label="Brand">
        <Head>
          <div>
            <Title>{brand ? brand.name : 'Brand'}</Title>
            <Sub>{brand ? `${brandLine(brand)}.` : 'This site is not in a saved brand yet.'}</Sub>
          </div>
          <span style={{ flex: 1 }} />
          <Close type="button" aria-label="Close" onClick={onClose}>
            ×
          </Close>
        </Head>

        <Body>
          {from ? <Quiet>{from}</Quiet> : null}
          {!brand && houseStyle ? (
            <Row>
              <Quiet>Your organisation’s house style is {houseStyle}.</Quiet>
              <span style={{ flex: 1 }} />
              <Button type="button" disabled={busy} onClick={() => void useHouse()}>
                Use it on this site
              </Button>
            </Row>
          ) : null}

          {proposing ? (
            <Form>
              <Label>What to propose</Label>
              <Choices>
                {canProposeBrand ? (
                  <Choice type="button" $active={what === 'brand'} onClick={() => setWhat('brand')}>
                    <span className="name">The brand {brand!.name}</span>
                    <span className="note">For an administrator to add to the organisation’s brands</span>
                  </Choice>
                ) : null}
                <Choice type="button" $active={what === 'samples'} onClick={() => setWhat('samples')}>
                  <span className="name">{cap(pagesLabel)} as samples</span>
                  <span className="note">
                    {sampleFor ? `Pictures of how ${sampleFor} looks done well` : 'Pictures of how the house style looks done well'}
                  </span>
                </Choice>
              </Choices>
              <Label htmlFor="brand-note">A line for whoever approves it</Label>
              <Note
                id="brand-note"
                value={note}
                placeholder="Optional — why this is worth keeping"
                onChange={event => setNote(event.currentTarget.value)}
              />
            </Form>
          ) : null}
          {answer ? <Answer $ok={answer.ok} role="status">{answer.text}</Answer> : null}
        </Body>

        {offered ? (
          <Foot>
            <Quiet>An administrator decides; nothing changes until then.</Quiet>
            <span style={{ flex: 1 }} />
            {proposing ? (
              <Primary type="button" disabled={busy || answer?.ok === true} onClick={() => void send()}>
                {busy ? (what === 'samples' ? 'Capturing and sending…' : 'Sending…') : answer?.ok ? 'Sent' : 'Send for approval'}
              </Primary>
            ) : (
              <Button type="button" onClick={() => setProposing(true)}>
                Propose to organisation…
              </Button>
            )}
          </Foot>
        ) : null}
      </Sheet>
    </Scrim>
  )
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

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
  padding: 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`
const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`
const Label = styled.label`
  font-size: var(--platform-typography-font-size-xs);
  font-weight: var(--platform-typography-font-weight-bold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--platform-colors-text-secondary);
  margin-top: 6px;
`
const Choices = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`
const Choice = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--site-accent)' : 'var(--platform-colors-border)')};
  background: ${({ $active }) => ($active ? 'var(--site-accent-wash)' : 'transparent')};
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  .name {
    font-size: var(--platform-typography-font-size-base);
  }
  .note {
    font-size: var(--platform-typography-font-size-xs);
    color: var(--platform-colors-text-secondary);
  }
`
const Note = styled.textarea`
  min-height: 64px;
  resize: vertical;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--platform-colors-border);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--platform-typography-font-size-sm);
`
const Answer = styled.div<{ $ok: boolean }>`
  padding: 8px 10px;
  border-radius: 8px;
  font-size: var(--platform-typography-font-size-sm);
  background: ${({ $ok }) => ($ok ? 'var(--site-accent-wash)' : 'var(--pure-danger-muted)')};
  color: ${({ $ok }) => ($ok ? 'var(--platform-colors-text)' : 'var(--pure-danger-text)')};
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
