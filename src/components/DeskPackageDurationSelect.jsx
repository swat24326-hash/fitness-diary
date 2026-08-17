import { useEffect, useState } from 'react'
import {
  DESK_PACKAGE_COUNT_CUSTOM,
  DESK_PACKAGE_DAY_OPTIONS,
  DESK_PACKAGE_MONTH_OPTIONS,
  DESK_PACKAGE_UNIT_DAYS,
  DESK_PACKAGE_UNIT_MONTHS,
  deskPackageCountMax,
  deskPackageCountSelectValue,
  formatDeskPackageDaysLabel,
  formatDeskPackageMonthsLabel,
  isDeskPackageCountPreset,
  normalizeDeskPackageUnit,
  parseDeskPackageCount,
} from '../lib/admin/deskPackageDurationCore.js'

/**
 * Срок пакета: дни или месяцы + пресет / «Другое…».
 * Пока в «Другое» нет валидного числа — onChange({ unit, count: null }).
 */
export function DeskPackageDurationSelect({
  unit = DESK_PACKAGE_UNIT_MONTHS,
  count,
  onChange,
  disabled = false,
  ariaLabel = 'Срок пакета',
  selectClassName = 'select',
}) {
  const normalizedUnit = normalizeDeskPackageUnit(unit)
  const parsed = parseDeskPackageCount(normalizedUnit, count)
  const [forceCustom, setForceCustom] = useState(
    () => count == null || count === '' || !isDeskPackageCountPreset(normalizedUnit, count),
  )
  const [customDraft, setCustomDraft] = useState(() =>
    parsed != null && !isDeskPackageCountPreset(normalizedUnit, parsed) ? String(parsed) : '',
  )

  useEffect(() => {
    if (count == null || count === '') {
      setForceCustom(true)
      return
    }
    if (!isDeskPackageCountPreset(normalizedUnit, count)) {
      setForceCustom(true)
      const n = parseDeskPackageCount(normalizedUnit, count)
      if (n != null) setCustomDraft(String(n))
    } else {
      setForceCustom(false)
    }
  }, [count, normalizedUnit])

  const selectValue = deskPackageCountSelectValue(normalizedUnit, count, forceCustom)
  const showCustom = selectValue === DESK_PACKAGE_COUNT_CUSTOM
  const presets =
    normalizedUnit === DESK_PACKAGE_UNIT_DAYS ? DESK_PACKAGE_DAY_OPTIONS : DESK_PACKAGE_MONTH_OPTIONS
  const formatCount =
    normalizedUnit === DESK_PACKAGE_UNIT_DAYS
      ? formatDeskPackageDaysLabel
      : formatDeskPackageMonthsLabel
  const max = deskPackageCountMax(normalizedUnit)
  const emit = (nextUnit, nextCount) => {
    onChange?.({ unit: nextUnit, count: nextCount })
  }

  return (
    <div className="desk-package-duration">
      <select
        className={`${selectClassName} desk-package-duration__unit`.trim()}
        value={normalizedUnit}
        disabled={disabled}
        aria-label={`${ariaLabel}: дни или месяцы`}
        title="Срок: дни (разовое) или месяцы (пакет прайса)"
        onChange={(e) => {
          const nextUnit = normalizeDeskPackageUnit(e.target.value)
          setForceCustom(false)
          setCustomDraft('')
          emit(nextUnit, 1)
        }}
      >
        <option value={DESK_PACKAGE_UNIT_DAYS}>Дни</option>
        <option value={DESK_PACKAGE_UNIT_MONTHS}>Месяцы</option>
      </select>
      <select
        className={`${selectClassName} desk-package-duration__count`.trim()}
        value={selectValue}
        disabled={disabled}
        aria-label={ariaLabel}
        title={
          normalizedUnit === DESK_PACKAGE_UNIT_DAYS
            ? 'Число дней: дата окончания = старт + N−1 (1 день — тот же день)'
            : 'Число месяцев: дата окончания = старт + N календарных месяцев'
        }
        onChange={(e) => {
          const next = e.target.value
          if (next === DESK_PACKAGE_COUNT_CUSTOM) {
            setForceCustom(true)
            const keep =
              parsed != null && !isDeskPackageCountPreset(normalizedUnit, parsed) ? parsed : null
            setCustomDraft(keep != null ? String(keep) : '')
            emit(normalizedUnit, keep)
            return
          }
          setForceCustom(false)
          setCustomDraft('')
          emit(normalizedUnit, Number(next))
        }}
      >
        {presets.map((n) => (
          <option key={n} value={String(n)}>
            {formatCount(n)}
          </option>
        ))}
        <option value={DESK_PACKAGE_COUNT_CUSTOM}>Другое…</option>
      </select>
      {showCustom ? (
        <input
          type="number"
          className="input desk-package-duration__custom"
          min={1}
          max={max}
          step={1}
          inputMode="numeric"
          disabled={disabled}
          value={customDraft}
          placeholder={normalizedUnit === DESK_PACKAGE_UNIT_DAYS ? 'дн.' : 'мес.'}
          aria-label={`${ariaLabel}: своё число`}
          title={`Целое число от 1 до ${max}`}
          onChange={(e) => {
            const raw = e.target.value
            setCustomDraft(raw)
            emit(normalizedUnit, parseDeskPackageCount(normalizedUnit, raw))
          }}
        />
      ) : null}
    </div>
  )
}
