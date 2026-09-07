/**
 * Общее для всех хуков: чтение входного JSON и ответ.
 * Хук не должен падать — при любой ошибке разбора возвращаем пустой объект.
 */

export async function readHookInput() {
  const chunks = []
  try {
    for await (const chunk of process.stdin) chunks.push(chunk)
  } catch {
    return {}
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/**
 * Пишем ответ без process.exit(): при выходе сразу после write Node может
 * не успеть сбросить буфер в пайп, и Cursor получит обрезанный JSON.
 * Процесс завершится сам — stdin уже прочитан до конца.
 */
export function respond(payload = {}) {
  process.stdout.write(JSON.stringify(payload))
  process.exitCode = 0
}

/** Обёртка: любая необработанная ошибка внутри хука не должна блокировать работу агента. */
export async function runHook(handler, fallback = {}) {
  let payload = fallback
  try {
    const input = await readHookInput()
    payload = (await handler(input)) || fallback
  } catch {
    payload = fallback
  }
  respond(payload)
}
