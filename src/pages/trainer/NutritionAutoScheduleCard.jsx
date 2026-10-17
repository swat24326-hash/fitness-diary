import { CalendarClock, CalendarX2 } from 'lucide-react'
import {
  NUTRITION_AUTO_HOLD_RU,
  NUTRITION_AUTO_WEIGHT_KG,
  formatNutritionAutoDay,
  nutritionAutoHoldReason,
  nutritionAutoPrefsFromSurvey,
  nutritionAutoWeightDeltaKg,
} from '../../lib/nutrition/nutritionAutoScheduleCore.js'

/**
 * Воскресный авто-рацион: переключатель, статус по весу, пропуск воскресенья.
 * @param {{
 *   client: object,
 *   health: object|null,
 *   survey: object,
 *   plan: object|null,
 *   sunday: string,
 *   lastManualDay?: string|null,
 *   readOnly?: boolean,
 *   busy?: boolean,
 *   onToggle: (enabled: boolean) => void,
 *   onSkip: () => void,
 * }} props
 */
export function NutritionAutoScheduleCard({
  client,
  health,
  survey,
  plan,
  sunday,
  lastManualDay = null,
  readOnly = false,
  busy = false,
  onToggle,
  onSkip,
}) {
  const prefs = nutritionAutoPrefsFromSurvey(survey)
  const on = prefs.enabled
  const reason = on
    ? nutritionAutoHoldReason({
        enabled: true,
        skipDate: prefs.skipDate,
        client,
        health,
        plan,
        sundayIso: sunday,
        lastManualDay,
      })
    : null
  const delta = nutritionAutoWeightDeltaKg(health, plan)
  const day = formatNutritionAutoDay(sunday)
  const skipped = on && prefs.skipDate === sunday

  let status
  if (!on) {
    status = `При смене веса на ${NUTRITION_AUTO_WEIGHT_KG} кг и больше — пересчитаем и отправим сами`
  } else if (reason) {
    status = NUTRITION_AUTO_HOLD_RU[reason] || reason
  } else {
    status =
      delta != null
        ? `Вс ${day} · вес изменился на ${String(delta).replace('.', ',')} кг — уйдёт пересчёт`
        : `Вс ${day} · уйдёт пересчёт рациона`
  }

  return (
    <div className={`nutrition-auto${on ? ' nutrition-auto--on' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="nutrition-auto__head"
        disabled={readOnly || busy}
        onClick={() => onToggle(!on)}
        aria-label="Пересчитывать рацион каждое воскресенье при смене веса"
      >
        <CalendarClock size={20} aria-hidden />
        <span className="nutrition-auto__title">
          Каждое воскресенье в 10:00
          <span className="nutrition-auto__sub">{status}</span>
        </span>
        <span className={`client-switch${on ? ' client-switch--on' : ''}`} aria-hidden>
          <span className="client-switch__knob" />
        </span>
      </button>

      {on && !skipped && !reason ? (
        <div className="nutrition-auto__actions">
          <button type="button" className="btn btn-secondary btn-touch" disabled={readOnly || busy} onClick={onSkip}>
            <CalendarX2 size={16} aria-hidden />
            Пропустить {day}
          </button>
        </div>
      ) : null}

      {on && skipped ? (
        <p className="nutrition-auto__note muted">
          Вс {day} пропускаем. Снова включится со следующего воскресенья.
        </p>
      ) : null}
    </div>
  )
}
