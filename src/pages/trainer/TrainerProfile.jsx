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
      </section>

      <TrainerStatisticsSection />
    </div>
  )
}
