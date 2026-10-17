/**
 * Вкладки объединённого инбокса тренера: От клиентов | Планёрка
 * (клиенты чаще — слева и по умолчанию).
 * @param {{
 *   tab: 'planerka' | 'clients',
 *   onTab: (tab: 'planerka' | 'clients') => void,
 *   planerkaCount?: number,
 *   clientsCount?: number,
 * }} props
 */
export function TrainerInboxTabBar({ tab, onTab, planerkaCount = 0, clientsCount = 0 }) {
  const pk = Math.max(0, Number(planerkaCount) || 0)
  const cl = Math.max(0, Number(clientsCount) || 0)
  return (
    <div className="iskra-inbox__tabs" role="tablist" aria-label="Разделы входящих">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'clients'}
        className={`iskra-inbox__tab${tab === 'clients' ? ' iskra-inbox__tab--on' : ''}`}
        data-testid="trainer-inbox-tab-clients"
        onClick={() => onTab('clients')}
      >
        От клиентов
        {cl > 0 ? (
          <span className="iskra-inbox__tab-badge" aria-hidden>
            {cl > 99 ? '99+' : cl}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'planerka'}
        className={`iskra-inbox__tab${tab === 'planerka' ? ' iskra-inbox__tab--on' : ''}`}
        data-testid="trainer-inbox-tab-planerka"
        onClick={() => onTab('planerka')}
      >
        Планёрка
        {pk > 0 ? (
          <span className="iskra-inbox__tab-badge" aria-hidden>
            {pk > 99 ? '99+' : pk}
          </span>
        ) : null}
      </button>
    </div>
  )
}
