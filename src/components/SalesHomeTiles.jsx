import { Link } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Compass,
  Phone,
  Tags,
  Ticket,
  Gift,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react'

const ICON = 22

/**
 * Плитки главной менеджера — один компактный ряд (иконка + короткая подпись).
 * @param {{
 *   attentionWidgets?: { hasPnk?: boolean, hasPlanerka?: boolean, hasCallToday?: boolean, hasCallTodayQueue?: boolean },
 * }} props
 */
export function SalesHomeTiles({ attentionWidgets = {} }) {
  const hasPnk = Boolean(attentionWidgets.hasPnk)
  const hasPlanerka = Boolean(attentionWidgets.hasPlanerka)
  const hasCallTodayQueue = Boolean(attentionWidgets.hasCallTodayQueue)

  return (
    <section className="sales-home__tiles sales-home__tiles--rail" aria-labelledby="sales-home-sections">
      <h2 id="sales-home-sections" className="sales-home__tiles-heading">
        Разделы
      </h2>

      <div className="sales-home__tile-grid sales-home__tile-grid--rail" role="navigation" aria-label="Разделы менеджера">
        <Link
          to="/sales/clients"
          className="sales-home__tile sales-home__tile--compact sales-home__tile--accent u-no-decoration"
          title="Клиенты — список, фильтры, карты"
        >
          <div className="sales-home__tile-icon">
            <Users size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Клиенты</p>
        </Link>
        <Link
          to="/sales/call-log"
          className={`sales-home__tile sales-home__tile--compact u-no-decoration${hasCallTodayQueue ? ' sales-home__tile--echo' : ''}`}
          title={hasCallTodayQueue ? 'Очередь звонков уже на главной выше' : 'Журнал звонков'}
        >
          <div className="sales-home__tile-icon">
            <Phone size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Звонки</p>
        </Link>
        <Link
          to="/sales/loyalty"
          className="sales-home__tile sales-home__tile--compact u-no-decoration"
          title="Журнал баллов — списания куша ПЗ"
        >
          <div className="sales-home__tile-icon">
            <Gift size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Баллы</p>
        </Link>
        <Link
          to="/sales/pnk"
          className={`sales-home__tile sales-home__tile--compact sales-home__tile--pnk u-no-decoration${hasPnk ? ' sales-home__tile--echo' : ''}`}
          title={hasPnk ? 'ПНК уже на главной выше' : 'ПНК — воронка пробных'}
        >
          <div className="sales-home__tile-icon">
            <UserRound size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">ПНК</p>
        </Link>
        <Link
          to="/sales?tab=clips"
          className="sales-home__tile sales-home__tile--compact u-no-decoration"
          title="Заявка — клип тренеру"
        >
          <div className="sales-home__tile-icon">
            <Ticket size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Заявка</p>
        </Link>
        <Link
          to="/sales/club-tasks"
          className={`sales-home__tile sales-home__tile--compact u-no-decoration${hasPlanerka ? ' sales-home__tile--echo' : ''}`}
          title={hasPlanerka ? 'Планёрка уже на главной выше' : 'Планёрка — задания клуба'}
        >
          <div className="sales-home__tile-icon">
            <ClipboardList size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Планёрка</p>
        </Link>
        <Link
          to="/sales?tab=report"
          className="sales-home__tile sales-home__tile--compact u-no-decoration"
          title="Отчёт — день и оплаты"
        >
          <div className="sales-home__tile-icon">
            <CalendarDays size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Отчёт</p>
        </Link>
        <Link
          to="/sales?tab=stats"
          className="sales-home__tile sales-home__tile--compact u-no-decoration"
          title="Статистика — месяц по залу"
        >
          <div className="sales-home__tile-icon">
            <BarChart3 size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Статистика</p>
        </Link>
        <Link
          to="/sales?tab=analytics"
          className="sales-home__tile sales-home__tile--compact u-no-decoration"
          title="Аналитика — динамика"
        >
          <div className="sales-home__tile-icon">
            <TrendingUp size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Аналитика</p>
        </Link>
        <Link
          to="/sales?tab=strategy"
          className="sales-home__tile sales-home__tile--compact u-no-decoration"
          title="Стратегия — план и закрытия"
        >
          <div className="sales-home__tile-icon">
            <Compass size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Стратегия</p>
        </Link>
        <Link
          to="/sales?tab=price"
          className="sales-home__tile sales-home__tile--compact u-no-decoration"
          title="Прайс — ПЗ и ТЗ"
        >
          <div className="sales-home__tile-icon">
            <Tags size={ICON} aria-hidden />
          </div>
          <p className="sales-home__tile-title">Прайс</p>
        </Link>
      </div>
    </section>
  )
}
