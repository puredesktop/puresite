/**
 * Rich Visual Element Inspector for PureSite's right rail.
 *
 * When any element is picked in `PageFrame`, shows:
 * - DOM breadcrumb & tag badge
 * - Structural controls: Move Up, Move Down, Duplicate, Delete
 * - Inline text editor (for leaf elements)
 * - Image source picker & inline `alt` editor (for `<img>`)
 * - Inline `href` + "Open in new tab" toggle (for `<a>` or linked elements)
 * - Alignment (`Left`, `Center`, `Right`) & spacing (`Tight`, `Normal`, `Loose`) pills
 *
 * Every mutation routes through PureSite's single-door `pages.ts` helpers.
 */
import { useEffect, useMemo, useState } from 'react'
import { styled } from 'styled-components'
import type { SiteSelection } from '../agents/catalog'
import type { MaterialItem } from '../lib/material'
import {
  isSafeUrlScheme,
  readElement,
  type ElementAlign,
  type ElementSpacing,
} from '../lib/pages'
import { quiet } from '../ui/look'

export function ElementQuickControls({
  html,
  picked,
  material,
  onText,
  onSrc,
  onMove,
  onDuplicate,
  onDelete,
  onSetLink,
  onSetAlt,
  onSetLayout,
  onClear,
}: {
  html: string
  picked: SiteSelection
  material: MaterialItem[]
  onText: (text: string) => void
  onSrc: (src: string) => void
  onMove?: (direction: 'up' | 'down') => void
  onDuplicate?: () => void
  onDelete?: () => void
  onSetLink?: (input: { href: string; newTab?: boolean }) => void
  onSetAlt?: (alt: string) => void
  onSetLayout?: (patch: { align?: ElementAlign; spacing?: ElementSpacing }) => void
  onClear: () => void
}): React.ReactElement {
  const info = useMemo(() => readElement(html, picked.path), [html, picked.path])
  const [textDraft, setTextDraft] = useState(info?.text ?? '')
  const [hrefDraft, setHrefDraft] = useState(info?.href ?? '')
  const [newTabDraft, setNewTabDraft] = useState(info?.newTab ?? false)
  const [altDraft, setAltDraft] = useState(info?.alt ?? '')
  const [hrefError, setHrefError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setTextDraft(info?.text ?? '')
    setHrefDraft(info?.href ?? '')
    setNewTabDraft(info?.newTab ?? false)
    setAltDraft(info?.alt ?? '')
    setHrefError(null)
    setConfirmDelete(false)
  }, [picked.path, info?.text, info?.href, info?.newTab, info?.alt])

  const images = material.filter(item => item.kind === 'image' && item.role !== 'reference')

  if (!info) {
    return <Hint>That element is gone — pick another.</Hint>
  }

  const canPlaceImage = info.isImage || (info.editableText && !info.text.trim())

  const commitText = (): void => {
    if (textDraft !== info.text) onText(textDraft)
  }

  const commitAlt = (): void => {
    if (onSetAlt && altDraft !== info.alt) onSetAlt(altDraft)
  }

  const commitLink = (nextNewTab = newTabDraft): void => {
    if (!onSetLink) return
    const trimmed = hrefDraft.trim()
    if (trimmed && !isSafeUrlScheme(trimmed)) {
      setHrefError('Use a relative page path, #anchor, or https:// / mailto: URL.')
      return
    }
    setHrefError(null)
    if (trimmed !== info.href || nextNewTab !== info.newTab) {
      onSetLink({ href: trimmed, newTab: nextNewTab })
    }
  }

  return (
    <Root data-element-inspector="">
      <BreadcrumbRow>
        <TagBadge>&lt;{info.tagName}&gt;</TagBadge>
        <Breadcrumb title={info.breadcrumb.join(' › ')}>
          {info.breadcrumb.slice(-3).join(' › ')}
        </Breadcrumb>
      </BreadcrumbRow>

      {(onMove || onDuplicate || onDelete) ? (
        <ActionGrid>
          {onMove ? (
            <>
              <SmallBtn
                type="button"
                disabled={!info.canMoveUp}
                title="Move element before previous sibling"
                onClick={() => onMove('up')}
              >
                ↑ Up
              </SmallBtn>
              <SmallBtn
                type="button"
                disabled={!info.canMoveDown}
                title="Move element after next sibling"
                onClick={() => onMove('down')}
              >
                ↓ Down
              </SmallBtn>
            </>
          ) : null}
          {onDuplicate ? (
            <SmallBtn
              type="button"
              disabled={!info.canDuplicate}
              title="Duplicate this element"
              onClick={onDuplicate}
            >
              Duplicate
            </SmallBtn>
          ) : null}
          {onDelete ? (
            confirmDelete ? (
              <DangerBtn
                type="button"
                onClick={() => {
                  setConfirmDelete(false)
                  onDelete()
                }}
              >
                Confirm
              </DangerBtn>
            ) : (
              <DangerBtn
                type="button"
                disabled={!info.canDelete}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </DangerBtn>
            )
          ) : null}
        </ActionGrid>
      ) : null}

      {confirmDelete ? (
        <InlineRow>
          <Hint>Remove &lt;{info.tagName}&gt;?</Hint>
          <SmallBtn type="button" onClick={() => setConfirmDelete(false)}>Cancel</SmallBtn>
        </InlineRow>
      ) : null}

      {info.editableText ? (
        <Field>
          <FieldLabel htmlFor="el-text-input">Text</FieldLabel>
          <TextInput
            id="el-text-input"
            value={textDraft}
            aria-label="Element text"
            onChange={e => setTextDraft(e.currentTarget.value)}
            onBlur={commitText}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
        </Field>
      ) : null}

      {canPlaceImage ? (
        <Field>
          <FieldLabel htmlFor="el-image-select">Image asset</FieldLabel>
          <Select
            id="el-image-select"
            value=""
            aria-label="Put an image here"
            onChange={e => {
              if (e.currentTarget.value) onSrc(e.currentTarget.value)
            }}
          >
            <option value="">{info.isImage ? 'Replace image…' : 'Put an image here…'}</option>
            {images.map(item => (
              <option key={item.name} value={item.reference}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {info.isImage && onSetAlt ? (
        <Field>
          <FieldLabel htmlFor="el-alt-input">Alt text (accessibility)</FieldLabel>
          <TextInput
            id="el-alt-input"
            value={altDraft}
            placeholder="Describe what this image shows"
            aria-label="Image alt text"
            onChange={e => setAltDraft(e.currentTarget.value)}
            onBlur={commitAlt}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
        </Field>
      ) : null}

      {onSetLink && (info.isLink || info.editableText) ? (
        <Field>
          <FieldLabel htmlFor="el-href-input">
            {info.isLink ? 'Link destination (href)' : 'Make into link (href)'}
          </FieldLabel>
          <TextInput
            id="el-href-input"
            value={hrefDraft}
            placeholder="about.html or https://…"
            aria-label="Link href"
            onChange={e => {
              setHrefDraft(e.currentTarget.value)
              if (hrefError) setHrefError(null)
            }}
            onBlur={() => commitLink()}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
          {hrefError ? <ErrorNote role="alert">{hrefError}</ErrorNote> : null}
          {info.isLink || hrefDraft.trim() ? (
            <CheckRow>
              <input
                type="checkbox"
                checked={newTabDraft}
                onChange={e => {
                  const checked = e.currentTarget.checked
                  setNewTabDraft(checked)
                  commitLink(checked)
                }}
              />
              <span>Open in new tab</span>
            </CheckRow>
          ) : null}
        </Field>
      ) : null}

      {onSetLayout ? (
        <>
          <Field>
            <FieldLabel>Text alignment</FieldLabel>
            <PillGroup role="group" aria-label="Text alignment">
              {(['left', 'center', 'right'] as const).map(option => (
                <Pill
                  key={option}
                  type="button"
                  aria-pressed={info.align === option}
                  $active={info.align === option}
                  onClick={() =>
                    onSetLayout({ align: info.align === option ? '' : option })
                  }
                >
                  {option[0]!.toUpperCase() + option.slice(1)}
                </Pill>
              ))}
            </PillGroup>
          </Field>

          <Field>
            <FieldLabel>Vertical spacing</FieldLabel>
            <PillGroup role="group" aria-label="Vertical spacing">
              {(['tight', 'normal', 'loose'] as const).map(option => (
                <Pill
                  key={option}
                  type="button"
                  aria-pressed={info.spacing === option}
                  $active={info.spacing === option}
                  onClick={() =>
                    onSetLayout({ spacing: info.spacing === option ? '' : option })
                  }
                >
                  {option[0]!.toUpperCase() + option.slice(1)}
                </Pill>
              ))}
            </PillGroup>
          </Field>
        </>
      ) : null}

      <SmallBtn type="button" onClick={onClear}>
        Clear selection
      </SmallBtn>
    </Root>
  )
}

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const BreadcrumbRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`

const TagBadge = styled.span`
  flex: none;
  padding: 2px 6px;
  border: 1px solid var(--p-text, #b3546c);
  border-radius: 3px;
  background: var(--p-chosen, #f6e7eb);
  color: var(--n-ink, #14171a);
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  font-weight: 600;
`

const Breadcrumb = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10.5px;
  color: var(--n-faint, #666c75);
`

const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
`

const InlineRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
`

const SmallBtn = styled.button`
  ${quiet}
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 500;
`

const DangerBtn = styled(SmallBtn)`
  color: var(--p-failed-text, #b4340e);
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const FieldLabel = styled.label`
  font-size: 11px;
  font-weight: 600;
  color: var(--n-soft, #474c54);
`

const TextInput = styled.input`
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  color: var(--n-ink, #14171a);
  font: inherit;
  font-size: 12px;
`

const Select = styled.select`
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  color: var(--n-ink, #14171a);
  font: inherit;
  font-size: 12px;
`

const CheckRow = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-soft, #474c54);
  cursor: pointer;
`

const PillGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
`

const Pill = styled.button<{ $active: boolean }>`
  height: 25px;
  padding: 0 6px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--p-text, #b3546c)' : 'var(--n-line, #c8ccd2)')};
  border-radius: 3px;
  background: ${({ $active }) => ($active ? 'var(--p-chosen, #f6e7eb)' : 'var(--n-sheet, #ffffff)')};
  color: var(--n-ink, #14171a);
  font: inherit;
  font-size: 11.5px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
`

const Hint = styled.span`
  font-size: 12px;
  color: var(--n-soft, #474c54);
`

const ErrorNote = styled.span`
  font-size: 11px;
  color: var(--p-failed-text, #b4340e);
`
