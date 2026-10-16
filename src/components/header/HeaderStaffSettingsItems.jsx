import { useState } from 'react'
import { ChevronDown, Smartphone } from 'lucide-react'
import { CoachPhoneQrPanel } from '../coach/CoachPhoneQrPanel.jsx'
import { HeaderPushSwitch } from './HeaderPushSwitch.jsx'
import { HeaderChatSoundSwitch } from './HeaderChatSoundSwitch.jsx'
import { HeaderInstallItem } from './HeaderInstallItem.jsx'
import { NotificationsSettingsFold } from './NotificationsSettingsFold.jsx'

/**
 * Пункты сотрудника в «Мой профиль» → «Настройки»: push (тренер, менеджер), звуки переписки;
 * тренеру — напоминания Ежедневника и QR для приложения на телефоне (код раскрывается тут же, под строкой).
 * Несколько переключателей уведомлений — за одной кнопкой «Уведомления».
 */
export function HeaderStaffSettingsItems({ showPush, showChatSound, showPhoneQr, showScheduleReminders, clubId }) {
  const [qrOpen, setQrOpen] = useState(false)
  const foldNotify = showPush && showChatSound
  const push = showPush ? <HeaderPushSwitch clubId={clubId} scheduleReminders={showScheduleReminders} /> : null
  const sound = showChatSound ? <HeaderChatSoundSwitch /> : null
  return (
    <>
      {foldNotify ? (
        <NotificationsSettingsFold hint={showScheduleReminders ? 'Push, напоминания, звуки' : 'Push и звуки'}>
          {push}
          {sound}
        </NotificationsSettingsFold>
      ) : (
        <>
          {push}
          {sound}
        </>
      )}
      {showPhoneQr ? (
        <>
          <button type="button" className="app-header__menu-item" aria-expanded={qrOpen} onClick={() => setQrOpen((o) => !o)}>
            <Smartphone size={18} aria-hidden />
            <span className="coach-qr-panel__label">QR для телефона</span>
            <ChevronDown size={18} aria-hidden className={`coach-qr-panel__chevron${qrOpen ? ' coach-qr-panel__chevron--open' : ''}`} />
          </button>
          {qrOpen ? <CoachPhoneQrPanel /> : null}
        </>
      ) : null}
      <HeaderInstallItem />
    </>
  )
}
