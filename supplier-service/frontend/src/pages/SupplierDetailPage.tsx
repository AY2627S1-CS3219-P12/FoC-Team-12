import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import arrowIcon from '../assets/foc-arrow.svg'
import placeholderArtwork from '../assets/supplier-location-placeholder.svg'
import {
  SupplierApiError,
  useSupplierDetailQuery,
} from '../api/supplierQueries'
import { StatePanel } from '../components/DirectoryStates'
import {
  displayImageUrl,
  formatBuilding,
  formatOperatingHours,
  isUuid,
} from '../utils/supplierFormatting'
import styles from './SupplierDetailPage.module.css'

interface ReturnLocationState {
  from?: string
}

function SupplierImage({
  category,
  name,
  url,
}: {
  category: string
  name: string
  url: string | null
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const hasImage = Boolean(url) && !failed

  return (
    <div className={styles.imageFrame}>
      <div
        aria-label={hasImage ? undefined : `${name} photo not available`}
        aria-hidden={hasImage || undefined}
        className={styles.imagePlaceholder}
        role={hasImage ? undefined : 'img'}
      >
        <img alt="" src={placeholderArtwork} />
        <p className={styles.placeholderTitle}>Campus location</p>
        <p>{hasImage ? 'Loading photo…' : 'Photo not available'}</p>
        <span>{category}</span>
      </div>
      {hasImage && (
        <img
          alt={`${name} location`}
          className={`${styles.supplierImage} ${loaded ? styles.imageLoaded : ''}`}
          decoding="async"
          loading="eager"
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          referrerPolicy="no-referrer"
          src={url!}
        />
      )}
    </div>
  )
}

export function SupplierDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const validId = isUuid(id)
  const supplierQuery = useSupplierDetailQuery(id, validId)
  const state = location.state as ReturnLocationState | null
  const backTo = state?.from?.startsWith('/suppliers')
    ? state.from
    : '/suppliers'

  if (!validId) {
    return (
      <div className={styles.page}>
        <BackLink to={backTo} />
        <StatePanel
          message="The location link does not contain a valid supplier ID."
          title="Invalid location link"
          tone="error"
        />
      </div>
    )
  }

  if (supplierQuery.isPending) {
    return (
      <div className={styles.page}>
        <BackLink to={backTo} />
        <div
          aria-label="Loading location details"
          className={styles.detailSkeleton}
        >
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }

  if (supplierQuery.isError) {
    const notFound =
      supplierQuery.error instanceof SupplierApiError &&
      supplierQuery.error.status === 404
    return (
      <div className={styles.page}>
        <BackLink to={backTo} />
        <StatePanel
          actionLabel={notFound ? undefined : 'Try again'}
          message={
            notFound
              ? 'This campus location does not exist or has been permanently removed.'
              : 'Check the connection and try loading this location again.'
          }
          onAction={notFound ? undefined : () => void supplierQuery.refetch()}
          title={
            notFound ? 'Location not found' : 'Location could not be loaded'
          }
          tone="error"
        />
      </div>
    )
  }

  const supplier = supplierQuery.data
  const imageUrl = displayImageUrl(supplier.imageUrl)

  return (
    <article className={styles.page}>
      <BackLink to={backTo} />
      {supplier.status === 'INACTIVE' && (
        <StatePanel
          message="This historical location is no longer included in the public directory."
          title="Location currently unavailable"
          tone="info"
        />
      )}
      <div className={styles.detailLayout}>
        <div className={styles.content}>
          <header className={styles.heading}>
            <span className={styles.badge}>{supplier.type}</span>
            <h1>{supplier.name}</h1>
            <p>{formatBuilding(supplier.building, supplier.floor)}</p>
          </header>

          <dl className={styles.details}>
            <div>
              <dt>Category</dt>
              <dd>{supplier.type ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Building and floor</dt>
              <dd>{formatBuilding(supplier.building, supplier.floor)}</dd>
            </div>
            <div>
              <dt>Directions</dt>
              <dd>
                {supplier.locationDescription ?? 'No directions provided'}
              </dd>
            </div>
            <div>
              <dt>Operating hours</dt>
              <dd>
                {formatOperatingHours(
                  supplier.openingTime,
                  supplier.closingTime,
                )}
              </dd>
            </div>
            <div>
              <dt>Coordinates</dt>
              <dd>
                {supplier.latitude?.toFixed(6)},{' '}
                {supplier.longitude?.toFixed(6)}
              </dd>
            </div>
          </dl>
        </div>
        <SupplierImage
          key={supplier.id}
          category={supplier.type ?? 'Campus'}
          name={supplier.name ?? 'Campus'}
          url={imageUrl}
        />
      </div>
    </article>
  )
}

function BackLink({ to }: { to: string }) {
  return (
    <Link className={styles.backLink} to={to}>
      <img alt="" height="20" src={arrowIcon} width="20" />
      <span>Back to campus locations</span>
    </Link>
  )
}
