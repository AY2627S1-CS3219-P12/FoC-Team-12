import { type FormEvent, useEffect, useState } from 'react'

import { ApiError, api, type AdminAccount, type AdminAccountPage } from './api/client'
import { AccountIcon } from './AccountIcon'

type Props = {
  currentUserId: string
}

const emptyPage: AdminAccountPage = {
  content: [], page: 0, size: 20, totalElements: 0, totalPages: 0,
}

export function AdminUserManagement({ currentUserId }: Props) {
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [pageNumber, setPageNumber] = useState(0)
  const [requestVersion, setRequestVersion] = useState(0)
  const [accounts, setAccounts] = useState<AdminAccountPage>(emptyPage)
  const [loading, setLoading] = useState(true)
  const [changingUserId, setChangingUserId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 3000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    let cancelled = false
    void api.listAdminAccounts(query, pageNumber)
      .then(result => { if (!cancelled) setAccounts(result) })
      .catch(requestError => {
        if (!cancelled) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load user accounts.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [pageNumber, query, requestVersion])

  const search = (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)
    setPageNumber(0)
    setQuery(queryDraft.trim())
    setRequestVersion(current => current + 1)
  }

  const replaceAccount = (updated: AdminAccount) => {
    setAccounts(current => ({
      ...current,
      content: current.content.map(account => account.userId === updated.userId ? updated : account),
    }))
  }

  const changeAdministrator = async (account: AdminAccount, administrator: boolean) => {
    const action = administrator ? 'promote' : 'remove Admin access from'
    if (!window.confirm(`Are you sure you want to ${action} ${account.username}?`)) return
    setChangingUserId(account.userId)
    setMessage('')
    setError('')
    try {
      replaceAccount(await api.setAdministrator(account.userId, administrator))
      setMessage(administrator ? `${account.username} is now an administrator.` : `Admin access removed from ${account.username}.`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to update administrator access.')
    } finally {
      setChangingUserId(null)
    }
  }

  const changeStatus = async (account: AdminAccount, status: 'ACTIVE' | 'BANNED') => {
    const action = status === 'BANNED' ? 'ban' : 'reactivate'
    if (!window.confirm(`Are you sure you want to ${action} ${account.username}?`)) return
    setChangingUserId(account.userId)
    setMessage('')
    setError('')
    try {
      replaceAccount(await api.setAccountStatus(account.userId, status))
      setMessage(status === 'BANNED' ? `${account.username} has been banned.` : `${account.username} has been reactivated.`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to update account status.')
    } finally {
      setChangingUserId(null)
    }
  }

  return <section className="admin-users" aria-labelledby="admin-users-title">
    <p className="eyebrow">Administration</p>
    <h1 id="admin-users-title">Manage users</h1>
    <p className="intro">Promote administrators and control account access without database changes.</p>

    <form className="admin-user-search" role="search" onSubmit={search}>
      <label htmlFor="admin-user-query">Search by email or username</label>
      <span>
        <input id="admin-user-query" value={queryDraft} onChange={event => setQueryDraft(event.target.value)} />
        <button disabled={loading}><AccountIcon name="search" />Search</button>
      </span>
    </form>

    {message && <p className="admin-user-success" role="status">{message}</p>}
    {error && <p className="admin-user-notice error" role="alert">{error}</p>}
    {loading && <p role="status">Loading accounts…</p>}
    {!loading && accounts.content.length === 0 && <p>No accounts match your search.</p>}

    {!loading && accounts.content.length > 0 && <div className="admin-user-list" aria-label="User accounts">
      {accounts.content.map(account => {
        const isSelf = account.userId === currentUserId
        const isAdmin = account.roles.includes('ADMIN')
        const changing = changingUserId === account.userId
        return <article className={`admin-user-card${isSelf ? ' admin-user-card-self' : ''}`} key={account.userId}>
          <div className="admin-user-summary">
            <div className="admin-user-identity">
              <span className={`admin-user-avatar${isAdmin ? ' administrator' : ''}`} aria-hidden="true">{account.username.trim().charAt(0).toUpperCase()}</span>
              <div className="admin-user-name">
                <h2>{account.username}</h2>
                <p>{account.email}</p>
              </div>
            </div>
            <span className={`account-status account-status-${account.status.toLowerCase()}`}><span className="account-status-dot" aria-hidden="true" />{account.status}</span>
          </div>
          <div className="admin-user-roles" aria-label={`Roles for ${account.username}`}>
            {account.roles.map(role => <span className={role === 'ADMIN' ? 'administrator-role' : 'participant-role'} key={role}>
              {role === 'ADMIN' && <AccountIcon name="shield" />}
              {role === 'ADMIN' ? 'Administrator' : role === 'REQUESTER' ? 'Requester' : 'Courier'}
            </span>)}
          </div>
          <div className="admin-user-actions">
            {isSelf
              ? <div className="admin-self-label"><AccountIcon name="lock" /><div><strong>Current account</strong><span>Your own access is protected.</span></div></div>
              : <>
                <div className="admin-action-group"><span className="admin-action-label">Administrator access</span>
                <button type="button" className={`admin-account-action ${isAdmin ? 'access-remove' : 'access-grant'}`} disabled={changing || account.status !== 'ACTIVE'}
                  onClick={() => { void changeAdministrator(account, !isAdmin) }}>
                  <AccountIcon name={isAdmin ? 'shield-minus' : 'shield-plus'} />
                  {changing ? 'Updating…' : isAdmin ? 'Remove Admin' : 'Promote to Admin'}
                </button>
                </div>
                <div className="admin-action-group"><span className="admin-action-label">Account access</span>
                <button type="button" className={`admin-account-action ${account.status === 'BANNED' ? 'account-restore' : 'account-ban'}`} disabled={changing || account.status === 'UNVERIFIED'}
                  onClick={() => { void changeStatus(account, account.status === 'BANNED' ? 'ACTIVE' : 'BANNED') }}>
                  <AccountIcon name={account.status === 'BANNED' ? 'restore' : 'ban'} />
                  {account.status === 'BANNED' ? 'Reactivate' : 'Ban account'}
                </button>
                </div>
              </>}
          </div>
        </article>
      })}
    </div>}

    {accounts.totalPages > 1 && <nav className="admin-user-pagination" aria-label="User account pages">
      <button type="button" className="secondary" disabled={loading || accounts.page === 0}
        onClick={() => { setLoading(true); setError(''); setPageNumber(current => Math.max(0, current - 1)) }}>Previous</button>
      <span>Page {accounts.page + 1} of {accounts.totalPages}</span>
      <button type="button" className="secondary" disabled={loading || accounts.page + 1 >= accounts.totalPages}
        onClick={() => { setLoading(true); setError(''); setPageNumber(current => current + 1) }}>Next</button>
    </nav>}
  </section>
}
