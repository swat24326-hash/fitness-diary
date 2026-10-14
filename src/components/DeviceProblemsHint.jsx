import { useDeviceProblems } from '../hooks/useDeviceProblems.js'
import { DEVICE_HEALTH_CODES } from '../lib/deviceHealth/deviceHealthCatalog.js'

/** Верх «Помощи» у тренера: что не так с планшетом и что сделать (те же тексты, что видит админ). */
export function DeviceProblemsHint() {
  const problems = useDeviceProblems()
  if (!problems.length) return null
  return (
    <div className="device-problems-hint" role="alert" data-testid="device-problems-hint">
      {problems.map((c) => (
        <p key={c}>
          <strong>{DEVICE_HEALTH_CODES[c].title}.</strong> {DEVICE_HEALTH_CODES[c].tellTrainer}
        </p>
      ))}
      <p className="muted">Сбой автоматически передаётся администратору клуба.</p>
    </div>
  )
}
