/** Данные телефона тренера (/coach): расписание, переписка, push. Только пропуск 'coach'. */
import { createCoachHandler } from './_lib/coach/coachHandler.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

export default withSafeApiHandler(createCoachHandler(), { label: 'coach' })
