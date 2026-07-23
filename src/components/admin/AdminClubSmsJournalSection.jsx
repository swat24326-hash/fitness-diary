import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchClubSmsLogs } from '../../lib/admin/clubSmsService.js'
import { OUTREACH_SCENARIO_LABELS } from '../../lib/trainer/trainerClientOutreachCore.js'
import { formatDateRu } from '../../lib/dateRu.js'
import '../../styles/club-sms-journal.css'

const PERIODS = [
  { id: '1', days: 1, label: 'Сегодня' },
  { id: '14', days: 14, label: '14 дней' },
]

function scenarioLabel(scenario) {
  const s = String(scenario ?? '')
  if (OUTREACH_SCENARIO_LABELS[s]) return OUTREACH_SCENARIO_LABELS[s]
  if (s === 'custom') return 'Свой текст'
  return s || '—'
}

function formatWhen(iso) {
  const s = String(iso ?? '')
  const day = s.slice(0, 10)
  const time = s.includes('T') ? s.slice(11, 16) : ''
  const ru = day ? formatDateRu(day) : '—'
  return time ? `${ru}, ${time}` : ru
}

/**
 * Журнал облачных SMS клуба — кто / кому / когда.
 * @param {{ clubId: string }} props
 */
export function AdminClubSmsJournalSection({ clubId }) {
  const [period, setPeriod] = useState('14')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const sinceDays = PERIODS.find((p) => p.id === period)?.days ?? 14

  const reload = useCallback(async () => {
    if (!clubId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const list = await fetchClubSmsLogs(clubId, { sinceDays })
      setRows(list)
    } catch (e) {
      setRows([])
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить журнал')
    } finally {
      setLoading(false)
    }
  }, [clubId, sinceDays])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <section className="card admin-outreach-templates__section club-sms-journal">
      <div className="club-sms-journal__head">
        <div>
          <h2 className="section-title">Журнал SMS клуба</h2>
          <p className="muted admin-outreach-templates__intro">
            Общий список касаний: видят админ и менеджеры клуба на любом устройстве.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch"
          onClick={() => void reload()}
          disabled={loading || !clubId}
          aria-label="Обновить журнал"
          title="Обновить"
        >
          <RefreshCw size={18} aria-hidden />
        </button>
      </div>

      <div className="club-sms-journal__periods" role="group" aria-label="Период">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn btn-touch club-sms-journal__period${period === p.id ? ' club-sms-journal__period--on' : ' btn-ghost'}`}
            onClick={() => setPeriod(p.id)}
            disabled={loading}
          >
            {p.label}
          </button>
        ))}
      </div>

      {err ? (
        <p className="admin-outreach-templates__error" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? <p className="muted">Загрузка журнала…</p> : null}

      {!loading && !err && rows.length === 0 ? (
        <p className="muted club-sms-journal__empty">
          За выбранный период SMS ещё не отправляли. Отметки появятся после отправки из списка
          клиентов.
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <ul className="club-sms-journal__list" aria-label="Записи журнала SMS">
          {rows.map((row) => (
            <li key={row.id || `${row.client_id}-${row.created_at}`} className="club-sms-journal__row">
              <div className="club-sms-journal__meta">
                <span className="club-sms-journal__when">{formatWhen(row.created_at)}</span>
                <span className="club-sms-journal__scenario">{scenarioLabel(row.scenario)}</span>
              </div>
              <div className="club-sms-journal__who">
                <strong>{row.client_name || 'Клиент'}</strong>
                <span className="muted"> · {row.sent_by_name || 'сотрудник'}</span>
              </div>
              {row.message_preview ? (
                <p className="club-sms-journal__preview muted">{row.message_preview}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
