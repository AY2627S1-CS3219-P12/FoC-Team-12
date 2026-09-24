import { Link } from 'react-router-dom'
import arrowIcon from '../assets/foc-arrow.svg'
import type { Supplier } from '../api/supplierQueries'
import {
  formatBuilding,
  formatOperatingHours,
} from '../utils/supplierFormatting'
import styles from './DirectoryComponents.module.css'

interface SupplierCardProps {
  supplier: Supplier
  returnTo: string
}

export function SupplierCard({ supplier, returnTo }: SupplierCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeading}>
        <h2>{supplier.name}</h2>
        <span className={styles.badge}>{supplier.type}</span>
      </div>
      <dl className={styles.cardDetails}>
        <div>
          <dt>Location</dt>
          <dd>{formatBuilding(supplier.building, supplier.floor)}</dd>
        </div>
        {supplier.locationDescription && (
          <div>
            <dt>Directions</dt>
            <dd>{supplier.locationDescription}</dd>
          </div>
        )}
        <div>
          <dt>Operating hours</dt>
          <dd>
            {formatOperatingHours(supplier.openingTime, supplier.closingTime)}
          </dd>
        </div>
      </dl>
      <Link
        className={styles.cardLink}
        state={{ from: returnTo }}
        to={`/suppliers/${supplier.id}`}
      >
        <span>View details</span>
        <img alt="" height="20" src={arrowIcon} width="20" />
      </Link>
    </article>
  )
}
