import { useMemo, useState } from 'react'
import { CloseButton } from '../../components/CloseButton'
import {
  HOMEWORK_AVOID,
  HOMEWORK_EQUIPMENT,
  HOMEWORK_FOCUS,
  HOMEWORK_GOALS,
  HOMEWORK_LEVELS,
  HOMEWORK_PATTERNS,
  HOMEWORK_PHASES,
  HOMEWORK_UNITS,
} from '../../lib/homework/library/homeworkLibraryTags.js'
import {
  HOMEWORK_FORM_LIMITS,
  homeworkEntryFromForm,
  homeworkLibraryFormErrors,
} from '../../lib/homework/library/homeworkLibraryFormCore.js'
import { homeworkLibraryAltOptions } from '../../lib/homework/library/homeworkLibraryOverridesCore.js'

function Chips({ label, options, value, onChange, multi = false, error }) {
  const isOn = (id) => (multi ? value.includes(id) : String(value) === String(id))
  const toggle = (id) => {
    if (!multi) return onChange(id)
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }
  return (
    <div className="hwlib-form__field" role="group" aria-label={label}>
      <span className="label">{label}</span>
      <div className="hwlib-chips">
        {Object.entries(options).map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={isOn(id)}
            className={`homework-group-chip${isOn(id) ? ' homework-group-chip--active' : ''}`}
            onClick={() => toggle(id)}
          >
            {text}
          </button>
        ))}
      </div>
      {error ? <p className="hwlib-form__error">{error}</p> : null}
    </div>
  )
}

function Counter({ value, max }) {
  const n = String(value ?? '').trim().length
  return <span className={`hwlib-form__count${n > max ? ' hwlib-form__count--over' : ''}`}>{n} / {max}</span>
}

/** Добавление и правка упражнения библиотеки ДЗ. */
export function HomeworkLibraryEntryForm({ initial, isNew, library, busy, onCancel, onSave }) {
  const [form, setForm] = useState(initial)
  const [tried, setTried] = useState(false)
  const errors = useMemo(() => homeworkLibraryFormErrors(form, library), [form, library])
  const shown = tried ? errors : {}
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))
  const input = (field) => (e) => set(field)(e.target.value)
  const alts = homeworkLibraryAltOptions(library, form.pattern, form.avoid).filter((x) => x.id !== form.id)

  const submit = (e) => {
    e.preventDefault()
    setTried(true)
    if (Object.keys(errors).length) return
    onSave(homeworkEntryFromForm(form))
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="hwlib-form-title" onClick={busy ? undefined : onCancel}>
      <form className="modal-panel hwlib-form" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="hwlib-form__head">
          <h2 id="hwlib-form-title" className="section-title">
            {isNew ? 'Новое упражнение' : 'Упражнение'}
          </h2>
          <CloseButton onClick={onCancel} disabled={busy} />
        </div>

        <label className="hwlib-form__field">
          <span className="label">Название</span>
          <input className="input" value={form.name} onChange={input('name')} aria-invalid={Boolean(shown.name)} />
          {shown.name ? <span className="hwlib-form__error">{shown.name}</span> : null}
        </label>

        <label className="hwlib-form__field">
          <span className="label">Движение</span>
          <select className="select" value={form.pattern} onChange={input('pattern')}>
            {Object.entries(HOMEWORK_PATTERNS).map(([id, text]) => (
              <option key={id} value={id}>{text}</option>
            ))}
          </select>
        </label>

        <Chips label="Уровень" options={HOMEWORK_LEVELS} value={form.level} onChange={(v) => set('level')(Number(v))} />
        <Chips label="Работает" options={HOMEWORK_FOCUS} value={form.focus} onChange={set('focus')} />
        <Chips label="Цели" options={HOMEWORK_GOALS} value={form.goals} onChange={set('goals')} multi error={shown.goals} />
        <Chips label="Часть занятия" options={HOMEWORK_PHASES} value={form.phases} onChange={set('phases')} multi error={shown.phases} />
        <Chips label="Нельзя при" options={HOMEWORK_AVOID} value={form.avoid} onChange={set('avoid')} multi />
        <Chips label="Инвентарь" options={HOMEWORK_EQUIPMENT} value={form.equip} onChange={set('equip')} />

        {form.equip === 'dumbbells' ? (
          <div className="hwlib-form__dumbbells">
            <label className="hwlib-form__field">
              <span className="label">Чем заменить гантели дома</span>
              <input className="input" value={form.household} onChange={input('household')} placeholder="бутылки с водой" aria-invalid={Boolean(shown.household)} />
              {shown.household ? <span className="hwlib-form__error">{shown.household}</span> : null}
            </label>
            <label className="hwlib-form__field">
              <span className="label">Упражнение на замену (без гантелей)</span>
              <select className="select" value={form.alt} onChange={input('alt')} aria-invalid={Boolean(shown.alt)}>
                <option value="">— выберите —</option>
                {alts.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
              {shown.alt ? <span className="hwlib-form__error">{shown.alt}</span> : null}
            </label>
          </div>
        ) : null}

        <Chips label="Считаем" options={HOMEWORK_UNITS} value={form.unit} onChange={set('unit')} />
        <div className="hwlib-form__field">
          <div className="hwlib-chips">
            <button type="button" aria-pressed={form.side} className={`homework-group-chip${form.side ? ' homework-group-chip--active' : ''}`} onClick={() => set('side')(!form.side)}>
              На каждую сторону
            </button>
            <button type="button" aria-pressed={form.impact} className={`homework-group-chip${form.impact ? ' homework-group-chip--active' : ''}`} onClick={() => set('impact')(!form.impact)}>
              С прыжками
            </button>
          </div>
          {shown.impact ? <p className="hwlib-form__error">{shown.impact}</p> : null}
        </div>

        <label className="hwlib-form__field">
          <span className="label hwlib-form__label-row">
            Как выполнять <Counter value={form.how} max={HOMEWORK_FORM_LIMITS.how} />
          </span>
          <textarea className="input" rows={3} value={form.how} onChange={input('how')} aria-invalid={Boolean(shown.how)} />
          {shown.how ? <span className="hwlib-form__error">{shown.how}</span> : null}
        </label>

        <label className="hwlib-form__field">
          <span className="label hwlib-form__label-row">
            Главная ошибка техники <Counter value={form.cue} max={HOMEWORK_FORM_LIMITS.cue} />
          </span>
          <input className="input" value={form.cue} onChange={input('cue')} aria-invalid={Boolean(shown.cue)} />
          {shown.cue ? <span className="hwlib-form__error">{shown.cue}</span> : null}
        </label>

        <div className="row td-modal-actions hwlib-form__actions">
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}
