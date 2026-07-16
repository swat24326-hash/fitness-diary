import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, UserPlus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { monthPartsFromIso, monthDateRange } from '../../lib/admin/salesReportCore'
import { todayLocalIso, formatDateRu } from '../../lib/dateRu'
import { createPnkClient, deletePnkClient, fetchPnkBundle, patchPnkClient } from '../../lib/pnk/pnkApiService'
import { PnkCoachNotifyChip } from '../../components/pnk/PnkCoachNotifyChip'
import { PnkManagerControlBoard } from '../../components/pnk/PnkManagerControlBoard'
import {
  PnkAttentionChips,
  PnkQualityChips,
  PnkStageChip,
} from '../../components/pnk/PnkStatusChips'
import {
  buildPnkDemoScenarioForm,
  matchesPnkBoardFilter,
} from '../../lib/pnk/pnkStagesCore'
import '../../styles/sales-report.css'
import '../../styles/pnk-funnel.css'

/**
 * Контроль воронки ПНК: менеджер продаж и админ (клуб из шапки).
 */
export function SalesPnk() {
  const { user, isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const clubId = isAdmin
    ? String(searchParams.get('club') ?? '').trim()
    : String(user?.club_id ?? '').trim()
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''
  const backTo = isAdmin ? `/admin/sales${clubQs}` : '/sales'

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bundle, setBundle] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', trainer_id: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [boardFilter, setBoardFilter] = useState('all')
  const [toast, setToast] = useState('')
  const [lastCreated, setLastCreated] = useState(null)

  function toastFromNotify(r) {
    if (!r?.ok) {
      setToast('Не удалось отправить — скопируйте текст вручную')
      setTimeout(() => setToast(''), 3500)
      return
    }
    if (r.channel === 'max') {
      setToast(r.opened ? 'Текст скопирован, Max открыт' : 'Текст скопирован — вставьте в Max')
    } else {
      setToast(r.shared ? 'Выберите мессенджер' : 'Скопировано — вставьте тренеру')
    }
    setTimeout(() => setToast(''), 3500)
  }

  const period = useMemo(() => {
    const parts = monthPartsFromIso(todayLocalIso())
    if (!parts) return { dateFrom: '', dateTo: '' }
    const { start, end } = monthDateRange(parts.year, parts.month)
    return { dateFrom: start, dateTo: end }
  }, [])

  const load = useCallback(async () => {
    if (!clubId) {
      setError(isAdmin ? 'Выберите клуб в шапке' : 'У менеджера не задан клуб')
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
  }, [clubId, period.dateFrom, period.dateTo, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const client = await createPnkClient({
        clubId,
        name: form.name,
        phone: form.phone,
        trainer_id: form.trainer_id,
      })
      const trainer = (bundle?.trainers ?? []).find((t) => t.id === form.trainer_id)
      setLastCreated({
        client,
        trainerName: trainer?.name || '',
        trainerPhone: trainer?.phone || null,
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

  async function onDelete(clientId) {
    const id = String(clientId ?? '').trim()
    if (!id || !clubId) return
    setBusy(true)
    setError('')
    try {
      await deletePnkClient({ clubId, client_id: id })
      setLastCreated((prev) => (prev?.client?.id === id ? null : prev))
      setToast('ПНК удалён')
      setTimeout(() => setToast(''), 3000)
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
  const attentionIds = useMemo(() => new Set(attention.map((a) => String(a.id))), [attention])
  const filterCounts = useMemo(() => {
    const counts = { all: clients.length, attention: 0, call: 0, date: 0, trial: 0 }
    for (const c of clients) {
      if (attentionIds.has(String(c.id))) counts.attention++
      if (matchesPnkBoardFilter(c, 'call')) counts.call++
      if (matchesPnkBoardFilter(c, 'date')) counts.date++
      if (matchesPnkBoardFilter(c, 'trial')) counts.trial++
    }
    return counts
  }, [clients, attentionIds])

  function fillDemoScenario() {
    const tid = form.trainer_id || bundle?.trainers?.[0]?.id || ''
    setForm(buildPnkDemoScenarioForm(tid))
    setCreateOpen(true)
  }

  function clientHref(c) {
    if (!isAdmin) return null
    return `/admin/clients/${encodeURIComponent(c.id)}${clubQs}`
  }

  return (
    <div className={`sales-report sales-report--wide pnk-funnel${busy ? ' sales-report__busy' : ''}`}>
      <div className="sales-report__toolbar">
        <div className="sales-home__hero-text">
          <p className="sales-home__eyebrow">{isAdmin ? 'Контроль клуба' : 'Воронка'}</p>
          <h1 className="sales-page__title">ПНК</h1>
        </div>
        <div className="pnk-funnel__toolbar-actions">
          <Link to={backTo} className="btn btn-ghost btn-sm btn-icon-square btn-touch" title="Назад" aria-label="Назад">
            <ArrowLeft size={16} aria-hidden />
          </Link>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-icon-square btn-touch"
            onClick={() => void load()}
            disabled={busy || !clubId}
            title="Обновить"
            aria-label="Обновить"
          >
            <RefreshCw size={16} aria-hidden className={busy ? 'icon-spin' : undefined} />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm btn-icon-square btn-touch"
            onClick={() => setCreateOpen((v) => !v)}
            disabled={!clubId}
            title="Новый ПНК"
            aria-label="Новый ПНК"
            aria-pressed={createOpen}
          >
            <UserPlus size={16} aria-hidden />
          </button>
        </div>
      </div>

      {isAdmin && !clubId ? (
        <p className="sync-feedback sync-feedback--err" role="status">
          Выберите клуб в шапке — тогда откроется контроль ПНК по залу.
        </p>
      ) : null}

      {toast ? (
        <p className="sync-feedback sync-feedback--ok" role="status">
          {toast}
        </p>
      ) : null}

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

      {createOpen && clubId ? (
        <form className="pnk-funnel__create" onSubmit={onCreate}>
          <div className="pnk-client-panel__head" style={{ padding: 0 }}>
            <h2 className="pnk-funnel__section-title" style={{ margin: 0 }}>
              Новый ПНК
            </h2>
            <button type="button" className="pnk-chip pnk-chip--action" onClick={fillDemoScenario} title="Подставить пример">
              Пример сценария
            </button>
          </div>
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
          <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>
            После создания — напишите тренеру (Max / другой мессенджер).
          </p>
          <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
            Передать тренеру
          </button>
        </form>
      ) : clubId ? (
        <div className="pnk-funnel__quality" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="pnk-chip pnk-chip--action" onClick={fillDemoScenario}>
            Создать ПНК по сценарию
          </button>
        </div>
      ) : null}

      {lastCreated?.client ? (
        <section className="card pnk-funnel__notify-banner" aria-label="Сообщить тренеру">
          <p className="pnk-funnel__section-title" style={{ marginBottom: 8 }}>
            ПНК «{lastCreated.client.name}» создан
          </p>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>
            Напишите тренеру: «В Max» или «Другой мессенджер».
          </p>
          <PnkCoachNotifyChip
            client={lastCreated.client}
            trainerName={lastCreated.trainerName}
            trainerPhone={lastCreated.trainerPhone}
            managerName={user?.name || ''}
            kind="created"
            busy={busy}
            onResult={toastFromNotify}
          />
        </section>
      ) : null}

      {attention.length ? (
        <section className="pnk-funnel__attention card" aria-label="Требует внимания">
          <h2 className="pnk-funnel__section-title">Внимание ({attention.length})</h2>
          <ul className="pnk-funnel__attention-scroll">
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

      {clubId ? (
        <PnkManagerControlBoard
          clients={clients}
          attentionIds={attentionIds}
          boardFilter={boardFilter}
          onBoardFilterChange={setBoardFilter}
          filterCounts={filterCounts}
          trainers={bundle?.trainers ?? []}
          managerName={user?.name || ''}
          busy={busy}
          clientHref={isAdmin ? clientHref : undefined}
          onNotifyResult={toastFromNotify}
          onComment={onComment}
          onDelete={onDelete}
        />
      ) : null}

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
        <p className="muted pnk-funnel__admin-hint">
          Админ видит всю картину по клубу: фильтр, поиск, раскрытие карточки → написать тренеру (Max / другой мессенджер),
          комментарий, переход в карточку клиента.
        </p>
      ) : null}
    </div>
  )
}
