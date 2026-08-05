import { AdminMaxOutreach } from './AdminMaxOutreach'

/** Настройки управляющего: только Max и SMS (не полная Структура). */
export function ClubSupervisorSettings() {
  return (
    <section className="card">
      <header style={{ marginBottom: 12 }}>
        <h1 className="section-title" style={{ margin: 0 }}>
          Настройки
        </h1>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.45 }}>
          Шаблоны Max и SMS вашего клуба. Клубы, тренеры, типы абонементов и остальные справочники задаёт
          администратор сети.
        </p>
      </header>
      <AdminMaxOutreach />
    </section>
  )
}
