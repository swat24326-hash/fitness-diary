/**
 * Вкладки дневника. Рацион — только у ПЗ (есть контур «От тренера»).
 * АЗ/ТЗ: День · Отчёты · Ещё.
 */
export function ClientFoodDiaryTabs({ value, onChange, showRation = false }) {
  const tabs = showRation
    ? [
        { id: 'day', label: 'День' },
        { id: 'reports', label: 'Отчёты' },
        { id: 'ration', label: 'Рацион' },
        { id: 'more', label: 'Ещё' },
      ]
    : [
        { id: 'day', label: 'День' },
        { id: 'reports', label: 'Отчёты' },
        { id: 'more', label: 'Ещё' },
      ]

  return (
    <div
      className={`food-diary-tabs${showRation ? ' food-diary-tabs--four' : ''}`}
      role="tablist"
      aria-label="Разделы дневника"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`food-diary-tabs__item btn-touch${value === t.id ? ' food-diary-tabs__item--on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
