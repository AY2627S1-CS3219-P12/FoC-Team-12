import { useEffect, useRef, useState } from 'react'
import {
  CaseError,
  isUuid,
  request,
  type CreditAction,
  type Summary,
} from './cases'
import { formatSingaporeTime } from './time'

type Input = {
  type: 'CREDIT_ADJUSTMENT'
  targetUserId: string
  amount: number
  reason: string
}
type Pending = { key: string; body: Input }
function validateAction(value: CreditAction, caseId: string): CreditAction {
  if (
    !value ||
    !isUuid(value.operationId) ||
    value.caseId !== caseId ||
    !isUuid(value.targetUserId) ||
    value.type !== 'CREDIT_ADJUSTMENT' ||
    !Number.isInteger(value.amount) ||
    value.amount === 0 ||
    value.amount < -2147483648 ||
    value.amount > 2147483647 ||
    typeof value.reason !== 'string' ||
    !value.reason.trim() ||
    value.reason.length > 2000 ||
    !['PENDING', 'UNKNOWN', 'SUCCEEDED', 'REJECTED'].includes(value.status) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    (value.completedAt !== null &&
      !Number.isFinite(Date.parse(value.completedAt))) ||
    !(
      (value.status === 'SUCCEEDED' || value.status === 'REJECTED') ===
      (value.completedAt !== null)
    ) ||
    !(value.reasonCode === null || typeof value.reasonCode === 'string')
  )
    throw new Error('Invalid action response')
  return value
}
const failure = (e: unknown) =>
  e instanceof CaseError && [401, 403, 404].includes(e.status)
    ? 'You no longer have access to these case actions. Refresh case access.'
    : e instanceof CaseError && e.status === 409
      ? 'This request conflicts with the current case or an earlier operation. Refresh case access; do not create a replacement while its outcome is uncertain.'
      : 'The action service is unavailable. No new financial outcome is confirmed. Retry an unconfirmed submission with the same request.'
