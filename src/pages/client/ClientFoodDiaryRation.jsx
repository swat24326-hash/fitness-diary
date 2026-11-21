import { useState } from 'react'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { ClientNutritionView } from './ClientPlanViews.jsx'
import { ClientFoodDiaryRationImport } from './ClientFoodDiaryRationImport.jsx'
import { useClientPlans } from './useClientPlans.js'
import { clientNutritionDayView } from '../../lib/client/clientNutritionDayCore.js'

/**
 * Вкладка «Рацион» внутри Еды (только ПЗ). Кнопка «В дневник».
 * previewItem — DEV без логина (иначе useClientPlans вечно «Загружаем…»).
 */
export function ClientFoodDiaryRation({
  entryDate,
  busy = false,
  onImportToDiary,
  previewItem = null,
}) {
  const plans = useClientPlans(previewItem ? null : 'nutrition')
  const [dayIndex, setDayIndex] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  /** День рациона на момент «В дневник» — пока окно открыто, Пн–Вс под ним не меняют выбор. */
  const [importDayIndex, setImportDayIndex] = useState(0)

  const item = previewItem || plans.item

  if (!previewItem) {
    if (plans.status === 'loading') {
      return <ClientMeStatus title="Загружаем рацион…" />
    }
    if (plans.status === 'empty') {
      return (
        <ClientMeStatus
          title="Рациона пока нет"
          hint="Когда тренер пришлёт питание в приложение — оно появится здесь. Дневник можно вести и без плана."
        />
      )
    }
    if (plans.status === 'error') {
      return <ClientMeStatus title="Не удалось загрузить" hint={plans.error} />
    }
    if (!item) {
      return <ClientMeStatus title="Загружаем рацион…" />
    }
  }

  if (!item) {
    return (
      <ClientMeStatus
        title="Рациона пока нет"
        hint="Когда тренер пришлёт питание в приложение — оно появится здесь."
      />
    )
  }

  const day = clientNutritionDayView(item.payload, dayIndex)

  return (
    <div className="food-diary-ration">
      {!previewItem && plans.offline ? (
        <p className="client-me-offline" role="status">
          Без сети — последний сохранённый рацион
        </p>
      ) : null}
      {previewItem ? (
        <p className="muted food-diary-ration__hint" role="note">
          Превью рациона — без сервера
        </p>
      ) : null}
      <div className="food-diary-ration__actions">
        <button
          type="button"
          className="btn btn-primary btn-touch food-diary-ration__to-diary"
          disabled={busy || !day.meals?.length}
          onClick={() => {
            setImportDayIndex(dayIndex)
            setImportOpen(true)
          }}
        >
          В дневник
        </button>
        <p className="muted food-diary-ration__hint">
          Можно взять часть приёмов — например только обед; свой ужин не тронется
        </p>
      </div>
      <ClientNutritionView key={item.id} item={item} onDayIndexChange={setDayIndex} />
      {importOpen ? (
        <ClientFoodDiaryRationImport
          planPayload={item.payload}
          dayIndex={importDayIndex}
          busy={busy}
          onCancel={() => setImportOpen(false)}
          onConfirm={({ mode, mealKeys }) => {
            setImportOpen(false)
            onImportToDiary?.({
              planId: item.id,
              planPayload: item.payload,
              dayIndex: importDayIndex,
              mode,
              mealKeys,
              entryDate,
            })
          }}
        />
      ) : null}
    </div>
  )
}
