import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Settings,
  Trophy,
  TrendingUp,
  UserCircle,
} from 'lucide-react'
import { HeaderNavItem } from './HeaderNavItem.jsx'
import { SalesHeaderPrimaryNav } from './SalesHeaderNav.jsx'

function navClass({ isActive }) {
  return `app-header__nav-link${isActive ? ' app-header__nav-link--active' : ''}`
}

/**
 * Центральная навигация шапки по роли (иконка над текстом).
 */
export function HeaderPrimaryNav({ role, adminQs = '' }) {
  if (role === 'admin') {
    return (
      <nav className="app-header__nav" aria-label="Разделы">
        <NavLink to={`/admin${adminQs}`} end className={navClass}>
          <HeaderNavItem icon={LayoutDashboard}>Главная</HeaderNavItem>
        </NavLink>
        <NavLink to={`/admin/structure${adminQs}`} className={navClass}>
          <HeaderNavItem icon={Settings}>Настройки</HeaderNavItem>
        </NavLink>
        <NavLink to={`/admin/clients${adminQs}`} className={navClass}>
          <HeaderNavItem icon={UserCircle}>Клиенты</HeaderNavItem>
        </NavLink>
        <NavLink to={`/admin/statistics${adminQs}`} className={navClass}>
          <HeaderNavItem icon={BarChart3}>Статистика</HeaderNavItem>
        </NavLink>
        <NavLink to={`/admin/sales${adminQs}`} className={navClass}>
          <HeaderNavItem icon={TrendingUp}>Продажи</HeaderNavItem>
        </NavLink>
        <NavLink to={`/admin/challenges${adminQs}`} className={navClass}>
          <HeaderNavItem icon={Trophy}>Челленджи</HeaderNavItem>
        </NavLink>
      </nav>
    )
  }

  if (role === 'supervisor') {
    return (
      <nav className="app-header__nav" aria-label="Разделы">
        <NavLink to="/club" end className={navClass}>
          <HeaderNavItem icon={LayoutDashboard}>Главная</HeaderNavItem>
        </NavLink>
        <NavLink to="/club/clients" className={navClass}>
          <HeaderNavItem icon={UserCircle}>Клиенты</HeaderNavItem>
        </NavLink>
        <NavLink to="/club/statistics" className={navClass}>
          <HeaderNavItem icon={BarChart3}>Статистика</HeaderNavItem>
        </NavLink>
        <NavLink to="/club/sales" className={navClass}>
          <HeaderNavItem icon={TrendingUp}>Продажи</HeaderNavItem>
        </NavLink>
        <NavLink to="/club/settings" className={navClass}>
          <HeaderNavItem icon={Settings}>Настройки</HeaderNavItem>
        </NavLink>
      </nav>
    )
  }

  if (role === 'sales') return <SalesHeaderPrimaryNav />

  return (
    <nav className="app-header__nav" aria-label="Разделы">
      <NavLink to="/trainer" end className={navClass}>
        <HeaderNavItem icon={LayoutDashboard}>Главная</HeaderNavItem>
      </NavLink>
      <NavLink to="/trainer/calendar" className={navClass}>
        <HeaderNavItem icon={CalendarDays}>Ежедневник</HeaderNavItem>
      </NavLink>
      <NavLink to="/trainer/profile" className={navClass}>
        <HeaderNavItem icon={BarChart3}>Статистика</HeaderNavItem>
      </NavLink>
      <NavLink to="/trainer/clients" className={navClass}>
        <HeaderNavItem icon={UserCircle}>Клиенты</HeaderNavItem>
      </NavLink>
    </nav>
  )
}
