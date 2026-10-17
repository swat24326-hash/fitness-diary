import { RefreshCw } from 'lucide-react'
import { LegalEntryLinks } from '../legal/LegalEntryLinks.jsx'
import { HeaderStaffSettingsItems } from './HeaderStaffSettingsItems.jsx'

/**
 * Настройки сотрудника внутри «Мой профиль»: Sync, уведомления, QR, восстановление.
 * «Помощь» / «Журнал ошибок» — в бургере меню (`HeaderJournalMenuItem`).
 * @param {{ sync: { ready: boolean, busy: boolean, label: string, run: () => void },
 *   items: import('react').ComponentProps<typeof HeaderStaffSettingsItems>,
 *   recover: { busy: boolean, run: () => void } }} props
 */
export function HeaderProfileSettings({ sync, items, recover }) {
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
      <LegalEntryLinks className="legal-entry-links--in-profile" />
    </>
  )
}
