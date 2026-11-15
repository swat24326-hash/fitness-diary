import { NavLink } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Settings,
  Trophy,
  TrendingUp,
  User,
  UserCircle,
} from 'lucide-react'
import { SalesHeaderMenuNav } from './SalesHeaderNav.jsx'

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

/**
 * Разделы в бургер-меню — те же иконки, что в верхней полосе, но в ряд.
 */
export function HeaderMenuNav({ role, adminQs = '', supabaseReady = false, onNavigate }) {
  const close = () => onNavigate?.()

  if (role === 'admin') {
    return (
      <div className="app-header__menu-nav" aria-label="Разделы">
        <NavLink to={`/admin${adminQs}`} end className={menuNavClass} onClick={close}>
          <MenuRow icon={LayoutDashboard}>Главная</MenuRow>
        </NavLink>
        <NavLink to={`/admin/structure${adminQs}`} className={menuNavClass} onClick={close}>
          <MenuRow icon={Settings}>Настройки</MenuRow>
        </NavLink>
        <NavLink to={`/admin/clients${adminQs}`} className={menuNavClass} onClick={close}>
          <MenuRow icon={UserCircle}>Клиенты</MenuRow>
        </NavLink>
        <NavLink to={`/admin/statistics${adminQs}`} className={menuNavClass} onClick={close}>
          <MenuRow icon={BarChart3}>Статистика</MenuRow>
        </NavLink>
        <NavLink to={`/admin/sales${adminQs}`} className={menuNavClass} onClick={close}>
          <MenuRow icon={TrendingUp}>Продажи</MenuRow>
        </NavLink>
        <NavLink to={`/admin/challenges${adminQs}`} className={menuNavClass} onClick={close}>
          <MenuRow icon={Trophy}>Челленджи</MenuRow>
        </NavLink>
        {supabaseReady ? (
          <NavLink to={`/admin/health${adminQs}`} className={menuNavClass} onClick={close}>
            <MenuRow icon={Activity}>Сбои устройств</MenuRow>
          </NavLink>
        ) : null}
      </div>
    )
  }

  if (role === 'supervisor') {
    return (
      <div className="app-header__menu-nav" aria-label="Разделы">
        <NavLink to="/club" end className={menuNavClass} onClick={close}>
          <MenuRow icon={LayoutDashboard}>Главная</MenuRow>
        </NavLink>
        <NavLink to="/club/clients" className={menuNavClass} onClick={close}>
          <MenuRow icon={UserCircle}>Клиенты</MenuRow>
        </NavLink>
        <NavLink to="/club/statistics" className={menuNavClass} onClick={close}>
          <MenuRow icon={BarChart3}>Статистика</MenuRow>
        </NavLink>
        <NavLink to="/club/sales" className={menuNavClass} onClick={close}>
          <MenuRow icon={TrendingUp}>Продажи</MenuRow>
        </NavLink>
        <NavLink to="/club/settings" className={menuNavClass} onClick={close}>
          <MenuRow icon={Settings}>Настройки</MenuRow>
        </NavLink>
      </div>
    )
  }

  if (role === 'sales') return <SalesHeaderMenuNav onNavigate={onNavigate} />

  return (
    <div className="app-header__menu-nav" aria-label="Разделы">
      <NavLink to="/trainer" end className={menuNavClass} onClick={close}>
        <MenuRow icon={LayoutDashboard}>Главная</MenuRow>
      </NavLink>
      <NavLink to="/trainer/calendar" className={menuNavClass} onClick={close}>
        <MenuRow icon={CalendarDays}>Ежедневник</MenuRow>
      </NavLink>
      <NavLink to="/trainer/profile" className={menuNavClass} onClick={close}>
        <MenuRow icon={User}>Профиль</MenuRow>
      </NavLink>
      <NavLink to="/trainer/clients" className={menuNavClass} onClick={close}>
        <MenuRow icon={UserCircle}>Клиенты</MenuRow>
      </NavLink>
    </div>
  )
}
