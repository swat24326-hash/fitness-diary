import { useEffect, useState } from 'react'
import { Shuffle, Sparkles } from 'lucide-react'
import { HOMEWORK_AVOID, HOMEWORK_GOALS, HOMEWORK_LEVELS } from '../../lib/homework/library/homeworkLibraryTags.js'
import { HOMEWORK_BLOCK_WEEKS } from '../../lib/homework/auto/homeworkGoalFormulas.js'
import { generateHomeworkWeek } from '../../lib/homework/auto/homeworkWeekGenerator.js'
import { homeworkAutoDefaultsFromHealth } from '../../lib/homework/auto/homeworkAutoDefaults.js'
import {
  buildHomeworkAutoWeek,
  formatHomeworkAutoDay,
  homeworkAutoHoldReason,
  homeworkAutoUpcomingSunday,
} from '../../lib/homework/auto/homeworkAutoScheduleCore.js'
import { screeningHomeworkInputs, screeningHomeworkLine, screeningSummary } from '../../lib/health/healthScreeningCore.js'
import { useHomeworkAutoSchedule } from './useHomeworkAutoSchedule.js'
import { useHomeworkLibrary } from '../../hooks/useHomeworkLibrary.js'
import { HomeworkAutoScheduleCard } from './HomeworkAutoScheduleCard.jsx'

const LEVELS = [1, 2, 3]
const SESSIONS = [2, 3]
const WEEKS = Array.from({ length: HOMEWORK_BLOCK_WEEKS }, (_, i) => i + 1)
const NO_EXERCISES = 'Не нашлось упражнений под эти ограничения — уберите часть ограничений'

