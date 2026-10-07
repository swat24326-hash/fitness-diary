/** Вход клиента в /me по приглашению из клуба: redeem / refresh / logout. */
import { createClientAuthHandler } from './_lib/clientPortal/clientAuthHandler.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

export default withSafeApiHandler(createClientAuthHandler(), { label: 'client-auth' })
