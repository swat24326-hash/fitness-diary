/** Совмещённые роли «управляющий + тренер»: admin-data?action=staff-link (только главный админ). */
import { inboxApiCall } from '../inbox/inboxAdminApiClient.js'

/** @returns {Promise<{ links: Array<{ supervisor_id: string, trainer_id: string }>, available: boolean }>} */
export const fetchStaffLinks = () => inboxApiCall('staff-link', 'GET', {})

/** trainerId = null — снять связь. */
export const saveStaffLink = (supervisorId, trainerId) =>
  inboxApiCall('staff-link', 'POST', {}, { supervisor_id: supervisorId, trainer_id: trainerId || null })
