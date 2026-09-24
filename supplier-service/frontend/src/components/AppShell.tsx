import { Link, Outlet } from 'react-router-dom'
import bagIcon from '../assets/foc-bag.svg'
import styles from './AppShell.module.css'

export function AppShell() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link className={styles.brand} to="/suppliers">
            <img alt="" height="24" src={bagIcon} width="24" />
            <span>Friend on Campus</span>
          </Link>
          <span className={styles.sectionName}>Campus locations</span>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
