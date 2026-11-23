/**
 * Interactive Design Tokens & Brand Studio Drawer for PureSite.
 *
 * Reads and updates the managed `/* studio-tokens:start *\/` block in
 * `styles/site.css` with live WCAG 2.1 contrast badges, all 10 bundled WOFF2
 * font families, measure/radius/rhythm sliders, and 5 curated 1-click presets.
 */
import { useEffect, useMemo, useState } from 'react'
import { styled } from 'styled-components'
import { SITE_FONT_FAMILIES } from '../fonts/siteFontRegistry'
import {
  contrastRatio,
  DESIGN_PRESETS,
  readDesignTokens,
  wcagGrade,
  type DesignTokens,
  type WcagGrade,
} from '../lib/designTokens'
import { primaryLook, quiet } from '../ui/look'

const DISPLAY_FONTS = SITE_FONT_FAMILIES.filter(f => f.generic !== 'monospace')
const BODY_FONTS = SITE_FONT_FAMILIES.filter(f => f.generic !== 'monospace')
const MONO_FONTS = SITE_FONT_FAMILIES.filter(f => f.generic === 'monospace')

export function DesignStudioDrawer({
  open,
  styles,
  onApply,
  onClose,
}: {
  open: boolean
  styles: string
  onApply: (tokens: DesignTokens) => void
  onClose: () => void
}): React.ReactElement | null {
  const current = useMemo(() => readDesignTokens(styles), [styles])
  const [draft, setDraft] = useState<DesignTokens>(current)

  useEffect(() => {
    setDraft(current)
  }, [current, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const update = (patch: Partial<DesignTokens>, commitNow = true): void => {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (commitNow) onApply(next)
  }

  const bodyRatio = contrastRatio(draft.ink, draft.ground)
  const bodyGrade = wcagGrade(bodyRatio)
  const mutedRatio = contrastRatio(draft.inkSoft, draft.ground)
  const mutedGrade = wcagGrade(mutedRatio)
  const surfaceRatio = contrastRatio(draft.ink, draft.surface)
  const surfaceGrade = wcagGrade(surfaceRatio)

  const colorFields: Array<{
    key: 'ground' | 'surface' | 'ink' | 'inkSoft' | 'accent'
    label: string
  }> = [
    { key: 'ground', label: 'Background' },
    { key: 'surface', label: 'Surface' },
    { key: 'ink', label: 'Ink' },
    { key: 'inkSoft', label: 'Muted ink' },
    { key: 'accent', label: 'Accent' },
  ]

  return (
    <Scrim onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <Drawer role="dialog" aria-modal="true" aria-label="Design studio" data-site-overlay="">
        <Header>
          <div>
            <Kicker>DESIGN STUDIO · STYLES/SITE.CSS</Kicker>
            <Title>Design Tokens &amp; Typography</Title>
          </div>
          <Btn type="button" onClick={onClose}>Done</Btn>
        </Header>

        <Body>
          <Section>
            <SectionTitle>1-CLICK PRESETS</SectionTitle>
            <PresetGrid>
              {DESIGN_PRESETS.map(preset => {
                const active =
                  preset.tokens.ground === draft.ground &&
                  preset.tokens.ink === draft.ink &&
                  preset.tokens.accent === draft.accent &&
                  preset.tokens.displayFont === draft.displayFont
                return (
                  <PresetCard
                    key={preset.id}
                    type="button"
                    $active={active}
                    onClick={() => update(preset.tokens, true)}
                  >
                    <SwatchRow aria-hidden="true">
                      <SwatchDot style={{ background: preset.tokens.ground }} />
                      <SwatchDot style={{ background: preset.tokens.surface }} />
                      <SwatchDot style={{ background: preset.tokens.ink }} />
                      <SwatchDot style={{ background: preset.tokens.accent }} />
                    </SwatchRow>
                    <PresetName>{preset.name}</PresetName>
                    <PresetNote>{preset.tokens.displayFont} / {preset.tokens.bodyFont}</PresetNote>
                  </PresetCard>
                )
              })}
            </PresetGrid>
          </Section>

          <Section>
            <SectionTitle>COLOUR PALETTE &amp; LIVE WCAG 2.1 CONTRAST</SectionTitle>
            <ColorGrid>
              {colorFields.map(({ key, label }) => (
                <ColorCell key={key}>
                  <Label htmlFor={`token-${key}`}>{label}</Label>
                  <ColorInputRow>
                    <ColorWell
                      type="color"
                      aria-label={`${label} colour swatch`}
                      value={draft[key]}
                      onChange={e => update({ [key]: e.currentTarget.value }, true)}
                    />
                    <HexInput
                      id={`token-${key}`}
                      value={draft[key]}
                      aria-label={`${label} hex`}
                      onChange={e => {
                        const val = e.currentTarget.value
                        setDraft(prev => ({ ...prev, [key]: val }))
                        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val.trim())) {
                          onApply({ ...draft, [key]: val.trim() })
                        }
                      }}
                    />
                  </ColorInputRow>
                </ColorCell>
              ))}
            </ColorGrid>

            <ContrastBar aria-label="WCAG 2.1 contrast check">
              <ContrastItem>
                <span>Ink / Ground</span>
                <strong>{bodyRatio.toFixed(1)}:1</strong>
                <GradePill $grade={bodyGrade}>{bodyGrade}</GradePill>
              </ContrastItem>
              <ContrastItem>
                <span>Muted / Ground</span>
                <strong>{mutedRatio.toFixed(1)}:1</strong>
                <GradePill $grade={mutedGrade}>{mutedGrade}</GradePill>
              </ContrastItem>
              <ContrastItem>
                <span>Ink / Surface</span>
                <strong>{surfaceRatio.toFixed(1)}:1</strong>
                <GradePill $grade={surfaceGrade}>{surfaceGrade}</GradePill>
              </ContrastItem>
            </ContrastBar>
          </Section>

          <Section>
            <SectionTitle>SELF-HOSTED WOFF2 TYPOGRAPHY (10 BUNDLED FAMILIES)</SectionTitle>
            <FontGrid>
              <Field>
                <Label htmlFor="font-display">Display &amp; headings</Label>
                <Select
                  id="font-display"
                  value={draft.displayFont}
                  onChange={e => update({ displayFont: e.currentTarget.value }, true)}
                >
                  {DISPLAY_FONTS.map(f => (
                    <option key={f.family} value={f.family}>
                      {f.family} ({f.generic})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="font-body">Body copy</Label>
                <Select
                  id="font-body"
                  value={draft.bodyFont}
                  onChange={e => update({ bodyFont: e.currentTarget.value }, true)}
                >
                  {BODY_FONTS.map(f => (
                    <option key={f.family} value={f.family}>
                      {f.family} ({f.generic})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="font-mono">Monospace &amp; labels</Label>
                <Select
                  id="font-mono"
                  value={draft.monoFont}
                  onChange={e => update({ monoFont: e.currentTarget.value }, true)}
                >
                  {MONO_FONTS.map(f => (
                    <option key={f.family} value={f.family}>
                      {f.family}
                    </option>
                  ))}
                </Select>
              </Field>
            </FontGrid>
          </Section>

          <Section>
            <SectionTitle>LAYOUT MEASURE, CORNERS &amp; VERTICAL RHYTHM</SectionTitle>
            <SliderList>
              <SliderRow>
                <SliderHead>
                  <Label htmlFor="slider-measure">Content max-width (measure)</Label>
                  <MonoVal>{draft.measureCh}ch</MonoVal>
                </SliderHead>
                <Range
                  id="slider-measure"
                  type="range"
                  min={48}
                  max={84}
                  step={2}
                  value={draft.measureCh}
                  onChange={e => update({ measureCh: Number(e.currentTarget.value) }, true)}
                />
              </SliderRow>

              <SliderRow>
                <SliderHead>
                  <Label htmlFor="slider-radius">Corner radius</Label>
                  <MonoVal>{draft.radiusPx}px</MonoVal>
                </SliderHead>
                <Range
                  id="slider-radius"
                  type="range"
                  min={0}
                  max={16}
                  step={1}
                  value={draft.radiusPx}
                  onChange={e => update({ radiusPx: Number(e.currentTarget.value) }, true)}
                />
              </SliderRow>

              <SliderRow>
                <SliderHead>
                  <Label htmlFor="slider-rhythm">Vertical rhythm scale</Label>
                  <MonoVal>{draft.rhythmScale.toFixed(2)}×</MonoVal>
                </SliderHead>
                <Range
                  id="slider-rhythm"
                  type="range"
                  min={0.75}
                  max={1.4}
                  step={0.05}
                  value={draft.rhythmScale}
                  onChange={e => update({ rhythmScale: Number(e.currentTarget.value) }, true)}
                />
              </SliderRow>
            </SliderList>
          </Section>
        </Body>

        <Footer>
          <FootNote>Writes managed /* studio-tokens:start */ variables cleanly to styles/site.css.</FootNote>
          <PrimaryBtn type="button" onClick={onClose}>Close studio</PrimaryBtn>
        </Footer>
      </Drawer>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: var(--platform-z-index-zi-app-modal, 50);
  display: flex;
  justify-content: flex-end;
  background: rgb(12 12 14 / 0.36);
`

const Drawer = styled.section`
  width: min(460px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--n-line, #c8ccd2);
  background: var(--n-sheet, #ffffff);
  color: var(--n-ink, #14171a);
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--n-line, #c8ccd2);
  background: var(--n-panel, #f6f7f8);
`

const Kicker = styled.div`
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--n-faint, #666c75);
  font-weight: 600;
`

const Title = styled.h2`
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 700;
`

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const SectionTitle = styled.div`
  font-size: 10.5px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--n-faint, #666c75);
  font-weight: 700;
`

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`

const PresetCard = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--p-text, #b3546c)' : 'var(--n-line, #c8ccd2)')};
  border-radius: 3px;
  background: ${({ $active }) => ($active ? 'var(--p-chosen, #f6e7eb)' : 'var(--n-sheet, #ffffff)')};
  color: var(--n-ink, #14171a);
  text-align: left;
  cursor: pointer;
  font: inherit;
`

const SwatchRow = styled.div`
  display: flex;
  gap: 4px;
`

const SwatchDot = styled.span`
  width: 14px;
  height: 14px;
  border: 1px solid rgb(0 0 0 / 0.18);
  border-radius: 2px;
`

const PresetName = styled.span`
  font-size: 12.5px;
  font-weight: 600;
`

const PresetNote = styled.span`
  font-size: 10.5px;
  color: var(--n-faint, #666c75);
`

const ColorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`

const ColorCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const ColorInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const ColorWell = styled.input`
  width: 30px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  cursor: pointer;
`

const HexInput = styled.input`
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  color: var(--n-ink, #14171a);
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 12px;
`

const ContrastBar = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--n-fence, #e2e5e8);
  border-radius: 3px;
  background: var(--n-panel, #f6f7f8);
`

const ContrastItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--n-soft, #474c54);
  strong {
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--n-ink, #14171a);
  }
`

const GradePill = styled.span<{ $grade: WcagGrade }>`
  align-self: flex-start;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: ${({ $grade }) =>
    $grade === 'Fail'
      ? 'var(--p-failed-text, #b4340e)'
      : $grade === 'AAA'
        ? 'var(--p-done-text, #166534)'
        : 'var(--p-working-text, #1d4ed8)'};
  color: #ffffff;
`

const FontGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const Label = styled.label`
  font-size: 11.5px;
  font-weight: 600;
  color: var(--n-soft, #474c54);
`

const Select = styled.select`
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  color: var(--n-ink, #14171a);
  font: inherit;
  font-size: 12.5px;
`

const SliderList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const SliderRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const SliderHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const MonoVal = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11.5px;
  color: var(--n-ink, #14171a);
  font-variant-numeric: tabular-nums;
`

const Range = styled.input`
  width: 100%;
  accent-color: var(--p-text, #b3546c);
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--n-line, #c8ccd2);
  background: var(--n-panel, #f6f7f8);
`

const FootNote = styled.span`
  font-size: 11px;
  color: var(--n-faint, #666c75);
`

const Btn = styled.button`
  ${quiet}
`

const PrimaryBtn = styled.button`
  ${quiet}
  ${primaryLook}
`
