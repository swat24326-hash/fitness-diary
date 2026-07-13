import { useAuth } from '../../context/AuthContext'
import { TrainerStatisticsSection } from './TrainerStatisticsSection'
import { TrainerPushSettings } from '../../components/iskra/TrainerPushPrompt.jsx'

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

      <TrainerPushSettings clubId={String(user?.club_id ?? '').trim()} />

      <TrainerStatisticsSection />
    </div>
  )
}
