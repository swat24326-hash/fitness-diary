/* global document */
/**
 * Шапка дней ежедневника над сеткой: не обрезана по высоте и каждая колонка — ровно над своей колонкой часов.
 * Полосу прокрутки мыши (Windows) headless с hasTouch не рисует — этот случай здесь не воспроизводится.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ height: number, clipped: number, drift: number }>}
 */
export function scheduleHeadsLayout(page) {
  return page.evaluate(() => {
    const box = document.querySelector('.trainer-schedule-day__col-heads')
    const current = '.trainer-schedule-day__page:not([aria-hidden])'
    const cols = [...box.querySelectorAll(`${current} .trainer-schedule-day__col-head`)].map((el) => el.getBoundingClientRect())
    const tracks = [...document.querySelectorAll(`.trainer-schedule-day__board ${current} .trainer-schedule-day__track`)].map(
      (el) => el.getBoundingClientRect(),
    )
    const drift =
      cols.length && cols.length === tracks.length
        ? Math.max(...cols.map((r, i) => Math.max(Math.abs(r.left - tracks[i].left), Math.abs(r.right - tracks[i].right))))
        : 999
    const minHead = Math.min(...cols.map((r) => r.height))
    return { height: Math.round(minHead), clipped: box.scrollHeight - box.clientHeight, drift: Math.round(drift) }
  })
}
