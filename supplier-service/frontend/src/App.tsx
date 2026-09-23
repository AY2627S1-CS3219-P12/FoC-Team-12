import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AdminSuppliersScaffoldPage } from './pages/AdminSuppliersScaffoldPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SuppliersScaffoldPage } from './pages/SuppliersScaffoldPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate replace to="/suppliers" />} />
        <Route path="suppliers/*" element={<SuppliersScaffoldPage />} />
        <Route
          path="admin/suppliers/*"
          element={<AdminSuppliersScaffoldPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
