/**
 * Крупные визуальные статусы для менеджера (в т.ч. если не слышит звук):
 * ошибка / не поняли / успех — всегда текстом на экране.
 */

/**
 * @param {{
 *   level?: 'error'|'warn'|'ok'|'info',
 *   title?: string,
 *   children?: import('react').ReactNode,
 * }} props
 */
export function SalesVisualAlert({ level = 'info', title, children }) {
  const role = level === 'error' || level === 'warn' ? 'alert' : 'status'
  return (
    <div className={`sales-visual-alert sales-visual-alert--${level}`} role={role}>
      {title ? <p className="sales-visual-alert__title">{title}</p> : null}
      {children ? <div className="sales-visual-alert__body">{children}</div> : null}
    </div>
  )
}
