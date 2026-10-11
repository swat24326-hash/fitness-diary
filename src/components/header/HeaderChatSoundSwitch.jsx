import { Volume2, VolumeX } from 'lucide-react'
import { useChatSoundSetting } from '../../hooks/useChatSoundSetting.js'

/** «Звуки сообщений» в «Настройках» бургера — переключатель, как «Уведомления». */
export function HeaderChatSoundSwitch() {
  const sound = useChatSoundSetting('staff')
  return (
    <div className="header-push">
      <div className="app-header__menu-item header-push__row">
        {sound.on ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />}
        <span className="header-push__label">
          Звуки сообщений
          <small>{sound.on ? 'Включены на этом устройстве' : 'Выключены'}</small>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={sound.on}
          aria-label="Звуки сообщений"
          className={`client-switch${sound.on ? ' client-switch--on' : ''}`}
          onClick={sound.toggle}
        >
          <span className="client-switch__knob" />
        </button>
      </div>
    </div>
  )
}
