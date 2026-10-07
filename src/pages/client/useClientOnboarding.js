import { useCallback, useRef, useState } from 'react'
import {
  CLIENT_ONBOARDING_KEY,
  applyOnboardingOutcome,
  freshOnboardingState,
  pendingOnboardingSteps,
  readOnboardingState,
} from '../../lib/client/clientOnboardingCore.js'

const SNOOZE_KEY = 'fd_client_onboarding_snooze'

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    /* приватный режим — баннеры живут до перезагрузки */
  }
}

/**
 * Какой баннер показать сейчас. start() — вход по QR / ссылке, баннеры заново. «Позже» прячет шаг
 * до следующего захода (sessionStorage); show(step) — открыть шаг из меню, даже если баннеры закончились.
 * @param {{ installMode: string, pushMode: string }} env
 */
export function useClientOnboarding({ installMode, pushMode }) {
  const [state, setState] = useState(() => readOnboardingState(readJson(window.localStorage, CLIENT_ONBOARDING_KEY)))
  const [snoozed, setSnoozed] = useState(() => readJson(window.sessionStorage, SNOOZE_KEY) ?? [])
  const [forced, setForced] = useState(null)
  const totalRef = useRef(0)

  const pending = pendingOnboardingSteps(state, { installMode, pushMode, snoozed })
  totalRef.current = Math.max(totalRef.current, pending.length)
  const forcedOk = forced === 'install' ? installMode !== 'none' : forced === 'push' ? pushMode === 'off' : false
  const step = forcedOk ? forced : (pending[0] ?? null)
  const total = forcedOk ? 1 : totalRef.current

  const finish = useCallback(
    (which, outcome) => {
      setForced(null)
      if (!state && outcome === 'later') return
      const next = applyOnboardingOutcome(state, which, outcome)
      writeJson(window.localStorage, CLIENT_ONBOARDING_KEY, next)
      setState(next)
      if (outcome === 'later') {
        const s = [...new Set([...snoozed, which])]
        writeJson(window.sessionStorage, SNOOZE_KEY, s)
        setSnoozed(s)
      }
    },
    [state, snoozed],
  )

  const start = useCallback(() => {
    const fresh = freshOnboardingState()
    writeJson(window.localStorage, CLIENT_ONBOARDING_KEY, fresh)
    writeJson(window.sessionStorage, SNOOZE_KEY, [])
    totalRef.current = 0
    setState(fresh)
    setSnoozed([])
  }, [])

  return {
    start,
    step,
    index: step ? total - (forcedOk ? 1 : pending.length) + 1 : 0,
    total,
    done: (which) => finish(which, 'done'),
    later: (which) => finish(which, 'later'),
    show: setForced,
  }
}
