import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Menu, RefreshCw, Smartphone } from 'lucide-react'
import { ProfileMenuUser } from '../../components/profile/ProfileMenuUser.jsx'
import { SignOutWarnDialog } from '../../components/screenCache/SignOutWarnDialog.jsx'
import { postClientMe } from '../../lib/client/clientSession.js'
import { avatarApiOver } from '../../lib/profile/avatarApi.js'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientSettingsSection } from './ClientSettingsSection.jsx'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

const clientAvatarApi = avatarApiOver(postClientMe)

/**
 * Бургер /me — выпадающее меню как у тренера (app-header__dropdown / __menu-item из index.css),
 * все строки одного вида: «Мой профиль» (фото и настройки) → действия → «Выйти».
 * onRefresh — «Обновить» данные открытого экрана (как у тренера — в меню, не в шапке).
 * Диалог «Выйти» живёт на этом уровне: иначе close() снимал dropdown и окно не успевало показаться.
 * @param {{ clientName?: string, onLogout: () => void | Promise<void>, onRefresh?: (() => void) | null, refreshing?: boolean }} props
 */
export function ClientMenu({ clientName = '', onLogout, onRefresh = null, refreshing = false }) {
  const [open, setOpen] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

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
        <Menu size={22} aria-hidden />
      </button>
      {/* hidden, не unmount: иначе «Выйти» → close снимал бы и диалог подтверждения */}
      <div
        id="client-menu-dropdown"
        className="app-header__dropdown"
        role="region"
        aria-label="Меню"
        hidden={!open}
      >
        <ClientMenuItems
          clientName={clientName}
          onRefresh={onRefresh}
          refreshing={refreshing}
          close={() => setOpen(false)}
          onLogoutRequest={() => {
            setOpen(false)
            setWarnOpen(true)
          }}
        />
      </div>
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
 * @param {{ clientName?: string, onLogout?: () => void | Promise<void>, onLogoutRequest?: () => void, onRefresh?: (() => void) | null, refreshing?: boolean, close?: () => void }} props
 */
export function ClientMenuItems({
  clientName = '',
  onLogout,
  onLogoutRequest = null,
  onRefresh = null,
  refreshing = false,
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
