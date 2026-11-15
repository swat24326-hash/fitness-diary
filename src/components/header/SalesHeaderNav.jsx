import { NavLink } from 'react-router-dom'
import { HeaderNavItem } from './HeaderNavItem.jsx'
import { salesHeaderNavItems, useSalesHeaderNavActive } from './salesHeaderNavItems.jsx'

function navClass({ isActive }) {
  return `app-header__nav-link${isActive ? ' app-header__nav-link--active' : ''}`
}

function menuNavClass({ isActive }) {
  return `app-header__menu-link${isActive ? ' app-header__menu-link--active' : ''}`
}

function MenuRow({ icon: Icon, children }) {
  return (
    <span className="app-header__nav-with-icon">
      <Icon size={18} aria-hidden />
      {children}
    </span>
  )
}

/** Верхняя полоса менеджера — все разделы с плиток главной. */
export function SalesHeaderPrimaryNav() {
  const active = useSalesHeaderNavActive()
  return (
    <nav className="app-header__nav app-header__nav--sales" aria-label="Разделы">
      {salesHeaderNavItems(active).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          title={item.title}
          aria-label={item.title}
          className={() => navClass({ isActive: item.isActive })}
        >
          <HeaderNavItem icon={item.icon}>{item.label}</HeaderNavItem>
        </NavLink>
      ))}
    </nav>
  )
}

/** Бургер менеджера — полные названия, иконка слева. */
export function SalesHeaderMenuNav({ onNavigate }) {
  const active = useSalesHeaderNavActive()
  const close = () => onNavigate?.()
  return (
    <div className="app-header__menu-nav" aria-label="Разделы">
      {salesHeaderNavItems(active).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={() => menuNavClass({ isActive: item.isActive })}
          onClick={close}
        >
          <MenuRow icon={item.icon}>{item.title}</MenuRow>
        </NavLink>
      ))}
    </div>
  )
}
