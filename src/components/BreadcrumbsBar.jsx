import { Link, matchPath, useLocation } from 'react-router-dom'

/** Сохраняем ?club= при переходе по крошкам внутри админки. */
function adminClubQs(search) {
  try {
    const x = new URLSearchParams(search ?? '').get('club')
    return x ? `?club=${encodeURIComponent(x)}` : ''
  } catch {
    return ''
  }
}

function buildCrumbs(pathname, search) {
  const p = pathname || '/'
  const clubQs = adminClubQs(search)

  const admin = [{ label: 'Админка', to: `/admin${clubQs}` }]
  const trainer = [{ label: 'Главная', to: '/trainer' }]

  if (p === '/' || p === '/trainer') return trainer

  // Trainer
  if (p === '/trainer/clients') return [...trainer, { label: 'Клиенты', to: '/trainer/clients' }]
  if (p === '/trainer/profile') return [...trainer, { label: 'Профиль', to: '/trainer/profile' }]
  if (matchPath('/trainer/clients/:id', p)) return [...trainer, { label: 'Клиенты', to: '/trainer/clients' }, { label: 'Карточка', to: p }]
  if (matchPath('/trainer/workouts/:id', p)) return [...trainer, { label: 'Тренировка', to: p }]
  if (matchPath('/trainer/challenges/:challengeId', p)) {
    const full = `${p}${search || ''}`
    return [...trainer, { label: 'Челлендж', to: full }]
  }

  // Admin (nested under AdminDashboard)
  if (p === '/admin') return []
  if (p === '/admin/structure') {
    let tab = 'clubs'
    try {
      tab = new URLSearchParams(search ?? '').get('tab') ?? 'clubs'
    } catch {
      /* ignore */
    }
    const sub = tab === 'trainers' ? 'Тренеры' : tab === 'statistics' ? 'Статистика' : 'Клубы'
    const structureBase = `/admin/structure${clubQs}`
    const full = `${p}${search || ''}`
    return [...admin, { label: 'Структура', to: structureBase }, { label: sub, to: full }]
  }
  if (p === '/admin/clients') return [...admin, { label: 'Клиенты', to: `/admin/clients${clubQs}` }]
  if (p === '/admin/exercises') return [...admin, { label: 'Упражнения', to: `/admin/exercises${clubQs}` }]
  if (p === '/admin/challenges') return [...admin, { label: 'Челленджи', to: `/admin/challenges${clubQs}` }]
  if (matchPath('/admin/challenges/:challengeId', p)) {
    const full = `${p}${search || ''}`
    return [...admin, { label: 'Челленджи', to: `/admin/challenges${clubQs}` }, { label: 'Рейтинг', to: full }]
  }
  if (matchPath('/admin/clients/:id', p)) {
    const full = `${p}${search || ''}`
    return [...admin, { label: 'Клиенты', to: `/admin/clients${clubQs}` }, { label: 'Карточка клиента', to: full }]
  }
  if (matchPath('/admin/workouts/:id', p)) {
    const full = `${p}${search || ''}`
    return [...admin, { label: 'Тренировка', to: full }]
  }

  // Fallback: показываем только корень раздела
  if (p.startsWith('/admin')) return admin
  if (p.startsWith('/trainer')) return trainer
  return [{ label: 'Главная', to: '/' }]
}

export function BreadcrumbsBar() {
  const loc = useLocation()
  const crumbs = buildCrumbs(loc.pathname, loc.search)
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
