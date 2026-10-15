import { type ReactNode, useEffect, useState } from 'react'
import {
  clearSession,
  readSession,
  replaceSessionRole,
  sessionExpiredEvent,
  type WorkspaceRole,
} from '../auth/session'
import { navigateTo } from '../navigation'
import coinMark from '../assets/coin-mark.svg'

export function CreditShell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(readSession)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  const initial = session?.username.trim().charAt(0).toUpperCase() || 'F'

  useEffect(() => {
    const refreshSession = () => setSession(readSession())
    window.addEventListener(sessionExpiredEvent, refreshSession)
    return () => window.removeEventListener(sessionExpiredEvent, refreshSession)
  }, [])

  const selectWorkspaceRole = async (role: WorkspaceRole) => {
    if (!session || role === session.role) return
    setWorkspaceBusy(true)
    setWorkspaceError('')
    try {
      setSession(await replaceSessionRole(role))
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : 'Unable to change workspace right now. Please try again.',
      )
    } finally {
      setWorkspaceBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              <img alt="" src={coinMark} />
            </span>
            <span>Friend on Campus</span>
          </a>
          <nav aria-label="Main navigation" className="main-nav">
            <a href="/suppliers">Locations</a>
            <a aria-current="page" href="/credits">
              Credits
            </a>
          </nav>
          {session && session.role !== 'ADMIN' && (
            <div
              aria-label="Choose your current role"
              className="workspace-selector"
              role="group"
            >
              <span className="workspace-selector-label">Acting as</span>
              <span className="workspace-selector-options">
                <button
                  aria-pressed={session.role === 'REQUESTER'}
                  disabled={workspaceBusy}
                  onClick={() => void selectWorkspaceRole('REQUESTER')}
                  type="button"
                >
                  Requester
                </button>
                <button
                  aria-pressed={session.role === 'COURIER'}
                  disabled={workspaceBusy}
                  onClick={() => void selectWorkspaceRole('COURIER')}
                  type="button"
                >
                  Courier
                </button>
              </span>
            </div>
          )}
          {session ? (
            <details className="account-menu">
              <summary aria-label={`Open account menu for ${session.username}`}>
                <span className="avatar" aria-hidden="true">
                  {initial}
                </span>
                <span className="account-name">{session.username}</span>
                <span aria-hidden="true" className="chevron" />
              </summary>
              <div className="account-menu-items">
                <a href="/">Profile</a>
                {session.availableRoles?.includes('ADMIN') &&
                  session.role !== 'ADMIN' && (
                    <button
                      disabled={workspaceBusy}
                      onClick={() => void selectWorkspaceRole('ADMIN')}
                      type="button"
                    >
                      Switch to Admin
                    </button>
                  )}
                {session.role === 'ADMIN' && (
                  <button
                    disabled={workspaceBusy}
                    onClick={() => void selectWorkspaceRole('REQUESTER')}
                    type="button"
                  >
                    <span aria-hidden="true">✓ </span>Admin
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    clearSession()
                    navigateTo('/')
                  }}
                >
                  Sign out
                </button>
              </div>
            </details>
          ) : (
            <a className="sign-in-link" href="/?returnTo=%2Fcredits">
              Sign in
            </a>
          )}
        </div>
      </header>
      {workspaceError && (
        <p className="workspace-error" role="alert">
          {workspaceError}
        </p>
      )}
      <main className="page-shell">{children}</main>
    </div>
  )
}
