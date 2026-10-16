import { AlertTriangle, CircleHelp, RefreshCw } from 'lucide-react'
import { LegalEntryLinks } from '../legal/LegalEntryLinks.jsx'
import { HeaderStaffSettingsItems } from './HeaderStaffSettingsItems.jsx'

/** Счётчик на кнопке журнала: ошибки и/или отложенное обновление. */
function JournalBadge({ errorCount, updatePending }) {
  if (errorCount <= 0 && !updatePending) return null
  const label =
    updatePending && errorCount > 0
      ? `Обновление отложено; записей в журнале: ${errorCount}`
      : updatePending
        ? 'Доступна новая версия'
        : `Записей в журнале: ${errorCount}`
  return (
    <span className="app-header__error-badge" aria-label={label}>
      {errorCount > 0 ? (errorCount > 99 ? '99+' : errorCount) : '↑'}
    </span>
  )
}

/**
 * Настройки сотрудника внутри «Мой профиль»: Sync, уведомления, QR, восстановление, журнал / помощь.
 * @param {{ sync: { ready: boolean, busy: boolean, label: string, run: () => void },
 *   items: import('react').ComponentProps<typeof HeaderStaffSettingsItems>,
 *   recover: { busy: boolean, run: () => void },
 *   journal: { isAdmin: boolean, errorCount: number, updatePending: boolean, open: () => void } }} props
 */
export function HeaderProfileSettings({ sync, items, recover, journal }) {
  return (
    <>
      {sync.ready ? (
        <button type="button" className="app-header__menu-item" disabled={sync.busy} onClick={sync.run}>
          <RefreshCw size={18} className={sync.busy ? 'icon-spin' : undefined} aria-hidden />
          {sync.label}
        </button>
      ) : null}
      <HeaderStaffSettingsItems {...items} />
      <button type="button" className="app-header__menu-item" disabled={recover.busy} onClick={recover.run}>
        <RefreshCw size={18} className={recover.busy ? 'icon-spin' : undefined} aria-hidden />
        {recover.busy ? 'Восстанавливаем…' : 'Восстановить приложение'}
      </button>
      <button type="button" className="app-header__menu-item app-header__menu-item--journal" onClick={journal.open}>
        <span className="app-header__menu-item-main">
          {journal.isAdmin ? <AlertTriangle size={18} aria-hidden /> : <CircleHelp size={18} aria-hidden />}
          {journal.isAdmin ? 'Журнал ошибок' : 'Помощь'}
        </span>
        <JournalBadge errorCount={journal.errorCount} updatePending={journal.updatePending} />
      </button>
      <LegalEntryLinks className="legal-entry-links--in-profile" />
    </>
  )
}
