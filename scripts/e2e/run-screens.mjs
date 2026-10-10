/**
 * Автотесты экрана (PATH_TO_GOAL п. 1b): локально, сервер подменён, прод не трогаем.
 * node scripts/e2e/run-screens.mjs [часть-имени-сценария]
 * Первый раз: npx playwright install chromium. Видимый браузер: E2E_HEADED=1.
 */
import { launchBrowser, startDevServer } from './lib/e2eHarness.mjs'
import * as offlineFinish from './scenarios/trainerOfflineFinish.mjs'
import * as editCompletedDate from './scenarios/trainerEditCompletedDate.mjs'
import * as twoDrafts from './scenarios/trainerTwoDrafts.mjs'
import * as clientMe from './scenarios/clientMeApp.mjs'
import * as staffInbox from './scenarios/staffInbox.mjs'
import * as clientChat from './scenarios/clientChat.mjs'
import * as trainerSchedule from './scenarios/trainerScheduleCalendar.mjs'
import * as coachApp from './scenarios/coachApp.mjs'

const SCENARIOS = [offlineFinish, editCompletedDate, twoDrafts, clientMe, staffInbox, clientChat, trainerSchedule, coachApp]

const filter = process.argv[2]
const picked = filter ? SCENARIOS.filter((s) => s.name.includes(filter)) : SCENARIOS

let browser
try {
  browser = await launchBrowser()
} catch (e) {
  console.error(`Chromium для Playwright не установлен: npx playwright install chromium\n${e.message.split('\n')[0]}`)
  process.exit(1)
}
const server = await startDevServer()
const failures = []
try {
  for (const s of picked) {
    console.log(`\n▶ ${s.name}`)
    failures.push(...(await s.run(browser)))
  }
} finally {
  await browser.close()
  server.stop()
}

if (failures.length) {
  console.error(`\n✗ автотесты экрана: ${failures.length} провал(ов)\n- ${failures.join('\n- ')}`)
  console.error('Скриншоты: qa-screenshots/e2e/')
  process.exit(1)
}
console.log(`\n✓ автотесты экрана: ${picked.length} сценари(й/я) прошли`)
