import { useEffect, useRef } from 'react'
import { claimPushHeal } from '../lib/push/pushSelfHeal.js'

/**
 * Запустить починку подписки при открытии приложения и при возврате в него (не чаще раза в полчаса).
 * @param {string} app
 * @param {() => Promise<unknown>} heal
 * @param {boolean} enabled
 * @param {{ onOpen?: boolean }} [opts] onOpen: false — при открытии экран уже сам чинит (вместе со статусом)
 */
export function usePushSelfHeal(app, heal, enabled, { onOpen = true } = {}) {
  const healRef = useRef(heal)
  useEffect(() => {
    healRef.current = heal
  }, [heal])

  useEffect(() => {
    if (!enabled) return undefined
    const run = () => {
      if (document.visibilityState !== 'visible' || !claimPushHeal(app)) return
      void healRef.current().catch(() => {})
    }
    if (onOpen) run()
    else claimPushHeal(app)
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [app, enabled, onOpen])
}
