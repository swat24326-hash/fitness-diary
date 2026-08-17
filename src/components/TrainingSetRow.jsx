import { Trash2 } from 'lucide-react'
import { TrainingSetHrField } from './trainer/TrainingSetHrField.jsx'
import { displayLateralityField } from '../lib/trainingSetLateralityCore'

function SetField({ label, value, onChange, inputMode, title, placeholder, type, min, max }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input
        className="input"
        inputMode={inputMode}
        type={type}
        min={min}
        max={max}
        placeholder={placeholder}
        title={title}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function patch(st, key, value) {
  return { ...st, [key]: value }
}

/**
 * Одна строка подхода: обычные поля или две стороны Л/П.
 */
export function TrainingSetRow({
  setIndex,
  set: st,
  isCardio,
  withSetHr,
  isLr,
  clientId,
  canRemove,
  onChange,
  onRemove,
}) {
  const rowClass = `set-row-compact${withSetHr && !isLr ? ' set-row-compact--functional' : ''}${isLr && !isCardio ? ' set-row-compact--lr' : ''}`

  const rpeField = (
    <SetField
      label="RPE"
      type="number"
      min={1}
      max={10}
      value={st.rpe ?? ''}
      onChange={(v) => onChange(patch(st, 'rpe', v))}
    />
  )

  const hrField = withSetHr ? (
    <TrainingSetHrField
      value={st.hr_after ?? ''}
      clientId={clientId}
      title={
        isCardio
          ? 'Пульс после отрезка/подхода (уд/мин). Двойной тап — текущий пульс с датчика'
          : undefined
      }
      onChange={(hr_after) => onChange(patch(st, 'hr_after', hr_after))}
    />
  ) : null

  const removeBtn = (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ marginBottom: 2, minHeight: 42 }}
      onClick={onRemove}
      disabled={!canRemove}
      aria-label="Удалить подход"
    >
      <Trash2 size={18} aria-hidden />
    </button>
  )

  if (isCardio) {
    return (
      <div className={rowClass}>
        <span className="set-row-compact__idx">{setIndex + 1}</span>
        <SetField
          label="Время под нагрузкой"
          inputMode="numeric"
          placeholder="мин"
          title="Сколько минут длился отрезок/подход"
          value={st.tut_sec ?? ''}
          onChange={(v) => onChange(patch(st, 'tut_sec', v))}
        />
        <SetField
          label="Нагрузка"
          inputMode="decimal"
          placeholder="уровень/кг/км"
          title="Например: уровень дорожки/эллипса, скорость, сопротивление или кг"
          value={st.load ?? ''}
          onChange={(v) => onChange(patch(st, 'load', v))}
        />
        {hrField}
        {rpeField}
        {removeBtn}
      </div>
    )
  }

  if (isLr) {
    return (
      <div className={rowClass}>
        <span className="set-row-compact__idx">{setIndex + 1}</span>
        <div className="set-row-lr-body">
          <div className="set-row-lr-side">
            <span className="set-row-lr-side__tag">Л</span>
            <SetField
              label="Повт."
              inputMode="numeric"
              value={displayLateralityField(st, 'reps_l', 'reps_r', 'reps')}
              onChange={(v) => onChange(patch(st, 'reps_l', v))}
            />
            <SetField
              label="Вес, кг"
              inputMode="decimal"
              value={displayLateralityField(st, 'weight_kg_l', 'weight_kg_r', 'weight_kg')}
              onChange={(v) => onChange(patch(st, 'weight_kg_l', v))}
            />
          </div>
          <div className="set-row-lr-side">
            <span className="set-row-lr-side__tag">П</span>
            <SetField
              label="Повт."
              inputMode="numeric"
              value={displayLateralityField(st, 'reps_r', 'reps_l', 'reps')}
              onChange={(v) => onChange(patch(st, 'reps_r', v))}
            />
            <SetField
              label="Вес, кг"
              inputMode="decimal"
              value={displayLateralityField(st, 'weight_kg_r', 'weight_kg_l', 'weight_kg')}
              onChange={(v) => onChange(patch(st, 'weight_kg_r', v))}
            />
          </div>
          <div className={`set-row-lr-meta${withSetHr ? ' set-row-lr-meta--hr' : ''}`}>
            {rpeField}
            {hrField}
          </div>
        </div>
        {removeBtn}
      </div>
    )
  }

  return (
    <div className={rowClass}>
      <span className="set-row-compact__idx">{setIndex + 1}</span>
      <SetField label="Повт." inputMode="numeric" value={st.reps} onChange={(v) => onChange(patch(st, 'reps', v))} />
      <SetField label="Вес, кг" inputMode="decimal" value={st.weight_kg} onChange={(v) => onChange(patch(st, 'weight_kg', v))} />
      {rpeField}
      {hrField}
      {removeBtn}
    </div>
  )
}
