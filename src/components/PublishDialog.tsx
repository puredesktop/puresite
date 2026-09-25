/**
 * Build, then send.
 *
 * Build writes `build/` — pages, stylesheet and the assets in use. Send takes
 * that folder to whichever service is chosen.
 *
 * The service list is not hard-coded: it is discovered from the tools the
 * user has, by shape rather than by name, so a host added tomorrow appears
 * here without this app shipping again. What the app knows is the three-step
 * publish — declare files, upload bytes, finalize — not any provider.
 *
 * The byte upload is why publishing is not purely a tool call: a presigned
 * PUT carries the file itself, and every MyTools body is JSON.
 */
import { useMemo, useState } from 'react'
import { styled } from 'styled-components'
import { hasBlockingFinding, type BuildResult, type CheckFinding } from '../lib/buildSite'
import { APP_ACCENT } from '../constants'
import type { PublishService } from '../lib/publishServices'
import type { PublishResult } from '../lib/publish'
import { verificationBadge, type SiteVerification } from '../lib/siteVerification'

export type PublishPhase =
  | 'idle'
  | 'building'
  | 'built'
  | 'sending'
  | 'live'
  | 'error'

/**
 * Copy without assuming the async clipboard is allowed here.
 *
 * The app's frame does not always carry the clipboard-write permission, and
 * the claim URL is the one string that must not be lost — so the selection
 * fallback stays until every shell grants the modern API.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const copied = document.execCommand('copy')
      area.remove()
      return copied
    } catch {
      return false
    }
  }
}

export interface PublishState {
  phase: PublishPhase
  message: string
  result?: BuildResult
  live?: PublishResult
}

export function PublishDialog({
  open,
  state,
  findings,
  verification,
  buildPath,
  services,
  allTools,
  chosenTools,
  onChooseTool,
  serviceId,
  onServiceId,
  onBuild,
  onSend,
  onStop,
  onOpenUrl,
  onClose,
}: {
  open: boolean
  state: PublishState
  findings: CheckFinding[]
  /**
   * The app's verdict on the preview, not the dialog's own: the same state
   * the board's badge shows and the same guard the build and the send run.
   * The dialog reflects it; it does not decide it.
   */
  verification: SiteVerification
  buildPath: string | null
  services: PublishService[]
  /** Every enabled tool, for the chooser. */
  allTools: PublishService[]
  chosenTools: string[]
  onChooseTool: (id: string, on: boolean) => void
  serviceId: string
  onServiceId: (id: string) => void
  onBuild: () => void
  onSend: () => void
  /** Stop an upload that is under way. */
  onStop: () => void
  /** Open a URL in the real browser, through the shell. */
  onOpenUrl: (url: string) => void
  onClose: () => void
}): React.ReactElement | null {
  const errors = useMemo(
    () => findings.filter(finding => finding.severity === 'error'),
    [findings],
  )
  const [chooserOpen, setChooserOpen] = useState(false)
  const [claimCopied, setClaimCopied] = useState(false)
  const warnings = useMemo(
    () => findings.filter(finding => finding.severity === 'warning'),
    [findings],
  )

  if (!open) return null

  const service = services.find(option => option.id === serviceId) ?? services[0]
  const others = allTools.filter(
    tool => !services.some(service => service.id === tool.id),
  )
  const busy = state.phase === 'building' || state.phase === 'sending'

  return (
    <Scrim>
      <Dialog>
        <Head>
          <Title>Publish</Title>
          <span style={{ flex: 1 }} />
          <Mono>{service?.anonymous ? 'no account needed' : 'static host'}</Mono>
        </Head>

        <Section>
          <SectionLabel>WHERE</SectionLabel>
          {/*
            The list comes from the tools that are actually installed, so a
            service added tomorrow appears here without this app shipping
            again. here.now is first because it publishes without an account.
          */}
          {services.length ? (
          <Services>
            {services.map(option => (
              <ServiceButton
                key={option.id}
                type="button"
                $active={option.id === serviceId}
                title={option.description}
                onClick={() => onServiceId(option.id)}
              >
                <ServiceName>{option.name}</ServiceName>
                <ServiceNote>
                  {option.anonymous ? 'No account needed' : 'Uses your key'}
                </ServiceNote>
              </ServiceButton>
            ))}
          </Services>
          ) : (
            <Clean>
              No publishing service yet. Add one in Tools — here.now publishes
              a site without an account — then choose it below.
            </Clean>
          )}

          {/*
            Recognising a publisher by the shape of its operations is a good
            default and a bad gate: a tool that names its file list something
            unexpected is invisible to the heuristic, and the person looking
            at it can see perfectly well what it does. So every other tool is
            listed here to be chosen, and the choice is kept with the site.
          */}
          <Disclosure
            type="button"
            disabled={!others.length}
            aria-expanded={chooserOpen}
            onClick={() => setChooserOpen(open => !open)}
          >
            <Caret $open={chooserOpen}>▸</Caret>
            <Mono>
              {others.length
                ? `${others.length} other tool${others.length === 1 ? '' : 's'}`
                : 'No other tools'}
            </Mono>
          </Disclosure>
          {chooserOpen && others.length ? (
            <Chooser>
              {others.map(tool => (
                <ChooserRow key={tool.id}>
                  <input
                    type="checkbox"
                    id={`publish-with-${tool.id}`}
                    checked={chosenTools.includes(tool.id)}
                    onChange={event => onChooseTool(tool.id, event.currentTarget.checked)}
                  />
                  <label htmlFor={`publish-with-${tool.id}`}>
                    <ServiceName>{tool.name}</ServiceName>
                    <ServiceNote>
                      {tool.create
                        ? 'Takes a list of files'
                        : 'Use it anyway if it publishes'}
                    </ServiceNote>
                  </label>
                </ChooserRow>
              ))}
            </Chooser>
          ) : null}
        </Section>

        <Section>
          <SectionLabel>CHECK</SectionLabel>
          {errors.length ? (
            <Findings>
              {errors.map((finding, index) => (
                <Finding key={index} $error>
                  <strong>{finding.message}</strong>
                  <span>{finding.fix}</span>
                </Finding>
              ))}
            </Findings>
          ) : (
            <Clean>Nothing here will be broken once it is live.</Clean>
          )}
          {warnings.length ? (
            <Mono>
              {warnings.length} warning{warnings.length === 1 ? '' : 's'} — worth
              knowing, not blocking
            </Mono>
          ) : null}
        </Section>

        <Section>
          <SectionLabel>PREVIEW</SectionLabel>
          {verification.state === 'verified' ? (
            <Clean>{verificationBadge(verification)} — every page measured in a visible frame with its fonts loaded.</Clean>
          ) : (
            <Findings>
              {verification.reasons
                .filter(reason => !errors.some(finding => finding.message === reason))
                .map(reason => (
                  <Finding key={reason} $error={verification.state === 'failed'}>
                    <strong>{reason}</strong>
                    {verification.state === 'checking' ? (
                      <span>Build checks again first; keep PureSite visible.</span>
                    ) : null}
                  </Finding>
                ))}
              {verification.state === 'failed' &&
              verification.reasons.every(reason => errors.some(f => f.message === reason)) ? (
                <Clean>Fix the findings above — the build refuses until they are.</Clean>
              ) : null}
            </Findings>
          )}
        </Section>

        {state.result ? (
          <Section>
            <SectionLabel>BUILD</SectionLabel>
            <Summary>
              {state.result.pages} page{state.result.pages === 1 ? '' : 's'},{' '}
              {state.result.assets.length} asset
              {state.result.assets.length === 1 ? '' : 's'},{' '}
              {Math.max(1, Math.round(state.result.totalBytes / 1024))} KB
            </Summary>
            {buildPath ? <Mono>{buildPath}</Mono> : null}
            <FileList>
              {state.result.files.slice(0, 12).map(file => (
                <FileLine key={file.path}>{file.path}</FileLine>
              ))}
              {state.result.files.length > 12 ? (
                <FileLine>
                  …and {state.result.files.length - 12} more
                </FileLine>
              ) : null}
            </FileList>
            {state.result.unusedAssets.length ? (
              <Mono>
                {state.result.unusedAssets.length} file
                {state.result.unusedAssets.length === 1 ? '' : 's'} in the package
                that no page uses
              </Mono>
            ) : null}
          </Section>
        ) : null}

        {state.live ? (
          <Section>
            <SectionLabel>LIVE</SectionLabel>
            <Summary>
              {/*
                Not a plain link: the app lives in a sandboxed frame where
                `target="_blank"` goes nowhere, so the shell opens the browser.
              */}
              <LiveLink
                href={state.live.siteUrl}
                onClick={event => {
                  event.preventDefault()
                  if (state.live) onOpenUrl(state.live.siteUrl)
                }}
              >
                {state.live.siteUrl}
              </LiveLink>
            </Summary>
            <Mono>
              {state.live.uploaded} uploaded
              {state.live.skipped ? `, ${state.live.skipped} already there` : ''}
            </Mono>
            {/*
              The claim URL is returned exactly once and cannot be recovered,
              and a claim link with any part trimmed does not work — so it is
              shown whole, and never shortened.
            */}
            {state.live.claimUrl ? (
              <Claim>
                <strong>Keep this link — it is shown once.</strong>
                <ClaimUrl>{state.live.claimUrl}</ClaimUrl>
                <span>
                  It is how you claim this site. Without it the site expires in
                  24 hours and cannot be recovered.
                </span>
                <div>
                  <GhostButton
                    type="button"
                    onClick={() => {
                      const url = state.live?.claimUrl
                      if (!url) return
                      void copyToClipboard(url).then(setClaimCopied)
                    }}
                  >
                    {claimCopied ? 'Copied' : 'Copy the claim link'}
                  </GhostButton>
                </div>
              </Claim>
            ) : null}
          </Section>
        ) : null}

        <Status>{state.message}</Status>

        <Actions>
          <GhostButton type="button" onClick={onClose}>
            Close
          </GhostButton>
          <span style={{ flex: 1 }} />
          {state.phase === 'sending' ? (
            <>
              {/* Close leaves the upload running; Stop actually stops it. */}
              <GhostButton type="button" onClick={onStop}>
                Stop
              </GhostButton>
              <PrimaryButton type="button" disabled>
                {state.message || 'Publishing…'}
              </PrimaryButton>
            </>
          ) : state.phase === 'built' || state.phase === 'live' ? (
            <>
              <GhostButton type="button" onClick={onBuild}>
                Build again
              </GhostButton>
              <PrimaryButton type="button" disabled={!service} onClick={onSend}>
                {state.phase === 'live'
                  ? 'Publish again'
                  : service
                    ? `Publish to ${service.name}`
                    : 'No service'}
              </PrimaryButton>
            </>
          ) : (
            <PrimaryButton
              type="button"
              disabled={busy || hasBlockingFinding(findings) || verification.state === 'failed'}
              onClick={onBuild}
            >
              {busy
                ? state.message || 'Working…'
                : verification.state === 'checking'
                  ? 'Check and build'
                  : 'Build'}
            </PrimaryButton>
          )}
        </Actions>
      </Dialog>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.5);
`

const Dialog = styled.div`
  width: min(680px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--pure-chrome-surface);
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionLabel = styled.div`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--platform-colors-text-secondary);
`

const Findings = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Finding = styled.div<{ $error: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px;
  border-radius: 0;
  font-size: 12.5px;
  line-height: 1.45;
  background: var(--platform-colors-danger-surface, rgb(180 52 14 / 0.1));
  color: var(--platform-colors-danger, #b4340e);

  strong {
    font-weight: 600;
  }
`

const Clean = styled.div`
  font-size: 13px;
  color: var(--platform-colors-text-secondary);
`

const Summary = styled.div`
  font-size: 14px;
  font-weight: 600;
`

const FileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 0;
  background: var(--pure-chrome-well);
`

const FileLine = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
`

const Mono = styled.div`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
  word-break: break-all;
`

const Status = styled.div`
  font-size: 13px;
  color: var(--platform-colors-text-secondary);
  min-height: 20px;
`

const Services = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
`

const ServiceButton = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid
    ${props => (props.$active ? APP_ACCENT : 'var(--platform-colors-border)')};
  box-shadow: ${props => (props.$active ? `0 0 0 1px ${APP_ACCENT}` : 'none')};
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
`

const ServiceName = styled.span`
  font-size: 13px;
  font-weight: 600;
`

const ServiceNote = styled.span`
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
`

const Disclosure = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  align-self: flex-start;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`

const Caret = styled.span<{ $open: boolean }>`
  font-size: 9px;
  line-height: 1;
  color: var(--platform-colors-text-secondary);
  transform: rotate(${props => (props.$open ? '90deg' : '0deg')});
  transition: transform 120ms ease;
`

const Chooser = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
`

const ChooserRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 9px;

  label {
    display: flex;
    flex-direction: column;
    gap: 1px;
    cursor: pointer;
  }
`

const LiveLink = styled.a`
  color: var(--platform-colors-accent);
  word-break: break-all;
`

const Claim = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 11px 13px;
  border-radius: 0;
  font-size: 12.5px;
  line-height: 1.5;
  background: var(--pure-chrome-well);
  color: var(--platform-colors-text-secondary);

  strong {
    color: var(--platform-colors-text);
    font-weight: 600;
  }
`

const ClaimUrl = styled.code`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11.5px;
  color: var(--platform-colors-text);
  word-break: break-all;
  user-select: all;
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const GhostButton = styled.button`
  padding: 9px 14px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
`

const PrimaryButton = styled.button`
  padding: 10px 18px;
  border: 0;
  border-radius: 0;
  background: ${APP_ACCENT};
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
