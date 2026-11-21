import { useEffect, useState } from 'react'
import {
  foodDiaryPersonalTargetsFormSeed,
  parseFoodDiaryPersonalTargets,
} from '../../lib/client/foodDiaryPersonalTargetsCore.js'

/**
 * «Мои цели» на вкладке Ещё — для АЗ/ТЗ (и ПЗ без рациона).
 */
export function ClientFoodDiaryTargets({
  personal = null,
  planOverrides = false,
  busy = false,
  localOnly = false,
  onSave,
}) {
  const [form, setForm] = useState(() => foodDiaryPersonalTargetsFormSeed(personal))
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(foodDiaryPersonalTargetsFormSeed(personal))
  }, [personal])

  const setField = (key, raw) => {
    setForm((prev) => ({ ...prev, [key]: raw }))
  }

  const submit = () => {
    setError('')
    const parsed = parseFoodDiaryPersonalTargets(form)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    if (localOnly) {
      setError('В превью сохранение только локально до перезагрузки')
      onSave?.(parsed.value)
      return
    }
    onSave?.(parsed.value)
  }

  return (
    <section className="card food-diary-more__card food-diary-targets" aria-label="Мои цели">
      <h2 className="food-diary-more__title">Мои цели</h2>
      <p className="muted food-diary-more__lead">
        {planOverrides
          ? 'Сейчас в дне цели из рациона тренера. Свои числа включатся, если рациона не будет.'
          : 'Ккал и БЖУ на день — сами задаёте ориентир для дневника.'}
      </p>
      <div className="food-diary-targets__grid">
        <label className="food-diary-targets__field">
          <span>Ккал</span>
          <input
            type="number"
            inputMode="numeric"
            min={800}
            max={5000}
            className="food-diary-targets__input"
            value={form.kcal}
            disabled={busy}
            onChange={(e) => setField('kcal', e.target.value)}
          />
        </label>
        <label className="food-diary-targets__field">
          <span>Белки, г</span>
          <input
            type="number"
            inputMode="numeric"
            min={10}
            max={400}
            className="food-diary-targets__input"
            value={form.protein_g}
            disabled={busy}
            onChange={(e) => setField('protein_g', e.target.value)}
          />
        </label>
        <label className="food-diary-targets__field">
          <span>Жиры, г</span>
          <input
            type="number"
            inputMode="numeric"
            min={10}
            max={400}
            className="food-diary-targets__input"
            value={form.fat_g}
            disabled={busy}
            onChange={(e) => setField('fat_g', e.target.value)}
          />
        </label>
        <label className="food-diary-targets__field">
          <span>Углеводы, г</span>
          <input
            type="number"
            inputMode="numeric"
            min={10}
            max={400}
            className="food-diary-targets__input"
            value={form.carbs_g}
            disabled={busy}
            onChange={(e) => setField('carbs_g', e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p className="food-diary-day__error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-touch food-diary-targets__save"
        disabled={busy}
        onClick={submit}
      >
        Сохранить цели
      </button>
    </section>
  )
}
