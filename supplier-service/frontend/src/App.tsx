import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AdminSuppliersScaffoldPage } from './pages/AdminSuppliersScaffoldPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SupplierDetailPage } from './pages/SupplierDetailPage'
import { SupplierDirectoryPage } from './pages/SupplierDirectoryPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate replace to="/suppliers" />} />
        <Route path="suppliers" element={<SupplierDirectoryPage />} />
        <Route path="suppliers/:id" element={<SupplierDetailPage />} />
        <Route
          path="admin/suppliers/*"
          element={<AdminSuppliersScaffoldPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
