import { Link } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Compass,
  Tags,
  Ticket,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react'

/**
 * Плитки главной менеджера продаж — группы «день» и «план».
 * @param {{
 *   attentionWidgets?: { hasPnk?: boolean, hasPlanerka?: boolean },
 * }} props
 */
export function SalesHomeTiles({ attentionWidgets = {} }) {
  const hasPnk = Boolean(attentionWidgets.hasPnk)
  const hasPlanerka = Boolean(attentionWidgets.hasPlanerka)

  return (
    <section className="sales-home__tiles" aria-labelledby="sales-home-sections">
      <h2 id="sales-home-sections" className="sales-home__tiles-heading">
        Разделы
      </h2>

      <div className="sales-home__tile-groups">
        <div className="sales-home__tile-group">
          <p className="sales-home__tile-group-title" id="sales-home-group-day">
            День в зале
          </p>
          <div className="sales-home__tile-grid sales-home__tile-grid--day" role="group" aria-labelledby="sales-home-group-day">
            <Link to="/sales/clients" className="sales-home__tile sales-home__tile--accent u-no-decoration">
              <div className="sales-home__tile-icon">
                <Users size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">Клиенты</p>
              <p className="sales-home__tile-lead">Список, фильтры, карты</p>
            </Link>
            <Link
              to="/sales/pnk"
              className={`sales-home__tile sales-home__tile--pnk u-no-decoration${hasPnk ? ' sales-home__tile--echo' : ''}`}
              title={hasPnk ? 'ПНК уже на главной выше' : undefined}
            >
              <div className="sales-home__tile-icon">
                <UserRound size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">ПНК</p>
              <p className="sales-home__tile-lead">Воронка пробных</p>
            </Link>
            <Link to="/sales?tab=clips" className="sales-home__tile u-no-decoration">
              <div className="sales-home__tile-icon">
                <Ticket size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">Заявка</p>
              <p className="sales-home__tile-lead">Клип тренеру</p>
            </Link>
            <Link
              to="/sales/club-tasks"
              className={`sales-home__tile u-no-decoration${hasPlanerka ? ' sales-home__tile--echo' : ''}`}
              title={hasPlanerka ? 'Планёрка уже на главной выше' : undefined}
            >
              <div className="sales-home__tile-icon">
                <ClipboardList size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">Планёрка</p>
              <p className="sales-home__tile-lead">Задания клуба</p>
            </Link>
          </div>
        </div>

        <div className="sales-home__tile-group">
          <p className="sales-home__tile-group-title" id="sales-home-group-plan">
            Отчёты и рост
          </p>
          <div className="sales-home__tile-grid sales-home__tile-grid--plan" role="group" aria-labelledby="sales-home-group-plan">
            <Link to="/sales?tab=report" className="sales-home__tile u-no-decoration">
              <div className="sales-home__tile-icon">
                <CalendarDays size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">Отчёт</p>
              <p className="sales-home__tile-lead">День · оплаты</p>
            </Link>
            <Link to="/sales?tab=stats" className="sales-home__tile u-no-decoration">
              <div className="sales-home__tile-icon">
                <BarChart3 size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">Статистика</p>
              <p className="sales-home__tile-lead">Месяц по залу</p>
            </Link>
            <Link to="/sales?tab=analytics" className="sales-home__tile u-no-decoration">
              <div className="sales-home__tile-icon">
                <TrendingUp size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">Аналитика</p>
              <p className="sales-home__tile-lead">Динамика</p>
            </Link>
            <Link to="/sales?tab=strategy" className="sales-home__tile u-no-decoration">
              <div className="sales-home__tile-icon">
                <Compass size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">Стратегия</p>
              <p className="sales-home__tile-lead">План и закрытия</p>
            </Link>
            <Link to="/sales?tab=price" className="sales-home__tile u-no-decoration">
              <div className="sales-home__tile-icon">
                <Tags size={44} aria-hidden />
              </div>
              <p className="sales-home__tile-title">Прайс</p>
              <p className="sales-home__tile-lead">ПЗ и ТЗ</p>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
