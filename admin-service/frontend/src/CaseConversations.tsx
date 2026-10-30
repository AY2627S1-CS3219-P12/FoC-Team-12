import { useEffect, useRef, useState } from 'react'
import { CaseError, isUuid, request, type Summary } from './cases'
import { chatFailure, conversation, type Conversation } from './conversations'
import { ConversationThread } from './ConversationThread'

export function ParticipantConversationStatus({
  summary,
}: {
  summary: Summary
}) {
  return (
    <section
      className="conversation-status"
      aria-label="Your private case conversation"
    >
      <h3>Your private conversation</h3>
      {summary.state === 'RESOLVED' && (
        <p>This case is resolved. Any existing conversation is read-only.</p>
      )}
      <p>
        Your conversation is not available here yet. Chat’s private conversation
        lookup still needs to be integrated.
      </p>
      <p>
        Only the assigned reviewer can start the conversation. Other
        participants’ conversations are never shown here.
      </p>
    </section>
  )
}
export function CaseConversations({
  summary,
  actorId,
  participantIds,
}: {
  summary: Summary
  actorId: string
  participantIds: string[]
}) {
  const [selected, setSelected] = useState('')
  const assigned =
    summary.state === 'UNDER_REVIEW' && summary.reviewerId === actorId
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
          Existing conversation lookup for reviewing administrators is pending
          Chat integration.
        </p>
      )}
      {assigned && (
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
      {selected && participantIds.includes(selected) && (
        <ReviewerConversation
          key={`${actorId}.${summary.caseId}.${selected}`}
          summary={summary}
          actorId={actorId}
          participantId={selected}
        />
      )}
      <p className="case-scope-note">
        Historical couriers who submitted a report are supported. Conversation
        access for historical participants without reports awaits an agreed
        authorization contract. This does not change ordinary errand chat
        access.
      </p>
    </section>
  )
}
function ReviewerConversation({
  summary,
  actorId,
  participantId,
}: {
  summary: Summary
  actorId: string
  participantId: string
}) {
  const storageKey = `foc.conversation-pending.${actorId}.${summary.caseId}.${participantId}`
  const [reference, setReference] = useState<Conversation>()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(() =>
    sessionStorage.getItem(storageKey),
  )
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
      {reference ? (
        <ConversationThread
          reference={reference}
          actorId={actorId}
          reviewerId={summary.reviewerId}
          writable={
            summary.state === 'UNDER_REVIEW' && summary.reviewerId === actorId
          }
        />
      ) : (
        <>
          <p>
            Open this participant’s existing conversation, or ask Chat to create
            it if none exists.
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
                : 'Open private conversation'}
          </button>
        </>
      )}
    </div>
  )
}
