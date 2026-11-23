/**
 * PureCloud Instant Publish, Version Rollback & Form Submissions Inbox Drawer.
 *
 * Talks to PureServer's `publish` cloud service (`/s/<slug>/`) via
 * `pureCloudSiteClient.ts` and degrades cleanly when PureServer is offline or
 * not attached.
 */
import { useCallback, useEffect, useState } from 'react'
import { styled } from 'styled-components'
import {
  buildCloudSiteFiles,
  deleteCloudFormSubmission,
  getCloudPublishStatus,
  getCloudSite,
  listCloudFormSubmissions,
  listCloudSites,
  publishCloudSite,
  removeCloudSite,
  rollbackCloudSiteVersion,
  slugifySiteTitle,
  updateCloudSite,
  type CloudFormSubmission,
  type CloudPublishedSiteItem,
  type CloudPublishStatus,
  type CloudSiteVersion,
} from '../lib/pureCloudSiteClient'
import type { SiteDocument } from '../lib/siteDocument'
import { primaryLook, quiet } from '../ui/look'

type TabId = 'publish' | 'versions' | 'forms'
type ExpiryOption = 'never' | '24h' | '7d' | '30d'

function expiryToIso(option: ExpiryOption): string | undefined {
  const now = Date.now()
  if (option === '24h') return new Date(now + 24 * 60 * 60 * 1000).toISOString()
  if (option === '7d') return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  if (option === '30d') return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
  return undefined
}

