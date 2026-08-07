/**
 * Уникальность карты в рамках клуба (не сети).
 * node scripts/verify-client-card-unique.mjs
 */
import {
  assertClubCardAvailableForCreate,
  cardConflictCreateError,
  findClubClientByCard,
  normalizeSalesCardNumber,
} from '../src/lib/admin/salesClientMatchCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(normalizeSalesCardNumber(' №Р247 ') === 'р247', 'normalize card')

const clients = [
  { id: 'a', club_id: 'club-1', name: 'Иванов', card_number: 'р247', lifecycle: 'active' },
  { id: 'b', club_id: 'club-2', name: 'Петров', card_number: 'р247', lifecycle: 'active' },
  { id: 'c', club_id: 'club-1', name: 'Сидоров', card_number: '99', lifecycle: 'archived', archived_at: '2026-01-01' },
]

ok(findClubClientByCard(clients, 'club-1', 'Р247')?.id === 'a', 'находит в своём клубе')
ok(findClubClientByCard(clients, 'club-2', 'р247')?.id === 'b', 'тот же номер в другом клубе — другой клиент')
ok(findClubClientByCard(clients, 'club-1', '999') == null, 'нет карты — null')
ok(findClubClientByCard(clients, 'club-1', '') == null, 'пустая карта — null')
ok(findClubClientByCard(clients, 'club-1', '99')?.id === 'c', 'архив тоже держит карту в клубе')

{
  const free = assertClubCardAvailableForCreate(clients, 'club-1', 'новый')
  ok(free.ok === true, 'свободная карта — ok')
  const empty = assertClubCardAvailableForCreate(clients, 'club-1', '')
  ok(empty.ok === true, 'без карты — ok')
  const otherClub = assertClubCardAvailableForCreate(clients, 'club-1', 'р247')
  ok(otherClub.ok === false && /этом клубе/i.test(otherClub.error), 'занято в клубе — блок')
  ok(/Иванов/.test(otherClub.error), 'в тексте ФИО')
  const okOther = assertClubCardAvailableForCreate(clients, 'club-3', 'р247')
  ok(okOther.ok === true, 'другой клуб — тот же номер свободен')
  const selfEdit = assertClubCardAvailableForCreate(clients, 'club-1', 'р247', {
    excludeClientId: 'a',
  })
  ok(selfEdit.ok === true, 'правка своей карты — ok')
  const steal = assertClubCardAvailableForCreate(clients, 'club-1', 'р247', {
    excludeClientId: 'c',
  })
  ok(steal.ok === false && /существующую/i.test(steal.error), 'правка на чужую карту — блок')
  const arch = assertClubCardAvailableForCreate(clients, 'club-1', '99')
  ok(arch.ok === false && /архиве/i.test(arch.error), 'занято архивом — в тексте')
}

ok(
  /этом клубе/i.test(cardConflictCreateError(clients[0], 'р247')),
  'текст предупреждения про клуб',
)

console.log('verify-client-card-unique: all passed')
