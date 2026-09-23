import { Link } from 'react-router-dom'
import styles from './ScaffoldPage.module.css'

export function NotFoundPage() {
  return (
    <section className={styles.page}>
      <p className={styles.eyebrow}>404</p>
      <h1>Page not found</h1>
      <p className={styles.intro}>
        This Supplier page does not exist.{' '}
        <Link to="/suppliers">Return to suppliers.</Link>
      </p>
    </section>
  )
}