export function CloudShareDrawer({
  open,
  document,
  previews,
  onOpenUrl,
  onStatusMessage,
  onClose,
}: {
  open: boolean
  document: SiteDocument
  previews: Record<string, string>
  onOpenUrl?: (url: string) => void
  onStatusMessage?: (message: string) => void
  onClose: () => void
}): React.ReactElement | null {
  const [tab, setTab] = useState<TabId>('publish')
  const [status, setStatus] = useState<CloudPublishStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null)

  const [siteItem, setSiteItem] = useState<CloudPublishedSiteItem | null>(null)
  const [versions, setVersions] = useState<CloudSiteVersion[]>([])
  const [submissions, setSubmissions] = useState<CloudFormSubmission[]>([])

  const [slug, setSlug] = useState(() => slugifySiteTitle(document.title))
  const [note, setNote] = useState('')
  const [passcode, setPasscode] = useState('')
  const [expiry, setExpiry] = useState<ExpiryOption>('never')
  const [allowForms, setAllowForms] = useState(true)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)

  useEffect(() => {
    setSlug(prev => prev || slugifySiteTitle(document.title))
  }, [document.title])

  const loadSiteDetails = useCallback(async (id: string) => {
    const detail = await getCloudSite(id)
    setSiteItem(detail.item)
    setVersions(detail.versions)
    setSubmissions(detail.formSubmissions)
    if (detail.item.slug) setSlug(detail.item.slug)
    if (typeof detail.item.allowForms === 'boolean') setAllowForms(detail.item.allowForms)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const nextStatus = await getCloudPublishStatus()
      setStatus(nextStatus)
      if (!nextStatus.connected) {
        setSiteItem(null)
        setVersions([])
        setSubmissions([])
        return
      }
      const listed = await listCloudSites()
      const wantedSlug = slugifySiteTitle(document.title)
      const matched =
        listed.items.find(item => item.slug === slug) ??
        listed.items.find(item => item.slug === wantedSlug) ??
        listed.items[0] ??
        null
      if (matched) {
        await loadSiteDetails(matched.id)
      } else {
        setSiteItem(null)
        setVersions([])
        setSubmissions([])
      }
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : String(error),
        error: true,
      })
    } finally {
      setLoading(false)
    }
  }, [document.title, loadSiteDetails, slug])

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, refresh])

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

  const handlePublish = async (): Promise<void> => {
    const cleanSlug = slugifySiteTitle(slug)
    setSlug(cleanSlug)
    setBusy('Publishing static bundle to PureCloud…')
    setFeedback(null)
    try {
      const files = buildCloudSiteFiles(document, previews)
      const expiresAt = expiryToIso(expiry)
      const res = await publishCloudSite({
        ...(siteItem?.id ? { id: siteItem.id } : {}),
        slug: cleanSlug,
        title: document.title || cleanSlug,
        description: document.manifest.brief || undefined,
        files,
        ...(passcode.trim() ? { passcode: passcode.trim() } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        allowForms,
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      setSiteItem(res.item)
      setNote('')
      await loadSiteDetails(res.item.id).catch(() => {})
      const msg = `Published live to ${res.item.url}`
      setFeedback({ text: msg })
      onStatusMessage?.(msg)
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : String(error),
        error: true,
      })
    } finally {
      setBusy(null)
    }
  }

  const handleRollback = async (version: number): Promise<void> => {
    if (!siteItem) return
    setBusy(`Rolling back to v${version}…`)
    setFeedback(null)
    try {
      const res = await rollbackCloudSiteVersion(siteItem.id, version)
      setSiteItem(res.item)
      await loadSiteDetails(siteItem.id).catch(() => {})
      const msg = `Rolled back ${res.item.slug} to version ${version}.`
      setFeedback({ text: msg })
      onStatusMessage?.(msg)
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : String(error),
        error: true,
      })
    } finally {
      setBusy(null)
    }
  }

  const handleToggleActive = async (): Promise<void> => {
    if (!siteItem) return
    const nextActive = siteItem.active === false
    setBusy(nextActive ? 'Re-activating link…' : 'Pausing link…')
    try {
      const res = await updateCloudSite({ id: siteItem.id, active: nextActive })
      setSiteItem(res.item)
      setFeedback({ text: nextActive ? 'Public link is active again.' : 'Public link paused.' })
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : String(error), error: true })
    } finally {
      setBusy(null)
    }
  }

  const handleRemove = async (): Promise<void> => {
    if (!siteItem) return
    setBusy('Removing published site…')
    try {
      await removeCloudSite(siteItem.id)
      setSiteItem(null)
      setVersions([])
      setSubmissions([])
      setConfirmUnpublish(false)
      setFeedback({ text: 'Removed site from PureCloud.' })
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : String(error), error: true })
    } finally {
      setBusy(null)
    }
  }

  const handleRefreshForms = async (): Promise<void> => {
    if (!siteItem) return
    setBusy('Refreshing form inbox…')
    try {
      const res = await listCloudFormSubmissions(siteItem.id)
      setSubmissions(res.submissions)
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : String(error), error: true })
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteSubmission = async (submissionId: string): Promise<void> => {
    if (!siteItem) return
    setBusy('Deleting submission…')
    try {
      await deleteCloudFormSubmission(siteItem.id, submissionId)
      setSubmissions(prev => prev.filter(s => s.id !== submissionId))
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : String(error), error: true })
    } finally {
      setBusy(null)
    }
  }

  const previewUrl = siteItem?.url
    ? siteItem.url
    : status?.publicUrl
      ? `${status.publicUrl.replace(/\/+$/, '')}/s/${slugifySiteTitle(slug)}/`
      : `/s/${slugifySiteTitle(slug)}/`

  return (
    <Scrim onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <Drawer role="dialog" aria-modal="true" aria-label="PureCloud share" data-site-overlay="">
        <Header>
          <div>
            <Kicker>PURECLOUD INSTANT PUBLISH</Kicker>
            <Title>Live Link, Versions &amp; Form Inbox</Title>
          </div>
          <Btn type="button" onClick={onClose}>Close</Btn>
        </Header>

        <StatusStrip $connected={Boolean(status?.connected)}>
          <StatusDot $connected={Boolean(status?.connected)} />
          <StatusText>
            {loading
              ? 'Checking PureServer connection…'
              : status?.connected
                ? `Connected · ${status.publicUrl || 'PureServer Ready'}`
                : status?.reason || 'Offline — PureServer is not attached in this session.'}
          </StatusText>
          <SmallBtn type="button" disabled={loading || Boolean(busy)} onClick={() => void refresh()}>
            Refresh
          </SmallBtn>
        </StatusStrip>

        <TabBar role="tablist" aria-label="PureCloud sections">
          <TabBtn type="button" role="tab" aria-selected={tab === 'publish'} $active={tab === 'publish'} onClick={() => setTab('publish')}>
            Publish &amp; Share
          </TabBtn>
          <TabBtn type="button" role="tab" aria-selected={tab === 'versions'} $active={tab === 'versions'} onClick={() => setTab('versions')}>
            Versions ({versions.length})
          </TabBtn>
          <TabBtn type="button" role="tab" aria-selected={tab === 'forms'} $active={tab === 'forms'} onClick={() => setTab('forms')}>
            Form Inbox ({submissions.length})
          </TabBtn>
        </TabBar>

        <Body>
          {feedback ? (
            <Notice $error={Boolean(feedback.error)} role={feedback.error ? 'alert' : 'status'}>
              {feedback.text}
            </Notice>
          ) : null}

          {!loading && !status?.connected ? (
            <OfflineCard>
              <strong>PureServer is not connected right now.</strong>
              <p>
                Connect your PureSuite desktop to a PureServer instance to publish directly to{' '}
                <code>/s/{slugifySiteTitle(slug)}/</code> with instant rollback and zero-JS contact
                form capture (<code>action=&quot;_forms/contact&quot;</code>).
              </p>
              <p>
                You can still build and export your static bundle locally via <strong>Publish…</strong>.
              </p>
            </OfflineCard>
          ) : null}

          {tab === 'publish' ? (
            <>
              {siteItem ? (
                <LiveCard>
                  <LiveHead>
                    <LiveLabel>LIVE URL · v{siteItem.activeVersion ?? 1}</LiveLabel>
                    <StateTag $active={siteItem.active !== false}>
                      {siteItem.active === false ? 'Paused' : 'Live'}
                    </StateTag>
                  </LiveHead>
                  <UrlCode>{siteItem.url}</UrlCode>
                  <Row>
                    <SmallBtn
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(siteItem.url).catch(() => {})
                        setCopiedUrl(true)
                        window.setTimeout(() => setCopiedUrl(false), 1600)
                      }}
                    >
                      {copiedUrl ? 'Copied URL' : 'Copy URL'}
                    </SmallBtn>
                    {onOpenUrl ? (
                      <SmallBtn type="button" onClick={() => onOpenUrl(siteItem.url)}>
                        Open live site
                      </SmallBtn>
                    ) : null}
                    <SmallBtn type="button" disabled={Boolean(busy)} onClick={() => void handleToggleActive()}>
                      {siteItem.active === false ? 'Resume' : 'Pause'}
                    </SmallBtn>
                    {confirmUnpublish ? (
                      <>
                        <DangerBtn type="button" disabled={Boolean(busy)} onClick={() => void handleRemove()}>
                          Confirm remove
                        </DangerBtn>
                        <SmallBtn type="button" onClick={() => setConfirmUnpublish(false)}>
                          Cancel
                        </SmallBtn>
                      </>
                    ) : (
                      <DangerBtn type="button" disabled={Boolean(busy)} onClick={() => setConfirmUnpublish(true)}>
                        Remove
                      </DangerBtn>
                    )}
                  </Row>
                </LiveCard>
              ) : null}

              <Field>
                <Label htmlFor="cloud-slug">Site slug</Label>
                <Input
                  id="cloud-slug"
                  value={slug}
                  placeholder="my-site"
                  onChange={e => setSlug(e.currentTarget.value)}
                />
                <Helper>Destination: <code>{previewUrl}</code></Helper>
              </Field>

              <Field>
                <Label htmlFor="cloud-note">Release note (optional)</Label>
                <Input
                  id="cloud-note"
                  value={note}
                  placeholder="Updated pricing section and hero typography"
                  onChange={e => setNote(e.currentTarget.value)}
                />
              </Field>

              <TwoCol>
                <Field>
                  <Label htmlFor="cloud-passcode">Passcode (optional)</Label>
                  <Input
                    id="cloud-passcode"
                    type="password"
                    value={passcode}
                    placeholder="Leave blank for public"
                    onChange={e => setPasscode(e.currentTarget.value)}
                  />
                </Field>
                <Field>
                  <Label htmlFor="cloud-expiry">Link expiry</Label>
                  <Select
                    id="cloud-expiry"
                    value={expiry}
                    onChange={e => setExpiry(e.currentTarget.value as ExpiryOption)}
                  >
                    <option value="never">Never expires</option>
                    <option value="24h">24 hours</option>
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                  </Select>
                </Field>
              </TwoCol>

              <CheckRow>
                <input
                  type="checkbox"
                  checked={allowForms}
                  onChange={e => setAllowForms(e.currentTarget.checked)}
                />
                <span>Accept zero-JS form submissions at <code>_forms/contact</code></span>
              </CheckRow>

              <Row>
                <PrimaryBtn
                  type="button"
                  disabled={!status?.connected || Boolean(busy)}
                  onClick={() => void handlePublish()}
                >
                  {busy ?? (siteItem ? 'Publish new version' : 'Publish to PureCloud')}
                </PrimaryBtn>
              </Row>
            </>
          ) : null}

          {tab === 'versions' ? (
            <List>
              {versions.length ? (
                versions.map(ver => {
                  const isActive = siteItem?.activeVersion === ver.version
                  return (
                    <ItemCard key={ver.version}>
                      <ItemMain>
                        <ItemHead>
                          <strong>Version {ver.version}</strong>
                          {isActive ? <StateTag $active>Active</StateTag> : null}
                        </ItemHead>
                        {ver.note ? <ItemDetail>{ver.note}</ItemDetail> : null}
                        <ItemMeta>
                          {ver.createdAt ? new Date(ver.createdAt).toLocaleString() : 'Snapshot'}
                          {ver.contentHash ? ` · ${ver.contentHash.slice(0, 8)}` : ''}
                        </ItemMeta>
                      </ItemMain>
                      {!isActive ? (
                        <SmallBtn
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void handleRollback(ver.version)}
                        >
                          Rollback
                        </SmallBtn>
                      ) : null}
                    </ItemCard>
                  )
                })
              ) : (
                <EmptyNote>
                  No published versions yet. Publish your site to create version 1 with instant rollback history.
                </EmptyNote>
              )}
            </List>
          ) : null}

          {tab === 'forms' ? (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <Helper>Submissions posted to <code>_forms/contact</code> appear here automatically.</Helper>
                {siteItem ? (
                  <SmallBtn type="button" disabled={Boolean(busy)} onClick={() => void handleRefreshForms()}>
                    Reload inbox
                  </SmallBtn>
                ) : null}
              </Row>
              <List>
                {submissions.length ? (
                  submissions.map(sub => (
                    <ItemCard key={sub.id}>
                      <ItemMain>
                        <ItemHead>
                          <strong>{sub.formName || 'contact'}</strong>
                          <ItemMeta>{new Date(sub.createdAt).toLocaleString()}</ItemMeta>
                        </ItemHead>
                        <FieldPairs>
                          {Object.entries(sub.fields).map(([k, v]) => (
                            <FieldPair key={k}>
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </FieldPair>
                          ))}
                        </FieldPairs>
                      </ItemMain>
                      <DangerBtn
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void handleDeleteSubmission(sub.id)}
                      >
                        Delete
                      </DangerBtn>
                    </ItemCard>
                  ))
                ) : (
                  <EmptyNote>
                    No form submissions yet. Insert a PureCloud Contact Form section and publish to start receiving responses.
                  </EmptyNote>
                )}
              </List>
            </>
          ) : null}
        </Body>
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
  width: min(500px, 100vw);
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

