import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import bagIcon from '../assets/foc-bag.svg'
import { navigateTo } from '../navigation'
import styles from './AppShell.module.css'

export function AppShell() {
  const { session, signOut, uiMode, setUiMode } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}`

  const toggleMode = () => {
    const nextMode = uiMode === 'admin' ? 'user' : 'admin'
    setUiMode(nextMode)
    navigateTo(nextMode === 'admin' ? '/admin/suppliers' : '/suppliers')
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link className={styles.brand} to="/suppliers">
            <img alt="" height="24" src={bagIcon} width="24" />
            <span>Friend on Campus</span>
          </Link>
          <nav
            aria-label="Account and supplier views"
            className={styles.actions}
          >
            {session?.role === 'ADMIN' && (
              <div className={styles.modeControl}>
                <span>{uiMode === 'admin' ? 'Admin mode' : 'User mode'}</span>
                <button
                  aria-checked={uiMode === 'admin'}
                  aria-label="Admin mode"
                  className={styles.modeSwitch}
                  onClick={toggleMode}
                  role="switch"
                  type="button"
                >
                  <span aria-hidden="true" />
                </button>
              </div>
            )}
            {session ? (
              <>
                <span className={styles.sessionName}>{session.username}</span>
                <button
                  onClick={() => {
                    signOut()
                    navigateTo('/')
                  }}
                  type="button"
                >
                  Sign out
                </button>
              </>
            ) : (
              <a href={`/?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</a>
            )}
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
