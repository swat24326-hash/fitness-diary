/**
 * Пункт верхней навигации: иконка над подписью (компактнее по ширине).
 */
export function HeaderNavItem({ icon: Icon, children }) {
  return (
    <span className="app-header__nav-item">
      {Icon ? <Icon size={18} strokeWidth={2} aria-hidden className="app-header__nav-item-icon" /> : null}
      <span className="app-header__nav-item-label">{children}</span>
    </span>
  )
}
