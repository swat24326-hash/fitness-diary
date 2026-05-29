import { useAuth } from '../../context/AuthContext'
import { TrainerStatisticsSection } from './TrainerStatisticsSection'

export function TrainerProfile() {
  const { user } = useAuth()

  return (
    <div className="grid stagger" style={{ gap: 18 }}>
      <section className="card">
        <h1 className="section-title" style={{ marginBottom: 6 }}>
          Профиль
        </h1>
        <p className="section-sub" style={{ margin: 0 }}>
          {user?.name ?? user?.email ?? 'Тренер'}
        </p>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.45 }}>
          Сводка и списки ниже — только по <strong>вашим клиентам</strong>. Показатели и карточки совпадают со статистикой клуба у админа.
        </p>
      </section>

      <TrainerStatisticsSection />
    </div>
  )
}
