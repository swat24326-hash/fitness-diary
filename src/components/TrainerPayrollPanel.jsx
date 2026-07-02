import { useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { formatRub, monthDateRange } from '../lib/admin/salesReportCore.js'
import { todayLocalIso } from '../lib/dateRu.js'
import { loadTrainerJournalFiltered } from '../lib/trainer/trainerJournalService.js'
import { computeTrainerSelfPayroll } from '../lib/trainer/trainerSelfPayroll.js'

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

/**
 * @param {{
 *   trainerId: string,
 *   clubId: string | null,
 *   membershipTypes: object[],
 *   memberships: object[],
 * }} props
 */
export function TrainerPayrollPanel({ trainerId, clubId, membershipTypes, memberships }) {
  const [todayPay, setTodayPay] = useState(0)
  const [monthPay, setMonthPay] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const { todayIso, monthStart, monthEnd, monthLabel } = useMemo(() => {
    const today = todayLocalIso()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const range = monthDateRange(year, month)
    const name = MONTH_NAMES[month - 1] ?? ''
    return {
      todayIso: today,
      monthStart: range.start,
      monthEnd: range.end,
      monthLabel: `${name} ${year}`,
    }
  }, [])

  useEffect(() => {
    const onStorage = () => setReloadKey((k) => k + 1)
    window.addEventListener('fitness-diary-storage', onStorage)
    return () => window.removeEventListener('fitness-diary-storage', onStorage)
  }, [])

  useEffect(() => {
    if (!trainerId || !clubId) {
      setTodayPay(0)
      setMonthPay(0)
      return
    }

    let cancelled = false
    setBusy(true)
    setError('')

    void (async () => {
      try {
        const journal = await loadTrainerJournalFiltered({
          trainerId,
          clubId,
          dateFrom: monthStart,
          dateTo: monthEnd,
        })
        if (cancelled) return

        const ctx = {
          trainings: journal.trainings ?? [],
          memberships: memberships ?? [],
          membershipTypes: membershipTypes ?? [],
          trainerId,
        }

        setTodayPay(
          computeTrainerSelfPayroll({
            ...ctx,
            dateFrom: todayIso,
            dateTo: todayIso,
          }),
        )
        setMonthPay(
          computeTrainerSelfPayroll({
            ...ctx,
            dateFrom: monthStart,
            dateTo: monthEnd,
          }),
        )
      } catch (e) {
        if (!cancelled) {
          setError(e?.message ?? 'Ошибка расчёта')
          setTodayPay(0)
          setMonthPay(0)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [trainerId, clubId, memberships, membershipTypes, todayIso, monthStart, monthEnd, reloadKey])

  return (
    <section className="card" aria-labelledby="trainer-payroll-title">
      <h2 className="section-title td-section-title" id="trainer-payroll-title" style={{ margin: '0 0 8px' }}>
        <Wallet size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
        Моя зарплата
      </h2>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
        По вашим <strong>завершённым тренировкам</strong> на планшете × ставки типов карт клуба. Отчёт
        отдела продаж сюда не подтягивается. «Без типа» не оплачивается.
      </p>

      {!clubId ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Клуб не указан в профиле — обратитесь к администратору.
        </p>
      ) : null}

      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <div className="health-mini__top" style={{ marginTop: 0 }}>
        <div className="health-mini__metric">
          <span className="muted">Заработал сегодня</span>
          <strong>{busy ? '…' : formatRub(todayPay)}</strong>
        </div>
        <div className="health-mini__metric">
          <span className="muted">В этом месяце</span>
          <strong>{busy ? '…' : formatRub(monthPay)}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {monthLabel}
          </span>
        </div>
      </div>
    </section>
  )
}
