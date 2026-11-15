/**
 * Единая шапка вложенного раздела админки (крошки — в BreadcrumbsBar).
 *
 * @param {{
 *   title: string,
 *   lead?: string,
 *   icon?: import('lucide-react').LucideIcon,
 *   children?: import('react').ReactNode,
 * }} props
 */
export function AdminSectionHeader({ title, lead = '', icon: Icon, children }) {
  return (
    <header className="admin-section__head">
      <div className="admin-section__intro">
        <div className="admin-section__title-row">
          {Icon ? <Icon size={22} aria-hidden className="admin-section__icon" /> : null}
          <h1 className="admin-section__title">{title}</h1>
        </div>
        {lead ? (
          <p className={`muted admin-section__lead${Icon ? ' admin-section__lead--with-icon' : ''}`}>
            {lead}
          </p>
        ) : null}
      </div>
      {children ? <div className="admin-section__actions">{children}</div> : null}
    </header>
  )
}
