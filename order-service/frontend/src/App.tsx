import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { OrderShell } from './components/OrderShell'
import { readSession } from './auth/session'
import { signInPath } from './navigation'
import { BrowsePage } from './pages/BrowsePage'
import { CreateErrandPage } from './pages/CreateErrandPage'
import { ErrandPage } from './pages/ErrandPage'
import { MyErrandsPage } from './pages/MyErrandsPage'

function SignedOut() {
  return (
    <section className="state-panel">
      <h2>Sign in to see errands</h2>
      <p>
        <a className="sign-in-link" href={signInPath()}>
          Sign in
        </a>
      </p>
    </section>
  )
}

export function AppRoutes() {
  if (!readSession()) return <SignedOut />
  return (
    <Routes>
      <Route element={<Navigate replace to="/errands/browse" />} path="/errands" />
      <Route element={<BrowsePage />} path="/errands/browse" />
      <Route element={<MyErrandsPage />} path="/errands/mine" />
      <Route element={<CreateErrandPage />} path="/errands/new" />
      <Route element={<ErrandPage />} path="/errands/:orderId" />
      <Route element={<Navigate replace to="/errands/browse" />} path="*" />
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <OrderShell>
        <AppRoutes />
      </OrderShell>
    </BrowserRouter>
  )
}
