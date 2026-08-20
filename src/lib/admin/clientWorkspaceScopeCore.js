/**
 * Профили загрузки карточки клиента (glance vs full) — без React/IDB.
 */

export const CLIENT_WORKSPACE_SCOPES = Object.freeze(['glance', 'full'])

/**
 * @param {unknown} raw
 * @returns {'glance' | 'full'}
 */
export function normalizeClientWorkspaceScope(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  return s === 'glance' ? 'glance' : 'full'
}

/**
 * Desk ТЗ/АЗ или lite-ПЗ (тренер без планшета) — только контакты + абоны.
 * @param {{ desk_hall?: unknown } | null | undefined} client
 * @param {{ litePz?: boolean }} [opts]
 */
export function clientWorkspaceScopeForClient(client, opts = {}) {
  const hall = String(client?.desk_hall ?? '').trim().toLowerCase()
  if (hall === 'tz' || hall === 'az') return 'glance'
  if (opts.litePz === true) return 'glance'
  return 'full'
}

/**
 * UI карточки без дневника (desk / lite).
 * @param {{ desk_hall?: unknown } | null | undefined} client
 * @param {{ litePz?: boolean }} [opts]
 */
export function clientCardUsesGlanceLocal(client, opts = {}) {
  return clientWorkspaceScopeForClient(client, opts) === 'glance'
}

/**
 * Какие блоки ответа get-client входят в scope.
 * @param {'glance' | 'full'} scope
 */
export function clientWorkspaceIncludes(scope) {
  const s = normalizeClientWorkspaceScope(scope)
  if (s === 'glance') {
    return {
      memberships: true,
      health_card: false,
      body_measurements: false,
      client_weight_entries: false,
      trainings: false,
    }
  }
  return {
    memberships: true,
    health_card: true,
    body_measurements: true,
    client_weight_entries: true,
    trainings: true,
  }
}

/**
 * Минимальный снимок клиента для мгновенного открытия карточки из списка.
 * @param {object | null | undefined} client
 */
export function buildClientCardNavSeed(client) {
  if (!client?.id) return null
  return {
    id: String(client.id),
    name: client.name ?? '',
    phone: client.phone ?? null,
    card_number: client.card_number ?? null,
    club_id: client.club_id ?? null,
    trainer_id: client.trainer_id ?? null,
    desk_hall: client.desk_hall ?? null,
    archived_at: client.archived_at ?? null,
    archive_reason: client.archive_reason ?? null,
    archive_reason_at: client.archive_reason_at ?? null,
    expected_return_on: client.expected_return_on ?? null,
  }
}
