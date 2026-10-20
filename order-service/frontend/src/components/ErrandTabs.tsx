import { NavLink } from 'react-router-dom'
import { useSessionRole } from '../hooks/useSessionRole'

/** Errand screens for the header role: Request help (Requester) or Run errands (Courier), plus My errands. */
export function ErrandTabs() {
  const role = useSessionRole()
  return (
    <nav aria-label="Errands" className="errand-tabs">
      {role === 'REQUESTER' ? (
        <NavLink className="errand-tab" to="/errands/new">
          Request help
        </NavLink>
      ) : (
        <NavLink className="errand-tab" to="/errands/browse">
          Run errands
        </NavLink>
      )}
      <NavLink className="errand-tab" to="/errands/mine">
        My errands
      </NavLink>
    </nav>
  )
}
