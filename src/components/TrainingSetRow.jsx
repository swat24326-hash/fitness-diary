import { Trash2 } from 'lucide-react'
import { TrainingSetHrField } from './trainer/TrainingSetHrField.jsx'
import { displayLateralityField, patchLateralitySetField } from '../lib/trainingSetLateralityCore'

function SetField({ label, value, onChange, inputMode, title, placeholder, type, min, max, fieldClass = '', gridArea = '' }) {
  const shown = placeholder || label
  return (
    <div
      className={[
        'field',
        'set-row-compact__field',
        fieldClass,
        gridArea,
      ]
        .filter(Boolean)
        .join(' ')}
    >
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

function RpeField({ value, onChange, gridArea = '', ariaSide = '' }) {
  const label = ariaSide ? `RPE, ${ariaSide}, 1–10` : 'RPE, 1–10'
  return (
    <SetField
      label={label}
      placeholder="RPE"
      type="number"
      min={1}
      max={10}
      fieldClass="set-row-compact__field--rpe"
      gridArea={gridArea}
      value={value}
      onChange={onChange}
    />
  )
}

/**
 * Подход: одна строка или Л/П — две строки (Л сверху, П снизу), одна корзина на обе.
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
  ]
    .filter(Boolean)
    .join(' ')

  const rpeField = (sideKey, otherKey, bothKey, ariaSide, gridArea) => (
    <RpeField
      value={displayLateralityField(st, sideKey, otherKey, bothKey)}
      onChange={(v) => onChange(patchLateralitySetField(st, sideKey, v))}
      gridArea={gridArea}
      ariaSide={ariaSide}
    />
  )

  const bilateralRpeField = (
    <RpeField value={st.rpe ?? ''} onChange={(v) => onChange(patch(st, 'rpe', v))} />
  )

  const hrField = (sideKey, otherKey, bothKey, ariaSide, gridArea) =>
    withSetHr ? (
      <TrainingSetHrField
        compact
        gridArea={gridArea}
        value={displayLateralityField(st, sideKey, otherKey, bothKey)}
        clientId={clientId}
        title={`Пульс после ${ariaSide.toLowerCase()} стороны (уд/мин). Двойной тап — с датчика`}
        onChange={(v) => onChange(patchLateralitySetField(st, sideKey, v))}
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
          label="Время под нагрузкой, min"
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
        {withSetHr ? (
          <TrainingSetHrField
            compact
            value={st.hr_after ?? ''}
            clientId={clientId}
            title="Пульс после отрезка/подхода (уд/мин). Двойной тап — текущий пульс с датчика"
            onChange={(v) => onChange(patch(st, 'hr_after', v))}
          />
        ) : null}
        {bilateralRpeField}
        {removeBtn}
      </div>
    )
  }

  if (isLr) {
    const functional = withSetHr && !isCardio
    const stackClass = ['set-row-lr-stack', functional ? 'set-row-lr-stack--functional' : '']
      .filter(Boolean)
      .join(' ')

    return (
      <div className={stackClass}>
        <span className="set-row-compact__idx set-row-lr-stack__idx">{setIndex + 1}</span>

        <span className="set-row-lr-stack__tag set-row-lr-stack__tag--l" aria-hidden>
          Л
        </span>
        <SetField
          label="Левая, повторы"
          placeholder="Повт."
          inputMode="numeric"
          gridArea="set-row-lr-stack__reps-l"
          value={displayLateralityField(st, 'reps_l', 'reps_r', 'reps')}
          onChange={(v) => onChange(patchLateralitySetField(st, 'reps_l', v))}
        />
        <SetField
          label="Левая, вес кг"
          placeholder="кг"
          inputMode="decimal"
          gridArea="set-row-lr-stack__wt-l"
          value={displayLateralityField(st, 'weight_kg_l', 'weight_kg_r', 'weight_kg')}
          onChange={(v) => onChange(patchLateralitySetField(st, 'weight_kg_l', v))}
        />
        {functional ? hrField('hr_after_l', 'hr_after_r', 'hr_after', 'Левая', 'set-row-lr-stack__hr-l') : null}
        {rpeField('rpe_l', 'rpe_r', 'rpe', 'левая', 'set-row-lr-stack__rpe-l')}

        <span className="set-row-lr-stack__tag set-row-lr-stack__tag--r" aria-hidden>
          П
        </span>
        <SetField
          label="Правая, повторы"
          placeholder="Повт."
          inputMode="numeric"
          gridArea="set-row-lr-stack__reps-r"
          value={displayLateralityField(st, 'reps_r', 'reps_l', 'reps')}
          onChange={(v) => onChange(patchLateralitySetField(st, 'reps_r', v))}
        />
        <SetField
          label="Правая, вес кг"
          placeholder="кг"
          inputMode="decimal"
          gridArea="set-row-lr-stack__wt-r"
          value={displayLateralityField(st, 'weight_kg_r', 'weight_kg_l', 'weight_kg')}
          onChange={(v) => onChange(patchLateralitySetField(st, 'weight_kg_r', v))}
        />
        {functional ? hrField('hr_after_r', 'hr_after_l', 'hr_after', 'Правая', 'set-row-lr-stack__hr-r') : null}
        {rpeField('rpe_r', 'rpe_l', 'rpe', 'правая', 'set-row-lr-stack__rpe-r')}

        <div className="set-row-lr-stack__remove">{removeBtn}</div>
      </div>
    )
  }

  return (
    <div className={rowClass}>
      <span className="set-row-compact__idx">{setIndex + 1}</span>
      <SetField label="Повторы" placeholder="Повт." inputMode="numeric" value={st.reps} onChange={(v) => onChange(patch(st, 'reps', v))} />
      <SetField label="Вес, кг" placeholder="кг" inputMode="decimal" value={st.weight_kg} onChange={(v) => onChange(patch(st, 'weight_kg', v))} />
      {bilateralRpeField}
      {withSetHr ? (
        <TrainingSetHrField
          compact
          value={st.hr_after ?? ''}
          clientId={clientId}
          onChange={(v) => onChange(patch(st, 'hr_after', v))}
        />
      ) : null}
      {removeBtn}
    </div>
  )
}
