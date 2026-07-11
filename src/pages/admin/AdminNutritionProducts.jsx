import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { pullNutritionProductsForClubFromCloud } from '../../lib/pullReferenceData'
import {
  deactivateNutritionProduct,
  insertNutritionProduct,
  listNutritionProductsForClub,
  seedDefaultNutritionProductsForClub,
} from '../../lib/nutrition/nutritionProductsService'
import { NUTRITION_MACRO_GROUP_LABELS } from '../../lib/nutrition/nutritionProductsCore.js'

function MacroBadge({ group }) {
  const label = NUTRITION_MACRO_GROUP_LABELS[group] ?? group
  return <span className={`admin-nutrition-badge admin-nutrition-badge--${group}`}>{label}</span>
}

function ProductChipList({ items, group, onDeactivate, confirmId, setConfirmId, busy }) {
  const active = items.filter((p) => p.is_active !== false)
  const inactive = items.filter((p) => p.is_active === false)
  if (!items.length) {
    return <p className="muted admin-nutrition-catalog__empty">Пока нет продуктов в этой группе.</p>
  }
  return (
    <>
      {active.length > 0 ? (
        <ul className="admin-nutrition-catalog__list">
          {active.map((p) => (
            <li key={p.id} className="admin-nutrition-product-row">
              <div className="admin-nutrition-product-row__main">
                <MacroBadge group={group} />
                <span className="admin-nutrition-product-row__label">{p.label}</span>
                <span className="muted admin-nutrition-product-row__macros">
                  Б {p.protein_per100} · Ж {p.fat_per100} · У {p.carbs_per100}
                  {p.piece_grams ? ` · ${p.piece_grams} г/шт` : ''}
                </span>
              </div>
              {confirmId === p.id ? (
                <div className="admin-nutrition-product-row__confirm">
                  <span className="muted">Отключить?</span>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onDeactivate(p.id)}>
                    Да
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>
                    Нет
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-icon-square btn-touch admin-nutrition-product-row__delete"
                  aria-label={`Отключить ${p.label}`}
                  disabled={busy}
                  onClick={() => setConfirmId(p.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted admin-nutrition-catalog__empty">Нет активных продуктов.</p>
      )}
      {inactive.length > 0 ? (
        <div className="admin-nutrition-catalog__inactive">
          <span className="muted">Отключённые:</span>
          <ul className="admin-nutrition-catalog__chips">
            {inactive.map((p) => (
              <li key={p.id}>
                <span className="admin-nutrition-chip admin-nutrition-chip--inactive">{p.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

const EMPTY_FORM = {
  label: '',
  macro_group: 'protein',
  protein_per100: '',
  fat_per100: '',
  carbs_per100: '',
  piece_grams: '',
}

export function AdminNutritionProducts() {
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''

  const [items, setItems] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [pullBusy, setPullBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)

  const reloadLocal = useCallback(async () => {
    if (!clubId) {
      setItems([])
      return
    }
    setItems(await listNutritionProductsForClub(clubId, { activeOnly: false }))
  }, [clubId])

  useEffect(() => {
    void reloadLocal()
  }, [reloadLocal])

  const grouped = useMemo(() => {
    const g = { protein: [], fat: [], carbs: [] }
    for (const p of items) {
      if (g[p.macro_group]) g[p.macro_group].push(p)
    }
    return g
  }, [items])

  const activeCount = useMemo(() => items.filter((p) => p.is_active !== false).length, [items])

  const pullFromCloud = async () => {
    if (!clubId) return
    setPullBusy(true)
    setMsg('')
    try {
      const r = await pullNutritionProductsForClubFromCloud(clubId, { forceFromCloud: true })
      if (!r.ok) setMsg(r.error ?? 'Ошибка загрузки')
      else setMsg(`Загружено из облака: ${r.count ?? 0}`)
      await reloadLocal()
    } finally {
      setPullBusy(false)
    }
  }

  const seedDefaults = async () => {
    if (!clubId) return
    setBusy(true)
    setMsg('')
    try {
      const r = await seedDefaultNutritionProductsForClub(clubId)
      if (r.skipped) setMsg('В клубе уже есть продукты — базовый набор не добавлен.')
      else if (r.count > 0) setMsg(`Добавлено продуктов: ${r.count}`)
      else setMsg(r.cloudError ?? 'Не удалось добавить базовый набор')
      await reloadLocal()
    } finally {
      setBusy(false)
    }
  }

  const addProduct = async (e) => {
    e.preventDefault()
    if (!clubId) return
    setBusy(true)
    setMsg('')
    try {
      const res = await insertNutritionProduct({
        club_id: clubId,
        label: form.label,
        macro_group: form.macro_group,
        protein_per100: Number(String(form.protein_per100).replace(',', '.')) || 0,
        fat_per100: Number(String(form.fat_per100).replace(',', '.')) || 0,
        carbs_per100: Number(String(form.carbs_per100).replace(',', '.')) || 0,
        piece_grams: form.piece_grams ? Number(String(form.piece_grams).replace(',', '.')) : null,
        sort_order: items.length,
      })
      if (!res.cloudOk && res.cloudError) setMsg(res.cloudError)
      else {
        setForm(EMPTY_FORM)
        setMsg('Продукт добавлен')
      }
      await reloadLocal()
    } finally {
      setBusy(false)
    }
  }

  const onDeactivate = async (id) => {
    setBusy(true)
    setMsg('')
    try {
      const res = await deactivateNutritionProduct(id)
      if (!res.cloudOk && res.cloudError) setMsg(res.cloudError)
      else setMsg('Продукт отключён')
      setConfirmId(null)
      await reloadLocal()
    } finally {
      setBusy(false)
    }
  }

  if (!clubId) {
    return (
      <section className="card admin-nutrition-page">
        <p className="muted">Выберите клуб в шапке — у каждого клуба свой набор продуктов для рациона.</p>
      </section>
    )
  }

  return (
    <div className="admin-nutrition-page">
      <section className="card admin-nutrition-hero">
        <div className="admin-nutrition-hero__text">
          <h2 className="section-title" style={{ fontSize: '1.1rem', margin: 0 }}>
            Продукты для рациона
          </h2>
          <p className="muted" style={{ margin: '8px 0 0', lineHeight: 1.45 }}>
            Свой справочник клуба. Тренер видит эти продукты во вкладке «Питание» у клиента. Если список пуст — используется
            встроенный базовый набор.
          </p>
          <p className="admin-nutrition-hero__stat">
            Активных: <strong>{activeCount}</strong>
          </p>
        </div>
        <div className="admin-nutrition-hero__actions">
          <button type="button" className="btn btn-touch" disabled={busy || pullBusy} onClick={() => void seedDefaults()}>
            <Sparkles size={18} aria-hidden />
            Базовый набор
          </button>
          {isSupabaseConfigured() ? (
            <button type="button" className="btn btn-touch btn-ghost" disabled={pullBusy || busy} onClick={() => void pullFromCloud()}>
              <RefreshCw size={18} aria-hidden className={pullBusy ? 'spin' : undefined} />
              Из облака
            </button>
          ) : null}
        </div>
      </section>

      {msg ? <p className="admin-nutrition-msg muted">{msg}</p> : null}

      <section className="card admin-nutrition-form-card">
        <h3 className="admin-nutrition-form-card__title">Добавить продукт</h3>
        <form className="admin-nutrition-form" onSubmit={(e) => void addProduct(e)}>
          <label className="admin-nutrition-form__field admin-nutrition-form__field--wide">
            <span>Название</span>
            <input className="input" value={form.label} required maxLength={80} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          </label>
          <label className="admin-nutrition-form__field">
            <span>Группа</span>
            <select className="input" value={form.macro_group} onChange={(e) => setForm((f) => ({ ...f, macro_group: e.target.value }))}>
              <option value="protein">Белки</option>
              <option value="fat">Жиры</option>
              <option value="carbs">Углеводы</option>
            </select>
          </label>
          <label className="admin-nutrition-form__field">
            <span>Б / 100 г</span>
            <input className="input" type="number" min={0} step="0.1" value={form.protein_per100} onChange={(e) => setForm((f) => ({ ...f, protein_per100: e.target.value }))} />
          </label>
          <label className="admin-nutrition-form__field">
            <span>Ж / 100 г</span>
            <input className="input" type="number" min={0} step="0.1" value={form.fat_per100} onChange={(e) => setForm((f) => ({ ...f, fat_per100: e.target.value }))} />
          </label>
          <label className="admin-nutrition-form__field">
            <span>У / 100 г</span>
            <input className="input" type="number" min={0} step="0.1" value={form.carbs_per100} onChange={(e) => setForm((f) => ({ ...f, carbs_per100: e.target.value }))} />
          </label>
          <label className="admin-nutrition-form__field">
            <span>Грамм/шт (опц.)</span>
            <input className="input" type="number" min={0} step="1" value={form.piece_grams} onChange={(e) => setForm((f) => ({ ...f, piece_grams: e.target.value }))} />
          </label>
          <button type="submit" className="btn btn-touch admin-nutrition-form__submit" disabled={busy}>
            <Plus size={18} aria-hidden />
            Добавить
          </button>
        </form>
      </section>

      {(['protein', 'fat', 'carbs']).map((group) => (
        <section key={group} className={`card admin-nutrition-catalog admin-nutrition-catalog--${group}`}>
          <h3 className="admin-nutrition-catalog__title">
            <MacroBadge group={group} />
          </h3>
          <ProductChipList
            items={grouped[group]}
            group={group}
            busy={busy}
            confirmId={confirmId}
            setConfirmId={setConfirmId}
            onDeactivate={(id) => void onDeactivate(id)}
          />
        </section>
      ))}
    </div>
  )
}
