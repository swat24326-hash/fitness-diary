import { useId, useState } from 'react'
import { ChevronDown, Settings, Smartphone } from 'lucide-react'
import { HeaderPushSwitch } from './HeaderPushSwitch.jsx'
import { HeaderChatSoundSwitch } from './HeaderChatSoundSwitch.jsx'
import { HeaderInstallItem } from './HeaderInstallItem.jsx'

/** «Настройки» в бургере: служебные пункты свёрнуты, чтобы меню не разрасталось. */
export function HeaderSettingsMenu({ attention = false, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const itemsId = useId()
  return (
    <div className="header-settings">
      <button
        type="button"
        className="app-header__menu-item header-settings__toggle"
        aria-expanded={open}
        aria-controls={itemsId}
        onClick={() => setOpen((o) => !o)}
      >
        <Settings size={18} aria-hidden />
        <span className="header-settings__label">Настройки</span>
        {attention && !open ? <span className="header-settings__dot" aria-label="Требует внимания" /> : null}
        <ChevronDown size={18} aria-hidden className={`header-settings__chevron${open ? ' header-settings__chevron--open' : ''}`} />
      </button>
      {open ? (
        <div id={itemsId} className="header-settings__items">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Пункты сотрудника: push (тренер, менеджер), звуки переписки; тренеру — напоминания Ежедневника
 * и QR для приложения на телефоне.
 */
export function HeaderStaffSettingsItems({ showPush, showChatSound, showPhoneQr, showScheduleReminders, clubId, onOpen }) {
  return (
    <>
      {showPush ? <HeaderPushSwitch clubId={clubId} scheduleReminders={showScheduleReminders} /> : null}
      {showChatSound ? <HeaderChatSoundSwitch /> : null}
      {showPhoneQr ? (
        <button type="button" className="app-header__menu-item" onClick={() => onOpen('phone-qr')}>
          <Smartphone size={18} aria-hidden />
          QR для телефона
        </button>
      ) : null}
      <HeaderInstallItem />
    </>
  )
}
