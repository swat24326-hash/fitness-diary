import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, MoreVertical, RefreshCw, Ruler, Scale, Smartphone } from 'lucide-react'
import { ProfileMenuUser } from '../../components/profile/ProfileMenuUser.jsx'
import { SignOutWarnDialog } from '../../components/screenCache/SignOutWarnDialog.jsx'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.js'
import { postClientMe } from '../../lib/client/clientSession.js'
import { avatarApiOver } from '../../lib/profile/avatarApi.js'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientSettingsSection } from './ClientSettingsSection.jsx'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

const clientAvatarApi = avatarApiOver(postClientMe)

/**
 * Меню ⋮ /me — выпадающее как у тренера (app-header__dropdown / __menu-item из index.css),
 * все строки одного вида: «Мой профиль» (фото и настройки) → действия → «Выйти».
 * onRefresh — «Обновить» данные открытого экрана (как у тренера — в меню, не в шапке).
 * Диалог «Выйти» на этом уровне (не внутри dropdown): иначе close() снимал меню вместе с окном.
 * @param {{
 *   clientName?: string
 *   onLogout: () => void | Promise<void>
 *   onRefresh?: (() => void) | null
 *   refreshing?: boolean
 *   onAddWeight?: (() => void) | null
 *   onAddMeasure?: (() => void) | null
 * }} props
 */
export function ClientMenu({
  clientName = '',
  onLogout,
  onRefresh = null,
  refreshing = false,
  onAddWeight = null,
  onAddMeasure = null,
}) {
  const [open, setOpen] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  usePopoverDismiss(open, close, rootRef)

  const confirmLogout = useCallback(async () => {
    setBusy(true)
    try {
      await Promise.resolve(onLogout())
    } finally {
      setBusy(false)
      setWarnOpen(false)
      setOpen(false)
    }
  }, [onLogout])

  return (
    <span className="client-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="client-menu-dropdown"
        title="Меню"
        aria-label="Меню"
      >
        <MoreVertical size={22} aria-hidden />
      </button>
      {open ? (
        <div id="client-menu-dropdown" className="app-header__dropdown" role="region" aria-label="Меню">
          <ClientMenuItems
            clientName={clientName}
            onRefresh={onRefresh}
            refreshing={refreshing}
            onAddWeight={onAddWeight}
            onAddMeasure={onAddMeasure}
            close={close}
            onLogoutRequest={() => {
              setOpen(false)
              setWarnOpen(true)
            }}
          />
        </div>
      ) : null}
      <SignOutWarnDialog
        app="client"
        open={warnOpen}
        busy={busy}
        onCancel={() => !busy && setWarnOpen(false)}
        onConfirm={() => void confirmLogout()}
      />
    </span>
  )
}

/**
 * Строки меню клиента — в ☰ экранов и в «⋮» шапки диалога.
 * close — закрыть то меню, где они стоят.
 * onLogoutRequest — открыть предупреждение снаружи (бургер); иначе свой SignOutWarnDialog (⋮ в чате).
 * @param {{
 *   clientName?: string
 *   onLogout?: () => void | Promise<void>
 *   onLogoutRequest?: () => void
 *   onRefresh?: (() => void) | null
 *   refreshing?: boolean
 *   onAddWeight?: (() => void) | null
 *   onAddMeasure?: (() => void) | null
 *   close?: () => void
 * }} props
 */
export function ClientMenuItems({
  clientName = '',
  onLogout,
  onLogoutRequest = null,
  onRefresh = null,
  refreshing = false,
  onAddWeight = null,
  onAddMeasure = null,
  close = () => {},
}) {
  const navigate = useNavigate()
  const { installer, onboarding } = useClientApp()
  const [warnOpen, setWarnOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ownWarn = !onLogoutRequest

  const requestLogout = () => {
    if (onLogoutRequest) {
      onLogoutRequest()
      return
    }
    setWarnOpen(true)
  }

  const confirmLogout = async () => {
    setBusy(true)
    try {
      await Promise.resolve(onLogout?.())
    } finally {
      setBusy(false)
      setWarnOpen(false)
      close()
    }
  }

  /** С главной — колбэк; с других вкладок — на главную с state (шторка откроется там). */
  const openProgressSelf = (kind) => {
    close()
    if (kind === 'weight' && onAddWeight) {
      onAddWeight()
      return
    }
    if (kind === 'measure' && onAddMeasure) {
      onAddMeasure()
      return
    }
    navigate(CLIENT_HOME, { state: { clientProgressSelf: kind } })
  }

  return (
    <>
      {clientName ? (
        <ProfileMenuUser name={clientName} api={clientAvatarApi} cacheKey="client" layout="phone" settings={<ClientSettingsSection />} />
      ) : null}
      {installer.mode !== 'none' ? (
        <button
          type="button"
          className="app-header__menu-item"
          onClick={() => {
            close()
            navigate(CLIENT_HOME)
            onboarding.show('install')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <Smartphone size={18} aria-hidden />
          Установить на телефон
        </button>
      ) : null}
      <button type="button" className="app-header__menu-item" onClick={() => openProgressSelf('weight')}>
        <Scale size={18} aria-hidden />
        Добавить вес
      </button>
      <button type="button" className="app-header__menu-item" onClick={() => openProgressSelf('measure')}>
        <Ruler size={18} aria-hidden />
        Добавить обмеры
      </button>
      {onRefresh ? (
        <button
          type="button"
          className="app-header__menu-item"
          disabled={refreshing}
          onClick={() => {
            close()
            onRefresh()
          }}
        >
          <RefreshCw size={18} aria-hidden className={refreshing ? 'client-me-spin' : undefined} />
          Обновить
        </button>
      ) : null}
      <button type="button" className="app-header__menu-item app-header__menu-item--danger" onClick={requestLogout}>
        <LogOut size={18} aria-hidden />
        Выйти
      </button>
      {ownWarn ? (
        <SignOutWarnDialog
          app="client"
          open={warnOpen}
          busy={busy}
          onCancel={() => !busy && setWarnOpen(false)}
          onConfirm={() => void confirmLogout()}
        />
      ) : null}
    </>
  )
}
