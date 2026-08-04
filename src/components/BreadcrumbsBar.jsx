import { Link, useLocation } from 'react-router-dom'
import { buildBreadcrumbs } from '../lib/breadcrumbsCore.js'

export function BreadcrumbsBar() {
  const loc = useLocation()
  const crumbs = buildBreadcrumbs(loc.pathname, loc.search)
  if (!crumbs?.length || crumbs.length === 1) return null

  return (
    <div className="breadcrumbs-shell" role="navigation" aria-label="Хлебные крошки">
      <ol className="breadcrumbs">
        {crumbs.map((c, idx) => {
          const last = idx === crumbs.length - 1
          return (
            <li key={`${c.to}-${idx}`} className="breadcrumbs__item">
              {last ? (
                <span className="breadcrumbs__current" aria-current="page">
                  {c.label}
                </span>
              ) : (
                <Link className="breadcrumbs__link u-no-decoration" to={c.to}>
                  {c.label}
                </Link>
              )}
              {!last ? <span className="breadcrumbs__sep" aria-hidden>›</span> : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
