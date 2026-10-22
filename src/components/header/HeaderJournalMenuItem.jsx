import { AlertTriangle, CircleHelp } from 'lucide-react'

/** Счётчик на кнопке журнала: ошибки, отложенное обновление или замечание без очереди. */
function JournalBadge({ errorCount, updatePending, remark }) {
  if (errorCount <= 0 && !updatePending && !remark) return null
  const label =
    updatePending && errorCount > 0
      ? `Обновление отложено; записей в журнале: ${errorCount}`
      : updatePending
        ? 'Доступна новая версия'
        : errorCount > 0
          ? `Записей в журнале: ${errorCount}`
          : 'Синхронизация с замечанием'
  return (
    <span className="app-header__error-badge" aria-label={label}>
      {errorCount > 0 ? (errorCount > 99 ? '99+' : errorCount) : updatePending ? '↑' : '!'}
    </span>
  )
}

/**
 * «Помощь» / «Журнал ошибок» в бургере меню аккаунта (все роли шапки).
 * @param {{ isAdmin: boolean, errorCount: number, updatePending: boolean, remark?: boolean, onOpen: () => void }} props
 */
export function HeaderJournalMenuItem({ isAdmin, errorCount, updatePending, remark = false, onOpen }) {
  return (
    <button type="button" className="app-header__menu-item app-header__menu-item--journal" onClick={onOpen} data-testid="header-journal-menu">
      <span className="app-header__menu-item-main">
        {isAdmin ? <AlertTriangle size={18} aria-hidden /> : <CircleHelp size={18} aria-hidden />}
        {isAdmin ? 'Журнал ошибок' : 'Помощь'}
      </span>
      <JournalBadge errorCount={errorCount} updatePending={updatePending} remark={remark} />
    </button>
  )
}
