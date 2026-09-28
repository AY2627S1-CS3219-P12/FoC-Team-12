import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import bagIcon from '../assets/foc-bag.svg'
import { navigateTo } from '../navigation'
import styles from './AppShell.module.css'

export function AppShell() {
  const { session, signOut, workspaceBusy, workspaceError, selectWorkspaceRole } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}`

  const switchCourierWorkspace = async () => {
    if (!session) return
    await selectWorkspaceRole(session.role === 'COURIER' ? 'REQUESTER' : 'COURIER')
  }

  const openAdminWorkspace = async () => {
    if (await selectWorkspaceRole('ADMIN')) navigateTo('/admin/suppliers')
  }

  const returnToRequesterWorkspace = async () => {
    if (await selectWorkspaceRole('REQUESTER')) navigateTo('/suppliers')
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
            {session && session.role !== 'ADMIN' && (
              <div className={styles.modeControl}>
                <span>{session.role === 'COURIER' ? 'Courier mode' : 'Requester mode'}</span>
                <button
                  aria-checked={session.role === 'COURIER'}
                  aria-label="Courier mode"
                  className={styles.modeSwitch}
                  disabled={workspaceBusy}
                  onClick={() => { void switchCourierWorkspace() }}
                  role="switch"
                  type="button"
                >
                  <span aria-hidden="true" />
                </button>
              </div>
            )}
            {session ? (
              <>
                <details className={styles.userMenu}>
                  <summary>{session.username}</summary>
                  <div className={styles.userMenuItems}>
                    <a href="/">Profile</a>
                    {session.availableRoles?.includes('ADMIN') && session.role !== 'ADMIN' && (
                      <button disabled={workspaceBusy} onClick={() => { void openAdminWorkspace() }} type="button">
                        Admin mode
                      </button>
                    )}
                    {session.role === 'ADMIN' && (
                      <button disabled={workspaceBusy} onClick={() => { void returnToRequesterWorkspace() }} type="button">
                        <span aria-hidden="true">✓ </span>Admin mode
                      </button>
                    )}
                  </div>
                </details>
                <button
                  className={styles.signOutButton}
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
      {workspaceError && <p className={styles.workspaceError} role="alert">{workspaceError}</p>}
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
