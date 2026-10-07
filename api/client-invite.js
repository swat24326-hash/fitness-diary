/** Сотрудник выдаёт клиенту ссылку на /me или отключает все его входы. */
import { createClientInviteHandler } from './_lib/clientPortal/clientInviteHandler.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

export default withSafeApiHandler(createClientInviteHandler(), { label: 'client-invite' })
