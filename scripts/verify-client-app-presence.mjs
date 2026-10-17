/**
 * «Есть приложение»: сессия с refresh или свежая (<1 ч); голый QR без использования — нет.
 */
import {
  CLIENT_APP_SESSION_GRACE_MS,
  clientHasActiveAppSession,
  clientSessionLooksActive,
} from '../src/lib/client/clientAppPresenceCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const now = Date.parse('2026-10-17T15:00:00Z')
ok(CLIENT_APP_SESSION_GRACE_MS === 60 * 60 * 1000, 'grace 1 час')

ok(
  clientSessionLooksActive(
    { created_at: '2026-10-17T14:30:00Z', last_refresh_at: null, revoked_at: null },
    now,
  ),
  'только что вошёл (<1 ч) — ок',
)
ok(
  !clientSessionLooksActive(
    { created_at: '2026-10-10T14:40:00Z', last_refresh_at: null, revoked_at: null },
    now,
  ),
  'старый вход без refresh — не приложение',
)
ok(
  clientSessionLooksActive(
    { created_at: '2026-10-10T14:40:00Z', last_refresh_at: '2026-10-16T10:00:00Z', revoked_at: null },
    now,
  ),
  'был refresh — пользуется',
)
ok(
  !clientSessionLooksActive(
    { created_at: '2026-10-17T14:30:00Z', last_refresh_at: null, revoked_at: '2026-10-17T14:40:00Z' },
    now,
  ),
  'отозвана — нет',
)

ok(
  !clientHasActiveAppSession(
    [
      { created_at: '2026-10-10T14:40:00Z', last_refresh_at: null, revoked_at: null },
      { created_at: '2026-10-09T10:00:00Z', last_refresh_at: null, revoked_at: null },
    ],
    now,
  ),
  'Семенов-кейс: несколько входов без refresh → нет приложения',
)

ok(
  clientHasActiveAppSession(
    [{ created_at: '2026-10-10T14:40:00Z', last_refresh_at: '2026-10-17T12:00:00Z', revoked_at: null }],
    now,
  ),
  'есть refresh → есть приложение',
)

console.log('verify-client-app-presence: ok')
