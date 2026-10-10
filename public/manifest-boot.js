/*
 * Manifest зала ставим до загрузки приложения, но не на /me. iPhone запоминает для значка «Домой» manifest,
 * который был при загрузке страницы, и не видит подмену из React: с manifest зала значок клиента
 * открывал «/» → вход сотрудника (INC-2026-10-10-01). Без manifest iPhone берёт текущий адрес /me?h=…,
 * manifest клуба добавляет сама страница /me (useClientBranding). Так же и /coach — телефон тренера, свой значок.
 * Отдельный файл, а не inline: CSP script-src 'self'.
 */
;(function (doc, path) {
  if (path === '/me' || path.indexOf('/me/') === 0) return
  if (path === '/coach' || path.indexOf('/coach/') === 0) return
  var link = doc.createElement('link')
  link.rel = 'manifest'
  link.href = '/manifest.json?v=3'
  doc.head.appendChild(link)
})(document, location.pathname)
