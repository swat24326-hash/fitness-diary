import { Trash2 } from 'lucide-react'
import { TrainingSetHrField } from './trainer/TrainingSetHrField.jsx'
import { displayLateralityField, patchLateralitySetField } from '../lib/trainingSetLateralityCore'

function SetField({ label, value, onChange, inputMode, title, placeholder, type, min, max }) {
  const shown = placeholder || label
  return (
    <div className="field set-row-compact__field">
      <label className="sr-only">{label}</label>
      <input
        className="input"
        inputMode={inputMode}
        type={type}
        min={min}
        max={max}
        placeholder={shown}
        title={title || label}
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function patch(st, key, value) {
  return { ...st, [key]: value }
}

function LrPair({ side, tag, ariaSide, reps, weight, onReps, onWeight }) {
  return (
    <div className={`set-row-lr-pair set-row-lr-pair--${side}`}>
      <span className="set-row-lr-pair__tag" aria-hidden>
        {tag}
      </span>
      <SetField label={`${ariaSide}, повторы`} placeholder="повт" inputMode="numeric" value={reps} onChange={onReps} />
      <SetField label={`${ariaSide}, вес кг`} placeholder="кг" inputMode="decimal" value={weight} onChange={onWeight} />
    </div>
  )
}

/**
 * Одна строка подхода: обычные поля или Л/П в той же линии.
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
  const rowClass = [
    'set-row-compact',
    withSetHr && !isLr ? 'set-row-compact--functional' : '',
    isLr && !isCardio ? 'set-row-compact--lr' : '',
    isLr && withSetHr && !isCardio ? 'set-row-compact--lr-hr' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const rpeField = (
    <SetField
      label="RPE"
      placeholder="RPE"
      type="number"
      min={1}
      max={10}
      value={st.rpe ?? ''}
      onChange={(v) => onChange(patch(st, 'rpe', v))}
    />
  )

  const hrField = withSetHr ? (
    <TrainingSetHrField
      compact
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
      className="btn btn-ghost btn-icon-square set-row-compact__remove"
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
          label="Время под нагрузкой, мин"
          placeholder="мин"
          inputMode="numeric"
          title="Сколько минут длился отрезок/подход"
          value={st.tut_sec ?? ''}
          onChange={(v) => onChange(patch(st, 'tut_sec', v))}
        />
        <SetField
          label="Нагрузка"
          placeholder="нагр."
          inputMode="decimal"
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
        <LrPair
          side="l"
          tag="Л"
          ariaSide="Левая"
          reps={displayLateralityField(st, 'reps_l', 'reps_r', 'reps')}
          weight={displayLateralityField(st, 'weight_kg_l', 'weight_kg_r', 'weight_kg')}
          onReps={(v) => onChange(patchLateralitySetField(st, 'reps_l', v))}
          onWeight={(v) => onChange(patchLateralitySetField(st, 'weight_kg_l', v))}
        />
        <LrPair
          side="r"
          tag="П"
          ariaSide="Правая"
          reps={displayLateralityField(st, 'reps_r', 'reps_l', 'reps')}
          weight={displayLateralityField(st, 'weight_kg_r', 'weight_kg_l', 'weight_kg')}
          onReps={(v) => onChange(patchLateralitySetField(st, 'reps_r', v))}
          onWeight={(v) => onChange(patchLateralitySetField(st, 'weight_kg_r', v))}
        />
        {rpeField}
        {hrField}
        {removeBtn}
      </div>
    )
  }

  return (
    <div className={rowClass}>
      <span className="set-row-compact__idx">{setIndex + 1}</span>
      <SetField label="Повторы" placeholder="Повт." inputMode="numeric" value={st.reps} onChange={(v) => onChange(patch(st, 'reps', v))} />
      <SetField label="Вес, кг" placeholder="кг" inputMode="decimal" value={st.weight_kg} onChange={(v) => onChange(patch(st, 'weight_kg', v))} />
      {rpeField}
      {hrField}
      {removeBtn}
    </div>
  )
}
