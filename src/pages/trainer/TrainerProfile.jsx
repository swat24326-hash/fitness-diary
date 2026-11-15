import { TrainerStatisticsSection } from './TrainerStatisticsSection'

/** Страница «Статистика» тренера (маршрут `/trainer/profile`). Личный профиль — в шапке. */
export function TrainerProfile() {
  return (
    <div className="grid stagger" style={{ gap: 18 }}>
      <TrainerStatisticsSection />
    </div>
  )
}
