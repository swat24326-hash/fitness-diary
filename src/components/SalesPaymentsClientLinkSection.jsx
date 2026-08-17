import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArchiveRestore, Link2, UserPlus } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { listTrainerSummariesForAdmin } from '../lib/dataAccess.js'
import { listMembershipTypesForClub } from '../lib/membershipTypesService.js'
import {
  attachPaymentLinkSiblingsAfterCreate,
  buildPaymentClientLinkActions,
  describePzMissingFromPaymentsMetaRu,
  isPaymentLinkActionReady,
  isPaymentLinkDurationFromFile,
  partitionPaymentClientLinkNeedWork,
  paymentLinkHallLabelRu,
  resolvePzLinkMode,
  siblingPaymentLinkActionsSameCard,
  sortTrainersForPzPaymentLink,
  summarizePaymentClientLinkActions,
} from '../lib/admin/salesPaymentsLinkCore.js'
import { applyPaymentClientLinkAction } from '../lib/admin/salesPaymentsLinkApplyService.js'
import { isTrainerWithoutTablet } from '../lib/admin/trainerTabletModeCore.js'
import { isHoldingTrainerUser } from '../lib/admin/deskClosingImportCore.js'
import { DeskPackageDurationSelect } from './DeskPackageDurationSelect.jsx'
import { useAuth } from '../context/AuthContext.jsx'

function PaymentLinkDurationFields({ action, disabled, onDuration }) {
  return (
    <>
      <DeskPackageDurationSelect
        unit={action.packageUnit}
        count={action.packageCount ?? action.packageMonths}
        disabled={disabled}
        ariaLabel={`Срок пакета для ${action.clientName}`}
        onChange={onDuration}
      />
      {isPaymentLinkDurationFromFile(action) ? (
        <span className="sales-report__hint">из файла · 1 день</span>
      ) : null}
    </>
  )
}

