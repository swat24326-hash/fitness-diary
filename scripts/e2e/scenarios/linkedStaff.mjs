/**
 * Совмещённые роли: «Тренер Тестов» — он же управляющий (учётки связаны). Клиентка коллеги пишет в «Жалобы и предложения» →
 * у тренера на планшете папка «Жалобы и предложения» с числом → открыл, ответил — ответ от учётки управляющего.
 * Коллеги видят его одним человеком — управляющим; личное от коллеги управляющему приходит на тренерский планшет.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, trainerClubSeed } from '../lib/fixtures.mjs'
import { coachPushUrl } from '../../../src/lib/push/pushTargetUrlCore.js'

export const name = 'совмещённые роли: тренер он же управляющий'

const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const SUP_ID = 'e2e00000-0000-4000-8000-0000000000a5'
const MATE_ID = 'e2e00000-0000-4000-8000-0000000000a6'
const GUEST_ID = 'e2e00000-0000-4000-8000-0000000000b9'
const COMPLAINT = 'В душе нет горячей воды'
const REPLY = 'Спасибо, уже чиним'
const MATE_ASK = 'Можно взять зал 2 в 19:00?'

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function setup() {
  const backend = createFakeBackend(trainerClubSeed())
  const users = backend.state.users
  users[0].linked_user_id = SUP_ID
  users.push(
    { id: SUP_ID, name: 'Тренер Тестов', role: 'supervisor', club_id: CLUB_ID, is_active: true, linked_user_id: TRAINER_ID },
    { id: MATE_ID, name: 'Коллега Игорь', role: 'trainer', club_id: CLUB_ID, is_active: true },
  )
  backend.state.clients.push({ id: GUEST_ID, trainer_id: MATE_ID, club_id: CLUB_ID, name: 'Гостева Мария', phone: '' })
  backend.state.live_user_ids = [SUP_ID, MATE_ID]
  const chat = createFakeChat(backend.state)
  backend.adminData = (req, user) => chat.staff(req, user)
  chat.client(GUEST_ID, { action: 'chat-send', kind: 'supervisor', body: COMPLAINT })
  return { backend, chat }
}

const mate = () => ({ id: MATE_ID, role: 'trainer', club_id: CLUB_ID, name: 'Коллега Игорь' })
const get = (chat, params, user) => chat.staff({ method: 'GET', searchParams: new URLSearchParams({ action: 'chat', ...params }) }, user)

function colleagueSeesOnePerson(c, chat) {
  const folders = get(chat, { view: 'contacts' }, mate()).json.folders
  const names = (id) => (folders.find((f) => f.id === id)?.contacts ?? []).map((p) => p.id)
  c.ok(!names('colleagues').includes(TRAINER_ID), 'коллега: связанного тренера нет в «Коллегах»')
  c.ok(names('admin').includes(SUP_ID), 'коллега: он в «Администрации» — как управляющий')
  c.ok(!folders.some((f) => f.id === 'complaints'), 'коллеге папка «Жалобы и предложения» не положена')
  const sent = chat.staff({ method: 'POST', searchParams: new URLSearchParams({ action: 'chat' }), body: { op: 'dm-send', user_id: SUP_ID, body: MATE_ASK } }, mate())
  c.ok(sent.status === 200 && chat.state.dm.pushes.at(-1)?.to === SUP_ID, 'коллега пишет управляющему')
}

export async function run(browser) {
  const c = createChecks('linked-staff')
  const { backend, chat } = setup()
  colleagueSeesOnePerson(c, chat)
  c.ok(coachPushUrl(`/messages/chat/${GUEST_ID}/supervisor`) === `/coach/chat/${GUEST_ID}/supervisor`, 'push жалобы на телефон тренера — в диалог внутри /coach')

  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.goto(`${ORIGIN}/messages`)
    const folders = page.getByTestId('chat-folders')
    const complaints = folders.getByRole('button', { name: /^Жалобы и предложения/ })
    c.ok(await reaches(complaints), 'планшет тренера: папка «Жалобы и предложения»')
    c.ok(await reaches(complaints.getByLabel('Ждут ответа: 1')), '«Жалобы и предложения»: 1 ждёт ответа')
    const mates = folders.getByRole('button', { name: /^Коллеги/ })
    c.ok(await reaches(mates.getByLabel('Ждут ответа: 1')), 'личное коллеги управляющему — на тренерском планшете')

    await complaints.click()
    const row = page.getByRole('link', { name: /Гостева Мария/ })
    c.ok(await reaches(row), 'в папке — клиентка чужого тренера')
    await screenshot(page, 'linked-staff-complaints')
    await row.click()
    await page.waitForURL(new RegExp(`/messages\\?.*chat=${GUEST_ID}%3Asupervisor`))
    c.ok(await reaches(page.locator('.chat-msg', { hasText: COMPLAINT })), 'жалоба в ленте')
    await page.getByTestId('chat-input').fill(REPLY)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: REPLY })), 'ответ в ленте')
    const saved = chat.state.messages.at(-1)
    c.ok(saved?.author_user_id === SUP_ID && saved?.body === REPLY, 'ответ ушёл от учётки управляющего')

    await page.goto(`${ORIGIN}/messages/dm/${MATE_ID}`)
    c.ok(await reaches(page.locator('.chat-msg', { hasText: MATE_ASK })), 'тренер видит личное коллеги управляющему')
    await screenshot(page, 'linked-staff-dm')
    c.ok(pageErrors.length === 0, `планшет: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'linked-staff-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
