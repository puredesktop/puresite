import { useEffect, useMemo, useState } from 'react'
import { styled } from 'styled-components'
import { siteLinkTheme } from './siteLinkTheme'
import { answerFor, contradictions, statedFacts } from '../lib/siteLenses'
import type { SiteLinkGraph } from '../lib/siteLinks'
import { urlPathFor, type SiteDocument } from '../lib/siteDocument'

/**
 * Ask what they will ask.
 *
 * A score out of a hundred tells you nothing you can act on. A question does:
 * put in what a person — or the assistant answering for them — will actually
 * ask, and see whether the site answers, from where, and in whose words. The
 * answer is always the site's own sentence; nothing here is generated, so a
 * blank means the site is silent and owes an answer.
 */
export function QuestionsSheet({
  document: siteDocument,
  graph,
  onOpenPage,
  onBuildPromise,
  onAsk,
  onClose,
}: {
  document: SiteDocument
  graph: SiteLinkGraph
  onOpenPage: (page: string) => void
  onBuildPromise: (path: string) => void
  /** Hand the writing of an answer to the assistant. */
  onAsk: (request: string) => void
  onClose: () => void
}): React.ReactElement {
  const [asked, setAsked] = useState<string[]>([])
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clashes = useMemo(() => contradictions(statedFacts(siteDocument)), [siteDocument])
  const answers = useMemo(
    () => asked.map(question => ({ question, answer: answerFor(siteDocument, graph, question) })),
    [asked, siteDocument, graph],
  )

  const ask = (question: string): void => {
    const trimmed = question.trim()
    if (!trimmed) return
    setTyped('')
    setAsked(current => [trimmed, ...current.filter(item => item !== trimmed)])
  }

  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label="Ask what they will ask">
        <Head>
          <div>
            <Title>Ask what they will ask</Title>
            <Sub>The site answers in its own sentences, or it does not answer.</Sub>
          </div>
          <span style={{ flex: 1 }} />
          <Close type="button" aria-label="Close" onClick={onClose}>
            ×
          </Close>
        </Head>

        <Field>
          <input
            value={typed}
            placeholder="When do nominations close?"
            aria-label="A question a reader would ask"
            onChange={event => setTyped(event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                ask(typed)
              }
            }}
          />
          <Primary type="button" onClick={() => ask(typed)} disabled={!typed.trim()}>
            Ask the site
          </Primary>
        </Field>

        <Body>
          {clashes.length ? (
            <Clash>
              <strong>
                {clashes[0]!.facts.length} pages say when it {clashes[0]!.about}s, differently
              </strong>
              {clashes[0]!.facts.map((fact, index) => (
                <span key={`${fact.page}-${index}`} className="said">
                  “{fact.said}” on {urlPathFor(fact.page)}
                </span>
              ))}
              <Ghost
                type="button"
                onClick={() =>
                  onAsk(
                    `These pages disagree about when it ${clashes[0]!.about}s: ${clashes[0]!.facts
                      .map(fact => `${fact.page} says ${fact.said}`)
                      .join(', ')}. Ask me which is right, then make them agree.`,
                  )
                }
              >
                Make them agree
              </Ghost>
            </Clash>
          ) : null}

          {answers.map(({ question, answer }) => (
            <Entry key={question} $answered={Boolean(answer.page)}>
              <div className="q">
                <Mark $answered={Boolean(answer.page)}>{answer.page ? 'answered' : 'silent'}</Mark>
                <span className="text">{question}</span>
              </div>
              {answer.page ? (
                <>
                  <Said>“{answer.sentence}”</Said>
                  <Row>
                    <Quiet>from {urlPathFor(answer.page)}</Quiet>
                    <span style={{ flex: 1 }} />
                    <Ghost type="button" onClick={() => onOpenPage(answer.page!)}>
                      Open that page
                    </Ghost>
                  </Row>
                </>
              ) : (
                <>
                  <Said $silent>
                    Nothing on the site says this. An assistant asked today would guess, or say it
                    does not know.
                  </Said>
                  <Row>
                    <span style={{ flex: 1 }} />
                    <Ghost
                      type="button"
                      onClick={() =>
                        onAsk(
                          `A reader asks: “${question}”. Nothing on this site answers it. Ask me what the answer is, then write it where it belongs — do not invent one.`,
                        )
                      }
                    >
                      Write an answer
                    </Ghost>
                  </Row>
                </>
              )}
              {answer.promised ? (
                <Row>
                  <Quiet>
                    It points at {urlPathFor(answer.promised)}, which nobody has built.
                  </Quiet>
                  <span style={{ flex: 1 }} />
                  <Ghost type="button" onClick={() => onBuildPromise(answer.promised!)}>
                    Build it
                  </Ghost>
                </Row>
              ) : null}
            </Entry>
          ))}

          {!answers.length ? (
            <Empty>
              Ask the questions your readers arrive with. Each one is kept, so the site can be held
              to them later.
            </Empty>
          ) : null}
        </Body>
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
  width: min(660px, 100%);
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
const Field = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 20px;
  border-bottom: 1px solid var(--platform-colors-border);
  input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: var(--platform-typography-font-size-base);
    padding: 9px 12px;
    border-radius: 9px;
    border: 1px solid var(--platform-colors-border);
    background: var(--pure-chrome-well);
    color: inherit;
  }