function Chips({ label, options, value, onChange, multi = false, attention = false }) {
  const isOn = (id) => (multi ? value.includes(id) : value === id)
  const toggle = (id) => {
    if (!multi) return onChange(id)
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }
  return (
    <div className={`homework-auto__row${attention ? ' homework-auto__row--attention' : ''}`}>
      <span className="homework-auto__label">{label}</span>
      <div className="homework-group-chips homework-auto__chips">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={isOn(id)}
            className={`homework-group-chip${isOn(id) ? ' homework-group-chip--active' : ''}`}
            onClick={() => toggle(id)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Вкладка «Авто»: отправка по воскресеньям сверху, ниже параметры недели; без расписания — разовый подбор в черновик. */
export function HomeworkAutoSection({ client, onDraft }) {
  const clientId = String(client?.id ?? '')
  const auto = useHomeworkAutoSchedule(client)
  const { loaded, row, health, screening, save } = auto
  const { library } = useHomeworkLibrary()
  const enabled = Boolean(row?.enabled)
  const [goal, setGoal] = useState('general')
  const [sex, setSex] = useState(null)
  const [level, setLevel] = useState(1)
  const [avoid, setAvoid] = useState([])
  const [sessions, setSessions] = useState(2)
  const [week, setWeek] = useState(1)
  const [variant, setVariant] = useState(0)
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const sunday = homeworkAutoUpcomingSunday()
  const limitsHold =
    enabled && homeworkAutoHoldReason({ row, client, health, screening, sundayIso: sunday, lastManualDay: auto.lastManualDay }) === 'limits'

  useEffect(() => {
    if (!loaded || hydrated) return
    setHydrated(true)
    const d = homeworkAutoDefaultsFromHealth(health)
    setGoal(row?.goal ?? d.goal)
    setSex(row ? row.sex : d.sex)
    if (!row) {
      const s = screeningSummary(screening)
      if (s.level) setLevel(s.level)
      if (s.sessions) setSessions(s.sessions)
      return
    }
    setLevel(row.level)
    setAvoid(row.avoid ?? [])
    setSessions(row.sessions)
    setVariant(row.block_shift ?? 0)
  }, [loaded, hydrated, row, health, screening])

  /** Смена настройки: при включённой автоотправке сразу сохраняем. */
  const setting = (setter, field) => (value) => {
    setter(value)
    if (enabled) void save({ [field]: value })
  }

  const showSunday = (scheduled) => {
    const res = buildHomeworkAutoWeek(scheduled, sunday, screening, library)
    if (!res.ok) return setError(NO_EXERCISES)
    setError('')
    onDraft({ ...res.draft, auto_sunday: sunday }, `Так уйдёт в воскресенье ${formatHomeworkAutoDay(sunday)}. Можно поправить и отправить сами.`)
  }

  /** Включена автоотправка — «другой набор» начинает новый блок с ближайшего воскресенья. */
  const shuffleScheduled = () => {
    const newBlock = { block_shift: variant + 1, anchor_date: sunday, skip_date: null }
    setVariant(variant + 1)
    void save(newBlock)
    showSunday({ ...row, goal, level, avoid, sessions, ...newBlock })
  }

  const build = (nextVariant) => {
    const res = generateHomeworkWeek({
      library,
      goal,
      ...screeningHomeworkInputs({ level, avoid }, screening),
      sex,
      sessions,
      week,
      seed: clientId,
      variant: nextVariant,
    })
    if (!res.ok) return setError(NO_EXERCISES)
    setError('')
    setVariant(nextVariant)
    onDraft(res.draft)
  }

  const enable = () =>
    save({ enabled: true, goal, level, avoid, sessions, sex, block_shift: variant, anchor_date: sunday, skip_date: null })

  const emphasis = sex === 'female' ? 'Акцент на низ тела — из карточки: женщина.' : sex === 'male' ? 'Акцент на верх тела — из карточки: мужчина.' : ''
  const fromScreening = screeningHomeworkLine(screeningSummary(screening)).replace('Для домашних заданий', 'Из анкеты здоровья')

  return (
    <section className="card homework-auto" aria-label="Автоподбор ДЗ">
      {loaded ? (
        <HomeworkAutoScheduleCard
          client={client}
          auto={auto}
          sunday={sunday}
          onEnable={enable}
          onDisable={() => save({ enabled: false })}
          onPreview={() => showSunday(row)}
          onShuffle={shuffleScheduled}
        />
      ) : null}

      <div className="homework-auto__params">
        <p className="homework-auto__params-title">
          {enabled ? 'Параметры недели · сохраняются сразу' : 'Параметры недели'}
        </p>
        <Chips label="Цель" options={Object.entries(HOMEWORK_GOALS)} value={goal} onChange={setting(setGoal, 'goal')} />
        <Chips label="Уровень" options={LEVELS.map((l) => [l, HOMEWORK_LEVELS[l]])} value={level} onChange={setting(setLevel, 'level')} />
        <Chips
          label="Нельзя при"
          options={Object.entries(HOMEWORK_AVOID)}
          value={avoid}
          onChange={setting(setAvoid, 'avoid')}
          multi
          attention={limitsHold}
        />
        <Chips label="Занятий в неделю" options={SESSIONS.map((n) => [n, String(n)])} value={sessions} onChange={setting(setSessions, 'sessions')} />
        {!enabled ? (
          <Chips label="Неделя нагрузки" options={WEEKS.map((w) => [w, `${w} из ${HOMEWORK_BLOCK_WEEKS}`])} value={week} onChange={setWeek} />
        ) : null}
        {fromScreening ? <p className="muted homework-auto__hint">{fromScreening}</p> : null}
        {emphasis ? <p className="muted homework-auto__hint">{emphasis}</p> : null}
      </div>

      {error ? <p className="homework-auto__error" role="alert">{error}</p> : null}
      {!enabled ? (
        <div className="homework-auto__actions">
          <button type="button" className="btn btn-primary btn-touch" onClick={() => build(variant)}>
            <Sparkles size={18} aria-hidden />
            Подобрать один раз
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            title="Другой набор упражнений"
            aria-label="Другой набор упражнений"
            onClick={() => build(variant + 1)}
          >
            <Shuffle size={18} aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  )
}
