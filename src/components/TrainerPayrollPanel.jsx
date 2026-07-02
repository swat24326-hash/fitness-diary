import { useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { aggregateMembershipTypeStats } from '../lib/admin/membershipTypeStatsAgg.js'
import {
  buildTrainerPayRateMap,
  computePayrollFromMembershipStats,
} from '../lib/admin/trainerPayrollCore.js'
import { loadTrainerJournalFiltered } from '../lib/trainer/trainerJournalService.js'
import { fetchTrainerReportPayroll } from '../lib/trainer/trainerPayrollService.js'

/**
 * @param {{
 *   trainerId: string,
 *   clubId: string | null,
 *   dateFrom: string,
 *   dateTo: string,
 *   membershipTypes: object[],
 *   memberships: object[],
 * }} props
 */
export function TrainerPayrollPanel({
  trainerId,
  clubId,
  dateFrom,
  dateTo,
  membershipTypes,
  memberships,
}) {
  const [reportPay, setReportPay] = useState(null)
  const [fitCityPay, setFitCityPay] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const rateMap = useMemo(() => buildTrainerPayRateMap(membershipTypes), [membershipTypes])

  const activeRates = useMemo(
    () =>
      (membershipTypes ?? [])
        .filter((t) => t?.is_active !== false)
        .map((t) => ({
          code: String(t.code ?? '—'),
          pay: Number(t.trainer_pay_per_session) || 0,
        })),
    [membershipTypes],
  )

  useEffect(() => {
    if (!trainerId || !clubId || !dateFrom || !dateTo) {
      setReportPay(null)
      setFitCityPay(null)
      return
    }

    let cancelled = false
    setBusy(true)
    setError('')

    void (async () => {
      try {
        const [reportRes, journal] = await Promise.all([
          fetchTrainerReportPayroll({ dateFrom, dateTo }),
          loadTrainerJournalFiltered({
            trainerId,
            clubId,
            dateFrom,
            dateTo,
          }),
        ])
        if (cancelled) return

        if (!reportRes.ok) {
          setError(reportRes.error?.message ?? 'Не удалось загрузить данные отчёта')
          setReportPay(null)
        } else {
          setReportPay(reportRes.data?.report_payroll ?? null)
        }

        const membershipById = new Map()
        for (const m of memberships ?? []) {
          const id = String(m?.id ?? '').trim()
          if (id) membershipById.set(id, m)
        }
        const stats = aggregateMembershipTypeStats({
          trainings: journal.trainings ?? [],
          memberships: [...membershipById.values()],
          membershipTypes,
          trainerIdFilter: trainerId,
        })
        const fitPay = computePayrollFromMembershipStats(stats, rateMap, {
          trainerIdFilter: trainerId,
        })
        setFitCityPay({
          total: fitPay.clubTotal,
          byType: fitPay.byTrainer.get(trainerId)?.byType ?? [],
        })
      } catch (e) {
        if (!cancelled) {
          setError(e?.message ?? 'Ошибка расчёта')
          setReportPay(null)
          setFitCityPay(null)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [trainerId, clubId, dateFrom, dateTo, memberships, membershipTypes, rateMap])

  if (!dateFrom || !dateTo) {
    return (
      <section className="card" style={{ marginTop: 12 }}>
        <h2 className="section-title td-section-title" style={{ margin: '0 0 8px' }}>
          <Wallet size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
          Моя зарплата
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Выберите период в сводке выше.
        </p>
      </section>
    )
  }

  return (
    <section className="card" style={{ marginTop: 12 }} aria-labelledby="trainer-payroll-title">
      <h2 className="section-title td-section-title" id="trainer-payroll-title" style={{ margin: '0 0 8px' }}>
        <Wallet size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
        Моя зарплата
      </h2>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
        Ставки задаёт админ в типах абонементов клуба. «Без типа» в оплату не входит. Расчёт по{' '}
        <strong>текущим ставкам</strong>.
      </p>

      {activeRates.length ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {activeRates.map((r) => (
            <span key={r.code} className="admin-mt-chip admin-mt-chip--active" title="Ставка за тренировку">
              {r.code}: {formatRub(r.pay)}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Ставки не заданы — попросите администратора указать оплату в типах абонементов.
        </p>
      )}

      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <div className="health-mini__top" style={{ marginTop: 0 }}>
        <div className="health-mini__metric">
          <span className="muted">По отчёту продаж</span>
          <strong>{busy ? '…' : formatRub(reportPay?.total ?? 0)}</strong>
        </div>
        <div className="health-mini__metric">
          <span className="muted">По FIT-CITY (справка)</span>
          <strong>{busy ? '…' : formatRub(fitCityPay?.total ?? 0)}</strong>
        </div>
      </div>

      {!busy && reportPay?.by_type?.length ? (
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
            Детализация по отчёту продаж
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {reportPay.by_type.map((line) => (
              <li key={String(line.typeId)}>
                {membershipTypes.find((t) => String(t.id) === String(line.typeId))?.code ?? '—'}:{' '}
                {line.count} × {formatRub(
                  (Number(line.amount) || 0) / Math.max(1, Number(line.count) || 1),
                )}{' '}
                = {formatRub(line.amount)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
