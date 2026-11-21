import { ClientFoodDiarySummary } from './ClientFoodDiarySummary.jsx'
import { ClientFoodDiaryWeek } from './ClientFoodDiaryWeek.jsx'

/**
 * Отчёты: неделя + полная сводка выбранного дня (как FatSecret Reports).
 */
export function ClientFoodDiaryReports({
  entries = [],
  week = null,
  busy = false,
  targets,
  onPickDay,
}) {
  return (
    <div className="food-diary-reports">
      <ClientFoodDiaryWeek
        week={week}
        busy={busy}
        open
        alwaysOpen
        onPickDay={onPickDay}
      />
      <ClientFoodDiarySummary entries={entries} targets={targets} />
    </div>
  )
}
