import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, UserPlus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { monthPartsFromIso, monthDateRange } from '../../lib/admin/salesReportCore'
import { todayLocalIso } from '../../lib/dateRu'
import { createPnkClient, deletePnkClient, fetchPnkBundle, patchPnkClient } from '../../lib/pnk/pnkApiService'
import { syncPnkHomeGlanceFromBoard } from '../../lib/pnk/pnkHomeGlanceSession.js'
import { PnkCoachNotifyChip } from '../../components/pnk/PnkCoachNotifyChip'
import { PnkManagerControlBoard } from '../../components/pnk/PnkManagerControlBoard'
import {
  buildPnkDemoScenarioForm,
  matchesPnkBoardFilter,
} from '../../lib/pnk/pnkStagesCore'
import { buildClientCardDeepLink } from '../../lib/admin/staffTaskDeepLinkCore.js'
import '../../styles/sales-report.css'
import '../../styles/pnk-funnel.css'

/**
 * Контроль воронки ПНК: менеджер продаж и админ (клуб из шапки).
 */
export function SalesPnk() {
  const { user, isAdmin, isSupervisor } = useAuth()
  const [searchParams] = useSearchParams()
  const clubId = isAdmin
    ? String(searchParams.get('club') ?? '').trim()
    : String(user?.club_id ?? '').trim()
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''
  const backTo = isAdmin ? `/admin/sales${clubQs}` : isSupervisor ? '/club' : '/sales'
  const focusId = String(searchParams.get('focus') ?? '').trim()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bundle, setBundle] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', trainer_id: '', pnk_trial_sessions: 1 })
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

  function onCreatedNotifyResult(r) {
    toastFromNotify(r)
    if (r?.ok) setLastCreated(null)
  }

  const period = useMemo(() => {
    const parts = monthPartsFromIso(todayLocalIso())
    if (!parts) return { dateFrom: '', dateTo: '' }
    const { start, end } = monthDateRange(parts.year, parts.month)
    return { dateFrom: start, dateTo: end }
  }, [])

  const boardHref = isAdmin
    ? `/admin/pnk${clubQs}`
    : isSupervisor
      ? `/club/pnk${clubQs}`
      : '/sales/pnk'

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
      syncPnkHomeGlanceFromBoard(clubId, data?.clients ?? [], { boardHref })
      setForm((f) => (f.trainer_id || !data.trainers?.[0]?.id ? f : { ...f, trainer_id: data.trainers[0].id }))
      if (focusId) {
        const openIds = new Set((data?.clients ?? []).map((c) => String(c.id)))
        if (!openIds.has(focusId)) {
          setToast('Этот ПНК уже не в работе — на главной могла остаться старая карточка')
          setTimeout(() => setToast(''), 4500)
        }
      }
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }, [clubId, period.dateFrom, period.dateTo, isAdmin, boardHref, focusId])

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
        pnk_trial_sessions: Number(form.pnk_trial_sessions) === 2 ? 2 : 1,
      })
      const trainer = (bundle?.trainers ?? []).find((t) => t.id === form.trainer_id)
      setLastCreated({
        client,
        trainerName: trainer?.name || '',
        trainerPhone: trainer?.phone || null,
      })
      setForm((f) => ({ ...f, name: '', phone: '', pnk_trial_sessions: 1 }))
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
      setToast('ПНК удалён — в статистике остался отказ')
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
    setForm({
      ...buildPnkDemoScenarioForm(tid),
      pnk_trial_sessions: Number(form.pnk_trial_sessions) === 2 ? 2 : 1,
    })
    setCreateOpen(true)
  }

  function clientHref(c) {
    if (isSupervisor) {
      return buildClientCardDeepLink(c.id, { clubId, forSupervisor: true, from: 'pnk' })
    }
    if (isAdmin) {
      return buildClientCardDeepLink(c.id, { clubId, forAdmin: true, from: 'pnk' })
    }
    return buildClientCardDeepLink(c.id, { clubId, forSales: true, from: 'pnk' })
  }

  return (
    <div className={`sales-report sales-report--wide pnk-funnel${busy ? ' sales-report__busy' : ''}`}>
      <div className="sales-report__toolbar pnk-funnel__topbar">
        <div className="sales-home__hero-text">
          <p className="sales-home__eyebrow">{isAdmin ? 'Контроль клуба' : 'Воронка'}</p>
          <h1 className="sales-page__title">ПНК</h1>
        </div>
        {stats ? (
          <section className="pnk-funnel__kpi pnk-funnel__kpi--inline" aria-label="Сводка за месяц">
            <div className="pnk-funnel__kpi-card pnk-funnel__kpi-card--fraction">
              <span className="pnk-funnel__kpi-label">ПНК → ДК</span>
              <span className="pnk-funnel__kpi-value">
                {stats.won}/{stats.entered}
                <span className="pnk-funnel__kpi-pct">{stats.conversionPct}%</span>
              </span>
            </div>
            <div className="pnk-funnel__kpi-card">
              <span className="pnk-funnel__kpi-label">В работе</span>
              <span className="pnk-funnel__kpi-value">{stats.open}</span>
            </div>
          </section>
        ) : null}
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

      {clubId ? (
        <div className="pnk-funnel__layout">
          <PnkManagerControlBoard
            clients={clients}
            attentionIds={attentionIds}
            boardFilter={boardFilter}
            onBoardFilterChange={setBoardFilter}
            filterCounts={filterCounts}
            trainers={bundle?.trainers ?? []}
            managerName={user?.name || ''}
            busy={busy}
            clientHref={clientHref}
            onNotifyResult={toastFromNotify}
            onComment={onComment}
            onDelete={onDelete}
            initialFocusId={focusId}
            showVisitQuality
            workExtras={
              <>
                {createOpen ? (
                  <form className="pnk-funnel__create" onSubmit={onCreate}>
                    <div className="pnk-client-panel__head" style={{ padding: 0 }}>
                      <h2 className="pnk-funnel__section-title" style={{ margin: 0 }}>
                        Новый ПНК
                      </h2>
                      <button
                        type="button"
                        className="pnk-chip pnk-chip--action"
                        onClick={fillDemoScenario}
                        title="Подставить пример"
                      >
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
                    <fieldset className="pnk-funnel__sessions" style={{ border: 0, margin: 0, padding: 0 }}>
                      <legend className="muted" style={{ fontSize: '0.9rem', marginBottom: 6 }}>
                        Бесплатных тренировок
                      </legend>
                      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="radio"
                            name="pnk_trial_sessions"
                            checked={Number(form.pnk_trial_sessions) !== 2}
                            onChange={() => setForm((f) => ({ ...f, pnk_trial_sessions: 1 }))}
                          />
                          1
                        </label>
                        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="radio"
                            name="pnk_trial_sessions"
                            checked={Number(form.pnk_trial_sessions) === 2}
                            onChange={() => setForm((f) => ({ ...f, pnk_trial_sessions: 2 }))}
                          />
                          2
                        </label>
                      </div>
                    </fieldset>
                    <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>
                      После создания — напишите тренеру (Max / другой мессенджер).
                    </p>
                    <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
                      Передать тренеру
                    </button>
                  </form>
                ) : null}

                {lastCreated?.client ? (
                  <section className="card pnk-funnel__notify-banner" aria-label="Сообщить тренеру">
                    <div className="pnk-client-panel__head" style={{ padding: 0, marginBottom: 8 }}>
                      <p className="pnk-funnel__section-title" style={{ margin: 0 }}>
                        ПНК «{lastCreated.client.name}» создан
                      </p>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-touch"
                        onClick={() => setLastCreated(null)}
                        title="Скрыть"
                      >
                        Позже
                      </button>
                    </div>
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
                      onResult={onCreatedNotifyResult}
                    />
                  </section>
                ) : null}
              </>
            }
          />
        </div>
      ) : null}
    </div>
  )
}
