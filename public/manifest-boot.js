/*
 * Manifest зала ставим до загрузки приложения, но не на /me. iPhone запоминает для значка «Домой» manifest,
 * который был при загрузке страницы, и не видит подмену из React: с manifest зала значок клиента
 * открывал «/» → вход сотрудника (INC-2026-10-10-01). Без manifest iPhone берёт текущий адрес /me?h=…,
 * manifest клуба добавляет сама страница /me (useClientBranding). Так же и /coach — телефон тренера, свой значок.
 * /coach на Android: клуб уже известен с прошлого входа (fd_coach_club_v1, coachSession.js) — manifest клуба
 * сразу при загрузке, иначе Chrome ставит и перепроверяет значок по запасному «Результат Плюс».
 * Отдельный файл, а не inline: CSP script-src 'self'.
 */
;(function (doc, path, ua) {
  if (path === '/me' || path.indexOf('/me/') === 0) return
  if (path === '/coach' || path.indexOf('/coach/') === 0) {
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return
    var url = ''
    try {
      url = String(JSON.parse(localStorage.getItem('fd_coach_club_v1') || 'null').manifest_url || '')
    } catch (e) {
      url = ''
    }
    if (url.indexOf('/api/coach?manifest=') !== 0) return
    var own = doc.createElement('link')
    own.rel = 'manifest'
    own.href = url
    doc.head.appendChild(own)
    return
  }
  var link = doc.createElement('link')
  link.rel = 'manifest'
  link.href = '/manifest.json?v=3'
  doc.head.appendChild(link)
})(document, location.pathname, navigator.userAgent)
