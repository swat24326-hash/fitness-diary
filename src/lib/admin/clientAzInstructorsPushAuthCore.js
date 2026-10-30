/**
 * Кто может пушить client_az_instructors (чистая логика ролей).
 */

import { normalizeClientAzInstructorRow } from './clientAzInstructorsCore.js'

/**
 * @param {{
 *   op: string,
 *   isAdmin?: boolean,
 *   isSalesManager?: boolean,
 *   isSupervisor?: boolean,
 *   isTrainer?: boolean,
 *   payload?: object,
 * }} input
 * @returns {{ ok: true, data?: object } | { ok: false, error: string }}
 */
export function assertClientAzInstructorsPushRole(input) {
  if (input?.isTrainer && !input?.isAdmin && !input?.isSalesManager && !input?.isSupervisor) {
    return { ok: false, error: 'Инструкторов АЗ назначает администратор или менеджер' }
  }
  if (!input?.isAdmin && !input?.isSalesManager && !input?.isSupervisor) {
    return { ok: false, error: 'Нет прав назначать инструкторов АЗ' }
  }
  const op = String(input?.op ?? '')
  if (op === 'delete') return { ok: true }
  if (op === 'insert' || op === 'update') {
    const prep = normalizeClientAzInstructorRow(input?.payload)
    if (!prep.ok) return prep
    return { ok: true, data: prep.data }
  }
  return { ok: false, error: 'Недопустимая операция' }
}
