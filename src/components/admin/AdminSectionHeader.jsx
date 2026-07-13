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
        {Icon ? (
          <div className="admin-section__title-row">
            <Icon size={22} aria-hidden className="admin-section__icon" />
            <div>
              <h1 className="admin-section__title">{title}</h1>
              {lead ? <p className="muted admin-section__lead">{lead}</p> : null}
            </div>
          </div>
        ) : (
          <>
            <h1 className="admin-section__title">{title}</h1>
            {lead ? <p className="muted admin-section__lead">{lead}</p> : null}
          </>
        )}
      </div>
      {children ? <div className="admin-section__actions">{children}</div> : null}
    </header>
  )
}
