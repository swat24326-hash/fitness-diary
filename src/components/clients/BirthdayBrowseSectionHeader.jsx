/**
 * Заголовок блока в списке ДР: «Сегодня» / «Ближайшие N дней».
 * @param {{ title: string, count?: number }} props
 */
export function BirthdayBrowseSectionHeader({ title, count }) {
  const n = Number(count)
  return (
    <li className="client-birthday-section" role="presentation">
      <div className="client-birthday-section__bar">
        <span className="client-birthday-section__title">{title}</span>
        {Number.isFinite(n) && n > 0 ? (
          <span className="client-birthday-section__count muted">{n}</span>
        ) : null}
      </div>
    </li>
  )
}
