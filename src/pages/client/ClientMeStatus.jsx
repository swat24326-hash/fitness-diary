/** Единая карточка состояния /me: загрузка, вход, ошибка, нет связи. */
export function ClientMeStatus({ icon: Icon, spin = false, title, hint, children, alert = false }) {
  return (
    <section className="os-empty-card client-me-card--center" role={alert ? 'alert' : 'status'}>
      {Icon ? <Icon size={32} aria-hidden className={`os-empty-card__icon${spin ? ' client-me-spin' : ''}`} /> : null}
      {title ? <h2 className="os-empty-card__title">{title}</h2> : null}
      {hint ? <p className="os-empty-card__hint">{hint}</p> : null}
      {children}
    </section>
  )
}
