import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Salad, WifiOff } from 'lucide-react'
import { shiftIsoDate } from '../../lib/client/foodDiaryDayCore.js'
import {
  FOOD_DIARY_ROSTER_FILTERS,
  filterFoodDiaryRosterRows,
} from '../../lib/client/foodDiaryRosterCore.js'
import { fetchFoodDiaryRoster } from '../../lib/client/foodDiaryTrainerService.js'
import { todayInTimeZoneIso } from '../../lib/dateRu'
import { isAppOnline } from '../../lib/syncService'

function formatDayLabel(iso) {
  try {
    const d = new Date(`${iso}T12:00:00`)
    return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
  } catch {
    return iso
  }
}

function statusClass(chip) {
  if (chip === 'ok') return 'food-diary-roster__status--ok'
  if (chip === 'miss') return 'food-diary-roster__status--miss'
  if (chip === 'empty') return 'food-diary-roster__status--empty'
  return 'food-diary-roster__status--other'
}

/**
 * Вечерний экран: кто из клиентов попал в цель рациона / мимо / молчит.
 * Только online.
 */
export function TrainerNutritionReportsPage() {
  const asOf = todayInTimeZoneIso()
  const [entryDate, setEntryDate] = useState(asOf)
  const [filter, setFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [enabled, setEnabled] = useState(true)

  const load = useCallback(async (date) => {
    if (!isAppOnline()) {
      setError('Нужен интернет — список питания только из облака')
      setRows([])
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await fetchFoodDiaryRoster({ date })
      setEnabled(data?.enabled !== false)
      setRows(Array.isArray(data?.clients) ? data.clients : [])
      if (data?.entry_date) setEntryDate(data.entry_date)
      if (data?.enabled === false) {
        setError(data?.message || 'Дневник калорий выключен для клуба')
      }
    } catch (e) {
      setRows([])
      setError(e?.message || 'Не удалось загрузить список')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load(entryDate)
  }, [entryDate, load])

  const visible = useMemo(() => filterFoodDiaryRosterRows(rows, filter), [rows, filter])
  const canNext = entryDate < asOf

  return (
    <div className="food-diary-roster os-enter">
      <header className="food-diary-roster__head">
        <h1 className="food-diary-roster__title">
          <Salad size={22} aria-hidden />
          Питание
        </h1>
        <p className="muted food-diary-roster__lead">Кто записался за день · факт к цели рациона</p>
      </header>

      <div className="food-diary-roster__nav">
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch"
          aria-label="Предыдущий день"
          disabled={busy}
          onClick={() => setEntryDate(shiftIsoDate(entryDate, -1))}
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <div className="food-diary-roster__date">{formatDayLabel(entryDate)}</div>
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch"
          aria-label="Следующий день"
          disabled={busy || !canNext}
          onClick={() => setEntryDate(shiftIsoDate(entryDate, 1))}
        >
          <ChevronRight size={22} aria-hidden />
        </button>
      </div>

      <div className="food-diary-roster__chips" role="tablist" aria-label="Фильтр">
        {FOOD_DIARY_ROSTER_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`food-diary-roster__chip btn-touch${filter === f.id ? ' food-diary-roster__chip--on' : ''}`}
            disabled={busy}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="food-diary-roster__error" role="alert">
          {!isAppOnline() ? <WifiOff size={18} aria-hidden /> : null}
          {error}
        </p>
      ) : null}

      {!error && !busy && enabled && visible.length === 0 ? (
        <p className="muted food-diary-roster__empty">Нет клиентов в этом фильтре</p>
      ) : null}

      <ul className="food-diary-roster__list">
        {visible.map((row) => (
          <li key={row.client_id}>
            <Link
              to={`/trainer/clients/${row.client_id}?tab=nutrition`}
              className="food-diary-roster__row btn-touch u-no-decoration"
            >
              <span className="food-diary-roster__name">{row.name}</span>
              <span className="food-diary-roster__meta">
                <span>
                  {Math.round(row.fact_kcal || 0)}
                  {row.plan_kcal != null ? ` / ${row.plan_kcal}` : ''} ккал
                </span>
                <span className={`food-diary-roster__status ${statusClass(row.chip)}`}>{row.label_ru}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {busy ? (
        <p className="muted food-diary-roster__busy" aria-busy="true">
          Загружаем…
        </p>
      ) : null}
    </div>
  )
}
