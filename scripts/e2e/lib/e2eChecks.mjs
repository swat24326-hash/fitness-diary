/** Проверки сценария: копим провалы, а не падаем на первом — так видно всю картину склейки. */

export function createChecks(scenario) {
  const failures = []
  return {
    failures,
    ok(cond, msg) {
      if (cond) {
        console.log(`  ✓ ${msg}`)
      } else {
        console.error(`  ✗ ${msg}`)
        failures.push(`${scenario}: ${msg}`)
      }
    },
  }
}

/** Ждём условие на стороне подменного сервера (push идёт с debounce). */
export async function waitFor(fn, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (fn()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return fn()
}
