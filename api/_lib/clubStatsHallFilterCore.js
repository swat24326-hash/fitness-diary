/**
 * Фильтр статистики по залу — тонкий реэкспорт для api/_lib (паритет с клиентом).
 */
export {
  CLUB_STATS_HALLS,
  CLUB_STATS_HALL_LABELS,
  normalizeClubStatsHall,
  clubStatsHallShowsPzOnlyCards,
  clientMatchesClubStatsHall,
  sliceClubStatsByHall,
  filterTrainingsByClubStatsHall,
  aggregateHallMembershipTypeCensus,
} from '../../src/lib/admin/clubStatsHallFilterCore.js'
