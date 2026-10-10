/** Вход тренера с личного телефона (/coach): sign-in / refresh / sign-out. */
import { createCoachAuthHandler } from './_lib/coach/coachAuthHandler.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

export default withSafeApiHandler(createCoachAuthHandler(), { label: 'coach-auth' })
