import { useEffect, useState } from 'react'
import { AdminShell } from './components/AdminShell'
import { readSession } from './auth/session'
import { AccessError, checkAccess } from './access'
import { EvidencePanel } from './EvidencePanel'
import { formatSingaporeTime } from './time'
import {
  CaseConversations,
  ParticipantConversationStatus,
} from './CaseConversations'
import {
  CaseError,
  isUuid,
  request,
  uuidPattern,
  type Detail,
  type Page,
  type Report,
  type Summary,
} from './cases'

function message(error: unknown) {
  if (error instanceof CaseError || error instanceof AccessError) {
    if (error.status === 401)
      return 'Your session has expired. Sign in to continue.'
    if (error.status === 403)
      return 'Access denied. Select the appropriate workspace or contact an administrator.'
    if (error.status === 404)
      return 'This case is unavailable or you do not have access.'
    if (error.status < 500) return error.message
  }
  return 'A required service is unavailable. Please try again shortly.'
}

export function CaseWorkspace() {
  const [session, setSession] = useState(readSession)
  useEffect(() => {
    const refresh = () => setSession(readSession())
    const timer = window.setInterval(refresh, 15_000)
    const events = ['focus', 'foc:session-changed', 'foc:session-expired']
    events.forEach((e) => window.addEventListener(e, refresh))
    return () => {
      clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, refresh))
    }
  }, [])
  return (
    <Workspace key={session?.accessToken || 'signed-out'} session={session} />
  )
}

