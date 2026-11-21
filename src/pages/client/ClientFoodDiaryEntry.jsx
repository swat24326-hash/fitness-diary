import { Apple } from 'lucide-react'
import { Link } from 'react-router-dom'
import { clubFoodDiaryEnabled, FOOD_DIARY_ROUTE } from '../../lib/client/foodDiaryClubCore.js'

/** Плитка на главной /me — слоты как у абонемента / «следующей»; только при флаге клуба. */
export function ClientFoodDiaryEntry({ club, to = FOOD_DIARY_ROUTE }) {
  if (!clubFoodDiaryEnabled(club)) return null
  return (
    <Link
      to={to}
      className="client-me-card client-me-tile client-me-tile--button food-diary-entry"
      aria-label="Дневник калорий: открыть"
    >
      <h2 className="client-me-card__title">
        <Apple size={16} aria-hidden />
        <span className="client-me-tile__title-text">Дневник калорий</span>
      </h2>
      <div className="client-me-tile__body">
        <span className="client-me-tile__hero">
          0<small>ккал</small>
        </span>
        <span className="client-me-tile__caption">сегодня</span>
      </div>
      <div className="client-me-tile__meta" aria-hidden />
      <p className="client-me-tile__foot">
        Считать еду в клубе
        <span className="client-me-tile__hint">Открыть</span>
      </p>
    </Link>
  )
}
