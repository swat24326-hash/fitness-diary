import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Trash2 } from 'lucide-react'
import { ModalHeader } from '../ModalHeader.jsx'
import { chatInitials } from '../../lib/chat/chatUiCore.js'
import { AVATAR_UNAVAILABLE_RU } from '../../lib/profile/avatarCore.js'
import { encodeAvatar, openAvatarImage } from '../../lib/profile/avatarPrepare.js'
import { AvatarCropper } from './AvatarCropper.jsx'
import { AvatarPhoto } from './AvatarPhoto.jsx'
import { ProfileStatusMark } from './ProfileStatusMark.jsx'
import { ProfileStatusPicker } from './ProfileStatusPicker.jsx'

function release(image) {
  if (!image) return
  URL.revokeObjectURL(image.url)
  image.img.close?.()
}

/**
 * «Мой профиль», как в Telegram: крупное фото (или инициалы), «Выбрать фото» → обрезка в круг → «Готово», «Удалить фото»;
 * ниже — «Настройки» своего приложения (settings). Пункт, открывающий другое окно, закрывает меню — и это окно вместе с ним.
 * Портал в body: шапка и меню с position:fixed / blur запирали бы окно в своей рамке.
 * pointerdown и mousedown не выпускаем: меню клиента закрывается по pointerdown мимо себя
 * и сняло бы это окно вместе с собой — «Выбрать фото» не успевает открыть галерею.
 * links — переходы своего приложения сразу под фото, чтобы не листать до них (тренеру — «Статистика и зарплата»).
 * layout: phone — клиент и телефон тренера; tablet — тренер на планшете; desk — менеджер / управляющий / админ на мониторе.
 * @param {{ open: boolean, onClose: () => void, name: string, avatar: ReturnType<typeof import('../../hooks/useMyAvatar.js').useMyAvatar>,
 *   settings?: import('react').ReactNode, links?: import('react').ReactNode, layout?: 'phone' | 'tablet' | 'desk' }} props
 */
export function ProfilePhotoSheet({ open, onClose, name, avatar, settings = null, links = null, layout = 'phone' }) {
  const titleId = useId()
  const fileRef = useRef(null)
  const [image, setImage] = useState(null)

  useEffect(() => () => release(image), [image])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape' || avatar.busy) return
      if (image) return setImage(null)
      avatar.setError('')
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, image, avatar, onClose])

  if (!open || typeof document === 'undefined') return null
  const { busy, error } = avatar
  const close = () => {
    if (busy) return
    setImage(null)
    avatar.setError('')
    onClose()
  }

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    avatar.setError('')
    try {
      setImage(await openAvatarImage(file))
    } catch (err) {
      avatar.setError(err.message)
    }
  }

  const done = async (crop) => {
    let data
    try {
      data = await encodeAvatar(image.img, crop)
    } catch (err) {
      avatar.setError(err.message)
      return
    }
    if (await avatar.save(data)) setImage(null)
  }

  return createPortal(
    <div
      className="modal-overlay profile-photo-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={close}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={`modal-panel profile-photo profile-photo--${layout}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="profile-photo-sheet"
        data-layout={layout}
      >
        <ModalHeader titleId={titleId} title="Мой профиль" onClose={close} closeDisabled={busy} />
        {image ? (
          <AvatarCropper image={image} busy={busy} onCancel={() => setImage(null)} onDone={(crop) => void done(crop)} />
        ) : (
          <div className="profile-photo__body">
            <div className="profile-photo__main">
              <div className="profile-photo__hero">
                <span className="profile-photo__circle" aria-hidden>
                  <AvatarPhoto src={avatar.photo} fallback={chatInitials(name) || '?'} />
                </span>
                <strong className="profile-photo__name">
                  {name || 'Без имени'}
                  {avatar.status?.emoji ? <ProfileStatusMark emoji={avatar.status.emoji} /> : null}
                </strong>
                <small className="muted">Фото видят в переписке клуба</small>
                {avatar.ready ? (
                  <div className="profile-photo__actions">
                    <button type="button" className="btn btn-primary btn-touch" disabled={busy} onClick={() => fileRef.current?.click()}>
                      <Camera size={18} aria-hidden />
                      {avatar.photo ? 'Сменить фото' : 'Выбрать фото'}
                    </button>
                    {avatar.photo ? (
                      <button type="button" className="btn btn-ghost btn-touch profile-photo__remove" disabled={busy} onClick={() => void avatar.remove()}>
                        <Trash2 size={18} aria-hidden />
                        Удалить
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted profile-photo__note">{AVATAR_UNAVAILABLE_RU}</p>
                )}
              </div>
              {links ? <div className="profile-photo__links">{links}</div> : null}
            </div>
            <div className="profile-photo__side">
              <ProfileStatusPicker avatar={avatar} />
            </div>
            {settings ? (
              <section className="profile-photo__settings" aria-label="Настройки" data-testid="profile-settings">
                <h3 className="profile-photo__settings-title">Настройки</h3>
                <div className="profile-photo__settings-items">{settings}</div>
              </section>
            ) : null}
          </div>
        )}
        {error ? (
          <p className="profile-photo__error" role="alert">
            {error}
          </p>
        ) : null}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} data-testid="profile-photo-input" />
      </div>
    </div>,
    document.body,
  )
}