function Workspace({ session }: { session: ReturnType<typeof readSession> }) {
  const participant = window.location.pathname.startsWith('/admin/reports')
  const id = window.location.pathname.split('/')[3] || ''
  const suppliedOrder =
    new URLSearchParams(window.location.search).get('orderId') || ''
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!session || participant) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    let active = true
    checkAccess(session, controller.signal)
      .then(() => {
        if (active) setVerified(true)
      })
      .catch((e) => {
        if (active) {
          setVerified(false)
          setError(message(e))
        }
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [session, participant, attempt])
  useEffect(() => {
    if (!verified) return
    const timer = window.setTimeout(() => {
      setAttempt((n) => n + 1)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [verified, attempt])
  const allowed =
    session &&
    (participant
      ? session.role === 'REQUESTER' || session.role === 'COURIER'
      : verified)
  return (
    <AdminShell administratorAccess={verified}>
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            {participant ? 'Participant reports' : 'Administration'}
          </p>
          <h1>
            {participant
              ? id && id !== 'new'
                ? 'Your report'
                : 'Report an errand issue'
              : 'Case review'}
          </h1>
          <p>
            {participant
              ? 'Submit your own statement and privately check your report.'
              : 'Review statements and take responsibility for an open case.'}
          </p>
        </div>
      </div>
      {!participant && (
        <a className="back-link" href={'/admin' + window.location.search}>
          <Arrow direction="back" />
          Back to report queue
        </a>
      )}
      {participant && id === 'new' && isUuid(suppliedOrder) && (
        <a className="back-link" href={'/errands/' + suppliedOrder}>
          <Arrow direction="back" />
          Back to errand
        </a>
      )}
      {!session ? (
        <section className="message-card">
          <h2>Sign in to continue</h2>
          <a
            className="button"
            href={
              '/?returnTo=' +
              encodeURIComponent(
                window.location.pathname + window.location.search,
              )
            }
          >
            Sign in to FoC
          </a>
        </section>
      ) : !allowed ? (
        <section className="message-card">
          <h2>
            {error ||
              (participant
                ? 'Select Requester or Courier mode to report an issue.'
                : 'Checking your access')}
          </h2>
          {error && (
            <button
              onClick={() => {
                setError('')
                setAttempt((n) => n + 1)
              }}
            >
              Try again
            </button>
          )}
        </section>
      ) : participant ? (
        id && id !== 'new' ? (
          <ReportStatus id={id} />
        ) : (
          <ReportEntry actor={session.userId} orderId={suppliedOrder} />
        )
      ) : id ? (
        <CaseDetail id={id} actor={session.userId} />
      ) : (
        <CaseQueue actor={session.userId} />
      )}
    </AdminShell>
  )
}

function Arrow({ direction = 'forward' }: { direction?: 'forward' | 'back' }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d={
          direction === 'back'
            ? 'M19 12H5m6 6-6-6 6-6'
            : 'M5 12h14m-6-6 6 6-6 6'
        }
      />
    </svg>
  )
}

function useRemote<T>(path: string) {
  const [response, setResponse] = useState<{
    path: string
    data?: T
    error?: string
  }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    let active = true
    request<T>(path, controller.signal)
      .then((value) => {
        if (active) setResponse({ path, data: value })
      })
      .catch((e) => {
        if (active) setResponse({ path, error: message(e) })
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [path, attempt])
  return {
    data: response?.path === path ? response.data : undefined,
    error: response?.path === path ? response.error || '' : '',
    retry: () => {
      setResponse(undefined)
      setAttempt((n) => n + 1)
    },
  }
}

function Feedback({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <section className="message-card" role="alert">
      <h2>{error}</h2>
      <button onClick={retry}>Try again</button>
    </section>
  ) : (
    <p role="status">Loading cases…</p>
  )
}
function SummaryCard({ value }: { value: Summary }) {
  return (
    <dl className="case-facts">
      <div>
        <dt>Status</dt>
        <dd>
          <span className="role-chip">{value.state.replaceAll('_', ' ')}</span>
        </dd>
      </div>
      <div>
        <dt>Case ID</dt>
        <dd>{value.caseId}</dd>
      </div>
      <div>
        <dt>Errand ID</dt>
        <dd>{value.orderId}</dd>
      </div>
      <div>
        <dt>Reviewer</dt>
        <dd>{value.reviewerId || 'Unassigned'}</dd>
      </div>
      <div>
        <dt>Revision</dt>
        <dd>{value.revision}</dd>
      </div>
      <div>
        <dt>Opened</dt>
        <dd>{formatSingaporeTime(value.createdAt)}</dd>
      </div>
    </dl>
  )
}

type Pending = { key: string; body: Record<string, string | number> }
function useMutation<T>(storageKey: string) {
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(storageKey) || 'null',
      ) as Pending | null
      return value &&
        isUuid(value.key) &&
        value.body &&
        typeof value.body === 'object'
        ? value
        : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<T>()
  async function submit(path: string, body: Pending['body']) {
    if (busy) return
    const operation = pending || { key: crypto.randomUUID(), body }
    // Save before sending: a reload or lost response retries the identical operation.
    sessionStorage.setItem(storageKey, JSON.stringify(operation))
    setPending(operation)
    setBusy(true)
    setError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    try {
      setResult(await request<T>(path, controller.signal, operation))
      sessionStorage.removeItem(storageKey)
      setPending(null)
    } catch (e) {
      setError(message(e))
      if (e instanceof CaseError && e.status < 500) {
        sessionStorage.removeItem(storageKey)
        setPending(null)
      }
    } finally {
      clearTimeout(timeout)
      setBusy(false)
    }
  }
  return { pending, busy, error, result, submit }
}

function ReportEntry({ actor, orderId }: { actor: string; orderId: string }) {
  if (!isUuid(orderId))
    return (
      <section className="message-card">
        <h2>Choose an errand to report</h2>
        <p>A report must be linked to a specific errand you participated in.</p>
        <a className="button" href="/errands/mine">
          Go to my errands
        </a>
      </section>
    )
  return <ReportForm key={orderId} actor={actor} orderId={orderId} />
}
function ReportForm({ actor, orderId }: { actor: string; orderId: string }) {
  const mutation = useMutation<Report>('foc.report-pending.' + actor)
  const order = orderId
  const [description, setDescription] = useState(
    String(mutation.pending?.body.description || ''),
  )
  if (mutation.pending && mutation.pending.body.orderId !== orderId)
    return (
      <section className="message-card">
        <h2>Finish your pending report</h2>
        <p>
          A previous submission still needs confirmation. Retry it before
          starting a report for another errand.
        </p>
        <a
          className="button"
          href={
            '/admin/reports/new?orderId=' +
            encodeURIComponent(String(mutation.pending.body.orderId))
          }
        >
          Resume pending report
        </a>
      </section>
    )
  if (mutation.result)
    return (
      <section className="case-panel" role="status">
        <h2>Your report was submitted</h2>
        <p>Save this case ID to return to your private status page.</p>
        <SummaryCard value={mutation.result.case} />
        <a
          className="button"
          href={'/admin/reports/' + mutation.result.case.caseId}
        >
          View my report
        </a>
      </section>
    )
  return (
    <section className="case-panel report-form-panel">
      <h2>Submit a statement</h2>
      <p>
        Tell us what happened with this errand. You can submit one statement;
        only you and authorized administrators can read it.
      </p>
      <form
        className="case-form"
        onSubmit={(e) => {
          e.preventDefault()
          void mutation.submit('reports', {
            orderId: order.trim(),
            description: description.trim(),
          })
        }}
      >
        <div className="report-context">
          <span>Reporting this errand</span>
          <strong>{order}</strong>
        </div>
        <label htmlFor="description">What happened?</label>
        <textarea
          id="description"
          required
          maxLength={2000}
          rows={7}
          value={description}
          disabled={mutation.busy || !!mutation.pending}
          onChange={(e) => setDescription(e.target.value)}
        />
        <small>
          {description.length}/2000 characters. Your statement cannot be edited
          after submission.
        </small>
        {mutation.error && (
          <p role="alert" className="workspace-error">
            {mutation.error}
          </p>
        )}
        {mutation.pending && (
          <p role="status">
            A request is pending. Retry to confirm its outcome using the same
            statement.
          </p>
        )}
        <button disabled={mutation.busy || !description.trim()}>
          {mutation.busy
            ? 'Submitting…'
            : mutation.pending
              ? 'Retry submission'
              : 'Submit report'}
        </button>
      </form>
    </section>
  )
}
function ReportStatus({ id }: { id: string }) {
  if (!isUuid(id)) return <p role="alert">A valid case UUID is required.</p>
  return <ReportStatusData id={id} />
}
function ReportStatusData({ id }: { id: string }) {
  const state = useRemote<Report>('reports/' + id)
  if (!state.data) return <Feedback {...state} />
  return (
    <section className="case-panel">
      <a className="back-link" href={'/errands/' + state.data.case.orderId}>
        <Arrow direction="back" />
        Back to errand
      </a>
      <h2>Report status</h2>
      <SummaryCard value={state.data.case} />
      <h3>Your statement</h3>
      <p className="statement-text">{state.data.ownStatement.description}</p>
      <p className="muted">
        Submitted {formatSingaporeTime(state.data.ownStatement.submittedAt)}
      </p>
      <button onClick={state.retry}>Refresh status</button>
      <ParticipantConversationStatus summary={state.data.case} />
    </section>
  )
}
type QueueFilter = { status: string; query: string; page: number }
const statuses = [
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: '', label: 'All reports' },
]
function initialFilters(): QueueFilter {
  const params = new URLSearchParams(window.location.search)
  const status =
    params.get('status') === 'ALL' ? '' : (params.get('status') ?? 'OPEN')
  const query = params.get('query') || ''
  const page = Number(params.get('page') || 0)
  return {
    status: statuses.some((item) => item.value === status) ? status : 'OPEN',
    query: isUuid(query) ? query : '',
    page:
      Number.isSafeInteger(page) && page >= 0 && page <= 2147483647 ? page : 0,
  }
}
function queueParams(filters: QueueFilter) {
  return new URLSearchParams({
    page: String(filters.page),
    size: '20',
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.query ? { query: filters.query } : {}),
  }).toString()
}
function queueLocation(filters: QueueFilter) {
  return queueParams(filters) + (filters.status ? '' : '&status=ALL')
}
export function CaseQueue({ actor }: { actor: string }) {
  const [filters, setFilters] = useState(initialFilters)
  const [query, setQuery] = useState(filters.query)
  const params = queueParams(filters)
  const state = useRemote<Page>('cases?' + params)
  function apply(next: QueueFilter) {
    setFilters(next)
    window.history.replaceState(
      null,
      '',
      window.location.pathname + '?' + queueLocation(next),
    )
  }
  function clear() {
    setQuery('')
    apply({ status: '', query: '', page: 0 })
  }
  const emptyOpen = filters.status === 'OPEN' && !filters.query
  return (
    <section
      className="case-panel report-queue"
      aria-labelledby="report-queue-title"
    >
      <div className="section-heading queue-heading">
        <div>
          <h2 id="report-queue-title">
            Report queue{' '}
            {state.data && (
              <span className="queue-count">{state.data.totalElements}</span>
            )}
          </h2>
          <p>Review participant reports and claim an open case to begin.</p>
        </div>
        <button
          className="button-secondary"
          onClick={state.retry}
          type="button"
        >
          <svg
            className="ui-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M20 7v5h-5M4 17v-5h5M5.5 8a7 7 0 0 1 11.8-2L20 9M4 15l2.7 3A7 7 0 0 0 18.5 16" />
          </svg>
          Refresh
        </button>
      </div>
      <div
        className="queue-statuses"
        role="group"
        aria-label="Filter reports by status"
      >
        {statuses.map((status) => (
          <button
            key={status.value}
            type="button"
            aria-pressed={filters.status === status.value}
            onClick={() => apply({ ...filters, status: status.value, page: 0 })}
          >
            {status.label}
          </button>
        ))}
      </div>
      <form
        className="queue-search"
        onSubmit={(e) => {
          e.preventDefault()
          apply({ ...filters, query: query.trim(), page: 0 })
        }}
      >
        <label htmlFor="queue-search">Find a case or errand</label>
        <div className="queue-search-row">
          <input
            id="queue-search"
            pattern={uuidPattern}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a case or errand ID"
          />
          <button type="submit">
            <svg
              className="ui-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
            Search
          </button>
          {filters.query && (
            <button
              className="button-secondary"
              type="button"
              onClick={() => {
                setQuery('')
                apply({ ...filters, query: '', page: 0 })
              }}
            >
              Clear search
            </button>
          )}
        </div>
      </form>
      <div aria-busy={!state.data && !state.error}>
        {!state.data ? (
          state.error ? (
            <div className="queue-state" role="alert">
              <h3>Reports could not be loaded</h3>
              <p>{state.error}</p>
              <button onClick={state.retry} type="button">
                Try again
              </button>
            </div>
          ) : (
            <div className="queue-state" role="status">
              <p>Loading report queue…</p>
            </div>
          )
        ) : (
          <>
            {state.data.content.length === 0 ? (
              <div className="queue-state">
                <span className="empty-queue-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    className="ui-icon"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path d="M8 5h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 3h6v4H9zM8 12h8M8 16h5" />
                  </svg>
                </span>
                <h3>
                  {emptyOpen
                    ? 'No open reports'
                    : 'No reports match these filters'}
                </h3>
                <p>
                  {emptyOpen
                    ? 'New participant reports will appear here when they are ready for review.'
                    : 'Try another status or clear the search to see more reports.'}
                </p>
                {!emptyOpen && (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={clear}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <ul className="case-list">
                {state.data.content.map((value) => (
                  <li key={value.caseId}>
                    <a
                      className="case-row"
                      href={
                        '/admin/cases/' +
                        value.caseId +
                        '?' +
                        queueLocation(filters)
                      }
                      aria-label={'Review case ' + value.caseId}
                    >
                      <div className="case-row-main">
                        <span
                          className={
                            'case-status status-' + value.state.toLowerCase()
                          }
                        >
                          <span aria-hidden="true" />
                          {
                            statuses.find((item) => item.value === value.state)
                              ?.label
                          }
                        </span>
                        <strong>Case {value.caseId}</strong>
                        <span className="case-row-errand">
                          Errand {value.orderId}
                        </span>
                      </div>
                      <div className="case-row-meta">
                        <span>
                          {value.reviewerId
                            ? value.reviewerId === actor
                              ? 'Assigned to you'
                              : 'Assigned to another reviewer'
                            : 'Ready to claim'}
                        </span>
                        <time dateTime={value.createdAt}>
                          {formatSingaporeTime(value.createdAt)}
                        </time>
                      </div>
                      <span className="case-row-action">
                        Review
                        <Arrow />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="case-pagination">
              <span className="queue-range">
                {state.data.totalElements
                  ? `Showing ${state.data.page * state.data.size + 1}–${Math.min((state.data.page + 1) * state.data.size, state.data.totalElements)} of ${state.data.totalElements}`
                  : '0 reports'}
              </span>
              <div className="queue-page-controls">
                <button
                  className="button-secondary"
                  type="button"
                  disabled={state.data.page === 0}
                  onClick={() =>
                    apply({ ...filters, page: state.data!.page - 1 })
                  }
                >
                  <Arrow direction="back" />
                  Previous
                </button>
                <span>
                  Page {state.data.page + 1} of{' '}
                  {Math.max(1, state.data.totalPages)}
                </span>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={state.data.page + 1 >= state.data.totalPages}
                  onClick={() =>
                    apply({ ...filters, page: state.data!.page + 1 })
                  }
                >
                  Next
                  <Arrow />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
function CaseDetail({ id, actor }: { id: string; actor: string }) {
  if (!isUuid(id)) return <p role="alert">A valid case UUID is required.</p>
  return <DetailData id={id} actor={actor} />
}
function DetailData({ id, actor }: { id: string; actor: string }) {
  const state = useRemote<Detail>('cases/' + id)
  const mutation = useMutation<Summary>('foc.claim-pending.' + actor + '.' + id)
  if (!state.data) return <Feedback {...state} />
  const value =
    mutation.result && mutation.result.revision > state.data.case.revision
      ? mutation.result
      : state.data.case
  return (
    <>
      <section className="case-panel">
        <div className="section-heading">
          <h2>Case details</h2>
          <button onClick={state.retry}>Refresh case</button>
        </div>
        <SummaryCard value={value} />
        {mutation.error && (
          <p role="alert" className="workspace-error">
            {mutation.error}
          </p>
        )}
        {mutation.result && <p role="status">Case assigned to you.</p>}
        {value.state === 'OPEN' || mutation.pending ? (
          <>
            <p>
              Claiming assigns you as the reviewer. Another administrator may
              claim this case first.
            </p>
            <button
              disabled={mutation.busy}
              onClick={() =>
                void mutation.submit('cases/' + id + '/claim', {
                  expectedRevision: value.revision,
                })
              }
            >
              {mutation.busy
                ? 'Claiming…'
                : mutation.pending
                  ? 'Retry claim'
                  : 'Claim case'}
            </button>
            {mutation.pending && (
              <p role="status">
                Retry the pending claim to confirm its outcome.
              </p>
            )}
          </>
        ) : (
          <p>
            {value.reviewerId === actor
              ? 'You are the assigned reviewer.'
              : 'This case is read only for you.'}
          </p>
        )}
      </section>
      <section className="case-panel">
        <h2>Participant statements</h2>
        {state.data.statements.map((statement) => (
          <article className="case-statement" key={statement.reporterId}>
            <h3>Participant {statement.reporterId}</h3>
            <p className="muted">
              {formatSingaporeTime(statement.submittedAt)}
            </p>
            <p className="statement-text">{statement.description}</p>
          </article>
        ))}
      </section>
      <EvidencePanel key={id} caseId={id} orderId={value.orderId} />
      <CaseConversations
        key={`${actor}.${id}`}
        summary={value}
        actorId={actor}
        participantIds={state.data.statements.map((s) => s.reporterId)}
      />
    </>
  )
}
