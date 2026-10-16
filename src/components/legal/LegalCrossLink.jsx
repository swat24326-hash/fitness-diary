import { Link, useLocation } from 'react-router-dom'

/** Ссылка между /privacy|/chat-rules|/offer — не теряет, куда вернуться крестиком. */
export function LegalCrossLink({ to, children }) {
  const location = useLocation()
  return (
    <Link to={to} state={location.state}>
      {children}
    </Link>
  )
}
