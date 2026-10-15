import type { ReactNode } from 'react'
import { clearSession, readSession } from '../auth/session'
import { navigateTo } from '../navigation'
import coinMark from '../assets/coin-mark.svg'

export function CreditShell({ children }: { children: ReactNode }) {
  const session = readSession()
  const initial = session?.username.trim().charAt(0).toUpperCase() || 'F'

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/suppliers">
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
      <main className="page-shell">{children}</main>
    </div>
  )
}
