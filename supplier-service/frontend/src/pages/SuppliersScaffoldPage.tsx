import { useSupplierSummaryQuery } from '../api/useSupplierSummaryQuery'
import styles from './ScaffoldPage.module.css'

export function SuppliersScaffoldPage() {
  const suppliers = useSupplierSummaryQuery()

  return (
    <section aria-labelledby="supplier-heading" className={styles.page}>
      <p className={styles.eyebrow}>Supplier frontend scaffold</p>
      <h1 id="supplier-heading">Campus suppliers</h1>
      <p className={styles.intro}>
        The responsive public browsing experience will be implemented in the
        next frontend task.
      </p>

      <div aria-live="polite" className={styles.statusCard}>
        <h2>Backend connection</h2>
        {suppliers.isPending && <p>Checking the Supplier API…</p>}
        {suppliers.isError && (
          <p className={styles.error}>
            The frontend could not reach the Supplier API. Start Spring Boot on
            port 8080 and try again.
          </p>
        )}
        {suppliers.isSuccess && (
          <p>
            Connected. The API currently reports{' '}
            <strong>{suppliers.data.totalItems} active suppliers</strong>.
          </p>
        )}
      </div>
    </section>
  )
}