`
const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`
const Entry = styled.div<{ $answered: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 13px 15px;
  border-radius: 12px;
  border: 1px solid
    ${({ $answered }) =>
      $answered ? 'var(--platform-colors-border)' : 'color-mix(in srgb, var(--pure-danger-text) 40%, transparent)'};
  background: ${({ $answered }) => ($answered ? 'transparent' : 'var(--pure-danger-muted)')};
  .q {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .text {
    font-size: var(--platform-typography-font-size-base);
    font-weight: var(--platform-typography-font-weight-medium);
  }
`
const Mark = styled.span<{ $answered: boolean }>`
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--platform-typography-font-size-xs);
  padding: 2px 8px;
  border-radius: 6px;
  background: ${({ $answered }) =>
    $answered ? 'var(--site-accent-wash)' : 'color-mix(in srgb, var(--pure-danger-text) 16%, transparent)'};
  color: ${({ $answered }) => ($answered ? 'var(--platform-colors-text)' : 'var(--pure-danger-text)')};
`
const Said = styled.p<{ $silent?: boolean }>`
  margin: 0;
  padding-left: 12px;
  border-left: 2px solid
    ${({ $silent }) => ($silent ? 'transparent' : 'var(--site-built-line)')};
  font-size: var(--platform-typography-font-size-sm);
  line-height: var(--platform-typography-line-height-base);
  color: ${({ $silent }) =>
    $silent ? 'var(--platform-colors-text-secondary)' : 'var(--platform-colors-text)'};
`
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`
const Quiet = styled.span`
  font-size: var(--platform-typography-font-size-xs);
  color: var(--platform-colors-text-secondary);
`
const Ghost = styled.button`
  font: inherit;
  font-size: var(--platform-typography-font-size-xs);
  padding: 6px 11px;
  border-radius: 8px;
  border: 1px solid var(--platform-colors-border);
  background: transparent;
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
`
const Primary = styled(Ghost)`
  font-size: var(--platform-typography-font-size-sm);
  padding: 9px 14px;
  border-color: transparent;
  background: var(--site-accent);
  color: var(--pure-chrome-on-accent);
  font-weight: var(--platform-typography-font-weight-bold);
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
const Clash = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 13px 15px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--pure-attention-text) 45%, transparent);
  background: var(--pure-attention-muted);
  font-size: var(--platform-typography-font-size-sm);
  .said {
    color: var(--platform-colors-text-secondary);
  }
  button {
    align-self: flex-start;
    margin-top: 4px;
  }
`
const Empty = styled.div`
  padding: 32px 0;
  text-align: center;
  color: var(--platform-colors-text-secondary);
  font-size: var(--platform-typography-font-size-sm);
`
