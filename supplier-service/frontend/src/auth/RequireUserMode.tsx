import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

export function RequireUserMode() {
  const { session, uiMode } = useAuth()
  if (session?.role === 'ADMIN' && uiMode === 'admin') {
    return <Navigate replace to="/admin/suppliers" />
  }
  return <Outlet />
}
