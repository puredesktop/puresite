/**
 * Visual Section Picker Modal for PureSite.
 *
 * Lets anyone browse the 10 Swiss-editorial responsive sections by category or
 * keyword, preview each layout's wireframe structure, and insert it cleanly
 * into the active page via PureSite's single-door pipeline.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { styled } from 'styled-components'
import {
  SECTION_CATEGORIES,
  SECTION_LIBRARY,
  type SectionCategory,
  type SectionTemplate,
} from '../lib/sectionLibrary'
import { primaryLook, quiet } from '../ui/look'

export function SectionPickerModal({
  open,
  pageName,
  onInsert,
  onClose,
}: {
  open: boolean
  pageName: string
  onInsert: (sectionId: string) => void
  onClose: () => void
}): React.ReactElement | null {
  const [category, setCategory] = useState<'All' | SectionCategory>('All')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SECTION_LIBRARY.filter(section => {
      if (category !== 'All' && section.category !== category) return false
      if (!q) return true
      return `${section.name} ${section.category} ${section.summary}`.toLowerCase().includes(q)
    })
  }, [category, query])

  if (!open) return null

  return (
    <Scrim onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <Dialog role="dialog" aria-modal="true" aria-label="Insert section" data-site-overlay="">
        <Header>
          <div>
            <Kicker>SECTION LIBRARY · {pageName}</Kicker>
            <Title>Insert a responsive section</Title>
          </div>
          <CloseBtn type="button" onClick={onClose}>Close</CloseBtn>
        </Header>

        <Controls>
          <SearchInput
            ref={searchRef}
            value={query}
            placeholder="Filter sections (hero, pricing, FAQ, contact form…)"
            aria-label="Filter sections"
            onChange={e => setQuery(e.currentTarget.value)}
          />
          <CategoryBar role="tablist" aria-label="Section categories">
            {(['All', ...SECTION_CATEGORIES] as const).map(cat => (
              <CatTab
                key={cat}
                type="button"
                role="tab"
                aria-selected={category === cat}
                $active={category === cat}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </CatTab>
            ))}
          </CategoryBar>
        </Controls>

        <Grid>
          {filtered.map(section => (
            <Card key={section.id}>
              <WireframeBox aria-hidden="true">
                <Wireframe kind={section.wireframe} />
              </WireframeBox>
              <CardBody>
                <CardHead>
                  <CardName>{section.name}</CardName>
                  <CatBadge>{section.category}</CatBadge>
                </CardHead>
                <CardSummary>{section.summary}</CardSummary>
                <CardFooter>
                  <InsertBtn
                    type="button"
                    onClick={() => {
                      onInsert(section.id)
                      onClose()
                    }}
                  >
                    Insert section
                  </InsertBtn>
                </CardFooter>
              </CardBody>
            </Card>
          ))}
          {!filtered.length ? (
            <Empty>No sections match “{query}”.</Empty>
          ) : null}
        </Grid>
      </Dialog>
    </Scrim>
  )
}

function Wireframe({ kind }: { kind: SectionTemplate['wireframe'] }): React.ReactElement {
  switch (kind) {
    case 'hero':
      return (
        <WfStack>
          <WfAccentBar style={{ width: '28%' }} />
          <WfBar style={{ width: '78%', height: 10 }} />
          <WfBar style={{ width: '64%', height: 6, opacity: 0.45 }} />
          <WfRow>
            <WfAccentBar style={{ width: 44, height: 12 }} />
            <WfBlock style={{ width: 40, height: 12 }} />
          </WfRow>
        </WfStack>
      )
    case 'split':
      return (
        <WfCols $cols={2}>
          <WfStack>
            <WfAccentBar style={{ width: '40%' }} />
            <WfBar style={{ width: '90%', height: 8 }} />
            <WfBar style={{ width: '80%', height: 5, opacity: 0.45 }} />
          </WfStack>
          <WfBlock style={{ height: 48 }} />
        </WfCols>
      )
    case 'grid-3':
      return (
        <WfCols $cols={3}>
          <WfBlock style={{ height: 46 }} />
          <WfBlock style={{ height: 46 }} />
          <WfBlock style={{ height: 46 }} />
        </WfCols>
      )
    case 'metrics':
      return (
        <WfCols $cols={4}>
          {[0, 1, 2, 3].map(i => (
            <WfStack key={i}>
              <WfBar style={{ width: '85%', height: 12 }} />
              <WfBar style={{ width: '70%', height: 4, opacity: 0.45 }} />
            </WfStack>
          ))}
        </WfCols>
      )
    case 'pricing':
      return (
        <WfCols $cols={3}>
          <WfBlock style={{ height: 48 }} />
          <WfBlock style={{ height: 48, borderColor: 'var(--p-text, #b3546c)' }} />
          <WfBlock style={{ height: 48 }} />
        </WfCols>
      )
    case 'quotes':
      return (
        <WfCols $cols={3}>
          {[0, 1, 2].map(i => (
            <WfBlock
              key={i}
              style={{ height: 44, borderLeft: '2px solid var(--p-text, #b3546c)' }}
            />
          ))}
        </WfCols>
      )
    case 'faq':
      return (
        <WfStack>
          <WfBar style={{ width: '100%', height: 9, opacity: 0.7 }} />
          <WfBar style={{ width: '100%', height: 9, opacity: 0.45 }} />
          <WfBar style={{ width: '100%', height: 9, opacity: 0.45 }} />
        </WfStack>
      )
    case 'form':
      return (
        <WfStack>
          <WfBlock style={{ height: 11, width: '75%' }} />
          <WfBlock style={{ height: 11, width: '75%' }} />
          <WfBlock style={{ height: 16, width: '75%' }} />
          <WfAccentBar style={{ width: 42, height: 10 }} />
        </WfStack>
      )
    case 'cta':
      return (
        <WfBlock style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
          <WfBar style={{ width: '55%', height: 8 }} />
          <WfAccentBar style={{ width: 38, height: 12 }} />
        </WfBlock>
      )
    case 'footer':
      return (
        <WfStack>
          <WfCols $cols={3}>
            <WfBar style={{ width: '80%', height: 6 }} />
            <WfBar style={{ width: '70%', height: 6 }} />
            <WfBar style={{ width: '70%', height: 6 }} />
          </WfCols>
          <WfBar style={{ width: '100%', height: 2, opacity: 0.35, marginTop: 10 }} />
          <WfBar style={{ width: '45%', height: 5, opacity: 0.45 }} />
        </WfStack>
      )
  }
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: var(--platform-z-index-zi-app-modal, 50);
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.48);
  padding: 20px;
`

const Dialog = styled.section`
  width: min(860px, 100%);
  max-height: min(84vh, 760px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  color: var(--n-ink, #14171a);
  overflow: hidden;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
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
  font-size: 16px;
  font-weight: 700;
`

const CloseBtn = styled.button`
  ${quiet}
`

const Controls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--n-fence, #e2e5e8);
`

const SearchInput = styled.input`
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  color: var(--n-ink, #14171a);
  font: inherit;
  font-size: 13px;
`

const CategoryBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`

const CatTab = styled.button<{ $active: boolean }>`
  height: 26px;
  padding: 0 10px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--p-text, #b3546c)' : 'var(--n-line, #c8ccd2)')};
  border-radius: 3px;
  background: ${({ $active }) => ($active ? 'var(--p-chosen, #f6e7eb)' : 'var(--n-sheet, #ffffff)')};
  color: var(--n-ink, #14171a);
  font: inherit;
  font-size: 12px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
`

const Grid = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
`

const Card = styled.article`
  display: flex;
  flex-direction: column;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  overflow: hidden;
`

const WireframeBox = styled.div`
  height: 78px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--n-fence, #e2e5e8);
  background: var(--n-panel, #f6f7f8);
  display: flex;
  flex-direction: column;
  justify-content: center;
`

const WfStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
`

const WfRow = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 2px;
`

const WfCols = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, minmax(0, 1fr));
  gap: 6px;
  width: 100%;
`

const WfBar = styled.div`
  border-radius: 2px;
  background: var(--n-strong, #8d939b);
`

const WfAccentBar = styled.div`
  height: 4px;
  border-radius: 2px;
  background: var(--p-text, #b3546c);
`

const WfBlock = styled.div`
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 2px;
  background: var(--n-sheet, #ffffff);
`

const CardBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
`

const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
`

const CardName = styled.h3`
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
`

const CatBadge = styled.span`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--n-faint, #666c75);
  white-space: nowrap;
`

const CardSummary = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--n-soft, #474c54);
  flex: 1;
`

const CardFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
`

const InsertBtn = styled.button`
  ${quiet}
  ${primaryLook}
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
`

const Empty = styled.div`
  grid-column: 1 / -1;
  padding: 32px;
  text-align: center;
  color: var(--n-faint, #666c75);
  font-size: 13px;
`
