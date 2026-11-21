import { useEffect, useMemo, useState } from 'react'
import { ScanBarcode } from 'lucide-react'
import {
  foodDiaryPortionFromHit,
  searchBuiltinFoodDiaryCatalog,
} from '../../lib/client/foodDiaryCatalogCore.js'
import { lookupFoodDiaryBarcode, searchFoodDiaryCatalog } from '../../lib/client/foodDiaryService.js'
import { ClientFoodDiaryBarcodeScanSheet } from './ClientFoodDiaryBarcodeScanSheet.jsx'

const PORTION_CHIPS = [50, 100, 150, 200]

function fmtHit(h) {
  return `${Math.round(h.kcal_per100)} ккал / 100 г`
}

function fmtPortionKcal(hit, gramsStr) {
  const g = Number(String(gramsStr).replace(',', '.'))
  if (!hit || !Number.isFinite(g) || g <= 0) return ''
  const kcal = Math.round((Number(hit.kcal_per100) || 0) * (g / 100))
  return `${kcal} ккал`
}

/**
 * Поиск + скан штрихкода (без ручного ввода цифр).
 * Эргономика телефона: поле поиска без автофокуса, скан у большого пальца,
 * список на всё место, порция — чипы граммов + нижний CTA.
 */
export function ClientFoodDiaryCatalogPicker({
  localOnly = false,
  busy = false,
  onPickPortion,
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState(null)
  const [grams, setGrams] = useState('100')

  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) {
      setHits([])
      return undefined
    }
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        setSearchBusy(true)
        setErr('')
        try {
          if (localOnly) {
            if (!cancelled) setHits(searchBuiltinFoodDiaryCatalog(q, { limit: 20 }))
            return
          }
          const data = await searchFoodDiaryCatalog(q)
          if (!cancelled) setHits(data?.hits ?? [])
        } catch (e) {
          if (!cancelled) {
            setHits(searchBuiltinFoodDiaryCatalog(q, { limit: 20 }))
            setErr(e?.message || 'Поиск только по встроенной полке')
          }
        } finally {
          if (!cancelled) setSearchBusy(false)
        }
      })()
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, localOnly])

  const applyHit = (hit) => {
    setPicked(hit)
    setGrams(hit.piece_grams ? String(hit.piece_grams).replace('.', ',') : '100')
    setErr('')
    setScanOpen(false)
  }

  const confirm = () => {
    if (!picked) return
    const g = Number(String(grams).replace(',', '.'))
    const portion = foodDiaryPortionFromHit(picked, g)
    if (!portion) {
      setErr('Укажите граммы')
      return
    }
    onPickPortion(portion)
  }

  const openScan = () => {
    setErr('')
    if (localOnly) {
      setErr('Штрихкод в превью недоступен — откройте дневник в клубе')
      return
    }
    setScanOpen(true)
  }

  const onScannedCode = async (digits) => {
    const data = await lookupFoodDiaryBarcode(digits)
    if (!data?.hit) throw new Error('Продукт по штрихкоду не найден')
    applyHit(data.hit)
  }

  const portionKcal = useMemo(() => fmtPortionKcal(picked, grams), [picked, grams])

  const chipValues = useMemo(() => {
    const piece = picked?.piece_grams ? Math.round(Number(picked.piece_grams)) : null
    const base = [...PORTION_CHIPS]
    if (piece && Number.isFinite(piece) && piece > 0 && !base.includes(piece)) {
      base.unshift(piece)
    }
    return base
  }, [picked])

  if (picked) {
    return (
      <div className="food-diary-catalog food-diary-catalog--fill food-diary-catalog--portion">
        <div className="food-diary-catalog__portion-main">
          <p className="food-diary-catalog__picked">
            <strong>{picked.name}</strong>
            <span className="muted"> · {fmtHit(picked)}</span>
          </p>
          <label className="food-diary-add-page__field">
            <span>Порция, г</span>
            <input
              inputMode="decimal"
              value={grams}
              disabled={busy}
              enterKeyHint="done"
              onChange={(e) => setGrams(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirm()
                }
              }}
            />
          </label>
          <div className="food-diary-catalog__chips" role="group" aria-label="Быстрый выбор порции">
            {chipValues.map((g) => {
              const on = String(grams).replace(',', '.') === String(g)
              return (
                <button
                  key={g}
                  type="button"
                  className={`food-diary-catalog__chip btn-touch${on ? ' food-diary-catalog__chip--on' : ''}`}
                  disabled={busy}
                  aria-pressed={on}
                  onClick={() => setGrams(String(g))}
                >
                  {g} г
                </button>
              )
            })}
          </div>
          {portionKcal ? <p className="food-diary-catalog__portion-kcal muted">{portionKcal} за порцию</p> : null}
          {err ? (
            <p className="food-diary-add-page__error" role="alert">
              {err}
            </p>
          ) : null}
        </div>
        <div className="food-diary-catalog__portion-bar">
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => setPicked(null)}>
            Другой
          </button>
          <button type="button" className="btn btn-primary btn-touch" disabled={busy} onClick={confirm}>
            В дневник
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="food-diary-catalog food-diary-catalog--fill">
      <label className="food-diary-catalog__search">
        <span className="sr-only">Поиск продукта</span>
        <input
          className="food-diary-catalog__search-input"
          value={query}
          disabled={busy}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Название продукта…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {searchBusy ? <p className="muted food-diary-catalog__hint">Ищем…</p> : null}
      {err ? (
        <p className="food-diary-add-page__error" role="alert">
          {err}
        </p>
      ) : null}

      <ul className="food-diary-catalog__hits food-diary-catalog__hits--fill">
        {hits.map((h) => (
          <li key={`${h.source}:${h.id}`}>
            <button
              type="button"
              className="food-diary-catalog__hit btn-touch"
              disabled={busy}
              onClick={() => applyHit(h)}
            >
              <span className="food-diary-catalog__hit-name">{h.name}</span>
              <span className="muted food-diary-catalog__hit-meta">
                {fmtHit(h)}
                {h.source === 'club' ? ' · клуб' : h.source === 'off' ? ' · штрихкод' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="food-diary-catalog__scan-bar">
        <button
          type="button"
          className="food-diary-catalog__scan-cta btn btn-secondary btn-touch"
          disabled={busy || searchBusy}
          onClick={openScan}
        >
          <ScanBarcode size={20} aria-hidden />
          Сканировать штрихкод
        </button>
      </div>

      {scanOpen ? (
        <ClientFoodDiaryBarcodeScanSheet onClose={() => setScanOpen(false)} onCode={onScannedCode} />
      ) : null}
    </div>
  )
}
