/**
 * «Он же тренер»: управляющий, который сам ведёт зал под тренерской учёткой. После связи сообщения ему
 * приходят на планшет и телефон тренера, жалобы клиентов — в папку «Жалобы и предложения», коллеги видят одного человека.
 * @param {{ supervisor: object, links: ReturnType<typeof import('./useStaffLinks.js').useStaffLinks> }} props
 */
export function SupervisorTrainerLinkCell({ supervisor, links }) {
  if (!links.available) return <span className="muted">—</span>
  const id = String(supervisor.id)
  const club = String(supervisor.club_id ?? '')
  const options = links.trainers.filter((t) => String(t.club_id ?? '') === club)
  const value = links.links.get(id) ?? ''
  return (
    <select
      className="select"
      value={value}
      disabled={links.savingId === id || supervisor.is_active === false}
      onChange={(e) => void links.save(id, e.target.value)}
      aria-label={`Он же тренер: ${supervisor.name}`}
      title="Если управляющий сам ведёт зал под тренерской учёткой — сообщения ему как управляющему придут и на планшет тренера"
    >
      <option value="">— нет —</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
