import { Sparkles } from 'lucide-react'
import { formatClubAvgVisitsPerWeek } from '../../lib/admin/clubAttendanceAggCore.js'
import { formatTrainerM3Cell } from '../../lib/admin/clientRetentionPresentationCore.js'
import { CoachQualityStatusBadge } from '../CoachQualityPanel'

/**
 * Карточка тренера в рейтинге клуба (объём + ритм + удержание + качество).
 *
 * @param {{
 *   rank: number,
 *   name: string,
 *   completed: number,
 *   draft: number,
 *   clients: number,
 *   attendanceAvg?: number | null,
 *   retentionRow?: {
 *     retentionM3?: { averageRate?: number | null, cohortSize?: number },
 *     tenureClientCount?: number,
 *   } | null,
 *   quality?: {
 *     status: string,
 *     statusLabel?: string,
 *     scorePct?: number | null,
 *     failureDirectionLabels?: string[],
 *   } | null,
 *   onOpenIskra?: (() => void) | null,
 * }} props
 */
export function TrainerRatingCard({
  rank,
  name,
  completed,
  draft,
  clients,
  attendanceAvg = null,
  retentionRow = null,
  quality = null,
  onOpenIskra = null,
}) {
  const place = Math.max(1, Number(rank) || 1)
  const rankMod = place <= 3 ? `trainer-rating-card--place-${place}` : ''
  const status = quality?.status
  const statusMod =
    status === 'review'
      ? 'trainer-rating-card--review'
      : status === 'attention'
        ? 'trainer-rating-card--attention'
        : status === 'ok'
          ? 'trainer-rating-card--ok'
          : ''
  const scorePct = quality?.scorePct
  const hasScore = scorePct != null && Number.isFinite(Number(scorePct))
  const dropLabels = quality?.failureDirectionLabels?.filter(Boolean) ?? []
  const attendanceLabel = formatClubAvgVisitsPerWeek(attendanceAvg)
  const retentionCell = formatTrainerM3Cell(retentionRow)
  const scoreTone =
    !hasScore
      ? 'muted'
      : status === 'review'
        ? 'review'
        : status === 'attention'
          ? 'attention'
          : status === 'ok'
            ? 'ok'
            : 'neutral'

  return (
    <article className={`card trainer-rating-card ${rankMod} ${statusMod}`.trim()}>
      <header className="trainer-rating-card__head">
        <div className="trainer-rating-card__identity">
          <span
            className={`trainer-rating-card__rank${place <= 3 ? ` trainer-rating-card__rank--${place}` : ''}`}
            aria-label={`Место ${place}`}
          >
            {place}
          </span>
          <div className="trainer-rating-card__who">
            <h4 className="trainer-rating-card__name">{name}</h4>
            {quality ? (
              <CoachQualityStatusBadge status={quality.status} label={quality.statusLabel} />
            ) : null}
          </div>
        </div>

        {quality ? (
          <div className={`trainer-rating-card__score trainer-rating-card__score--${scoreTone}`}>
            {hasScore ? (
              <>
                <span className="trainer-rating-card__score-num">{scorePct}</span>
                <span className="trainer-rating-card__score-den">/100</span>
              </>
            ) : (
              <span className="trainer-rating-card__score-empty">нет балла</span>
            )}
          </div>
        ) : null}
      </header>

      {hasScore ? (
        <div
          className="trainer-rating-card__meter"
          role="img"
          aria-label={`Балл качества ${scorePct} из 100`}
        >
          <span
            className={`trainer-rating-card__meter-fill trainer-rating-card__meter-fill--${scoreTone}`}
            style={{ width: `${Math.max(0, Math.min(100, Number(scorePct)))}%` }}
          />
        </div>
      ) : null}

      {dropLabels.length ? (
        <p className="trainer-rating-card__drop">
          <span className="trainer-rating-card__drop-label">Просадка</span>
          <span className="trainer-rating-card__drop-text">{dropLabels.join(' · ')}</span>
        </p>
      ) : null}

      <dl className="trainer-rating-card__stats">
        <div className="trainer-rating-card__stat">
          <dt>Завершено</dt>
          <dd>{completed}</dd>
        </div>
        <div className="trainer-rating-card__stat">
          <dt>Черновики</dt>
          <dd>{draft}</dd>
        </div>
        <div className="trainer-rating-card__stat">
          <dt>Клиентов</dt>
          <dd>{clients}</dd>
        </div>
        <div
          className="trainer-rating-card__stat"
          title="Средняя посещаемость клиентов тренера, трен./нед (окно ритма)"
        >
          <dt>Посещаемость</dt>
          <dd>{attendanceLabel}</dd>
        </div>
        <div
          className="trainer-rating-card__stat"
          title={
            retentionCell.tone === 'pending'
              ? 'M+3 ещё не созрел (~3 мес.)'
              : 'Удержание M+3'
          }
        >
          <dt>Удержание</dt>
          <dd className={`trainer-rating-card__stat-val--${retentionCell.tone}`}>
            {retentionCell.text}
          </dd>
        </div>
      </dl>

      {onOpenIskra ? (
        <div className="trainer-rating-card__actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm trainer-rating-card__iskra"
            onClick={onOpenIskra}
          >
            <Sparkles size={15} aria-hidden />
            ИСКРА
          </button>
        </div>
      ) : null}
    </article>
  )
}
