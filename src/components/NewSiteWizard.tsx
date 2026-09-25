/**
 * Starting a site, as four questions instead of a screen.
 *
 * A new site needs a brief, its material, a shape and a look — so a fresh one
 * opens on exactly that, and nothing else. Create hands everything to drafting
 * and lands you on the board with real pages; Start empty lands you on the
 * board with the starter page. Either way the answers are stored in the
 * package: the wizard is a doorway, not a place.
 */
import { useEffect } from 'react'
import { styled } from 'styled-components'
import { ASSET_ROLES, type MaterialItem } from '../lib/material'
import { suggestedName } from '../lib/assetNames'
import { APP_ACCENT } from '../constants'
import type { AssetRole } from '../lib/assetNotes'
import type { TargetProfile } from '../lib/siteDocument'

/**
 * Where the site is going, chosen up front.
 *
 * The template, the deploy step and the environment a page can assume all
 * differ per target, so it is asked once rather than guessed at publish time.
 * Phase one ships the first; the others are named so the choice is visible
 * and the site is not silently built for the wrong one.
 */
const TARGETS: { id: TargetProfile; label: string; note: string; ready: boolean }[] = [
  {
    id: 'static-host',
    label: 'Static host',
    note: 'Pages and assets, uploaded. Netlify, Cloudflare Pages.',
    ready: true,
  },
  {
    id: 'vps-git',
    label: 'Your own server',
    note: 'Push to a box you own. Not in this version.',
    ready: false,
  },
  {
    id: 'container',
    label: 'Container',
    note: 'An image you deploy. Not in this version.',
    ready: false,
  },
]

const LOOKS = [
  { id: 'auto', label: 'Auto', note: 'Read off the files you attach' },
  { id: 'plain', label: 'Plain', note: 'Black on white, one column' },
  { id: 'editorial', label: 'Editorial', note: 'Serif, generous measure' },
  { id: 'studio', label: 'Studio', note: 'Dark, one accent' },
]

interface NewSiteWizardProps {
  open: boolean
  brief: string
  onBrief: (brief: string) => void
  /** Name a file so it can be spoken about later, rather than pathed. */
  onRenameFile: (file: string, called: string) => void
  target: TargetProfile
  onTarget: (target: TargetProfile) => void
  look: string
  onLook: (look: string) => void
  material: MaterialItem[]
  previews: Record<string, string>
  onAddFiles: () => void
  onSetRole: (name: string, role: AssetRole) => void
  busy: boolean
  busyLabel: string
  onCreate: () => void
  onSkip: () => void
  onCancel: () => void
}

