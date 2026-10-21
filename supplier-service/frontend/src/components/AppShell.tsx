import { useRef } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import bagIcon from '../assets/foc-bag.svg'
import { navigateTo } from '../navigation'
import styles from './AppShell.module.css'

export function AppShell() {
  const accountMenuRef = useRef<HTMLDetailsElement>(null)
  const {
    session,
    signOut,
    workspaceBusy,
    workspaceError,
    selectWorkspaceRole,
  } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}`
  const locationsPath =
    session?.role === 'ADMIN' ? '/admin/suppliers' : '/suppliers'

  const openAdminWorkspace = async () => {
    if (!(await selectWorkspaceRole('ADMIN'))) return
    if (accountMenuRef.current) accountMenuRef.current.open = false
    navigateTo('/admin/suppliers')
  }

  const returnToRequesterWorkspace = async () => {
    if (!(await selectWorkspaceRole('REQUESTER'))) return
    if (accountMenuRef.current) accountMenuRef.current.open = false
    navigateTo('/suppliers')
  }

  const accountInitial = session?.username.trim().charAt(0).toUpperCase()

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <a className={styles.brand} href="/">
            <img alt="" height="24" src={bagIcon} width="24" />
            <span>Friend on Campus</span>
          </a>
          <nav aria-label="Main navigation" className={styles.serviceNav}>
            <a href="/">Profile</a>
            <Link aria-current="page" to={locationsPath}>
              Suppliers
            </Link>
            <a href="/credits">Credits</a>
            <a href="/errands/browse">Errands</a>
          </nav>
          <nav
            aria-label="Account and workspace"
            className={styles.actions}
          >
            {session && session.role !== 'ADMIN' && (
              <div
                aria-label="Choose your current role"
                className={styles.workspaceSelector}
                role="group"
              >
                <span className={styles.workspaceSelectorOptions}>
                  <button
                    aria-pressed={session.role === 'REQUESTER'}
                    disabled={workspaceBusy}
                    onClick={() => {
                      void selectWorkspaceRole('REQUESTER')
                    }}
                    type="button"
                  >
                    Requester
                  </button>
                  <button
                    aria-pressed={session.role === 'COURIER'}
                    disabled={workspaceBusy}
                    onClick={() => {
                      void selectWorkspaceRole('COURIER')
                    }}
                    type="button"
                  >
                    Courier
                  </button>
                </span>
              </div>
            )}
            {session ? (
              <>
                <details className={styles.userMenu} ref={accountMenuRef}>
                  <summary
                    aria-label={`Open account menu for ${session.username}`}
                    title="Account menu"
                  >
                    <span aria-hidden="true" className={styles.accountAvatar}>
                      {accountInitial}
                    </span>
                    <span className={styles.accountName}>
                      {session.username}
                    </span>
                    <span aria-hidden="true" className={styles.menuChevron} />
                  </summary>
                  <div className={styles.userMenuItems}>
                    <a href="/">Profile</a>
                    {session.role === 'ADMIN' && (
                      <a href="/?view=users">Manage users</a>
                    )}
                    {session.availableRoles?.includes('ADMIN') &&
                      session.role !== 'ADMIN' && (
                        <button
                          disabled={workspaceBusy}
                          onClick={() => {
                            void openAdminWorkspace()
                          }}
                          type="button"
                        >
                          Switch to Admin
                        </button>
                      )}
                    {session.role === 'ADMIN' && (
                      <button
                        disabled={workspaceBusy}
                        onClick={() => {
                          void returnToRequesterWorkspace()
                        }}
                        type="button"
                      >
                        Switch to User
                      </button>
                    )}
                    <span aria-hidden="true" className={styles.menuDivider} />
                    <button
                      className={styles.menuSignOut}
                      onClick={() => {
                        signOut()
                        navigateTo('/')
                      }}
                      type="button"
                    >
                      Sign out
                    </button>
                  </div>
                </details>
              </>
            ) : (
              <a href={`/?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</a>
            )}
          </nav>
        </div>
      </header>
      {workspaceError && (
        <p className={styles.workspaceError} role="alert">
          {workspaceError}
        </p>
      )}
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
