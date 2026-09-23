import { NavLink, Outlet } from 'react-router-dom'
import styles from './AppShell.module.css'

export function AppShell() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <NavLink className={styles.brand} to="/suppliers">
          Friend on Campus
        </NavLink>
        <nav aria-label="Supplier sections" className={styles.navigation}>
          <NavLink
            className={({ isActive }) =>
              isActive ? styles.activeLink : styles.link
            }
            to="/suppliers"
          >
            Suppliers
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              isActive ? styles.activeLink : styles.link
            }
            to="/admin/suppliers"
          >
            Admin
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
