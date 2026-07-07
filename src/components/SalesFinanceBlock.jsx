/**
 * Карточка настроек на вкладке «Финансы клуба».
 * @param {{ step: number | string, title: string, hint?: string, children: import('react').ReactNode, footer?: import('react').ReactNode }} props
 */
export function SalesFinanceBlock({ step, title, hint, children, footer }) {
  return (
    <article className="sales-finance-block">
      <header className="sales-finance-block__head">
        <span className="sales-finance-block__step" aria-hidden>
          {step}
        </span>
        <div className="sales-finance-block__head-text">
          <h3 className="sales-finance-block__title">{title}</h3>
          {hint ? <p className="sales-finance-block__hint muted">{hint}</p> : null}
        </div>
      </header>
      <div className="sales-finance-block__body">{children}</div>
      {footer ? <footer className="sales-finance-block__foot">{footer}</footer> : null}
    </article>
  )
}
