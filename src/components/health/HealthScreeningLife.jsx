import { SCREEN_EQUIPMENT, SCREEN_LIFE } from '../../lib/health/healthScreeningCatalog.js'
import { HealthScreeningChips } from './HealthScreeningYesNo.jsx'

/** Блок «Опыт, быт и дом»: один вариант на строку + инвентарь (несколько). */
export function HealthScreeningLife({ life, onChange, disabled }) {
  const set = (key, v) => {
    const next = { ...life }
    if (v == null) delete next[key]
    else next[key] = v
    onChange(next)
  }
  const nothing = Array.isArray(life.equipment) && life.equipment.length === 0
  return (
    <div className="hscr-life">
      {Object.entries(SCREEN_LIFE).map(([key, q]) => (
        <div key={key} className="hscr-life__row">
          <span className="hscr-q__label">{q.label}</span>
          <HealthScreeningChips options={q.options} value={life[key] ?? null} multi={false} onChange={(v) => set(key, v)} disabled={disabled} label={q.label} />
        </div>
      ))}
      <div className="hscr-life__row">
        <span className="hscr-q__label">Инвентарь дома</span>
        <div className="hscr-life__equip">
          <HealthScreeningChips options={SCREEN_EQUIPMENT} value={life.equipment ?? []} onChange={(v) => set('equipment', v.length ? v : null)} disabled={disabled} label="Инвентарь дома" />
          <button
            type="button"
            className={`hscr-chip${nothing ? ' hscr-chip--on' : ''}`}
            aria-pressed={nothing}
            disabled={disabled}
            onClick={() => set('equipment', nothing ? null : [])}
          >
            Ничего из этого
          </button>
        </div>
      </div>
    </div>
  )
}
