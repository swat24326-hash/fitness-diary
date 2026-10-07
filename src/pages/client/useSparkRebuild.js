import { useEffect, useRef, useState } from 'react'

const SETTLE_MS = 420

/**
 * «Обновить» на /me: график оседает, а когда пришли свежие данные именно по кнопке — собирается заново.
 * Оседание длится не меньше SETTLE_MS, иначе быстрый ответ даёт рывок. Первый заход не перерисовываем.
 */
export function useSparkRebuild(status, reload) {
  const startedAt = useRef(0)
  const [settling, setSettling] = useState(false)
  const [build, setBuild] = useState(0)
  useEffect(() => {
    if (!startedAt.current || status === 'loading') return
    const wait = Math.max(0, SETTLE_MS - (Date.now() - startedAt.current))
    startedAt.current = 0
    const timer = setTimeout(() => {
      if (status === 'ready') setBuild((b) => b + 1)
      setSettling(false)
    }, wait)
    return () => clearTimeout(timer)
  }, [status])
  const refresh = () => {
    startedAt.current = Date.now()
    setSettling(true)
    reload()
  }
  return { build, settling, refresh }
}