const StatusStrip = styled.div<{ $connected: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--n-fence, #e2e5e8);
  background: var(--n-panel, #f6f7f8);
`

const StatusDot = styled.span<{ $connected: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 1px;
  flex: none;
  background: ${({ $connected }) =>
    $connected ? 'var(--p-done-text, #166534)' : 'var(--n-strong, #8d939b)'};
`

const StatusText = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--n-soft, #474c54);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TabBar = styled.div`
  display: flex;
  gap: 4px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--n-fence, #e2e5e8);
`

const TabBtn = styled.button<{ $active: boolean }>`
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

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`

const Notice = styled.div<{ $error: boolean }>`
  padding: 9px 11px;
  border: 1px solid ${({ $error }) => ($error ? 'var(--p-failed-text, #b4340e)' : 'var(--p-done-text, #166534)')};
  border-radius: 3px;
  background: var(--n-panel, #f6f7f8);
  color: ${({ $error }) => ($error ? 'var(--p-failed-text, #b4340e)' : 'var(--n-ink, #14171a)')};
  font-size: 12px;
`

const OfflineCard = styled.div`
  padding: 12px 14px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-panel, #f6f7f8);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--n-soft, #474c54);
  strong {
    display: block;
    color: var(--n-ink, #14171a);
    margin-bottom: 4px;
  }
  p {
    margin: 6px 0 0;
  }
`

const LiveCard = styled.div`
  padding: 12px;
  border: 1px solid var(--p-text, #b3546c);
  border-radius: 3px;
  background: var(--n-panel, #f6f7f8);
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const LiveHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const LiveLabel = styled.span`
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--n-faint, #666c75);
`

const StateTag = styled.span<{ $active: boolean }>`
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 10px;
  font-weight: 700;
  background: ${({ $active }) => ($active ? 'var(--p-done-text, #166534)' : 'var(--n-strong, #8d939b)')};
  color: #ffffff;
`

const UrlCode = styled.code`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 12px;
  word-break: break-all;
  color: var(--n-ink, #14171a);
`

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
`

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const Label = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: var(--n-soft, #474c54);
`

const Helper = styled.span`
  font-size: 11px;
  color: var(--n-faint, #666c75);
`

const Input = styled.input`
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
  color: var(--n-ink, #14171a);
  font: inherit;
  font-size: 12.5px;
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

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--n-ink, #14171a);
  cursor: pointer;
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const ItemCard = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--n-line, #c8ccd2);
  border-radius: 3px;
  background: var(--n-sheet, #ffffff);
`

const ItemMain = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const ItemHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
`

const ItemDetail = styled.div`
  font-size: 12px;
  color: var(--n-soft, #474c54);
`

const ItemMeta = styled.span`
  font-size: 11px;
  color: var(--n-faint, #666c75);
`

const FieldPairs = styled.dl`
  margin: 4px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const FieldPair = styled.div`
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: 8px;
  font-size: 12px;
  dt {
    color: var(--n-faint, #666c75);
    font-weight: 600;
  }
  dd {
    margin: 0;
    color: var(--n-ink, #14171a);
    word-break: break-word;
  }
`

const EmptyNote = styled.div`
  padding: 20px 14px;
  border: 1px solid var(--n-fence, #e2e5e8);
  border-radius: 3px;
  background: var(--n-panel, #f6f7f8);
  font-size: 12.5px;
  color: var(--n-soft, #474c54);
  text-align: center;
`

const Btn = styled.button`
  ${quiet}
`

const SmallBtn = styled.button`
  ${quiet}
  height: 25px;
  padding: 0 9px;
  font-size: 11.5px;
`

const DangerBtn = styled(SmallBtn)`
  color: var(--p-failed-text, #b4340e);
`

const PrimaryBtn = styled.button`
  ${quiet}
  ${primaryLook}
`
