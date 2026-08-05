import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Trash2 } from 'lucide-react'
import { fetchDeletionAuditLogViaApi } from '../../lib/admin/deletionAuditLogService.js'
import {
  formatDeletionAuditActor,
  formatDeletionAuditClient,
  formatDeletionAuditMeta,
} from '../../lib/admin/deletionAuditFormatCore.js'
import { CLIENT_HARD_DELETE_CONFIRM_CODE } from '../../lib/clientHardDeleteConfirmCore.js'
import { formatDateRu } from '../../lib/dateRu.js'
import '../../styles/deletion-audit.css'

function formatWhen(iso) {
  const s = String(iso ?? '')
  const day = s.slice(0, 10)
  const time = s.includes('T') ? s.slice(11, 16) : ''
  const ru = day ? formatDateRu(day) : '—'
  return time ? `${ru}, ${time}` : ru
}

/**
 * Журнал жёстких удалений клиентов клуба.
 * @param {{ clubId: string, listBackHref?: string }} props
 */
export function AdminDeletionLogSection({ clubId = '', listBackHref = '/admin/clients' }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetchDeletionAuditLogViaApi({
        clubId,
        page: 0,
        pageSize: 50,
        q,
      })
      setRows(res.rows)
      setTotal(res.totalCount)
    } catch (e) {
      setRows([])
      setTotal(0)
      setError(e?.message ? String(e.message) : 'Не удалось загрузить журнал')
    } finally {
      setBusy(false)
    }
  }, [clubId, q])

  useEffect(() => {
    void load()
  }, [load])

  const applySearch = () => setQ(qInput.trim())

  return (
    <section className="deletion-audit" aria-label="Журнал удалений клиентов">
      <div className="deletion-audit__head">
        <div className="deletion-audit__title-row">
          <Trash2 size={22} aria-hidden />
          <h2 className="section-title" style={{ margin: 0 }}>
            Журнал удалений
          </h2>
        </div>
        <Link to={listBackHref} className="btn btn-ghost btn-touch">
          ← К клиентам
        </Link>
      </div>
      <p className="muted deletion-audit__hint">
        Кто и когда удалил карточку клиента (не архив). История тренировок при удалении не восстанавливается —
        запись нужна, чтобы закрыть спор «куда пропала карточка».
      </p>
      <p className="deletion-audit__memo" role="note">
        <strong>Памятка:</strong> код подтверждения полного удаления карточки —{' '}
        <code className="deletion-audit__code">{CLIENT_HARD_DELETE_CONFIRM_CODE}</code>
        . В модалке код не подсказывают; лучше архивировать, чем стирать.
      </p>
      <div className="deletion-audit__toolbar">
        <input
          type="search"
          className="deletion-audit__search"
          placeholder="ФИО, карта, кто удалил…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applySearch()
            }
          }}
          aria-label="Поиск в журнале удалений"
        />
        <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={applySearch}>
          Найти
        </button>
        <button type="button" className="btn btn-primary btn-icon-square btn-touch" disabled={busy} onClick={() => void load()} aria-label="Обновить">
          <RefreshCw size={18} className={busy ? 'icon-spin' : undefined} aria-hidden />
        </button>
      </div>
      {error ? <p className="sales-report__error">{error}</p> : null}
      <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
        Записей: {total}
        {!clubId ? ' · все клубы' : ''}
      </p>
      <div className="table-wrap">
        <table className="deletion-audit__table">
          <thead>
            <tr>
              <th>Когда</th>
              <th>Клиент</th>
              <th>Тренер</th>
              <th>Кто удалил</th>
              <th>Состав</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !busy ? (
              <tr>
                <td colSpan={5} className="muted">
                  Пока пусто — удаления после включения журнала появятся здесь.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatWhen(r.created_at)}</td>
                <td>{formatDeletionAuditClient(r)}</td>
                <td>{String(r.trainer_name ?? '').trim() || '—'}</td>
                <td>{formatDeletionAuditActor(r)}</td>
                <td className="muted">{formatDeletionAuditMeta(r.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
