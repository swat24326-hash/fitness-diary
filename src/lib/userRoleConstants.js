/**
 * Значения public.users.role: в схеме — 'admin' | 'trainer', вручную в Table Editor иногда вводят кириллицу.
 * Фильтры Supabase должны учитывать оба варианта.
 */
export const USERS_TRAINER_ROLES = ['trainer', 'тренер']
export const USERS_ADMIN_ROLES = ['admin', 'администратор']
export const USERS_SALES_MANAGER_ROLES = ['sales_manager', 'менеджер по продажам']
