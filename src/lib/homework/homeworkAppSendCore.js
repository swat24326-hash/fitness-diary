/**
 * Черновик ДЗ → снимок для приложения клиента («Задание от тренера»).
 * id упражнений справочника клиенту не нужны — только то, что видно на карточке.
 */
import { sanitizeClientPlanPayload } from '../clientPlans/clientPlanCore.js'

/** @returns {{ ok: true, payload: object } | { ok: false, error: 'empty_draft' }} */
export function buildHomeworkAppSnapshot(draft) {
  const payload = sanitizeClientPlanPayload('homework', {
    title: draft?.title,
    comment: draft?.comment,
    blocks: (draft?.blocks ?? []).map((b) => ({
      label: b?.label,
      exercises: (b?.exercises ?? []).map((ex) => ({ name: ex?.name, sets: ex?.sets, reps: ex?.reps, rest_sec: ex?.rest_sec })),
    })),
  })
  return payload ? { ok: true, payload } : { ok: false, error: 'empty_draft' }
}
