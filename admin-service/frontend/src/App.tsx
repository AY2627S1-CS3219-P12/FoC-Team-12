import { useEffect, useState } from 'react'
import { AccessError, checkAccess, readSession } from './access'
import { AdminShell } from './components/AdminShell'
import { CaseWorkspace } from './CaseWorkspace'

type State = 'loading' | 'signin' | 'denied' | 'unavailable' | 'ready'
const signIn = '/?returnTo=%2Fadmin'

export function App() {
  return window.location.pathname.startsWith('/admin/reports') ||
    window.location.pathname.startsWith('/admin/cases') ? (
    <CaseWorkspace />
  ) : (
    <Dashboard />
  )
}

function Dashboard() {
  const [session, setSession] = useState(readSession)
  const [attempt, setAttempt] = useState(0)
  const [access, setAccess] = useState<{ token?: string; state: State }>({
    state: 'loading',
  })
  useEffect(() => {
    const refresh = () => setSession(readSession())
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('foc:session-changed', refresh)
    window.addEventListener('foc:session-expired', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('foc:session-changed', refresh)
      window.removeEventListener('foc:session-expired', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  const token = session?.accessToken
  const userId = session?.userId
  useEffect(() => {
    if (!token || !userId) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    let active = true
    checkAccess({ accessToken: token, userId }, controller.signal)
      .then(() => {
        if (active) setAccess({ token, state: 'ready' })
      })
      .catch((e: unknown) => {
        if (active)
          setAccess({
            token,
            state:
              e instanceof AccessError && e.status === 401
                ? 'signin'
                : e instanceof AccessError && e.status === 403
                  ? 'denied'
                  : 'unavailable',
          })
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [token, userId, attempt])
  // A replacement identity never inherits the previous identity's successful check.
  const state: State = !session
    ? 'signin'
    : access.token === token
      ? access.state
      : 'loading'
  useEffect(() => {
    if (state !== 'ready') return
    const timer = window.setTimeout(() => {
      setAccess({ state: 'loading' })
      setAttempt((n) => n + 1)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [state, attempt])
  const retry = () => {
    setAccess({ state: 'loading' })
    setAttempt((n) => n + 1)
  }
  return (
    <AdminShell administratorAccess={state === 'ready'}>
      <div className="page-intro">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Admin dashboard</h1>
          <p>
            Manage accounts and campus suppliers from their dedicated spaces.
          </p>
        </div>
        {state === 'ready' && (
          <span className="role-chip">Access verified</span>
        )}
      </div>
      {state === 'loading' && (
        <section className="message-card" role="status">
          <span className="message-illustration" aria-hidden="true">
            ◌
          </span>
          <h2>Checking your access</h2>
          <p>Confirming your current administrator permissions.</p>
        </section>
      )}
      {state === 'signin' && (
        <section className="message-card" aria-labelledby="state-title">
          <span className="message-illustration" aria-hidden="true">
            ◌
          </span>
          <p className="eyebrow">Authentication required</p>
          <h2 id="state-title">Sign in to continue</h2>
          <p>
            Use your FoC account and select Admin mode to open this workspace.
          </p>
          <a className="button" href={signIn}>
            Sign in to FoC
          </a>
        </section>
      )}
      {state === 'denied' && (
        <section className="message-card" aria-labelledby="state-title">
          <span className="message-illustration" aria-hidden="true">
            ◌
          </span>
          <p className="eyebrow">Access restricted</p>
          <h2 id="state-title">This workspace is for administrators</h2>
          <p>
            Your current session cannot access administration. If you have
            administrator access, select Admin mode in the account menu.
          </p>
          <a className="button" href="/?view=profile">
            Go to your profile
          </a>
        </section>
      )}
      {state === 'unavailable' && (
        <section className="message-card" role="alert">
          <span className="message-illustration" aria-hidden="true">
            ◌
          </span>
          <p className="eyebrow">Connection problem</p>
          <h2>We couldn’t verify your access</h2>
          <p>
            Account verification is temporarily unavailable. Try again in a
            moment to open the workspace.
          </p>
          <button onClick={retry} type="button">
            Try again
          </button>
          <a className="text-link" href="/?view=profile">
            Return to your profile
          </a>
        </section>
      )}
      {state === 'ready' && (
        <>
          <nav className="service-grid" aria-label="Administration tools">
            <a className="service-card admin-card" href="/?view=users">
              <h2>Manage users</h2>
              <p>
                Review accounts, administrator assignments and account access.
              </p>
              <span className="service-action">Open account management →</span>
            </a>
            <a className="service-card admin-card" href="/admin/suppliers">
              <h2>Campus suppliers</h2>
              <p>Manage the campus locations used by your community.</p>
              <span className="service-action">Open supplier management →</span>
            </a>
          </nav>
          <section className="case-panel" aria-labelledby="case-review-title">
            <div className="section-heading">
              <h2 id="case-review-title">Case review</h2>
              <a className="button" href="/admin/cases">
                Open case queue
              </a>
            </div>
            <p>
              Review participant statements and claim an open case. Evidence,
              conversations and resolution tools are planned for later
              iterations.
            </p>
          </section>
        </>
      )}
    </AdminShell>
  )
}
