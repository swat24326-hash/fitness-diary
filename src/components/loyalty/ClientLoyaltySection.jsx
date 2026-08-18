import { Link } from 'react-router-dom'
import { formatDateRu } from '../../lib/dateRu.js'
import { formatLoyaltyAccountCopy } from '../../lib/loyalty/loyaltyGlanceUiCore.js'
import { canOpenLoyaltyJournal } from '../../lib/loyalty/loyaltyJournalUiCore.js'
import { useClientLoyalty } from '../../hooks/useClientLoyalty.js'
import { useAuth } from '../../context/AuthContext'
import { LoyaltyRedeemControls } from './LoyaltyRedeemControls.jsx'
import '../../styles/loyalty.css'

/**
 * Вкладка «Баллы». Списание — sales/admin, только в сети.
 */
export function ClientLoyaltySection({ client, compact = false }) {
  const { isAdmin, isSalesManager, isTrainer, isSupervisor } = useAuth()
  const role = { isAdmin, isSalesManager, isTrainer, isSupervisor }
  const { snapshot, source, busy, visible, reload } = useClientLoyalty(client)
  if (!visible) return null

  const copy = formatLoyaltyAccountCopy(snapshot)
  const offline = source === 'cache'
  const empty = !snapshot && !busy
  const clubQs = client?.club_id ? `?club=${encodeURIComponent(String(client.club_id))}` : ''
  const journalHref = isSalesManager ? '/sales/loyalty' : `/admin/loyalty${clubQs}`
  const showJournal = canOpenLoyaltyJournal(role)

  return (
    <section className={`loyalty-account${compact ? ' loyalty-account--compact' : ''}`} aria-label="Баллы лояльности">
      <header className="loyalty-account__head">
        <p className="loyalty-account__eyebrow">Лояльность ПЗ</p>
        <h2 className="loyalty-account__title">Баллы</h2>
      </header>

      {busy && !snapshot ? (
        <p className="muted loyalty-account__status" role="status">
          Загружаю баллы…
        </p>
      ) : empty ? (
        <p className="muted loyalty-account__status" role="status">
          {offline ? 'Нет сохранённых баллов на устройстве.' : 'Не удалось загрузить баллы.'}
        </p>
      ) : (
        <>
          <div className="loyalty-account__points" aria-live="polite">
            <span className="loyalty-account__points-value">{copy.points}</span>
            <span className="loyalty-account__points-label">баллов</span>
          </div>
          {copy.hint ? (
            <p className="loyalty-account__hint" role="status">
              {copy.hint}
            </p>
          ) : null}
          <dl className="loyalty-account__facts">
            <div>
              <dt>Недель в цикле</dt>
              <dd>{copy.weeks_credited}</dd>
            </div>
            <div>
              <dt>Остаток ккал</dt>
              <dd>{copy.kcal_remainder}</dd>
            </div>
            <div>
              <dt>Старт цикла</dt>
              <dd>{copy.cycle_start ? formatDateRu(copy.cycle_start) : '—'}</dd>
            </div>
            <div>
              <dt>Куш с</dt>
              <dd>{copy.unlock_on ? formatDateRu(copy.unlock_on) : '—'}</dd>
            </div>
          </dl>
          {offline ? (
            <p className="muted loyalty-account__offline" role="status">
              Показано с устройства. При сети откройте вкладку снова или нажмите Sync.
            </p>
          ) : null}
          <LoyaltyRedeemControls
            clientId={client?.id}
            snapshot={snapshot}
            role={role}
            onDone={() => void reload()}
          />
          {showJournal ? (
            <p className="loyalty-account__journal-link">
              <Link to={journalHref}>Журнал списаний</Link>
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
