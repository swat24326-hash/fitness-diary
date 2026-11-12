import { formatDateRu } from '../../lib/dateRu.js'
import {
  MEMBERSHIP_DURATION_MONTH_PRESETS,
  MEMBERSHIP_DURATION_PRESET_CUSTOM,
  formatMembershipDurationLabel,
  membershipDurationFromPreset,
  membershipPackageEndIso,
} from '../../lib/membership/membershipPackageDurationCore.js'

/**
 * Выбор длительности пакета: пресеты месяцев (в т.ч. 1.5) или произвольные дни.
 *
 * @param {{
 *   startDate: string,
 *   preset: string,
 *   customDays: string,
 *   onPresetChange: (preset: string) => void,
 *   onCustomDaysChange: (days: string) => void,
 * }} props
 */
export function MembershipDurationFields({
  startDate,
  preset,
  customDays,
  onPresetChange,
  onCustomDaysChange,
}) {
  const dur = membershipDurationFromPreset(preset, customDays)
  const endPreview = startDate && dur ? membershipPackageEndIso(startDate, dur.unit, dur.count) : ''
  const label = dur ? formatMembershipDurationLabel(dur) : ''

  return (
    <div className="grid" style={{ gap: 8 }}>
      <div className="field" style={{ margin: 0 }}>
        <label className="label" htmlFor="membership-duration-preset">
          Срок пакета
        </label>
        <select
          id="membership-duration-preset"
          className="input"
          value={preset}
          aria-label="Срок пакета"
          onChange={(e) => onPresetChange(e.target.value)}
        >
          {MEMBERSHIP_DURATION_MONTH_PRESETS.map((n) => (
            <option key={String(n)} value={String(n)}>
              {n === 1.5 ? '1.5 месяца' : n === 1 ? '1 месяц' : `${n} мес.`}
            </option>
          ))}
          <option value={MEMBERSHIP_DURATION_PRESET_CUSTOM}>Другое (дни)…</option>
        </select>
      </div>
      {preset === MEMBERSHIP_DURATION_PRESET_CUSTOM ? (
        <input
          className="input"
          type="number"
          min={1}
          max={366}
          inputMode="numeric"
          placeholder="Число дней, напр. 47"
          aria-label="Число дней"
          value={customDays}
          onChange={(e) => onCustomDaysChange(e.target.value)}
        />
      ) : null}
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.35 }}>
        {preset === '1.5'
          ? '1.5 мес. = с числа на число (+1 календарный месяц) + 14 дней.'
          : preset === MEMBERSHIP_DURATION_PRESET_CUSTOM
            ? 'Нестандартный срок: ровно N календарных дней включительно.'
            : 'Месяцы — с того же числа (15 → 15), не «+30 дней».'}
        {label && endPreview ? (
          <>
            {' '}
            Сейчас: <strong style={{ color: 'var(--text)' }}>{label}</strong>
            {startDate ? ` → до ${formatDateRu(endPreview)}` : ''}.
          </>
        ) : null}
      </p>
    </div>
  )
}
