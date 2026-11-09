import { useRef, useState } from 'react'
import {
  CaseError,
  isUuid,
  request,
  type AdminAction,
  type Summary,
  type Detail,
} from './cases'

type Submission = {
  key: string
  body: {
    resolution: string
    expectedRevision: number
    rejectedActionExplanations: { operationId: string; explanation: string }[]
  }
}
export function ResolutionPanel({
  summary,
  actor,
  actions,
  resolution,
  closure,
  refresh,
}: {
  summary: Summary
  actor: string
  actions?: AdminAction[]
  resolution?: string | null
  closure?: Detail['closure']
  refresh: () => void
}) {
  const storage = `foc.resolve-pending.${actor}.${summary.caseId}`
  const [pending, setPending] = useState<Submission | null>(() => {
    if (closure)
      return {
        key: closure.operationId,
        body: {
          resolution: closure.resolution,
          expectedRevision: closure.revision,
          rejectedActionExplanations: closure.explanations,
        },
      }
    try {
      const p = JSON.parse(
        sessionStorage.getItem(storage) || 'null',
      ) as Submission | null
      return p &&
        isUuid(p.key) &&
        typeof p.body.resolution === 'string' &&
        Number.isSafeInteger(p.body.expectedRevision) &&
        Array.isArray(p.body.rejectedActionExplanations)
        ? p
        : null
    } catch {
      return null
    }
  })
  const [reason, setReason] = useState(pending?.body.resolution || '')
  const [explanations, setExplanations] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pending?.body.rejectedActionExplanations.map((e) => [
        e.operationId,
        e.explanation,
      ]) || [],
    ),
  )
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const guard = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const rejected = actions?.filter((a) => a.status === 'REJECTED') || []
  const blocked =
    !actions ||
    actions.some((a) => a.status === 'PENDING' || a.status === 'UNKNOWN')
  const valid =
    reason.trim().length > 0 &&
    reason.trim().length <= 2000 &&
    rejected.every(
      (a) =>
        explanations[a.operationId]?.trim() &&
        explanations[a.operationId]!.trim().length <= 2000,
    )
  async function submit() {
    if (guard.current || (!pending && (!valid || blocked))) return
    const operation = pending || {
      key: crypto.randomUUID(),
      body: {
        resolution: reason.trim(),
        expectedRevision: summary.revision,
        rejectedActionExplanations: rejected.map((a) => ({
          operationId: a.operationId,
          explanation: explanations[a.operationId]!.trim(),
        })),
      },
    }
    try {
      sessionStorage.setItem(storage, JSON.stringify(operation))
    } catch {
      setError(
        'Safe retry storage is unavailable. Enable session storage before resolving.',
      )
      return
    }
    setPending(operation)
    guard.current = true
    setBusy(true)
    setError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const result = await request<Detail>(
        `cases/${summary.caseId}/resolve`,
        controller.signal,
        operation,
      )
      if (
        result.case.caseId !== summary.caseId ||
        result.case.state !== 'RESOLVED' ||
        result.case.reviewerId !== actor
      )
        throw new Error('Invalid resolution response')
      sessionStorage.removeItem(storage)
      setPending(null)
      setDone(true)
      setConfirm(false)
      refresh()
      heading.current?.focus()
    } catch (e) {
      if (
        e instanceof CaseError &&
        [400, 401, 403, 404, 409].includes(e.status)
      ) {
        sessionStorage.removeItem(storage)
        setPending(null)
        setConfirm(false)
        setError(
          e.message +
            (e.status === 409 ? ' Refresh the case before trying again.' : ''),
        )
      } else
        setError(
          e instanceof CaseError
            ? e.message
            : 'Resolution could not be confirmed. Retry the same request to recover its outcome; do not assume the case is resolved.',
        )
    } finally {
      clearTimeout(timeout)
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <section className="case-panel" aria-labelledby="resolution-title">
      <h2 id="resolution-title" ref={heading} tabIndex={-1}>
        Case resolution
      </h2>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {closure && summary.state !== 'RESOLVED' && (
        <p role="status">
          Resolution preparation is pending. Conversations and new actions are
          read only. Resume the original resolution below.
        </p>
      )}
      {done && (
        <p role="status">
          Case resolved. The decision is final and case conversations are read
          only.
        </p>
      )}
      {summary.state === 'RESOLVED' ? (
        <>
          <p>This case is resolved. Further reports and actions are closed.</p>
          {resolution && <p className="statement-text">{resolution}</p>}
        </>
      ) : (
        !done &&
        (summary.reviewerId !== actor || summary.state !== 'UNDER_REVIEW' ? (
          <p>Only the assigned reviewer can resolve a case under review.</p>
        ) : (
          <>
            <p>
              Resolution is final. We check fresh Chat evidence before closing
              the case. Unavailable or incomplete evidence keeps it open. No
              account or credit action is required.
            </p>
            {blocked && (
              <p role="status">
                {!actions
                  ? 'Refresh the case to verify action history.'
                  : 'Wait for all pending or unknown actions to receive an owner-confirmed outcome.'}
              </p>
            )}
            <form
              className="case-form"
              onSubmit={(e) => {
                e.preventDefault()
                setConfirm(true)
              }}
            >
              <label htmlFor="resolution-reason">Resolution reason</label>
              <textarea
                id="resolution-reason"
                rows={4}
                maxLength={2000}
                required
                value={reason}
                disabled={busy || !!pending || confirm}
                onChange={(e) => setReason(e.target.value)}
              />
              {rejected.map((a, i) => (
                <div key={a.operationId}>
                  <p>
                    Rejected action {i + 1}:{' '}
                    {a.type === 'BAN' ? 'Account ban' : 'Credit correction'} —{' '}
                    {a.reason}
                  </p>
                  <label htmlFor={`explain-${a.operationId}`}>
                    Explanation for rejected action {i + 1}
                  </label>
                  <textarea
                    id={`explain-${a.operationId}`}
                    required
                    rows={3}
                    maxLength={2000}
                    disabled={busy || !!pending || confirm}
                    value={explanations[a.operationId] || ''}
                    onChange={(e) =>
                      setExplanations({
                        ...explanations,
                        [a.operationId]: e.target.value,
                      })
                    }
                  />
                </div>
              ))}
              {pending ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  {busy
                    ? 'Checking resolution…'
                    : 'Retry same resolution request'}
                </button>
              ) : confirm ? (
                <div role="region" aria-label="Confirm final resolution">
                  <p>
                    Close this case permanently? Participants will see the final
                    status. Your internal reason stays private to
                    administrators.
                  </p>
                  <p className="statement-text">{reason.trim()}</p>
                  <button
                    type="button"
                    disabled={busy || blocked || !valid}
                    onClick={() => void submit()}
                  >
                    Confirm resolution
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button disabled={busy || blocked || !valid}>
                  Review resolution
                </button>
              )}
            </form>
          </>
        ))
      )}
    </section>
  )
}
