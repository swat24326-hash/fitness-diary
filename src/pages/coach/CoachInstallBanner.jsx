import { useState } from 'react'
import { Share, Smartphone } from 'lucide-react'
import { isCoachIos, isCoachStandalone } from '../../lib/coach/coachInstall.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { COACH_APP_TITLE } from './CoachShell.jsx'
import { useCoachHandoff } from './useCoachHandoff.js'

const HIDDEN_KEY = 'fd_coach_install_hidden'

function readHidden() {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * iPhone в Safari: как поставить значок «Домой». Пока подсказка на экране, значок унесёт с собой вход.
 * Свёрнута в строку — под ней Ежедневник, сетке часов нужна высота экрана.
 */
export function CoachInstallBanner() {
  const { club } = useCoachApp()
  const [hidden, setHidden] = useState(readHidden)
  const [open, setOpen] = useState(false)
  const show = !hidden && isCoachIos() && !isCoachStandalone()
  useCoachHandoff({ active: show })
  if (!show) return null

  const hide = () => {
    try {
      window.localStorage.setItem(HIDDEN_KEY, '1')
    } catch {
      /* приватный режим — скроем до перезагрузки */
    }
    setHidden(true)
  }
  const name = club?.name || COACH_APP_TITLE

  return (
    <section className="coach-card coach-install" aria-label="Значок на экран «Домой»">
      <div className="coach-install__row">
        <h2 className="coach-install__title">
          <Smartphone size={20} aria-hidden /> Значок на экран «Домой»
        </h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Свернуть' : 'Как?'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={hide}>
          Готово
        </button>
      </div>
      {open ? (
        <ol className="coach-install__steps">
          <li>
            Нажмите <Share size={16} aria-label="Поделиться" /> внизу экрана
          </li>
          <li>Выберите «На экран „Домой“»</li>
          <li>Откройте значок «{name}» — он войдёт сам</li>
        </ol>
      ) : null}
    </section>
  )
}
