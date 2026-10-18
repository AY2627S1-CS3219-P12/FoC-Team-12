import { NavLink } from 'react-router-dom'

/** The Figma "Request help / Run errands" switch, plus My errands, shared by the errand screens. */
export function ErrandTabs() {
  return (
    <nav aria-label="Errands" className="tabs errand-tabs">
      <NavLink className="tab tab-link" to="/errands/new">
        Request help
      </NavLink>
      <NavLink className="tab tab-link" to="/errands/browse">
        Run errands
      </NavLink>
      <NavLink className="tab tab-link" to="/errands/mine">
        My errands
      </NavLink>
    </nav>
  )
}
