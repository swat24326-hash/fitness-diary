import { TrainerProfileHero } from './TrainerProfileHero.jsx'
import { TrainerStatisticsSection } from './TrainerStatisticsSection'

export function TrainerProfile() {
  return (
    <div className="grid stagger" style={{ gap: 18 }}>
      <TrainerProfileHero />
      <TrainerStatisticsSection />
    </div>
  )
}
