/** Приложение клиента /me: абонемент, ближайшая тренировка, прогресс, бонусы. */
import { clientMeHandler } from './_lib/clientPortal/clientMeHandler.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

export default withSafeApiHandler(clientMeHandler, { label: 'client-me' })
