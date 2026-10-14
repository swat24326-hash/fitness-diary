const LEGACY_FIELDS = [
  ['diseases', 'Заболевания'],
  ['contraindications', 'Противопоказания'],
  ['medications', 'Препараты'],
]

/** Текст старых полей карты здоровья — только чтение; новые ответы вносят в анкету здоровья. */
export function HealthLegacyNotes({ health }) {
  const rows = LEGACY_FIELDS.filter(([key]) => String(health?.[key] ?? '').trim())
  if (!rows.length) return null
  return (
    <div className="hscr-legacy">
      <p className="hscr-legacy__caption">Из старой карты — перенесите в анкету здоровья</p>
      {rows.map(([key, label]) => (
        <p key={key} className="hscr-legacy__row">
          <span className="muted">{label}:</span> {health[key]}
        </p>
      ))}
    </div>
  )
}
