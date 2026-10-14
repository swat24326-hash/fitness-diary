import { useRef, useState } from 'react'
import { ClipboardList, HeartPulse, ShieldCheck } from 'lucide-react'
import { SCREEN_BONES, SCREEN_CLEARANCE, SCREEN_WOMEN, SCREEN_ZONES } from '../../lib/health/healthScreeningCatalog.js'
import {
  normalizeScreeningAnswers,
  screeningBlockAllNo,
  screeningHomeworkLine,
  screeningProgress,
  screeningSummary,
  screeningWithClearance,
} from '../../lib/health/healthScreeningCore.js'
import { formatDateRu } from '../../lib/dateRu'
import { useHealthScreening } from '../../hooks/useHealthScreening.js'
import { HealthScreeningBadges } from './HealthScreeningBadges.jsx'
import { HealthScreeningBlock } from './HealthScreeningBlock.jsx'
import { HealthScreeningLife } from './HealthScreeningLife.jsx'
import { HealthScreeningQuestion } from './HealthScreeningQuestion.jsx'
import { HealthScreeningZone } from './HealthScreeningZone.jsx'

const sumProgress = (p) =>
  Object.values(p)
    .filter(Boolean)
    .reduce((acc, b) => ({ done: acc.done + b.done, total: acc.total + b.total }), { done: 0, total: 0 })

/** Карточка клиента → здоровье: анкета «да / нет» с уточнением, итог для тренировки и авто-ДЗ. Ответ сохраняется сразу. */
export function HealthScreeningSection({ client, sex, readOnly = false }) {
  const scr = useHealthScreening(client)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  if (!scr.loaded) return null
  const close = () => {
    setOpen(false)
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const answers = normalizeScreeningAnswers(scr.answers)
  const summary = screeningSummary(answers)
  const progress = screeningProgress(answers, sex)
  const total = sumProgress(progress)
  const disabled = readOnly || !scr.canEdit
  const put = (next) => void scr.save(next)
  const setAnswer = (group, id) => (ans) => {
    const g = { ...answers[group] }
    if (ans) g[id] = ans
    else delete g[id]
    put({ ...answers, [group]: g })
  }
  const homeworkLine = screeningHomeworkLine(summary)

  return (
    <section ref={ref} className="card hscr" aria-label="Анкета здоровья">
      <div className="hscr__head">
        <ClipboardList size={20} aria-hidden className="hscr__icon" />
        <div className="hscr__title-wrap">
          <h2 className="section-title hscr__title">Анкета здоровья</h2>
          <p className="hscr__sub">
            {summary.answered ? `Отвечено ${total.done} из ${total.total}` : 'Не заполнена — 2–3 минуты на первой встрече'}
          </p>
        </div>
        {!disabled || summary.answered ? (
          <button type="button" className={`btn btn-touch ${summary.answered || open ? 'btn-ghost' : 'btn-primary'}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Свернуть' : summary.answered ? (disabled ? 'Ответы' : 'Изменить') : 'Заполнить'}
          </button>
        ) : null}
      </div>

      <HealthScreeningBadges badges={summary.badges} />

      {summary.needsClearance ? (
        <div className="hscr-clear" role="alert">
          <HeartPulse size={18} aria-hidden />
          <div>
            <p className="hscr-clear__title">Нагрузку нужно согласовать</p>
            <p className="hscr-clear__text">Уточните у клиента разрешение врача. Пока допуск не подтверждён, домашние задания сами не уходят.</p>
            {!disabled ? (
              <button type="button" className="btn btn-touch hscr-clear__btn" onClick={() => put(screeningWithClearance(answers, scr.userId))}>
                Допуск подтверждён
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {summary.cleared ? (
        <p className="hscr__ok">
          <ShieldCheck size={16} aria-hidden /> Допуск подтверждён {answers.cleared?.at ? formatDateRu(answers.cleared.at.slice(0, 10)) : ''}
        </p>
      ) : null}
      {summary.pulseUnreliable ? (
        <p className="hscr__hint">Пульс — не ориентир нагрузки (сердце / препараты): смотрите на самочувствие и дыхание.</p>
      ) : null}
      {homeworkLine ? <p className="hscr__hint">{homeworkLine}</p> : null}
      {scr.error ? <p className="hscr__error" role="alert">{scr.error}</p> : null}

      {open ? (
        <div className="hscr__blocks">
          <HealthScreeningBlock
            title="1. Допуск к нагрузке"
            note="Любое «да» — согласовать с врачом. До допуска — щадящий режим."
            progress={progress.clearance}
            disabled={disabled}
            onAllNo={() => put(screeningBlockAllNo(answers, 'clearance'))}
          >
            {SCREEN_CLEARANCE.map((q) => (
              <HealthScreeningQuestion key={q.id} q={q} answer={answers.clearance[q.id]} onChange={setAnswer('clearance', q.id)} disabled={disabled} />
            ))}
          </HealthScreeningBlock>

          <HealthScreeningBlock
            title="2. Суставы и спина"
            note="Отметьте, что болит или было. Упражнения подберём без опасных движений."
            progress={progress.zones}
            disabled={disabled}
            onAllNo={() => put(screeningBlockAllNo(answers, 'zones'))}
          >
            {SCREEN_ZONES.map((z) => (
              <HealthScreeningZone key={z.id} zone={z} answer={answers.zones[z.id]} onChange={setAnswer('zones', z.id)} disabled={disabled} />
            ))}
            {SCREEN_BONES.map((q) => (
              <HealthScreeningQuestion key={q.id} q={q} answer={answers.bones[q.id]} onChange={setAnswer('bones', q.id)} disabled={disabled} />
            ))}
          </HealthScreeningBlock>

          {progress.women ? (
            <HealthScreeningBlock
              title="3. Женское здоровье"
              progress={progress.women}
              disabled={disabled}
              onAllNo={() => put(screeningBlockAllNo(answers, 'women'))}
            >
              {SCREEN_WOMEN.map((q) => (
                <HealthScreeningQuestion key={q.id} q={q} answer={answers.women[q.id]} onChange={setAnswer('women', q.id)} disabled={disabled} />
              ))}
            </HealthScreeningBlock>
          ) : null}

          <HealthScreeningBlock title={progress.women ? '4. Опыт, быт и дом' : '3. Опыт, быт и дом'} progress={progress.life} disabled={disabled}>
            <HealthScreeningLife life={answers.life} onChange={(life) => put({ ...answers, life })} disabled={disabled} />
          </HealthScreeningBlock>
          <button type="button" className="btn btn-primary btn-touch hscr__done" onClick={close}>
            Готово · {total.done} из {total.total}
          </button>
        </div>
      ) : null}
    </section>
  )
}