const explanations = {
  PENDING:
    'Accepted by Admin. Waiting for Credit to confirm the financial outcome.',
  UNKNOWN:
    'Confirmation is overdue. This may already have taken effect. Recovery retains the original operation; do not submit a replacement.',
  SUCCEEDED: 'Credit confirmed that this correction was applied.',
  REJECTED:
    'Credit rejected this correction. This operation will not be retried as a new correction.',
}
export function CreditActions({
  summary,
  actorId,
  participantIds,
  initialActions = [],
}: {
  summary: Summary
  actorId: string
  participantIds: string[]
  initialActions?: CreditAction[]
}) {
  const storageKey = `foc.credit-action-pending.${actorId}.${summary.caseId}`
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const p = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      return p &&
        isUuid(p.key) &&
        p.body?.type === 'CREDIT_ADJUSTMENT' &&
        isUuid(p.body.targetUserId) &&
        Number.isInteger(p.body.amount) &&
        p.body.amount !== 0 &&
        typeof p.body.reason === 'string'
        ? p
        : null
    } catch {
      return null
    }
  })
  const [actions, setActions] = useState<CreditAction[]>(() => {
    try {
      return initialActions.map((a) => validateAction(a, summary.caseId))
    } catch {
      return []
    }
  })
  const [historyUnavailable] = useState(() => {
    try {
      initialActions.forEach((a) => validateAction(a, summary.caseId))
      return false
    } catch {
      return true
    }
  })
  const [target, setTarget] = useState(pending?.body.targetUserId || '')
  const [direction, setDirection] = useState<'add' | 'subtract'>(
    pending && pending.body.amount < 0 ? 'subtract' : 'add',
  )
  const [amount, setAmount] = useState(
    pending ? String(Math.abs(pending.body.amount)) : '',
  )
  const [reason, setReason] = useState(pending?.body.reason || '')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [denied, setDenied] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const guard = useRef(false)
  const active = useRef(true)
  const abort = useRef<AbortController | null>(null)
  const current = useRef(actions)
  useEffect(() => {
    current.current = actions
  }, [actions])
  const writable =
    summary.state === 'UNDER_REVIEW' &&
    summary.reviewerId === actorId &&
    !denied &&
    !historyUnavailable
  const eligible = [...new Set(participantIds)]
  const numeric = Number(amount)
  const valid =
    eligible.includes(target) &&
    /^\d+$/.test(amount) &&
    Number.isSafeInteger(numeric) &&
    numeric > 0 &&
    numeric <= 2147483647 &&
    reason.trim().length > 0 &&
    reason.trim().length <= 2000
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      abort.current?.abort()
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    let controller = new AbortController()
    let timer: number | undefined
    async function poll() {
      controller = new AbortController()
      const outstanding = current.current.filter(
        (a) => a.status === 'PENDING' || a.status === 'UNKNOWN',
      )
      if (!outstanding.length && refresh === 0) return
      const targets = outstanding.length ? outstanding : current.current
      const timeout = window.setTimeout(() => controller.abort(), 8000)
      try {
        const updates = await Promise.all(
          targets.map((a) =>
            request<CreditAction>(
              `cases/${summary.caseId}/actions/${a.operationId}`,
              controller.signal,
            ).then((v) => {
              const result = validateAction(v, summary.caseId)
              if (
                result.operationId !== a.operationId ||
                result.targetUserId !== a.targetUserId ||
                result.amount !== a.amount ||
                result.reason !== a.reason
              )
                throw new Error('Mismatched action')
              if (
                ['SUCCEEDED', 'REJECTED'].includes(a.status) &&
                JSON.stringify(result) !== JSON.stringify(a)
              )
                throw new Error('Changed terminal outcome')
              return result
            }),
          ),
        )
        if (cancelled) return
        setActions((old) =>
          old.map(
            (a) => updates.find((u) => u.operationId === a.operationId) || a,
          ),
        )
        setPollError('')
      } catch (e) {
        if (cancelled) return
        setPollError(failure(e))
        if (e instanceof CaseError && [401, 403, 404].includes(e.status)) {
          setDenied(true)
          setActions([])
          return
        }
      } finally {
        clearTimeout(timeout)
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 5000)
    }
    timer = window.setTimeout(() => void poll(), refresh ? 0 : 5000)
    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [summary.caseId, refresh, actions.length])
  async function submit() {
    if (guard.current || !writable || (!pending && !valid)) return
    const operation: Pending = pending || {
      key: crypto.randomUUID(),
      body: {
        type: 'CREDIT_ADJUSTMENT',
        targetUserId: target,
        amount: direction === 'subtract' ? -numeric : numeric,
        reason: reason.trim(),
      },
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(operation))
    } catch {
      setError(
        'Your browser could not preserve this request for safe retry. Nothing was submitted.',
      )
      return
    }
    guard.current = true
    setBusy(true)
    setPending(operation)
    setError('')
    const controller = new AbortController()
    abort.current = controller
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const value = validateAction(
        await request<CreditAction>(
          `cases/${summary.caseId}/actions`,
          controller.signal,
          operation,
        ),
        summary.caseId,
      )
      if (!active.current) return
      if (
        value.targetUserId !== operation.body.targetUserId ||
        value.amount !== operation.body.amount ||
        value.reason !== operation.body.reason
      )
        throw new Error('Mismatched acceptance')
      setActions((old) =>
        old.some((a) => a.operationId === value.operationId)
          ? old
          : [...old, value],
      )
      sessionStorage.removeItem(storageKey)
      setPending(null)
      setConfirm(false)
      setAmount('')
      setReason('')
      setRefresh((n) => n + 1)
    } catch (e) {
      if (active.current) {
        setError(failure(e))
        if (e instanceof CaseError && [401, 403, 404].includes(e.status)) {
          setDenied(true)
          setActions([])
        }
        if (e instanceof CaseError && e.status === 400) {
          sessionStorage.removeItem(storageKey)
          setPending(null)
        }
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
    <section
      className="case-panel credit-actions"
      aria-labelledby="credit-actions-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administrative correction</p>
          <h2 id="credit-actions-title">Credit additions and subtractions</h2>
        </div>
        <button
          className="button-secondary"
          disabled={busy || denied}
          onClick={() => setRefresh((n) => n + 1)}
        >
          Refresh action status
        </button>
      </div>
      <p>
        These corrections add or remove available credits independently of an
        errand’s reward. Credit Service decides and confirms the financial
        outcome.
      </p>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {pollError && (
        <p role="alert" className="workspace-error">
          Status could not be refreshed. Last confirmed information is shown.{' '}
          {pollError}
        </p>
      )}
      {historyUnavailable && (
        <p role="alert" className="workspace-error">
          Action history could not be verified. Refresh the case before
          requesting a new correction.
        </p>
      )}
      {!denied && (
        <>
          {actions.length ? (
            <ul className="credit-action-list">
              {actions.map((a) => (
                <li key={a.operationId}>
                  <div className="section-heading">
                    <h3>
                      {a.amount > 0 ? 'Add' : 'Subtract'} {Math.abs(a.amount)}{' '}
                      credits
                    </h3>
                    <span
                      className={`action-state action-${a.status.toLowerCase()}`}
                    >
                      {a.status}
                    </span>
                  </div>
                  <p>{explanations[a.status]}</p>
                  <p>
                    Target:{' '}
                    {eligible.includes(a.targetUserId)
                      ? `Participant ${eligible.indexOf(a.targetUserId) + 1}`
                      : 'Case participant'}
                  </p>
                  <p className="statement-text">{a.reason}</p>
                  {a.reasonCode && (
                    <p>
                      Reason: {a.reasonCode.toLowerCase().replaceAll('_', ' ')}
                    </p>
                  )}
                  <p className="evidence-meta">
                    Requested{' '}
                    <time dateTime={a.createdAt}>
                      {formatSingaporeTime(a.createdAt)}
                    </time>
                    {a.completedAt && (
                      <>
                        {' '}
                        · Completed{' '}
                        <time dateTime={a.completedAt}>
                          {formatSingaporeTime(a.completedAt)}
                        </time>
                      </>
                    )}
                  </p>
                  <details className="evidence-technical">
                    <summary>Operation details</summary>
                    <p>Operation ID: {a.operationId}</p>
                    <p>Target account ID: {a.targetUserId}</p>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            !historyUnavailable && (
              <p>No credit corrections recorded for this case.</p>
            )
          )}
          {writable ? (
            <form
              className="case-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!pending) setConfirm(true)
                else void submit()
              }}
            >
              <label htmlFor="credit-target">Participant</label>
              <select
                id="credit-target"
                value={target}
                disabled={busy || !!pending || confirm}
                onChange={(e) => setTarget(e.target.value)}
                required
              >
                <option value="">Choose a reporting participant</option>
                {eligible.map((id, index) => (
                  <option key={id} value={id}>
                    Participant {index + 1}
                  </option>
                ))}
              </select>
              <fieldset
                className="credit-direction"
                disabled={busy || !!pending || confirm}
              >
                <legend>Correction</legend>
                <label>
                  <input
                    type="radio"
                    name="credit-direction"
                    checked={direction === 'add'}
                    onChange={() => setDirection('add')}
                  />{' '}
                  Add credits
                </label>
                <label>
                  <input
                    type="radio"
                    name="credit-direction"
                    checked={direction === 'subtract'}
                    onChange={() => setDirection('subtract')}
                  />{' '}
                  Subtract credits
                </label>
              </fieldset>
              <label htmlFor="credit-amount">Whole credits</label>
              <input
                id="credit-amount"
                type="number"
                min="1"
                max="2147483647"
                step="1"
                required
                value={amount}
                disabled={busy || !!pending || confirm}
                onChange={(e) => setAmount(e.target.value)}
              />
              <label htmlFor="credit-reason">Reason for correction</label>
              <textarea
                id="credit-reason"
                rows={4}
                required
                maxLength={2000}
                value={reason}
                disabled={busy || !!pending || confirm}
                onChange={(e) => setReason(e.target.value)}
              />
              {pending && (
                <p role="status">
                  Submission is unconfirmed. Retry this exact request to recover
                  its original operation. Do not create a replacement.
                </p>
              )}
              {confirm && !pending ? (
                <div
                  className="credit-confirm"
                  role="region"
                  aria-label="Confirm credit correction"
                >
                  <h3>
                    Confirm {direction === 'add' ? 'addition' : 'subtraction'}
                  </h3>
                  <p>
                    {direction === 'add' ? 'Add' : 'Subtract'} {numeric} credits{' '}
                    {direction === 'add' ? 'to' : 'from'} Participant{' '}
                    {eligible.indexOf(target) + 1}. This requests a financial
                    correction; it is not a reward adjustment.
                  </p>
                  <p className="statement-text">{reason.trim()}</p>
                  <div className="conversation-picker">
                    <button
                      type="button"
                      disabled={busy || !valid}
                      onClick={() => void submit()}
                    >
                      Confirm credit correction
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => setConfirm(false)}
                    >
                      Back to editing
                    </button>
                  </div>
                </div>
              ) : (
                <button disabled={busy || (!pending && !valid)}>
                  {busy
                    ? 'Submitting…'
                    : pending
                      ? 'Retry same correction'
                      : 'Review correction'}
                </button>
              )}
            </form>
          ) : (
            <p>
              Only the assigned reviewer can request corrections while the case
              is under review.
            </p>
          )}
          <p className="case-scope-note">
            Targets are limited to verified reporting participants. Historical
            non-reporters await integration. Pending or unknown outcomes are not
            proof of success or rejection.
          </p>
        </>
      )}
    </section>
  )
}
