import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { OrderShell } from './components/OrderShell'
import { readSession } from './auth/session'
import { signInPath } from './navigation'
import { BrowsePage } from './pages/BrowsePage'
import { CreateErrandPage } from './pages/CreateErrandPage'
import { ErrandPage } from './pages/ErrandPage'
import { MyErrandsPage } from './pages/MyErrandsPage'
import { type ErrandRole, homeFor, useSessionRole } from './hooks/useSessionRole'

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

/** A screen for one role; the other role (or switching to it) lands on its own screen instead. */
function ForRole({ role, children }: { role: ErrandRole; children: React.ReactNode }) {
  const current = useSessionRole()
  return current === role ? children : <Navigate replace to={homeFor(current)} />
}

function RoleHome() {
  return <Navigate replace to={homeFor(useSessionRole())} />
}

export function AppRoutes() {
  if (!readSession()) return <SignedOut />
  return (
    <Routes>
      <Route element={<RoleHome />} path="/errands" />
      <Route element={<ForRole role="COURIER"><BrowsePage /></ForRole>} path="/errands/browse" />
      <Route element={<MyErrandsPage />} path="/errands/mine" />
      <Route element={<ForRole role="REQUESTER"><CreateErrandPage /></ForRole>} path="/errands/new" />
      <Route element={<ErrandPage />} path="/errands/:orderId" />
      <Route element={<RoleHome />} path="*" />
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
