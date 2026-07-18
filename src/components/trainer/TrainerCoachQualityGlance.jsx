import { Link } from 'react-router-dom'
import { Gauge } from 'lucide-react'

/**
 * Неблокирующая подсказка на главной тренера (тонкие / хвосты).
 * @param {{
 *   glance: {
 *     hasSignal: boolean,
 *     headline: string|null,
 *     factsPreview: { clientId: string, clientName: string, kind: string }[],
 *   } | null,
 *   loading?: boolean,
 * }} props
 */
export function TrainerCoachQualityGlance({ glance, loading = false }) {
  if (loading) {
    return (
      <section className="trainer-cq-glance" aria-labelledby="trainer-cq-glance-title" aria-busy="true">
        <h2 id="trainer-cq-glance-title" className="trainer-cq-glance__title">
          Качество ведения
        </h2>
        <p className="muted trainer-cq-glance__loading">Загрузка…</p>
      </section>
    )
  }

  if (!glance?.hasSignal || !glance.headline) return null

  return (
    <section className="trainer-cq-glance" aria-labelledby="trainer-cq-glance-title">
      <div className="trainer-cq-glance__head">
        <h2 id="trainer-cq-glance-title" className="trainer-cq-glance__title">
          <Gauge size={18} aria-hidden />
          Качество ведения
        </h2>
        <Link to="/trainer/profile" className="trainer-cq-glance__more">
          Подробнее
        </Link>
      </div>
      <p className="trainer-cq-glance__headline">{glance.headline}</p>
      {glance.factsPreview?.length ? (
        <ul className="trainer-cq-glance__clients">
          {glance.factsPreview.map((f) => (
            <li key={`${f.kind}-${f.clientId}`}>
              <Link to={`/trainer/clients/${f.clientId}`}>{f.clientName}</Link>
              <span className="muted">
                {' '}
                · {f.kind === 'thin_training' ? 'тонкая' : f.kind === 'stuck_bz' ? 'хвост БЗ' : 'хвост ДК'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
