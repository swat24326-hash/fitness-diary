import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Wallet } from 'lucide-react'
import { formatRub, monthDateRange } from '../lib/admin/salesReportCore.js'
import {
  addDaysToIso,
  clampIsoDateToToday,
  formatDateRu,
  todayLocalIso,
} from '../lib/dateRu.js'
import { loadTrainerSelfPayrollAmounts, payrollFallbackLabel } from '../lib/trainer/trainerSelfPayrollService.js'
import '../styles/trainer-payroll.css'

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

function currentMonthParts() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function addMonths(year, month, delta) {
  const dt = new Date(Number(year), Number(month) - 1 + delta, 1)
  return { year: dt.getFullYear(), month: dt.getMonth() + 1 }
}

function monthIsoValue(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function isMonthAfterCurrent(year, month) {
  const cur = currentMonthParts()
  return year > cur.year || (year === cur.year && month > cur.month)
}

function monthLabelRu(year, month) {
  const raw = MONTH_NAMES[(Number(month) || 1) - 1] ?? ''
  const name = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ''
  return `${name} ${year}`
}

/**
 * @param {{
 *   trainerId: string,
 *   clubId: string | null,
 *   membershipTypes: object[],
 *   memberships: object[],
 * }} props
 */
export function TrainerPayrollPanel({ trainerId, clubId, membershipTypes, memberships }) {
  const [selectedDay, setSelectedDay] = useState(() => todayLocalIso())
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthParts())
  const [dayPay, setDayPay] = useState(0)
  const [monthPay, setMonthPay] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fallbackReason, setFallbackReason] = useState(null)
  const [retryingCloud, setRetryingCloud] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const autoRetryRef = useRef(0)

  const monthRange = useMemo(
    () => monthDateRange(selectedMonth.year, selectedMonth.month),
    [selectedMonth.year, selectedMonth.month],
  )

  const monthCaption = useMemo(
    () => monthLabelRu(selectedMonth.year, selectedMonth.month),
    [selectedMonth.year, selectedMonth.month],
  )

  const atCurrentMonth = useMemo(
    () =>
      selectedMonth.year === currentMonthParts().year &&
      selectedMonth.month === currentMonthParts().month,
    [selectedMonth.year, selectedMonth.month],
  )

  const atToday = selectedDay === todayLocalIso()

  useEffect(() => {
    const onStorage = () => setReloadKey((k) => k + 1)
    window.addEventListener('fitness-diary-storage', onStorage)
    return () => window.removeEventListener('fitness-diary-storage', onStorage)
  }, [])

  useEffect(() => {
    if (!trainerId || !clubId) {
      setDayPay(0)
      setMonthPay(0)
      return
    }

    let cancelled = false
    setBusy(true)
    setError('')

    void (async () => {
      try {
        const res = await loadTrainerSelfPayrollAmounts({
          trainerId,
          clubId,
          dayIso: selectedDay,
          monthFrom: monthRange.start,
          monthTo: monthRange.end,
          membershipTypes: membershipTypes ?? [],
          membershipsLocal: memberships ?? [],
        })
        if (cancelled) return
        setDayPay(res.dayPay)
        setMonthPay(res.monthPay)
        setFallbackReason(res.fallbackReason ?? null)

        const softNet =
          res.fallbackReason && /timeout|частично/i.test(String(res.fallbackReason))
        if (!res.fallbackReason || res.source === 'remote') {
          autoRetryRef.current = 0
          setRetryingCloud(false)
        } else if (softNet && autoRetryRef.current < 1) {
          autoRetryRef.current += 1
          setRetryingCloud(true)
          window.setTimeout(() => {
            if (!cancelled) setReloadKey((k) => k + 1)
          }, 2800)
        } else {
          setRetryingCloud(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message ?? 'Ошибка расчёта')
          setDayPay(0)
          setMonthPay(0)
          setFallbackReason(null)
          setRetryingCloud(false)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    trainerId,
    clubId,
    memberships,
    membershipTypes,
    selectedDay,
    monthRange.start,
    monthRange.end,
    reloadKey,
  ])

  useEffect(() => {
    autoRetryRef.current = 0
    setRetryingCloud(false)
  }, [selectedDay, monthRange.start, monthRange.end, trainerId, clubId])

  const fallbackNote = payrollFallbackLabel(fallbackReason, { retrying: retryingCloud })

  const onDayChange = (iso) => setSelectedDay(clampIsoDateToToday(iso))

  const onMonthInput = (value) => {
    const s = String(value ?? '').slice(0, 7)
    if (!s) return
    const year = Number(s.slice(0, 4))
    const month = Number(s.slice(5, 7))
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return
    if (isMonthAfterCurrent(year, month)) {
      setSelectedMonth(currentMonthParts())
      return
    }
    setSelectedMonth({ year, month })
  }

  return (
    <section className="card trainer-payroll" aria-labelledby="trainer-payroll-title">
      <div className="trainer-payroll__head">
        <span className="trainer-payroll__icon" aria-hidden>
          <Wallet size={20} />
        </span>
        <div>
          <h2 className="section-title td-section-title" id="trainer-payroll-title" style={{ margin: 0 }}>
            Моя зарплата
          </h2>
          <p className="trainer-payroll__note" style={{ margin: '0.35rem 0 0' }}>
            По вашим завершённым тренировкам × ставки типов карт (при сети — из облака).
          </p>
        </div>
      </div>

      {fallbackNote ? (
        <p className="muted admin-inline-note" style={{ marginBottom: 12 }}>
          {fallbackNote}
        </p>
      ) : null}

      {!clubId ? (
        <p className="muted" style={{ margin: '0 0 1rem', fontSize: 13 }}>
          Клуб не указан в профиле — обратитесь к администратору.
        </p>
      ) : null}

      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <div className="trainer-payroll__filters">
        <div className="trainer-payroll__filter-block">
          <span className="trainer-payroll__filter-label">День</span>
          <div className="trainer-payroll__date-stepper">
            <button
              type="button"
              className="trainer-payroll__date-btn"
              aria-label="Предыдущий день"
              onClick={() => onDayChange(addDaysToIso(selectedDay, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <label className="trainer-payroll__date-pill">
              <Calendar size={15} aria-hidden />
              <span className="trainer-payroll__date-text">{formatDateRu(selectedDay)}</span>
              <input
                type="date"
                className="trainer-payroll__date-input-overlay"
                value={selectedDay}
                max={todayLocalIso()}
                onChange={(e) => onDayChange(e.target.value)}
                aria-label="День расчёта"
              />
            </label>
            <button
              type="button"
              className="trainer-payroll__date-btn"
              aria-label="Следующий день"
              disabled={atToday}
              onClick={() => onDayChange(addDaysToIso(selectedDay, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="trainer-payroll__filter-block">
          <span className="trainer-payroll__filter-label">Месяц</span>
          <div className="trainer-payroll__date-stepper">
            <button
              type="button"
              className="trainer-payroll__date-btn"
              aria-label="Предыдущий месяц"
              onClick={() => setSelectedMonth((m) => addMonths(m.year, m.month, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <label className="trainer-payroll__date-pill">
              <Calendar size={15} aria-hidden />
              <span className="trainer-payroll__date-text">{monthCaption}</span>
              <input
                type="month"
                className="trainer-payroll__date-input-overlay"
                value={monthIsoValue(selectedMonth.year, selectedMonth.month)}
                max={monthIsoValue(currentMonthParts().year, currentMonthParts().month)}
                onChange={(e) => onMonthInput(e.target.value)}
                aria-label="Месяц расчёта"
              />
            </label>
            <button
              type="button"
              className="trainer-payroll__date-btn"
              aria-label="Следующий месяц"
              disabled={atCurrentMonth}
              onClick={() => setSelectedMonth((m) => addMonths(m.year, m.month, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="trainer-payroll__kpi-grid">
        <div className={`trainer-payroll__kpi${busy ? ' trainer-payroll__kpi--loading' : ''}`}>
          <span className="trainer-payroll__kpi-label">За день</span>
          <span className="trainer-payroll__kpi-value">{busy ? '…' : formatRub(dayPay)}</span>
          <span className="trainer-payroll__kpi-sub">{formatDateRu(selectedDay)}</span>
        </div>
        <div
          className={`trainer-payroll__kpi trainer-payroll__kpi--accent${busy ? ' trainer-payroll__kpi--loading' : ''}`}
        >
          <span className="trainer-payroll__kpi-label">За месяц</span>
          <span className="trainer-payroll__kpi-value">{busy ? '…' : formatRub(monthPay)}</span>
          <span className="trainer-payroll__kpi-sub">{monthCaption}</span>
        </div>
      </div>
    </section>
  )
}
