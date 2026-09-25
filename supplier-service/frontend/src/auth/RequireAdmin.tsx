import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { navigateTo } from '../navigation'
import styles from './RequireAdmin.module.css'
import { useAuth } from './useAuth'

export function RequireAdmin() {
  const { accessDenied, session } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  useEffect(() => {
    if (!session) {
      navigateTo(`/?returnTo=${encodeURIComponent(returnTo)}`)
    }
  }, [returnTo, session])

  if (!session) {
    return (
      <section aria-live="polite" className={styles.panel}>
        <p className={styles.eyebrow}>Authentication required</p>
        <h1>Taking you to sign in…</h1>
        <p>You need an administrator account to manage suppliers.</p>
      </section>
    )
  }

  if (session.role !== 'ADMIN' || accessDenied) {
    return (
      <section className={styles.panel} role="alert">
        <p className={styles.eyebrow}>Admin access required</p>
        <h1>You cannot manage suppliers</h1>
        <p>
          This signed-in account does not have access to Supplier
          administration. You can still browse campus locations or sign in with
          an ADMIN account.
        </p>
        <div className={styles.actions}>
          <Link to="/suppliers">Browse suppliers</Link>
          <a href="/">Back to service home</a>
        </div>
      </section>
    )
  }

  return <Outlet />
}
