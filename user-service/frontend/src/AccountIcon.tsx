type IconName = 'shield' | 'shield-minus' | 'shield-plus' | 'ban' | 'restore' | 'lock' | 'search'

export function AccountIcon({ name }: { name: IconName }) {
  return <svg className="account-icon" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    {name.startsWith('shield') && <>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.4 7.7 7.5 9.5 4.1-1.8 7.5-5 7.5-9.5V6L12 3Z" />
      {name === 'shield' && <path d="m8.5 11.5 2.5 2.5 4.5-5" />}
      {name !== 'shield' && <path d="M9 11.5h6" />}
      {name === 'shield-plus' && <path d="M12 8.5v6" />}
    </>}
    {name === 'ban' && <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>}
    {name === 'restore' && <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /><path d="m9 13 2 2 4-4" /></>}
    {name === 'lock' && <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></>}
    {name === 'search' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>}
  </svg>
}
