/** Есть ли на сервере сборка новее той, что открыта: проверка service worker с потолком по времени. */
const CHECK_MS = 4_000

function waitInstalled(worker, ms) {
  return new Promise((resolve) => {
    if (!worker || worker.state !== 'installing') return resolve(undefined)
    const done = () => resolve(undefined)
    worker.addEventListener('statechange', () => worker.state !== 'installing' && done())
    setTimeout(done, ms)
  })
}

export async function hasNewerAppVersion() {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null
  const reg = await sw?.getRegistration?.().catch(() => null)
  if (!reg) return false
  if (reg.waiting) return true
  await Promise.race([reg.update().catch(() => {}), new Promise((r) => setTimeout(r, CHECK_MS))])
  await waitInstalled(reg.installing, CHECK_MS)
  return Boolean(reg.waiting)
}
