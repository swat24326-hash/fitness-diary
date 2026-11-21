import { ClientFoodDiaryHabits } from './ClientFoodDiaryHabits.jsx'
import { ClientFoodDiaryTargets } from './ClientFoodDiaryTargets.jsx'

/**
 * «Ещё»: свои цели КБЖУ + копия дня.
 */
export function ClientFoodDiaryMore({
  entryDate,
  asOf,
  busy = false,
  localOnly = false,
  personalTargets = null,
  planOverrides = false,
  onSaveTargets,
  onCopyYesterday,
  onCopyMeal,
}) {
  return (
    <div className="food-diary-more">
      <ClientFoodDiaryTargets
        personal={personalTargets}
        planOverrides={planOverrides}
        busy={busy}
        localOnly={localOnly}
        onSave={onSaveTargets}
      />
      <section className="card food-diary-more__card">
        <h2 className="food-diary-more__title">Быстрые действия</h2>
        <p className="muted food-diary-more__lead">
          Скопировать вчерашний день или один приём на {entryDate}.
        </p>
        <ClientFoodDiaryHabits
          frequent={[]}
          entryDate={entryDate}
          asOf={asOf}
          busy={busy}
          onQuickAdd={() => {}}
          onCopyYesterday={onCopyYesterday}
          onCopyMeal={onCopyMeal}
          copyOnly
        />
      </section>
    </div>
  )
}
