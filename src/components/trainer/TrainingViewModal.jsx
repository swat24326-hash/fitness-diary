import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Heart, Timer } from 'lucide-react'
import { CloseButton } from '../CloseButton'
import { TrainingExercisesReadonly } from '../TrainingExercisesReadonly'
import { TrainingHrSessionSummary } from './TrainingHrSessionSummary'
import { formatDateRu } from '../../lib/dateRu'
import { normalizeHrSessionSnapshot } from '../../lib/hr/hrSessionAgg.js'

/**
 * Просмотр сохранённой тренировки (дневник клиента).
 * Полноэкранный оверлей в document.body — как «Тренировки абонемента», не внутри колонки дневника.
 * @param {{
 *   training: object,
 *   clientName?: string,
 *   trainerName?: string,
 *   membership?: { tone?: string, label?: string } | null,
 *   dateLabel: string,
 *   onClose: () => void,
 * }} props
 */
export function TrainingViewModal({
  training,
  clientName,
  trainerName,
  membership,
  dateLabel,
  onClose,
}) {
  useEffect(() => {
    if (!training) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [training, onClose])

  if (!training) return null

  const data = training.data && typeof training.data === 'object' ? training.data : {}
  const hrSession = normalizeHrSessionSnapshot(data.hr_session)
  const isDraft = training.status === 'draft'
  const focus = String(data.training_focus ?? '').trim()
  const memTone = membership?.tone || 'neutral'
  const memLabel = membership?.label || ''

  const hasMeasures = Boolean(data.pre_weight_kg || data.pre_hr)
  const hasSurvey = Boolean(data.survey_notes || data.readiness)
  const hasSummary = Boolean(data.rpe || data.stars || data.trainer_comment)

  return createPortal(
    <div
      className="modal-overlay modal-overlay--center modal-overlay--membership-view training-view-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diary-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--membership-view training-view"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="training-view__head">
          <div className="training-view__head-text">
            <p className="training-view__kicker">Просмотр тренировки</p>
            <h2 id="diary-modal-title" className="training-view__title">
              {dateLabel}
            </h2>
            <p className="training-view__meta">
              <span>{formatDateRu(training.date)}</span>
              <span className="training-view__dot" aria-hidden>
                ·
              </span>
              <span>{training.type ?? '—'}</span>
              <span className="training-view__dot" aria-hidden>
                ·
              </span>
              <span>{trainerName ?? 'Тренер'}</span>
            </p>
          </div>
          <CloseButton onClick={onClose} size={20} />
        </header>

        <div className="training-view__badges">
          <div className={`diary-status ${isDraft ? 'diary-status--draft' : 'diary-status--done'}`}>
            {isDraft ? (
              <>
                <Timer size={16} aria-hidden /> Черновик
              </>
            ) : (
              <>
                <CheckCircle2 size={16} aria-hidden /> Завершена
              </>
            )}
          </div>
          {focus ? (
            <span className="training-view__focus-pill" aria-label="Направленность">
              {focus}
            </span>
          ) : null}
          {hrSession?.avg != null ? (
            <span className="training-view__hr-pill" title="Средний пульс сессии">
              <Heart size={13} aria-hidden strokeWidth={2.25} fill="currentColor" />
              ср. {hrSession.avg}
            </span>
          ) : null}
        </div>

        {memLabel ? (
          <div className={`diary-membership diary-membership--${memTone} training-view__membership`}>
            {memLabel}
          </div>
        ) : null}

        <div className="training-view__body">
          {hasMeasures ? (
            <section className="training-view__section">
              <h3 className="training-view__section-title">Замеры до</h3>
              <div className="training-view__chips">
                {data.pre_weight_kg ? (
                  <span className="training-view__chip">
                    <span className="training-view__chip-k">Вес</span>
                    <span className="training-view__chip-v">{data.pre_weight_kg} кг</span>
                  </span>
                ) : null}
                {data.pre_hr ? (
                  <span className="training-view__chip">
                    <span className="training-view__chip-k">Пульс</span>
                    <span className="training-view__chip-v">{data.pre_hr}</span>
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {hrSession ? (
            <section className="training-view__section training-view__section--hr">
              <TrainingHrSessionSummary summary={hrSession} variant="readonly" />
            </section>
          ) : null}

          {hasSurvey ? (
            <section className="training-view__section">
              <h3 className="training-view__section-title">Опрос</h3>
              {data.readiness ? (
                <p className="training-view__kv">
                  <span className="training-view__kv-k">Готовность</span>
                  <span className="training-view__kv-v">{data.readiness}/10</span>
                </p>
              ) : null}
              {data.survey_notes ? <p className="training-view__text">{data.survey_notes}</p> : null}
            </section>
          ) : null}

          {data.warmup ? (
            <section className="training-view__section">
              <h3 className="training-view__section-title">Разминка</h3>
              <p className="training-view__text">{data.warmup}</p>
              {data.warmup_duration_min ? (
                <p className="training-view__kv muted">
                  <span className="training-view__kv-k">Длительность</span>
                  <span className="training-view__kv-v">{data.warmup_duration_min} мин</span>
                </p>
              ) : null}
            </section>
          ) : null}

          {focus ? (
            <section className="training-view__section">
              <h3 className="training-view__section-title">Направленность</h3>
              <p className="training-view__text training-view__text--emph">{focus}</p>
            </section>
          ) : null}

          {data.exercises?.length ? (
            <section className="training-view__section">
              <h3 className="training-view__section-title">Упражнения</h3>
              <TrainingExercisesReadonly exercises={data.exercises} sessionType={training.type} />
            </section>
          ) : null}

          {data.cooldown ? (
            <section className="training-view__section">
              <h3 className="training-view__section-title">Заминка</h3>
              <p className="training-view__text">{data.cooldown}</p>
              {data.cooldown_duration_min ? (
                <p className="training-view__kv muted">
                  <span className="training-view__kv-k">Длительность</span>
                  <span className="training-view__kv-v">{data.cooldown_duration_min} мин</span>
                </p>
              ) : null}
            </section>
          ) : null}

          {hasSummary ? (
            <section className="training-view__section">
              <h3 className="training-view__section-title">Итог</h3>
              <div className="training-view__chips">
                {data.stars ? (
                  <span className="training-view__chip">
                    <span className="training-view__chip-k">Оценка</span>
                    <span className="training-view__chip-v">{data.stars}/5</span>
                  </span>
                ) : null}
                {data.rpe ? (
                  <span className="training-view__chip">
                    <span className="training-view__chip-k">RPE</span>
                    <span className="training-view__chip-v">{data.rpe}</span>
                  </span>
                ) : null}
              </div>
              {data.trainer_comment ? <p className="training-view__text">{data.trainer_comment}</p> : null}
            </section>
          ) : null}
        </div>

        {clientName ? (
          <p className="training-view__footer muted">Клиент: {clientName}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
