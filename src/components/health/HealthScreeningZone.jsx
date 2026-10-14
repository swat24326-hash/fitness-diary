import { SCREEN_ZONE_DIAGNOSIS, SCREEN_ZONE_STATUS, SCREEN_ZONE_TRIGGERS } from '../../lib/health/healthScreeningCatalog.js'
import { HealthScreeningQuestion } from './HealthScreeningQuestion.jsx'
import { HealthScreeningChips } from './HealthScreeningYesNo.jsx'

/** Зона тела: «да» → сейчас / что было / что вызывает боль. */
export function HealthScreeningZone({ zone, answer, onChange, disabled }) {
  const set = (key, v) => onChange({ ...answer, [key]: v ?? undefined })
  return (
    <HealthScreeningQuestion q={zone} answer={answer} onChange={onChange} disabled={disabled}>
      <div className="hscr-zone">
        <span className="hscr-zone__label">Сейчас</span>
        <HealthScreeningChips options={SCREEN_ZONE_STATUS} value={answer?.s ?? null} multi={false} onChange={(v) => set('s', v)} disabled={disabled} label={`${zone.label}: сейчас`} />
        <span className="hscr-zone__label">Что было</span>
        <HealthScreeningChips options={SCREEN_ZONE_DIAGNOSIS} value={answer?.d ?? []} onChange={(v) => set('d', v)} disabled={disabled} label={`${zone.label}: что было`} />
        <span className="hscr-zone__label">Что вызывает боль</span>
        <HealthScreeningChips options={SCREEN_ZONE_TRIGGERS} value={answer?.t ?? []} onChange={(v) => set('t', v)} disabled={disabled} label={`${zone.label}: что вызывает боль`} />
      </div>
    </HealthScreeningQuestion>
  )
}
