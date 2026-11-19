/** Статистика по типу абонемента — одна правда с клиентом. */
export {
  MEMBERSHIP_TYPE_UNLABELED,
  trainingCountsForMembershipTypeStats,
  buildMembershipTypeById,
  membershipTypeKeyCountsInVolumeStats,
  buildMembershipStatsIndex,
  resolveTrainingMembershipTypeKey,
  trainingCountsInVolumeStats,
  filterTrainingsForVolumeStats,
  filterCompletedTrainingsForVolumeStats,
  aggregateMembershipTypeStats,
  membershipCardTypeLabelForTraining,
} from '../../src/lib/admin/membershipTypeStatsAgg.js'
