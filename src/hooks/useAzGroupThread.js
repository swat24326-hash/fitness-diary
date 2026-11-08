import { useStaffGroupThread } from './useStaffGroupThread.js'

/**
 * Лента группы АЗ. api — тот же набор, что у чата клуба (staff / coach / client).
 * side «client» — приложение клиента; у инструктора — «staff».
 */
export function useAzGroupThread(api, key, onMuteChange, cacheKey = '', side = 'staff') {
  return useStaffGroupThread(api, key, onMuteChange, cacheKey, 'az', side)
}
