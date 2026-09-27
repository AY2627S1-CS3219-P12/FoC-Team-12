import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import bagIcon from '../assets/foc-bag.svg'
import { navigateTo } from '../navigation'
import styles from './AppShell.module.css'

export function AppShell() {
  const { session, signOut } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}`
  const managing = location.pathname.startsWith('/admin/suppliers')

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
            {session?.role === 'ADMIN' &&
              (managing ? (
                <Link to="/suppliers">Public supplier view</Link>
              ) : (
                <Link to="/admin/suppliers">Manage suppliers</Link>
              ))}
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
