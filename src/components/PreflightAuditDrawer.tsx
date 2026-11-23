/**
 * Unified Live Pre-Flight Auditor Drawer for PureSite.
 *
 * Combines SEO & Meta + Live Google Search & OpenGraph Social Card previews,
 * Accessibility (lang, H1s, heading hierarchy, alt text, empty links/buttons,
 * WCAG 2.1 contrast), and Responsive / Build / Weight Budget checks with
 * 1-click fix actions.
 */
import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import type {
  AuditCategory,
  AuditFixAction,
  AuditSeverity,
  PreflightAuditReport,
} from '../lib/preflightAudit'
import { primaryLook, quiet } from '../ui/look'

export function PreflightAuditDrawer({
  open,
  report,
  checkingResponsive = false,
  onRunResponsiveCheck,
  onFix,
  onClose,
}: {
  open: boolean
  report: PreflightAuditReport
  checkingResponsive?: boolean
  onRunResponsiveCheck?: () => void
  onFix: (action: AuditFixAction) => void
  onClose: () => void
}): React.ReactElement | null {
  const [filter, setFilter] = useState<'all' | AuditCategory>('all')

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

  const visibleItems = report.items.filter(
    item => filter === 'all' || item.category === filter,
  )

  return (
    <Scrim onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <Drawer role="dialog" aria-modal="true" aria-label="Pre-flight audit" data-site-overlay="">
        <Header>
          <div>
            <Kicker>PRE-FLIGHT AUDITOR · {report.preview.page}</Kicker>
            <Title>Launch Readiness</Title>
          </div>
          <Btn type="button" onClick={onClose}>Close</Btn>
        </Header>

        <ScoreStrip>
          <ScoreBox $grade={report.grade}>
            <ScoreNum>{report.score}</ScoreNum>
            <ScoreMax>/ 100</ScoreMax>
          </ScoreBox>
          <ScoreMeta>
            <GradeLabel>{report.grade}</GradeLabel>
            <CountLine>
              <span>{report.counts.errors} error{report.counts.errors === 1 ? '' : 's'}</span>
              <span>·</span>
              <span>{report.counts.warnings} warning{report.counts.warnings === 1 ? '' : 's'}</span>
              <span>·</span>
              <span>{report.counts.passes} passed</span>
            </CountLine>
            <WeightLine>
              Payload: {Math.max(1, Math.round(report.weight.totalBytes / 1024))} KB
              {' '}({Math.max(1, Math.round(report.weight.htmlBytes / 1024))} KB HTML,{' '}
              {Math.max(1, Math.round(report.weight.cssBytes / 1024))} KB CSS)
            </WeightLine>
          </ScoreMeta>
        </ScoreStrip>

        <Body>
          <Section>
            <SectionTitle>LIVE GOOGLE SEARCH PREVIEW</SectionTitle>
            <GoogleCard>
              <GoogleSite>{report.preview.siteName}</GoogleSite>
              <GoogleUrl>{report.preview.url}</GoogleUrl>
              <GoogleTitle>{report.preview.title}</GoogleTitle>
              <GoogleDesc>{report.preview.description}</GoogleDesc>
            </GoogleCard>
          </Section>

          <Section>
            <SectionTitle>LIVE OPENGRAPH SOCIAL CARD</SectionTitle>
            <OgCard>
              {report.preview.ogImage ? (
                <OgBanner>
                  <OgImageTag>og:image · {report.preview.ogImage}</OgImageTag>
                </OgBanner>
              ) : null}
              <OgBody>
                <OgHost>{report.preview.url.replace(/^https?:\/\//, '')}</OgHost>
                <OgTitle>{report.preview.ogTitle}</OgTitle>
                <OgDesc>{report.preview.ogDescription}</OgDesc>
              </OgBody>
            </OgCard>
          </Section>

          <FilterRow>
            <FilterTabs role="tablist" aria-label="Audit categories">
              {(
                [
                  ['all', 'All'],
                  ['seo', 'SEO & Meta'],
                  ['accessibility', 'Accessibility'],
                  ['responsive', 'Responsive & Build'],
                ] as const
              ).map(([id, label]) => (
                <FilterTab
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  $active={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </FilterTab>
              ))}
            </FilterTabs>
            {onRunResponsiveCheck ? (
              <Btn
                type="button"
                disabled={checkingResponsive}
                onClick={onRunResponsiveCheck}
                title="Measure the active page at 390px (Phone) and 768px (Tablet)"
              >
                {checkingResponsive ? 'Measuring…' : 'Check 390 / 768'}
              </Btn>
            ) : null}
          </FilterRow>

          <CheckList>
            {visibleItems.map(item => (
              <CheckRow key={item.id} $severity={item.severity}>
                <CheckMain>
                  <CheckHead>
                    <SevBadge $severity={item.severity}>
                      {item.severity === 'error'
                        ? 'ERR'
                        : item.severity === 'warning'
                          ? 'WARN'
                          : 'PASS'}
                    </SevBadge>
                    <CheckTitle>{item.title}</CheckTitle>
                  </CheckHead>
                  <CheckDetail>{item.detail}</CheckDetail>
                </CheckMain>
                {item.fixAction ? (
                  <FixBtn type="button" onClick={() => onFix(item.fixAction!)}>
                    {item.fixAction.label}
                  </FixBtn>
                ) : null}
              </CheckRow>
            ))}
          </CheckList>
        </Body>

        <Footer>
          <FootNote>Checks update live as you edit pages, SEO head, and Design Studio tokens.</FootNote>
          <PrimaryBtn type="button" onClick={onClose}>Done</PrimaryBtn>
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
  width: min(520px, 100vw);
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

const ScoreStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--n-fence, #e2e5e8);
`

const ScoreBox = styled.div<{ $grade: PreflightAuditReport['grade'] }>`
  flex: none;
  min-width: 78px;
  padding: 8px 10px;
  border: 1px solid
    ${({ $grade }) =>
      $grade === 'Fix before launch'
        ? 'var(--p-failed-text, #b4340e)'
        : $grade === 'Ready'
          ? 'var(--p-done-text, #166534)'
          : 'var(--b-amber, #c98a12)'};
  border-radius: 3px;
  background: var(--n-panel, #f6f7f8);
  text-align: center;
`

const ScoreNum = styled.span`
  font-size: 24px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
`

const ScoreMax = styled.span`
  font-size: 11px;
  color: var(--n-faint, #666c75);
  margin-left: 2px;
`

const ScoreMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`

const GradeLabel = styled.div`
  font-size: 14px;
  font-weight: 700;
`

const CountLine = styled.div`
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: var(--n-soft, #474c54);
  font-variant-numeric: tabular-nums;
`

const WeightLine = styled.div`
  font-size: 11px;
  color: var(--n-faint, #666c75);
`

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionTitle = styled.div`
  font-size: 10.5px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--n-faint, #666c75);
  font-weight: 700;
`

const GoogleCard = styled.div`
  padding: 12px 14px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const GoogleSite = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: var(--n-ink, #14171a);
`

const GoogleUrl = styled.div`
  font-size: 11px;
  color: var(--n-faint, #666c75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const GoogleTitle = styled.div`
  margin-top: 3px;
  font-size: 15px;
  font-weight: 600;
  color: #1a0dab;
`

const GoogleDesc = styled.div`
  font-size: 12px;
  line-height: 1.45;
  color: var(--n-soft, #474c54);
`

const OgCard = styled.div`
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  overflow: hidden;
  background: var(--n-panel, #f6f7f8);
`

const OgBanner = styled.div`
  padding: 14px 12px;
  border-bottom: 1px solid var(--n-fence, #e2e5e8);
  background: var(--n-selected, #e6e8eb);
`

const OgImageTag = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--n-soft, #474c54);
`

const OgBody = styled.div`
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const OgHost = styled.div`
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--n-faint, #666c75);
`

const OgTitle = styled.div`
  font-size: 13.5px;
  font-weight: 700;
  color: var(--n-ink, #14171a);
`

const OgDesc = styled.div`
  font-size: 12px;
  line-height: 1.4;
  color: var(--n-soft, #474c54);
`

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

const FilterTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`

const FilterTab = styled.button<{ $active: boolean }>`
  height: 26px;
  padding: 0 9px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--p-text, #b3546c)' : 'var(--n-line, #c8ccd2)')};
  border-radius: 3px;
  background: ${({ $active }) => ($active ? 'var(--p-chosen, #f6e7eb)' : 'var(--n-sheet, #ffffff)')};
  color: var(--n-ink, #14171a);
  font: inherit;
  font-size: 11.5px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
`

const CheckList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const CheckRow = styled.div<{ $severity: AuditSeverity }>`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid
    ${({ $severity }) =>
      $severity === 'error'
        ? 'var(--p-failed-text, #b4340e)'
        : $severity === 'warning'
          ? 'var(--b-amber, #c98a12)'
          : 'var(--n-fence, #e2e5e8)'};
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
`

const CheckMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`

const CheckHead = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const SevBadge = styled.span<{ $severity: AuditSeverity }>`
  flex: none;
  padding: 1px 5px;
  border-radius: 2px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  background: ${({ $severity }) =>
    $severity === 'error'
      ? 'var(--p-failed-text, #b4340e)'
      : $severity === 'warning'
        ? 'var(--b-amber, #c98a12)'
        : 'var(--p-done-text, #166534)'};
  color: ${({ $severity }) => ($severity === 'warning' ? '#22190a' : '#ffffff')};
`

const CheckTitle = styled.span`
  font-size: 12.5px;
  font-weight: 600;
`

const CheckDetail = styled.span`
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--n-soft, #474c54);
`

const FixBtn = styled.button`
  ${quiet}
  flex: none;
  height: 25px;
  padding: 0 9px;
  font-size: 11.5px;
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
