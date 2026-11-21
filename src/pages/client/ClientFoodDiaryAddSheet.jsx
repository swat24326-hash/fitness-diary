import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { FOOD_DIARY_MEALS, parseFoodDiaryUpsert } from '../../lib/client/foodDiaryDayCore.js'
import { ClientFoodDiaryCatalogPicker } from './ClientFoodDiaryCatalogPicker.jsx'

/**
 * Шторка добавления продукта: между шапкой клуба и нижними вкладками /me,
 * чтобы не ломать хром и оставить место под список каталога.
 */
export function ClientFoodDiaryAddSheet({
  asOf,
  entryDate,
  initial = null,
  defaultMeal = 'breakfast',
  busy = false,
  error = '',
  localOnly = false,
  frequent = [],
  onClose,
  onSave,
  onDelete,
  onQuickAdd,
}) {
  const editing = Boolean(initial?.id)
  const [tab, setTab] = useState(() => (editing ? 'manual' : 'search'))
  /** Приём уже выбран на дне («+» у завтрака/обеда…) — на экране добавления не дублируем чипы. */
  const meal = initial?.meal_key || defaultMeal
  const [name, setName] = useState(() => initial?.name ?? '')
  const [grams, setGrams] = useState(() => (initial?.grams != null ? String(initial.grams).replace('.', ',') : ''))
  const [kcal, setKcal] = useState(() => (initial?.kcal != null ? String(initial.kcal).replace('.', ',') : ''))
  const [protein, setProtein] = useState(() =>
    initial?.protein_g != null ? String(initial.protein_g).replace('.', ',') : '',
  )
  const [fat, setFat] = useState(() => (initial?.fat_g != null ? String(initial.fat_g).replace('.', ',') : ''))
  const [carbs, setCarbs] = useState(() =>
    initial?.carbs_g != null ? String(initial.carbs_g).replace('.', ',') : '',
  )
  const [fiber, setFiber] = useState(() =>
    initial?.fiber_g != null && Number(initial.fiber_g) !== 0 ? String(initial.fiber_g).replace('.', ',') : '',
  )
  const [sugar, setSugar] = useState(() =>
    initial?.sugar_g != null && Number(initial.sugar_g) !== 0 ? String(initial.sugar_g).replace('.', ',') : '',
  )
  const [sodium, setSodium] = useState(() =>
    initial?.sodium_mg != null && Number(initial.sodium_mg) !== 0
      ? String(initial.sodium_mg).replace('.', ',')
      : '',
  )
  const [moreOpen, setMoreOpen] = useState(
    () =>
      Boolean(
        (initial?.fiber_g && Number(initial.fiber_g) !== 0) ||
          (initial?.sugar_g && Number(initial.sugar_g) !== 0) ||
          (initial?.sodium_mg && Number(initial.sodium_mg) !== 0),
      ),
  )
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const title = editing ? 'Изменить продукт' : 'Добавить продукт'
  const mealLabel = FOOD_DIARY_MEALS.find((m) => m.key === meal)?.label || 'Приём'

  const saveBody = async (body) => {
    setLocalError('')
    const parsed = parseFoodDiaryUpsert(body, asOf)
    if (!parsed.ok) {
      setLocalError(parsed.error)
      return
    }
    await onSave(parsed)
  }

  const submit = async (e) => {
    e.preventDefault()
    await saveBody({
      id: initial?.id,
      entry_date: entryDate,
      meal_key: meal,
      name,
      grams: grams || null,
      kcal,
      protein_g: protein,
      fat_g: fat,
      carbs_g: carbs,
      fiber_g: fiber || undefined,
      sugar_g: sugar || undefined,
      sodium_mg: sodium || undefined,
    })
  }

  const onPickPortion = async (portion) => {
    await saveBody({
      entry_date: entryDate,
      meal_key: meal,
      ...portion,
    })
  }

  return (
    <div className="food-diary-add-sheet">
      <button
        type="button"
        className="food-diary-add-sheet__backdrop"
        aria-label="Закрыть"
        disabled={busy}
        onClick={onClose}
      />
      <div className="food-diary-add-page" role="dialog" aria-modal="true" aria-label={title}>
      <header className="food-diary-add-page__head">
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch food-diary-add-page__back"
          aria-label="Назад"
          disabled={busy}
          onClick={onClose}
        >
          <ChevronLeft size={22} strokeWidth={2.25} aria-hidden />
        </button>
        <div className="food-diary-add-page__titles">
          <h2 className="food-diary-add-page__title">{title}</h2>
          <p className="food-diary-add-page__meal-label muted">{mealLabel}</p>
        </div>
      </header>

      {!editing ? (
        <div className="food-diary-add__modes" role="tablist" aria-label="Способ добавления">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'search'}
            className={`food-diary-add__mode btn-touch${tab === 'search' ? ' food-diary-add__mode--on' : ''}`}
            onClick={() => setTab('search')}
          >
            Поиск
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'frequent'}
            className={`food-diary-add__mode btn-touch${tab === 'frequent' ? ' food-diary-add__mode--on' : ''}`}
            onClick={() => setTab('frequent')}
          >
            Часто
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'manual'}
            className={`food-diary-add__mode btn-touch${tab === 'manual' ? ' food-diary-add__mode--on' : ''}`}
            onClick={() => setTab('manual')}
          >
            Вручную
          </button>
        </div>
      ) : null}

      <div className="food-diary-add-page__body">
        {tab === 'search' && !editing ? (
          <div className="food-diary-add-page__scroll">
            <ClientFoodDiaryCatalogPicker localOnly={localOnly} busy={busy} onPickPortion={(p) => void onPickPortion(p)} />
            {localError || error ? (
              <p className="food-diary-add-page__error" role="alert">
                {localError || error}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'frequent' && !editing ? (
          <div className="food-diary-add-page__scroll">
            {frequent.length === 0 ? (
              <p className="food-diary-add-page__empty muted">Пока пусто — добавьте еду через поиск.</p>
            ) : (
              <ul className="food-diary-catalog__hits food-diary-catalog__hits--fill">
                {frequent.map((f) => (
                  <li key={f.name}>
                    <button
                      type="button"
                      className="food-diary-catalog__hit btn-touch"
                      disabled={busy}
                      onClick={() => onQuickAdd?.({ ...f, meal_key: meal })}
                    >
                      <span className="food-diary-catalog__hit-name">{f.name}</span>
                      <span className="muted food-diary-catalog__hit-meta">
                        {Math.round(f.kcal)} ккал
                        {f.grams != null ? ` · ${f.grams} г` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {localError || error ? (
              <p className="food-diary-add-page__error" role="alert">
                {localError || error}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'manual' || editing ? (
          <form className="food-diary-add-page__scroll food-diary-add-page__form" onSubmit={(e) => void submit(e)}>
            <label className="food-diary-add-page__field">
              <span>Название</span>
              <input
                value={name}
                required
                maxLength={120}
                disabled={busy}
                autoComplete="off"
                placeholder="Овсянка с бананом"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="food-diary-add__grid">
              <label className="food-diary-add-page__field">
                <span>Граммы</span>
                <input
                  inputMode="decimal"
                  value={grams}
                  disabled={busy}
                  placeholder="необязательно"
                  onChange={(e) => setGrams(e.target.value)}
                />
              </label>
              <label className="food-diary-add-page__field">
                <span>Ккал</span>
                <input inputMode="decimal" value={kcal} required disabled={busy} onChange={(e) => setKcal(e.target.value)} />
              </label>
              <label className="food-diary-add-page__field">
                <span>Белки, г</span>
                <input
                  inputMode="decimal"
                  value={protein}
                  required
                  disabled={busy}
                  onChange={(e) => setProtein(e.target.value)}
                />
              </label>
              <label className="food-diary-add-page__field">
                <span>Жиры, г</span>
                <input inputMode="decimal" value={fat} required disabled={busy} onChange={(e) => setFat(e.target.value)} />
              </label>
              <label className="food-diary-add-page__field">
                <span>Углеводы, г</span>
                <input
                  inputMode="decimal"
                  value={carbs}
                  required
                  disabled={busy}
                  onChange={(e) => setCarbs(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="food-diary-add__more btn-touch"
              disabled={busy}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {moreOpen ? 'Скрыть клетчатку, сахар, натрий' : 'Ещё: клетчатка, сахар, натрий'}
            </button>
            {moreOpen ? (
              <div className="food-diary-add__grid">
                <label className="food-diary-add-page__field">
                  <span>Клетчатка, г</span>
                  <input inputMode="decimal" value={fiber} disabled={busy} onChange={(e) => setFiber(e.target.value)} />
                </label>
                <label className="food-diary-add-page__field">
                  <span>Сахар, г</span>
                  <input inputMode="decimal" value={sugar} disabled={busy} onChange={(e) => setSugar(e.target.value)} />
                </label>
                <label className="food-diary-add-page__field">
                  <span>Натрий, мг</span>
                  <input
                    inputMode="decimal"
                    value={sodium}
                    disabled={busy}
                    placeholder="соль ≈ ×2,5"
                    onChange={(e) => setSodium(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
            {localError || error ? (
              <p className="food-diary-add-page__error" role="alert">
                {localError || error}
              </p>
            ) : null}
            <div className="food-diary-add-page__actions">
              {editing && onDelete ? (
                <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => void onDelete()}>
                  Удалить
                </button>
              ) : (
                <span />
              )}
              <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
      </div>
    </div>
  )
}
