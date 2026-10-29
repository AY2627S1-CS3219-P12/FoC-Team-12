import { useEffect, useState } from 'react'
import { AdminShell } from './components/AdminShell'
import { readSession } from './auth/session'
import { AccessError, checkAccess } from './access'
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
      setVerified(false)
      setAttempt((n) => n + 1)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [verified])
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
          <h1>{participant ? 'Report an errand issue' : 'Case review'}</h1>
          <p>
            {participant
              ? 'Submit your own statement and privately check your report.'
              : 'Review statements and take responsibility for an open case.'}
          </p>
        </div>
      </div>
      <nav className="case-links" aria-label="Case navigation">
        <a href="/admin">Dashboard</a>
        <a href="/admin/reports/new">Participant reports</a>
        {verified && <a href="/admin/cases">Case queue</a>}
      </nav>
      {!session ? (
        <section className="message-card">
          <h2>Sign in to continue</h2>
          <a
            className="button"
            href={'/?returnTo=' + encodeURIComponent(window.location.pathname)}
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
          <ReportForm actor={session.userId} />
        )
      ) : id ? (
        <CaseDetail id={id} actor={session.userId} />
      ) : (
        <Queue />
      )}
    </AdminShell>
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
        <dd>{new Date(value.createdAt).toLocaleString()}</dd>
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

function ReportForm({ actor }: { actor: string }) {
  const mutation = useMutation<Report>('foc.report-pending.' + actor)
  const [order, setOrder] = useState(
    String(mutation.pending?.body.orderId || ''),
  )
  const [description, setDescription] = useState(
    String(mutation.pending?.body.description || ''),
  )
  const [lookup, setLookup] = useState('')
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
    <div className="case-layout">
      <section className="case-panel">
        <h2>Submit a statement</h2>
        <p>
          You can submit one statement per errand. Chat must confirm that you
          participated and that the eligibility evidence is complete.
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
          <label htmlFor="order">Errand ID</label>
          <input
            id="order"
            required
            pattern={uuidPattern}
            value={order}
            disabled={mutation.busy || !!mutation.pending}
            onChange={(e) => setOrder(e.target.value)}
            placeholder="Paste the errand UUID"
          />
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
            {description.length}/2000 characters. Your statement cannot be
            edited after submission.
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
      <section className="case-panel">
        <h2>Check an existing report</h2>
        <p>Only your own statement and the case status are visible here.</p>
        <form
          className="case-form"
          onSubmit={(e) => {
            e.preventDefault()
            window.location.assign('/admin/reports/' + lookup)
          }}
        >
          <label htmlFor="lookup">Case ID</label>
          <input
            id="lookup"
            required
            pattern={uuidPattern}
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
          />
          <button>View my report</button>
        </form>
      </section>
    </div>
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
      <h2>Your report</h2>
      <SummaryCard value={state.data.case} />
      <h3>Your statement</h3>
      <p className="statement-text">{state.data.ownStatement.description}</p>
      <p className="muted">
        Submitted{' '}
        {new Date(state.data.ownStatement.submittedAt).toLocaleString()}
      </p>
      <button onClick={state.retry}>Refresh status</button>
    </section>
  )
}
function Queue() {
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [params, setParams] = useState('page=0&size=20')
  const state = useRemote<Page>('cases?' + params)
  function navigate(page: number) {
    setParams(
      new URLSearchParams({
        page: String(page),
        size: '20',
        ...(filter ? { status: filter } : {}),
        ...(query.trim() ? { query: query.trim() } : {}),
      }).toString(),
    )
  }
  return (
    <>
      <form
        className="case-panel case-filters"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(0)
        }}
      >
        <label>
          Status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
        <label>
          Case or errand ID
          <input
            pattern={uuidPattern}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Optional UUID"
          />
        </label>
        <button>Apply filters</button>
      </form>
      {!state.data ? (
        <Feedback {...state} />
      ) : (
        <section className="case-panel">
          <div className="section-heading">
            <h2>Cases ({state.data.totalElements})</h2>
            <button onClick={state.retry}>Refresh</button>
          </div>
          {state.data.content.length === 0 ? (
            <p>No cases match these filters.</p>
          ) : (
            <ul className="case-list">
              {state.data.content.map((value) => (
                <li key={value.caseId}>
                  <a href={'/admin/cases/' + value.caseId}>
                    <strong>{value.state.replaceAll('_', ' ')}</strong>
                    <span>Case {value.caseId}</span>
                    <span>Errand {value.orderId}</span>
                    <small>
                      {value.reviewerId
                        ? 'Assigned reviewer: ' + value.reviewerId
                        : 'Available to claim'}{' '}
                      · {new Date(value.createdAt).toLocaleString()}
                    </small>
                    <span className="service-action">Review case →</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="case-pagination">
            <button
              disabled={state.data.page === 0}
              onClick={() => navigate(state.data!.page - 1)}
            >
              Previous
            </button>
            <span>
              Page {state.data.page + 1} of {Math.max(1, state.data.totalPages)}
            </span>
            <button
              disabled={state.data.page + 1 >= state.data.totalPages}
              onClick={() => navigate(state.data!.page + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
    </>
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
              {new Date(statement.submittedAt).toLocaleString()}
            </p>
            <p className="statement-text">{statement.description}</p>
          </article>
        ))}
      </section>
      <section className="case-panel">
        <h2>Further review tools</h2>
        <p>
          Timeline evidence, participant conversations, actions and resolution
          are planned for later iterations. These statements do not represent a
          complete evidence timeline.
        </p>
      </section>
    </>
  )
}
