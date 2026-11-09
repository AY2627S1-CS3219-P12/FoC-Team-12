import { useEffect, useRef, useState } from 'react'
import { CaseError, isUuid, request, type Summary } from './cases'
import {
  chatFailure,
  confirmedConversations,
  conversation,
  type Conversation,
} from './conversations'
import { ConversationThread } from './ConversationThread'

export function ParticipantConversationStatus({
  summary,
  actorId,
}: {
  summary: Summary
  actorId: string
}) {
  const saved = useConfirmed(summary, actorId, true)
  return (
    <section
      className="conversation-status"
      aria-label="Your private case conversation"
    >
      <h3>Your private conversation</h3>
      {summary.state === 'RESOLVED' && (
        <p>This case is resolved. Any existing conversation is read-only.</p>
      )}
      <SavedStatus saved={saved} />
      {saved.references?.[0] ? (
        <ConversationThread
          reference={saved.references[0]}
          actorId={actorId}
          reviewerId={summary.reviewerId}
          writable={summary.state === 'UNDER_REVIEW'}
          participantView
        />
      ) : (
        saved.references && (
          <p>
            No confirmed conversation is available. The assigned reviewer can
            start a private conversation.
          </p>
        )
      )}
      <p>
        Only the assigned reviewer can start the conversation. Other
        participants’ conversations are never shown here.
      </p>
    </section>
  )
}
function useConfirmed(
  summary: Summary,
  actorId: string,
  participantView: boolean,
) {
  const [result, setResult] = useState<{
    identity: string
    references?: Conversation[]
    error: string
  }>()
  const [attempt, setAttempt] = useState(0)
  const { caseId, orderId, revision } = summary
  const identity = `${actorId}.${caseId}.${orderId}.${participantView}.${revision}.${attempt}`
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    let active = true
    confirmedConversations(
      { caseId, orderId },
      actorId,
      participantView,
      controller.signal,
    )
      .then((values) => {
        if (active) setResult({ identity, references: values, error: '' })
      })
      .catch((e) => {
        if (active) setResult({ identity, error: chatFailure(e) })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [caseId, orderId, actorId, participantView, identity])
  return {
    references: result?.identity === identity ? result.references : undefined,
    error: result?.identity === identity ? result.error : '',
    retry: () => setAttempt((n) => n + 1),
  }
}
function SavedStatus({ saved }: { saved: ReturnType<typeof useConfirmed> }) {
  return (
    <>
      {saved.error ? (
        <p role="alert">{saved.error}</p>
      ) : (
        !saved.references && <p role="status">Checking saved conversations…</p>
      )}
      <button className="button-secondary" onClick={saved.retry}>
        Refresh saved conversations
      </button>
    </>
  )
}
export function CaseConversations({
  summary,
  actorId,
  participantIds,
  closing = false,
}: {
  summary: Summary
  actorId: string
  participantIds: string[]
  closing?: boolean
}) {
  const [selected, setSelected] = useState('')
  const saved = useConfirmed(summary, actorId, false)
  const reference = saved.references?.find(
    (r) => r.participantUserId === selected,
  )
  const assigned =
    !closing &&
    summary.state === 'UNDER_REVIEW' &&
    summary.reviewerId === actorId
  return (
    <section className="case-panel" aria-labelledby="case-conversations-title">
      <p className="eyebrow">Private follow-up</p>
      <h2 id="case-conversations-title">Participant conversations</h2>
      <p>
        Each participant has a separate conversation. Select one reporting
        participant to follow up privately.
      </p>
      {!assigned && (
        <p className="conversation-status">
          {summary.state === 'OPEN'
            ? 'Claim this case before starting a conversation.'
            : summary.state === 'RESOLVED'
              ? 'This case is resolved. Existing conversations are read-only.'
              : 'Only the assigned reviewer can initiate conversations.'}{' '}
          Select a participant to view an existing conversation.
        </p>
      )}
      <SavedStatus saved={saved} />
      {saved.references && (
        <>
          <div
            className="conversation-picker"
            aria-label="Select a reporting participant"
          >
            {[...new Set(participantIds)].map((id, index) => (
              <button
                key={id}
                className="button-secondary"
                aria-pressed={id === selected}
                onClick={() => setSelected(id)}
              >
                Participant {index + 1}
              </button>
            ))}
          </div>
          {!participantIds.length && (
            <p>
              No reporting participants are available for conversation
              initiation.
            </p>
          )}
        </>
      )}
      {selected &&
        participantIds.includes(selected) &&
        saved.references &&
        (reference && assigned ? (
          <ReviewerConversation
            key={`${actorId}.${summary.caseId}.${selected}`}
            summary={summary}
            actorId={actorId}
            participantId={selected}
            initialReference={reference}
          />
        ) : reference ? (
          <ConversationThread
            reference={reference}
            actorId={actorId}
            reviewerId={summary.reviewerId}
            writable={assigned}
          />
        ) : assigned ? (
          <ReviewerConversation
            key={`${actorId}.${summary.caseId}.${selected}`}
            summary={summary}
            actorId={actorId}
            participantId={selected}
          />
        ) : (
          <p>No confirmed conversation is available for this participant.</p>
        ))}
      <p className="case-scope-note">
        Conversations are available for participants who submitted a report,
        including historical couriers.
      </p>
    </section>
  )
}
function ReviewerConversation({
  summary,
  actorId,
  participantId,
  initialReference,
}: {
  summary: Summary
  actorId: string
  participantId: string
  initialReference?: Conversation
}) {
  const storageKey = `foc.conversation-pending.${actorId}.${summary.caseId}.${participantId}`
  const [reference, setReference] = useState<Conversation | undefined>(
    initialReference,
  )
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(() => {
    try {
      if (initialReference) {
        sessionStorage.removeItem(storageKey)
        return null
      }
      return sessionStorage.getItem(storageKey)
    } catch {
      return null
    }
  })
  const [error, setError] = useState('')
  const active = useRef(true)
  const guard = useRef(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      controller.current?.abort()
    }
  }, [])
  async function open() {
    if (
      guard.current ||
      summary.state !== 'UNDER_REVIEW' ||
      summary.reviewerId !== actorId
    )
      return
    const key = pending && isUuid(pending) ? pending : crypto.randomUUID()
    try {
      sessionStorage.setItem(storageKey, key)
    } catch {
      setError(
        'Your browser could not preserve the request for safe retry. No request was sent.',
      )
      return
    }
    setPending(key)
    guard.current = true
    setBusy(true)
    setError('')
    const abort = new AbortController()
    controller.current = abort
    const timer = window.setTimeout(() => abort.abort(), 8000)
    try {
      const value = await request<Conversation>(
        `cases/${summary.caseId}/conversations`,
        abort.signal,
        { key, body: { participantUserId: participantId } },
      )
      if (!active.current) return
      if (
        !value ||
        typeof value.conversationId !== 'string' ||
        !isUuid(value.conversationId)
      )
        throw new Error('Invalid conversation')
      const validated = conversation(value, {
        conversationId: value.conversationId,
        caseId: summary.caseId,
        orderId: summary.orderId,
        participantUserId: participantId,
        readOnly: true,
      })
      sessionStorage.removeItem(storageKey)
      setPending(null)
      setReference(validated)
    } catch (e) {
      if (!active.current) return
      setError(chatFailure(e))
      if (e instanceof CaseError && e.status === 400) {
        sessionStorage.removeItem(storageKey)
        setPending(null)
      }
    } finally {
      clearTimeout(timer)
      if (active.current) {
        guard.current = false
        setBusy(false)
      }
    }
  }
  return (
    <div className="conversation-selection">
      <details className="evidence-technical">
        <summary>Selected participant details</summary>
        <p>Account ID: {participantId}</p>
      </details>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {reference && (
        <ConversationThread
          reference={reference}
          actorId={actorId}
          reviewerId={summary.reviewerId}
          writable={
            summary.state === 'UNDER_REVIEW' && summary.reviewerId === actorId
          }
        />
      )}
      {(!reference || initialReference) && (
        <>
          <p>
            {initialReference
              ? 'Refresh access to this active case conversation. Its existing history is preserved.'
              : 'Open a private conversation with this reporting participant.'}
          </p>
          {pending && (
            <p role="status">
              Initiation is unconfirmed. Retry the same request to confirm its
              outcome.
            </p>
          )}
          <button
            disabled={
              busy ||
              summary.state !== 'UNDER_REVIEW' ||
              summary.reviewerId !== actorId
            }
            onClick={() => void open()}
          >
            {busy
              ? 'Opening…'
              : pending
                ? 'Retry opening conversation'
                : initialReference
                  ? 'Refresh conversation access'
                  : 'Open private conversation'}
          </button>
        </>
      )}
    </div>
  )
}
