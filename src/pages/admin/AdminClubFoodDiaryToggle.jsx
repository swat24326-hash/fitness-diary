import { FOOD_DIARY_CLUB_LABEL } from '../../lib/client/foodDiaryClubCore.js'

/**
 * Организация → клуб: вкл/выкл дневника калорий (touch-переключатель, как в /me настройках).
 */
export function AdminClubFoodDiaryToggle({ clubId, enabled, busy, onChange }) {
  const on = enabled === true
  const labelId = `club-food-diary-label-${String(clubId || 'new')}`
  return (
    <div className="food-diary-club-toggle">
      <div className="food-diary-club-toggle__copy">
        <span id={labelId} className="food-diary-club-toggle__label">
          {FOOD_DIARY_CLUB_LABEL}
        </span>
        <span className="food-diary-club-toggle__hint muted">
          {on ? 'Клиенты видят плитку в приложении' : 'Скрыто у клиентов'}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        className={`client-switch${on ? ' client-switch--on' : ''}`}
        disabled={busy}
        onClick={() => onChange(!on)}
      >
        <span className="client-switch__knob" />
      </button>
    </div>
  )
}
