/**
 * Автотесты экрана (PATH_TO_GOAL п. 1b): локально, сервер подменён, прод не трогаем.
 * node scripts/e2e/run-screens.mjs [часть-имени-сценария]
 * Первый раз: npx playwright install chromium. Видимый браузер: E2E_HEADED=1.
 */
import { launchBrowser, startDevServer } from './lib/e2eHarness.mjs'
import * as offlineFinish from './scenarios/trainerOfflineFinish.mjs'
import * as editCompletedDate from './scenarios/trainerEditCompletedDate.mjs'
import * as twoDrafts from './scenarios/trainerTwoDrafts.mjs'
import * as inputAfterOpen from './scenarios/trainerInputAfterOpen.mjs'
import * as clientMe from './scenarios/clientMeApp.mjs'
import * as staffInbox from './scenarios/staffInbox.mjs'
import * as clientChat from './scenarios/clientChat.mjs'
import * as chatVoice from './scenarios/chatVoice.mjs'
import * as clientSparkShake from './scenarios/clientSparkShake.mjs'
import * as trainerSchedule from './scenarios/trainerScheduleCalendar.mjs'
import * as coachApp from './scenarios/coachApp.mjs'
import * as coachSchedule from './scenarios/coachSchedule.mjs'
import * as coachClients from './scenarios/coachClients.mjs'
import * as coachContacts from './scenarios/coachContacts.mjs'
import * as staffDm from './scenarios/staffDm.mjs'
import * as linkedStaff from './scenarios/linkedStaff.mjs'
import * as settingsMenu from './scenarios/trainerSettingsMenu.mjs'
import * as adminSchedule from './scenarios/adminTrainerSchedule.mjs'
import * as clientTrainerPlans from './scenarios/clientTrainerPlans.mjs'
import * as homeworkAuto from './scenarios/homeworkAutoSchedule.mjs'
import * as healthScreening from './scenarios/healthScreening.mjs'
import * as adminHomeworkLibrary from './scenarios/adminHomeworkLibrary.mjs'

const SCENARIOS = [offlineFinish, editCompletedDate, twoDrafts, inputAfterOpen, clientMe, clientSparkShake, staffInbox, clientChat, chatVoice, clientTrainerPlans, homeworkAuto, healthScreening, adminHomeworkLibrary, trainerSchedule, adminSchedule, coachApp, coachSchedule, coachClients, coachContacts, staffDm, linkedStaff, settingsMenu]

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