export function NewSiteWizard({
  open,
  brief,
  onBrief,

  target,
  onTarget,
  look,
  onLook,
  material,
  previews,
  onAddFiles,
  onSetRole,
  onRenameFile,
  busy,
  busyLabel,
  onCreate,
  onSkip,
  onCancel,
}: NewSiteWizardProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) return
    // Escape is the cancel gesture, not the start-empty one: someone reaching
    // for the keyboard to dismiss a dialog wants out, not a new empty site.
    // It stays live during drafting, because a request that will not finish
    // is exactly when a way out matters.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <Scrim>
      <Dialog>
        <Title>New site</Title>

        <Field>
          <Label htmlFor="wizard-brief">What is it for?</Label>
          <Brief
            id="wizard-brief"
            value={brief}
            autoFocus
            placeholder="Who is it for, and what should they do?"
            onChange={event => onBrief(event.currentTarget.value)}
          />
        </Field>

        <Field>
          <Label>Files</Label>
          {material.length ? (
            <Files>
              {material.map(item => (
                <FileChip key={item.name}>
                  {previews[item.name] ? (
                    <FileThumb src={previews[item.name]} alt="" />
                  ) : (
                    <FileKind>{item.kind}</FileKind>
                  )}
                  <CalledInput
                    value={item.alias ?? ''}
                    placeholder={suggestedName(item.name)}
                    aria-label={`What ${item.name} is called`}
                    onChange={event => onRenameFile(item.name, event.currentTarget.value)}
                  />
                  <FileName title={item.name}>{item.name}</FileName>
                  <RoleSelect
                    value={item.role ?? 'content'}
                    aria-label={`What ${item.name} is for`}
                    $set={(item.role ?? 'content') !== 'content'}
                    onChange={event =>
                      onSetRole(item.name, event.currentTarget.value as AssetRole)
                    }
                  >
                    {ASSET_ROLES.map(role => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </RoleSelect>
                </FileChip>
              ))}
            </Files>
          ) : (
            <Hint>
              A logo, photographs, a page whose look you like. Each one gets a
              short name here — logo, hero — and that is what you write later,
              never a file path.
            </Hint>
          )}
          <div>
            <GhostButton type="button" disabled={busy} onClick={onAddFiles}>
              Add files…
            </GhostButton>
          </div>
        </Field>

        <TwoUp>
          <Field>
            <Label>Where it goes</Label>
            <Targets>
              {TARGETS.map(option => (
                <TargetButton
                  key={option.id}
                  type="button"
                  title={option.note}
                  disabled={!option.ready}
                  $active={target === option.id}
                  onClick={() => onTarget(option.id)}
                >
                  <LookName>{option.label}</LookName>
                  <LookNote>{option.note}</LookNote>
                </TargetButton>
              ))}
            </Targets>
          </Field>
        </TwoUp>

        <Field>
          <Label>Look</Label>
          <Looks>
            {LOOKS.map(option => (
              <LookButton
                key={option.id}
                type="button"
                title={option.note}
                $active={look === option.id}
                onClick={() => onLook(option.id)}
              >
                <LookName>{option.label}</LookName>
                <LookNote>{option.note}</LookNote>
              </LookButton>
            ))}
          </Looks>
          <Hint>
            A file marked <em>design reference</em> always wins — the site is
            drawn to match it.
          </Hint>
        </Field>

        <Actions>
          <GhostButton type="button" onClick={onCancel}>
            Cancel
          </GhostButton>
          <GhostButton type="button" disabled={busy} onClick={onSkip}>
            Start empty
          </GhostButton>
          <span style={{ flex: 1 }} />
          <PrimaryButton
            type="button"
            disabled={busy || (!brief.trim() && !material.length)}
            onClick={onCreate}
          >
            {busy ? busyLabel : 'Create'}
          </PrimaryButton>
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
  /* Wide enough that the material reads as material — thumbnails big enough
     to recognise, and a role next to each one — rather than a row of stamps. */
  width: min(760px, calc(100vw - 48px));
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

const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
`

const Label = styled.label`
  font-size: 13px;
  color: var(--platform-colors-text-secondary);
`

const Brief = styled.textarea`
  min-height: 96px;
  resize: vertical;
  padding: 11px 13px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 14px;
`

const Input = styled.input`
  padding: 9px 12px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 14px;
`

const TwoUp = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 16px;
`

const Files = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
`

const FileChip = styled.div`
  flex: none;
  width: 132px;
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const FileThumb = styled.img`
  width: 132px;
  height: 78px;
  object-fit: contain;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--pure-chrome-well);
`

const FileKind = styled.span`
  width: 132px;
  height: 78px;
  display: grid;
  place-items: center;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
`

/**
 * A role that is not the default is worth seeing at a glance — a reference
 * left set by mistake is otherwise invisible until it changes the whole look.
 */
const RoleSelect = styled.select<{ $set: boolean }>`
  width: 100%;
  padding: 4px 6px;
  border: 1px solid
    ${props =>
      props.$set ? 'var(--platform-colors-accent)' : 'var(--platform-colors-border)'};
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: ${props =>
    props.$set ? 'var(--platform-colors-accent)' : 'var(--platform-colors-text-secondary)'};
  font: inherit;
  font-size: 11px;
`

const CalledInput = styled.input`
  width: 88px;
  font: inherit;
  font-size: var(--platform-typography-font-size-xs);
  font-weight: var(--platform-typography-font-weight-bold);
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid var(--platform-colors-border);
  background: var(--pure-chrome-well);
  color: inherit;
`
const FileName = styled.span`
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Looks = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
`

const Targets = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
`

const LookButton = styled.button<{ $active: boolean }>`
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

const TargetButton = styled(LookButton)`
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

const LookName = styled.span`
  font-size: 13px;
  font-weight: 600;
`

const LookNote = styled.span`
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
`

const Hint = styled.span`
  font-size: 12px;
  color: var(--platform-colors-text-secondary);
  line-height: 1.5;
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

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
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
