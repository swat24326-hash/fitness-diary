import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw, UserPlus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { monthPartsFromIso, monthDateRange } from '../../lib/admin/salesReportCore'
import { todayLocalIso, formatDateRu } from '../../lib/dateRu'
import { createPnkClient, fetchPnkBundle, patchPnkClient } from '../../lib/pnk/pnkApiService'
import { buildPnkStageProgress } from '../../lib/pnk/pnkStagesCore'
import {
  PnkAttentionChips,
  PnkDeliverableChips,
  PnkQualityChips,
  PnkStageChip,
} from '../../components/pnk/PnkStatusChips'
import '../../styles/sales-report.css'
import '../../styles/pnk-funnel.css'

export function SalesPnk() {
  const { user, isAdmin } = useAuth()
  const clubId = String(user?.club_id ?? '').trim()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bundle, setBundle] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', trainer_id: '' })
  const [createOpen, setCreateOpen] = useState(false)

  const period = useMemo(() => {
    const parts = monthPartsFromIso(todayLocalIso())
    if (!parts) return { dateFrom: '', dateTo: '' }
    const { start, end } = monthDateRange(parts.year, parts.month)
    return { dateFrom: start, dateTo: end }
  }, [])

  const load = useCallback(async () => {
    if (!clubId) {
      setError('У менеджера не задан клуб')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await fetchPnkBundle({
        clubId,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
      })
      setBundle(data)
      setForm((f) => (f.trainer_id || !data.trainers?.[0]?.id ? f : { ...f, trainer_id: data.trainers[0].id }))
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }, [clubId, period.dateFrom, period.dateTo])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createPnkClient({
        clubId,
        name: form.name,
        phone: form.phone,
        trainer_id: form.trainer_id,
      })
      setForm((f) => ({ ...f, name: '', phone: '' }))
      setCreateOpen(false)
      await load()
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  async function onComment(clientId, text) {
    const comment = String(text ?? '').trim()
    if (!comment) return
    setBusy(true)
    try {
      await patchPnkClient({ clubId, client_id: clientId, comment })
      await load()
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  const stats = bundle?.stats
  const attention = bundle?.attention ?? []
  const clients = bundle?.clients ?? []

  return (
    <div className={`sales-report sales-report--wide pnk-funnel${busy ? ' sales-report__busy' : ''}`}>
      <div className="sales-report__toolbar">
        <div className="sales-home__hero-text">
          <p className="sales-home__eyebrow">Воронка</p>
          <h1 className="sales-page__title">ПНК</h1>
        </div>
        <div className="pnk-funnel__toolbar-actions">
          <Link to="/sales" className="btn btn-ghost btn-sm btn-icon-square btn-touch" title="Назад" aria-label="Назад">
            <ArrowLeft size={16} aria-hidden />
          </Link>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-icon-square btn-touch"
            onClick={() => void load()}
            disabled={busy}
            title="Обновить"
            aria-label="Обновить"
          >
            <RefreshCw size={16} aria-hidden className={busy ? 'icon-spin' : undefined} />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm btn-icon-square btn-touch"
            onClick={() => setCreateOpen((v) => !v)}
            title="Новый ПНК"
            aria-label="Новый ПНК"
            aria-pressed={createOpen}
          >
            <UserPlus size={16} aria-hidden />
          </button>
        </div>
      </div>

      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert">
          {error}
        </p>
      ) : null}

      {stats ? (
        <section className="pnk-funnel__kpi" aria-label="Сводка за месяц">
          <div className="pnk-funnel__kpi-card">
            <span className="pnk-funnel__kpi-label">ПНК</span>
            <span className="pnk-funnel__kpi-value">{stats.entered}</span>
          </div>
          <div className="pnk-funnel__kpi-card">
            <span className="pnk-funnel__kpi-label">Оформления</span>
            <span className="pnk-funnel__kpi-value">{stats.won}</span>
          </div>
          <div className="pnk-funnel__kpi-card">
            <span className="pnk-funnel__kpi-label">Конверсия</span>
            <span className="pnk-funnel__kpi-value">{stats.conversionPct}%</span>
          </div>
          <div className="pnk-funnel__kpi-card">
            <span className="pnk-funnel__kpi-label">В работе</span>
            <span className="pnk-funnel__kpi-value">{stats.open}</span>
          </div>
        </section>
      ) : null}

      {stats ? (
        <PnkQualityChips
          nutritionPct={stats.nutritionPct}
          homeworkPct={stats.homeworkPct}
          periodLabel={`${formatDateRu(period.dateFrom)}–${formatDateRu(period.dateTo)}`}
        />
      ) : null}

      {createOpen ? (
        <form className="pnk-funnel__create" onSubmit={onCreate}>
          <h2 className="pnk-funnel__section-title">Новый ПНК</h2>
          <label>
            Имя
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label>
            Телефон
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label>
            Тренер
            <select
              className="input"
              required
              value={form.trainer_id}
              onChange={(e) => setForm((f) => ({ ...f, trainer_id: e.target.value }))}
            >
              <option value="">Выберите</option>
              {(bundle?.trainers ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
            Передать тренеру
          </button>
        </form>
      ) : null}

      {attention.length ? (
        <section className="pnk-funnel__attention card" aria-label="Требует внимания">
          <h2 className="pnk-funnel__section-title">Внимание</h2>
          <ul className="pnk-funnel__list">
            {attention.map((row) => (
              <li key={row.id} className={`pnk-funnel__row pnk-funnel__row--${row.tone}`}>
                <div className="pnk-funnel__row-main">
                  <div className="pnk-client-panel__head" style={{ padding: 0 }}>
                    <strong>{row.name}</strong>
                    <PnkStageChip stage={row.pnk_stage} tone={row.tone} />
                  </div>
                  <PnkAttentionChips flags={row.flags} />
                  {row.pnk_trial_date ? (
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {formatDateRu(row.pnk_trial_date)}
                      {row.pnk_trial_time ? ` ${row.pnk_trial_time}` : ''}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="pnk-funnel__board" aria-label="В работе">
        <h2 className="pnk-funnel__section-title">В работе ({clients.length})</h2>
        {!clients.length ? (
          <p className="muted">Пока нет открытых ПНК</p>
        ) : (
          <ul className="pnk-funnel__list">
            {clients.map((c) => {
              const progress = buildPnkStageProgress(c)
              return (
                <li key={c.id} className="pnk-funnel__card">
                  <div className="pnk-funnel__card-head">
                    <div>
                      <div className="pnk-client-panel__head" style={{ padding: 0, marginBottom: 4 }}>
                        <strong>{c.name}</strong>
                        <PnkStageChip stage={c.pnk_stage} />
                      </div>
                      <p className="pnk-funnel__meta">
                        {c.trainer_name || '—'}
                        {c.pnk_trial_date
                          ? ` · ${formatDateRu(c.pnk_trial_date)}${c.pnk_trial_time ? ` ${c.pnk_trial_time}` : ''}`
                          : ''}
                      </p>
                    </div>
                    <span className="pnk-funnel__pct">{progress.pct}%</span>
                  </div>
                  <div className="pnk-funnel__track" aria-hidden>
                    <div className="pnk-funnel__fill" style={{ width: `${progress.pct}%` }} />
                  </div>
                  <PnkDeliverableChips client={c} />
                  {c.pnk_comment ? <p className="pnk-funnel__comment">«{c.pnk_comment}»</p> : null}
                  <CommentMini disabled={busy} onSubmit={(text) => void onComment(c.id, text)} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {stats?.trainers?.length ? (
        <section className="pnk-funnel__by-trainer card">
          <h2 className="pnk-funnel__section-title">По тренерам</h2>
          <table className="pnk-funnel__table">
            <thead>
              <tr>
                <th>Тренер</th>
                <th>ПНК</th>
                <th>Оформл.</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {stats.trainers.map((t) => (
                <tr key={t.trainerId}>
                  <td>{t.trainer_name}</td>
                  <td>{t.entered}</td>
                  <td>{t.won}</td>
                  <td>{t.conversionPct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {isAdmin ? (
        <p className="muted pnk-funnel__admin-hint">Админ: полный контроль через этот же экран у менеджера клуба.</p>
      ) : null}
    </div>
  )
}

function CommentMini({ onSubmit, disabled }) {
  const [text, setText] = useState('')
  return (
    <form
      className="pnk-funnel__comment-form"
      onSubmit={(e) => {
        e.preventDefault()
        const v = text.trim()
        if (!v) return
        onSubmit(v)
        setText('')
      }}
    >
      <input
        className="input"
        placeholder="Комментарий"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        aria-label="Комментарий"
      />
      <button type="submit" className="btn btn-secondary btn-sm btn-touch" disabled={disabled || !text.trim()}>
        OK
      </button>
    </form>
  )
}