export function SalesPaymentsClientLinkSection({
  clubId = '',
  reportDate = '',
  lines = null,
  canEdit = true,
  onToast,
}) {
  const { isSalesManager, isSupervisor } = useAuth()
  const clientsSearchBase = isSalesManager
    ? '/sales/clients'
    : isSupervisor
      ? '/club/clients'
      : '/admin/clients'
  const [trainers, setTrainers] = useState([])
  const [azTypes, setAzTypes] = useState([])
  const [actions, setActions] = useState([])
  const [busyId, setBusyId] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState('')
  const bulkLockRef = useRef(false)

  const toast = (msg) => {
    if (typeof onToast === 'function') onToast(msg)
  }

  useEffect(() => {
    if (!clubId || !lines?.length) {
      setActions([])
      return undefined
    }
    let alive = true
    void (async () => {
      try {
        const [tr, types] = await Promise.all([
          listTrainerSummariesForAdmin(),
          listMembershipTypesForClub(clubId, { aerobicOnly: true, activeOnly: true }).catch(() => []),
        ])
        if (!alive) return
        const clubTrainers = sortTrainersForPzPaymentLink(
          (tr ?? []).filter(
            (t) =>
              !isHoldingTrainerUser(t) &&
              t?.is_active !== false &&
              (!t.club_id || String(t.club_id) === String(clubId)),
          ),
        )
        setTrainers(clubTrainers)
        setAzTypes(Array.isArray(types) ? types : [])
        setActions(buildPaymentClientLinkActions({ lines, azTypes: types }))
      } catch (e) {
        if (alive) setError(e?.message || 'Не удалось подготовить действия')
      }
    })()
    return () => {
      alive = false
    }
  }, [clubId, lines])

  const summary = useMemo(
    () => summarizePaymentClientLinkActions(actions, { trainers }),
    [actions, trainers],
  )
  const { pz: pzRows, desk: deskRows, conflicts: conflictRows, restores: restoreRows } = useMemo(
    () => partitionPaymentClientLinkNeedWork(actions),
    [actions],
  )
  const pzMeta = describePzMissingFromPaymentsMetaRu({
    count: summary.pzPending,
    amount: summary.pzAmount,
  })

  const trainersNoTablet = useMemo(
    () => trainers.filter((t) => t?.id && isTrainerWithoutTablet(t)),
    [trainers],
  )
  const trainersWithTablet = useMemo(
    () => trainers.filter((t) => t?.id && !isTrainerWithoutTablet(t)),
    [trainers],
  )

  const patchAction = (id, patch) => {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const runOne = async (action, opts = {}) => {
    if (!canEdit || !clubId) return { ok: false }
    const silent = opts.silent === true
    setBusyId(action.id)
    setError('')
    try {
      const res = await applyPaymentClientLinkAction({
        action,
        clubId,
        reportDate,
        trainers,
      })
      if (!res.ok) {
        patchAction(action.id, { error: res.error, status: 'pending' })
        setError(res.error || 'Ошибка')
        return { ok: false }
      }
      setActions((prev) => {
        const withDone = prev.map((a) =>
          a.id === action.id ? { ...a, status: 'done', error: '', result: res.result } : a,
        )
        return res.clientId
          ? attachPaymentLinkSiblingsAfterCreate(withDone, action, res.clientId)
          : withDone
      })
      if (!silent) {
        const sibs = siblingPaymentLinkActionsSameCard(actions, action)
        if (res.warning) toast(res.warning)
        else if (res.result === 'restored') {
          toast(
            res.alreadyActive
              ? `Уже не в архиве: ${action.clientName}`
              : `Вернули из архива: ${action.clientName}`,
          )
        } else if (res.result === 'lite') {
          toast(
            res.restored
              ? `Из архива + lite ПЗ: ${action.clientName}`
              : res.attached
                ? `ПЗ-абон к карточке: ${action.clientName}`
                : `Создан lite ПЗ: ${action.clientName}`,
          )
        } else if (res.result === 'clip') {
          toast(
            res.restored
              ? `Из архива + ПЗ: ${action.clientName}`
              : res.attached
                ? `ПЗ-абон к карточке: ${action.clientName}`
                : `Клип тренеру: ${action.clientName}`,
          )
        } else if (res.result === 'az' || res.result === 'tz') {
          toast(
            res.restored
              ? `Из архива + абон ${String(res.result).toUpperCase()}: ${action.clientName}`
              : res.attached
                ? `Абон ${String(res.result).toUpperCase()} к карточке: ${action.clientName}`
                : `Desk ${String(res.result).toUpperCase()}: ${action.clientName}`,
          )
        }
        if (sibs.length && !res.attached) {
          toast(
            `Карта №${action.cardNumber}: можно также создать абон ${sibs.map((s) => paymentLinkHallLabelRu(s.hall)).join('/')} к той же карточке`,
          )
        }
      } else if (res.warning) {
        toast(res.warning)
      }
      return { ok: true, clientId: res.clientId || null }
    } catch (e) {
      const msg = e?.message || 'Ошибка'
      patchAction(action.id, { error: msg })
      setError(msg)
      return { ok: false }
    } finally {
      setBusyId('')
    }
  }

  const runReadyBatch = async (ready, emptyMsg, doneLabel) => {
    if (!canEdit || bulkLockRef.current) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate ?? '').slice(0, 10))) {
      setError('Нет даты отчёта — карточки не создаём')
      return
    }
    if (!ready.length) {
      setError(emptyMsg)
      return
    }
    if (ready.length >= 2) {
      const ok = window.confirm(
        `Создать ${ready.length} карточек одним действием? Отменить пачкой нельзя.`,
      )
      if (!ok) return
    }
    bulkLockRef.current = true
    setBulkBusy(true)
    setError('')
    let okCount = 0
    let queue = [...ready]
    try {
      for (let i = 0; i < queue.length; i++) {
        const a = queue[i]
        if (a?.status === 'done') continue
        const res = await runOne(a, { silent: true })
        if (res.ok) {
          okCount += 1
          if (res.clientId) {
            queue = attachPaymentLinkSiblingsAfterCreate(queue, a, res.clientId)
          }
        }
      }
    } finally {
      bulkLockRef.current = false
      setBulkBusy(false)
    }
    if (okCount) toast(`${doneLabel}: ${okCount}`)
  }

  const runReadyPz = async () => {
    const ready = pzRows.filter((a) => {
      const trainer = trainers.find((t) => String(t.id) === String(a.trainerId))
      return isPaymentLinkActionReady(a, trainer)
    })
    await runReadyBatch(ready, 'Сначала выберите тренера у строк ПЗ', 'Создано ПЗ')
  }

  const runReadyDesk = async () => {
    const ready = deskRows.filter((a) => isPaymentLinkActionReady(a, null))
    await runReadyBatch(ready, 'Сначала укажите направление у строк АЗ (ТЗ готовы без этого)', 'Создано ТЗ/АЗ')
  }

  if (!canEdit || !lines?.length) return null
  if (!actions.length) return null

  const anyBusy = Boolean(busyId) || bulkBusy

  const siblingHint = (action) => {
    const sibs = siblingPaymentLinkActionsSameCard(actions, action)
    if (!sibs.length) return null
    const halls = [...new Set(sibs.map((s) => paymentLinkHallLabelRu(s.hall)))].join(', ')
    return `Та же карта ещё в ${halls}. Абон другого зала допишется к этой карточке (один клиент в Ядре).`
  }

  return (
    <section className="sales-report__card sales-payments-link" aria-label="Связка оплат с карточками">
      <h3 className="sales-report__section-title">
        <Link2 size={18} aria-hidden style={{ verticalAlign: -3, marginRight: 6 }} />
        Карточки из оплат
      </h3>
      <p className="sales-report__hint">
        Отчёт дня — выше («Подставить»). Здесь — кого ещё нет в базе, кто <strong>в архиве</strong> (вернуть), или
        кому нужен абон другого зала. Сначала закройте <strong>ПЗ без карточки</strong> (тренер обязателен: без
        планшета → lite, с планшетом → клип). ТЗ/АЗ — desk без тренера или <strong>абон к уже существующей
        карточке</strong> того же №. Срок — дни или месяцы (разовое из тарифа сразу «1 день»). Если в
        файле одна карта и ПЗ, и ТЗ — обе строки здесь: второй зал допишется к той же карточке (один клиент в
        Ядре).
      </p>

      <div className="sales-payments-link__kpis" role="group" aria-label="Сводка по файлу">
        <div className="sales-payments-link__kpi">
          <span className="sales-payments-link__kpi-label">Уже в базе</span>
          <strong className="sales-payments-link__kpi-value">{summary.matched}</strong>
        </div>
        <div
          className={`sales-payments-link__kpi${summary.pzPending ? ' sales-payments-link__kpi--accent' : ''}`}
        >
          <span className="sales-payments-link__kpi-label">ПЗ без карточки</span>
          <strong className="sales-payments-link__kpi-value">{summary.pzPending}</strong>
          {summary.pzAmount > 0 ? (
            <span className="sales-payments-link__kpi-sub">{formatRub(summary.pzAmount)}</span>
          ) : null}
        </div>
        <div className="sales-payments-link__kpi">
          <span className="sales-payments-link__kpi-label">ТЗ / АЗ desk</span>
          <strong className="sales-payments-link__kpi-value">{summary.deskPending}</strong>
        </div>
        {summary.cardConflict > 0 ? (
          <div className="sales-payments-link__kpi sales-payments-link__kpi--accent">
            <span className="sales-payments-link__kpi-label">Конфликт карты</span>
            <strong className="sales-payments-link__kpi-value">{summary.cardConflict}</strong>
          </div>
        ) : null}
        {summary.restorePending > 0 ? (
          <div className="sales-payments-link__kpi sales-payments-link__kpi--accent">
            <span className="sales-payments-link__kpi-label">Из архива</span>
            <strong className="sales-payments-link__kpi-value">{summary.restorePending}</strong>
          </div>
        ) : null}
      </div>

      {error ? <p className="sales-report__error">{error}</p> : null}

      {!summary.needWork ? (
        <p className="sales-report__hint">Все строки из файла уже есть в базе данных или не требуют карточки.</p>
      ) : null}

      {restoreRows.length ? (
        <div className="sales-payments-link__block">
          <h4 className="sales-payments-link__block-title">
            <ArchiveRestore size={16} aria-hidden style={{ verticalAlign: -2, marginRight: 6 }} />
            Клиент в архиве
          </h4>
          <p className="muted sales-payments-link__block-hint">
            Оплата пришла по карте человека из архива, абон этого зала уже есть. Верните карточку в работу — новую
            не создаём.
          </p>
          <div className="sales-payments-import__table-wrap">
            <table className="sales-payments-import__table">
              <thead>
                <tr>
                  <th>Карта</th>
                  <th>Клиент</th>
                  <th>Зал</th>
                  <th>Сумма</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {restoreRows.map((a) => {
                  const ready = isPaymentLinkActionReady(a, null)
                  return (
                    <tr key={a.id}>
                      <td>{a.cardNumber}</td>
                      <td>
                        <div>{a.clientName || '—'}</div>
                        <div className="sales-report__hint">в архиве</div>
                        {a.error ? <div className="sales-report__error">{a.error}</div> : null}
                      </td>
                      <td>{paymentLinkHallLabelRu(a.hall)}</td>
                      <td>{a.amount > 0 ? formatRub(a.amount) : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={anyBusy || !ready}
                          onClick={() => void runOne(a)}
                        >
                          <ArchiveRestore size={14} aria-hidden />
                          {busyId === a.id ? '…' : 'Вернуть из архива'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {conflictRows.length ? (
        <div className="sales-payments-link__block">
          <h4 className="sales-payments-link__block-title">
            <AlertTriangle size={16} aria-hidden style={{ verticalAlign: -2, marginRight: 6 }} />
            Дубли карты — не создавать
          </h4>
          <p className="muted sales-payments-link__block-hint">
            В клубе уже несколько клиентов с этим № карты. «Создать» только усугубит. Откройте поиск, склейте или
            поправьте карты вручную, затем снова загрузите оплаты.
          </p>
          <div className="sales-payments-import__table-wrap">
            <table className="sales-payments-import__table">
              <thead>
                <tr>
                  <th>Карта</th>
                  <th>Клиент в файле</th>
                  <th>Зал</th>
                  <th>Сумма</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {conflictRows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.cardNumber}</td>
                    <td>
                      <div>{a.clientName || '—'}</div>
                      {a.error ? <div className="sales-report__error">{a.error}</div> : null}
                    </td>
                    <td>{paymentLinkHallLabelRu(a.hall)}</td>
                    <td>{a.amount > 0 ? formatRub(a.amount) : '—'}</td>
                    <td>
                      <Link
                        className="btn btn-ghost btn-sm u-no-decoration"
                        to={`${clientsSearchBase}?q=${encodeURIComponent(a.cardNumber || '')}`}
                      >
                        Открыть в Клиентах
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {pzRows.length ? (
        <div className="sales-payments-link__block sales-payments-link__block--pz">
          <div className="sales-payments-link__block-head">
            <div>
              <h4 className="sales-payments-link__block-title">ПЗ без карточки</h4>
              <p className="sales-payments-link__block-meta">{pzMeta}</p>
              <p className="muted sales-payments-link__block-hint">
                Без тренера создать нельзя. Тренеры без планшета — вверху списка.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={anyBusy || summary.pzReady === 0}
              onClick={() => void runReadyPz()}
              title={
                summary.pzReady === 0
                  ? 'Выберите тренера в строках'
                  : `Создать ${summary.pzReady} с выбранным тренером`
              }
            >
              <UserPlus size={14} aria-hidden />
              {bulkBusy ? 'Создаём…' : `Создать готовые (${summary.pzReady})`}
            </button>
          </div>

          <div className="sales-payments-import__table-wrap">
            <table className="sales-payments-import__table">
              <thead>
                <tr>
                  <th>Карта</th>
                  <th>Клиент</th>
                  <th>Тариф / срок</th>
                  <th>Сумма</th>
                  <th>Тренер (обязательно)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pzRows.map((a) => {
                  const trainer = trainers.find((t) => String(t.id) === String(a.trainerId))
                  const mode = resolvePzLinkMode(trainer)
                  const ready = isPaymentLinkActionReady(a, trainer)
                  const sameCardHint = siblingHint(a)
                  return (
                    <tr key={a.id} className="sales-payments-link__row--pz">
                      <td>{a.cardNumber}</td>
                      <td>
                        <div>{a.clientName}</div>
                        {a.needsRestore ? <div className="sales-report__hint">в архиве</div> : null}
                      </td>
                      <td>
                        <div>{a.tariffName || '—'}</div>
                        <PaymentLinkDurationFields
                          action={a}
                          disabled={anyBusy || a.status === 'done'}
                          onDuration={({ unit, count }) =>
                            patchAction(a.id, {
                              packageUnit: unit,
                              packageCount: count,
                              packageMonths: unit === 'months' ? count : null,
                              durationFromTariff: false,
                              error: '',
                            })
                          }
                        />
                      </td>
                      <td>{a.amount > 0 ? formatRub(a.amount) : '—'}</td>
                      <td>
                        <div className="sales-payments-link__pz">
                          <select
                            className="select"
                            value={a.trainerId}
                            required
                            onChange={(e) =>
                              patchAction(a.id, { trainerId: e.target.value, error: '' })
                            }
                            disabled={anyBusy || a.status === 'done'}
                            aria-label={`Тренер для ${a.clientName}`}
                          >
                            <option value="">Выберите тренера…</option>
                            {trainersNoTablet.length ? (
                              <optgroup label="Без планшета → lite">
                                {trainersNoTablet.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name ?? '—'}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            {trainersWithTablet.length ? (
                              <optgroup label="С планшетом → клип">
                                {trainersWithTablet.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name ?? '—'}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                          </select>
                          {mode ? (
                            <span className="sales-payments-link__mode">
                              {mode === 'lite' ? '→ lite (ведёт админ/менеджер)' : '→ клип на планшет'}
                            </span>
                          ) : (
                            <span className="sales-payments-link__mode sales-payments-link__mode--warn">
                              Тренер не выбран
                            </span>
                          )}
                        </div>
                        {sameCardHint ? (
                          <div className="sales-report__hint sales-payments-link__sibling">{sameCardHint}</div>
                        ) : null}
                        {a.error ? <div className="sales-report__error">{a.error}</div> : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={anyBusy || !ready}
                          onClick={() => void runOne(a)}
                        >
                          <UserPlus size={14} aria-hidden />
                          {busyId === a.id
                            ? '…'
                            : a.needsRestore
                              ? 'Вернуть и абон'
                              : a.attachClientId
                                ? 'Дописать абон'
                                : 'Создать'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {deskRows.length ? (
        <div className="sales-payments-link__block">
          <div className="sales-payments-link__block-head">
            <div>
              <h4 className="sales-payments-link__block-title">ТЗ / АЗ — desk</h4>
              <p className="muted sales-payments-link__block-hint">
                Без живого тренера. Срок — дни (разовое: 1 день) или месяцы. Направление АЗ — из тарифа или вручную.
                Готовые строки (ТЗ сразу, АЗ после направления) можно создать пачкой.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={anyBusy || summary.deskReady === 0}
              onClick={() => void runReadyDesk()}
              title={
                summary.deskReady === 0
                  ? 'ТЗ готовы сразу. Для АЗ выберите направление'
                  : `Создать ${summary.deskReady} готовых desk-карточек`
              }
            >
              <UserPlus size={14} aria-hidden />
              {bulkBusy ? 'Создаём…' : `Создать готовые (${summary.deskReady})`}
            </button>
          </div>
          <div className="sales-payments-import__table-wrap">
            <table className="sales-payments-import__table">
              <thead>
                <tr>
                  <th>Карта</th>
                  <th>Клиент</th>
                  <th>Зал</th>
                  <th>Тариф / срок</th>
                  <th>Действие</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deskRows.map((a) => {
                  const ready = isPaymentLinkActionReady(a, null)
                  const sameCardHint = siblingHint(a)
                  return (
                    <tr key={a.id}>
                      <td>{a.cardNumber}</td>
                      <td>
                        <div>{a.clientName}</div>
                        {a.needsRestore ? <div className="sales-report__hint">в архиве</div> : null}
                      </td>
                      <td>{String(a.hall || '—').toUpperCase()}</td>
                      <td>
                        <div>{a.tariffName || '—'}</div>
                        <div className="sales-payments-link__tariff-meta">
                          <PaymentLinkDurationFields
                            action={a}
                            disabled={anyBusy || a.status === 'done'}
                            onDuration={({ unit, count }) =>
                              patchAction(a.id, {
                                packageUnit: unit,
                                packageCount: count,
                                packageMonths: unit === 'months' ? count : null,
                                durationFromTariff: false,
                                error: '',
                              })
                            }
                          />
                          {a.kind === 'az_desk' && a.membershipTypeLabel ? (
                            <span className="sales-report__hint">· {a.membershipTypeLabel}</span>
                          ) : a.kind === 'az_desk' ? (
                            <span className="sales-report__hint">· направление вручную</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {a.kind === 'az_desk' ? (
                          <select
                            className="select"
                            value={a.membershipTypeId}
                            onChange={(e) => {
                              const id = e.target.value
                              const t = azTypes.find((x) => String(x.id) === id)
                              patchAction(a.id, {
                                membershipTypeId: id,
                                membershipTypeLabel: t ? String(t.name || t.code || '') : '',
                              })
                            }}
                            disabled={anyBusy || a.status === 'done'}
                            aria-label="Направление АЗ"
                          >
                            <option value="">Направление…</option>
                            {azTypes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name || t.code}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="sales-report__hint">{a.label}</span>
                        )}
                        {sameCardHint ? (
                          <div className="sales-report__hint sales-payments-link__sibling">{sameCardHint}</div>
                        ) : null}
                        {a.error ? <div className="sales-report__error">{a.error}</div> : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={anyBusy || !ready}
                          onClick={() => void runOne(a)}
                        >
                          <UserPlus size={14} aria-hidden />
                          {busyId === a.id
                            ? '…'
                            : a.needsRestore
                              ? 'Вернуть и абон'
                              : a.attachClientId
                                ? 'Дописать абон'
                                : 'Создать'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}
