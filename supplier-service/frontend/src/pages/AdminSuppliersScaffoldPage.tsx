import styles from './ScaffoldPage.module.css'

export function AdminSuppliersScaffoldPage() {
  return (
    <section aria-labelledby="admin-heading" className={styles.page}>
      <p className={styles.eyebrow}>Supplier frontend scaffold</p>
      <h1 id="admin-heading">Supplier administration</h1>
      <p className={styles.intro}>
        Administrative workflows will be added after the public experience and
        authentication contract are ready.
      </p>
      <aside className={styles.statusCard}>
        <h2>Security boundary</h2>
        <p>
          This route is only a placeholder. Hiding a route is not access
          control; the backend must enforce the future ADMIN role.
        </p>
      </aside>
    </section>
  )
}
