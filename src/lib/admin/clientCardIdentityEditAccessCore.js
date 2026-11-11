/**
 * Карандаш у ФИО в шапке пути тренера — только планшетный тренер.
 * Админ / управляющий / менеджер правят контакты в desk-блоке (карандаш → Сохранить/Отменить).
 *
 * @param {{ isTrainer?: boolean, canManageClubClients?: boolean }} p
 */
export function clientCardHeaderAllowsIdentityEdit(p = {}) {
  return Boolean(p.isTrainer) && !p.canManageClubClients
}
