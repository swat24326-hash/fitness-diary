import { useEffect, useMemo, useState } from 'react'
import { Link2, UserPlus } from 'lucide-react'
import { listTrainerSummariesForAdmin } from '../lib/dataAccess.js'
import { listMembershipTypesForClub } from '../lib/membershipTypesService.js'
import {
  buildPaymentClientLinkActions,
  resolvePzLinkMode,
} from '../lib/admin/salesPaymentsLinkCore.js'
import { applyPaymentClientLinkAction } from '../lib/admin/salesPaymentsLinkApplyService.js'
import { isTrainerWithoutTablet } from '../lib/admin/trainerTabletModeCore.js'
import { isHoldingTrainerUser } from '../lib/admin/deskClosingImportCore.js'

/**
 * После превью оплат: создать lite / клип / desk по строкам без клиента в Оси.
 */
export function SalesPaymentsClientLinkSection({
  clubId = '',
  reportDate = '',
  lines = null,
  canEdit = true,
  onToast,
}) {
  const [trainers, setTrainers] = useState([])
  const [azTypes, setAzTypes] = useState([])
  const [actions, setActions] = useState([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

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
        const clubTrainers = (tr ?? []).filter(
          (t) =>
            !isHoldingTrainerUser(t) &&
            t?.is_active !== false &&
            (!t.club_id || String(t.club_id) === String(clubId)),
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

  const needWork = useMemo(
    () => (actions ?? []).filter((a) => a.kind !== 'skip_matched' && a.status !== 'done'),
    [actions],
  )
  const matched = useMemo(
    () => (actions ?? []).filter((a) => a.kind === 'skip_matched').length,
    [actions],
  )

  const patchAction = (id, patch) => {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const runOne = async (action) => {
    if (!canEdit || !clubId) return
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
        return
      }
      patchAction(action.id, { status: 'done', error: '', result: res.result })
      if (res.warning) toast(res.warning)
      else if (res.result === 'lite') toast(`Создан lite ПЗ: ${action.clientName}`)
      else if (res.result === 'clip') toast(`Клип тренеру: ${action.clientName}`)
      else if (res.result === 'az' || res.result === 'tz') {
        toast(`Desk ${String(res.result).toUpperCase()}: ${action.clientName}`)
      }
    } catch (e) {
      const msg = e?.message || 'Ошибка'
      patchAction(action.id, { error: msg })
      setError(msg)
    } finally {
      setBusyId('')
    }
  }

  if (!canEdit || !lines?.length) return null
  if (!actions.length) return null

  const realTrainers = trainers.filter((t) => t?.id)

  return (
    <section className="sales-report__card sales-payments-link" aria-label="Связка оплат с карточками">
      <h3 className="sales-report__section-title">
        <Link2 size={18} aria-hidden style={{ verticalAlign: -3, marginRight: 6 }} />
        Карточки из оплат
      </h3>
      <p className="sales-report__hint">
        Отчёт дня — выше («Подставить»). Здесь: кого ещё нет в Оси. ПЗ — выберите тренера (без планшета = lite, с
        планшетом = клип). АЗ/ТЗ — desk без тренера; направление АЗ — из тарифа (последняя покупка по карте).
        {matched ? ` Уже в Оси: ${matched}.` : ''}
      </p>
      {error ? <p className="sales-report__error">{error}</p> : null}
      {!needWork.length ? (
        <p className="sales-report__hint">Все строки из файла уже есть в Оси или не требуют карточки.</p>
      ) : (
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
              {needWork.map((a) => {
                const trainer = realTrainers.find((t) => String(t.id) === String(a.trainerId))
                const mode = resolvePzLinkMode(trainer)
                return (
                  <tr key={a.id}>
                    <td>{a.cardNumber}</td>
                    <td>{a.clientName}</td>
                    <td>{String(a.hall || '—').toUpperCase()}</td>
                    <td>
                      <div>{a.tariffName || '—'}</div>
                      <div className="sales-report__hint">
                        {a.packageMonths} мес
                        {a.kind === 'az_desk' && a.membershipTypeLabel
                          ? ` · ${a.membershipTypeLabel}`
                          : a.kind === 'az_desk'
                            ? ' · направление вручную на карточке'
                            : ''}
                      </div>
                    </td>
                    <td>
                      {a.kind === 'pz_need_trainer' ? (
                        <div className="sales-payments-link__pz">
                          <select
                            className="select"
                            value={a.trainerId}
                            onChange={(e) => patchAction(a.id, { trainerId: e.target.value, error: '' })}
                            disabled={busyId === a.id || a.status === 'done'}
                            aria-label="Тренер"
                          >
                            <option value="">Тренер…</option>
                            {realTrainers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name ?? '—'}
                                {isTrainerWithoutTablet(t) ? ' · без планшета' : ' · планшет'}
                              </option>
                            ))}
                          </select>
                          {mode ? (
                            <span className="sales-report__hint">
                              {mode === 'lite' ? '→ lite (админ)' : '→ клип на планшет'}
                            </span>
                          ) : null}
                        </div>
                      ) : a.kind === 'az_desk' ? (
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
                          disabled={busyId === a.id || a.status === 'done'}
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
                      {a.error ? <div className="sales-report__error">{a.error}</div> : null}
                      {a.status === 'done' ? (
                        <div className="sales-report__hint">Готово{a.result ? `: ${a.result}` : ''}</div>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === a.id || a.status === 'done'}
                        onClick={() => void runOne(a)}
                      >
                        <UserPlus size={14} aria-hidden />
                        {busyId === a.id ? '…' : 'Создать'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
