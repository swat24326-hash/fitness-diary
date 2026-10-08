/**
 * «Входящие» клиентов и команды: черновик рассылки, ответы на опрос, итоги, доступ админ/управляющий,
 * выбор получателей по залу и по ролям сотрудников, белый список для получателя.
 * node scripts/verify-inbox.mjs
 */
import {
  inboxExpiresAtIso,
  isInboxCampaignOpen,
  normalizeInboxCampaignDraft,
} from '../src/lib/inbox/inboxCampaignCore.js'
import { inboxCampaignStats, normalizeInboxAnswers, summarizeInboxResults } from '../src/lib/inbox/inboxAnswersCore.js'
import {
  canCloseInboxCampaign,
  canViewInboxCampaign,
  inboxDeliveryClubFilter,
  inboxStaffRoleOf,
  inboxStaffRoleValues,
  isInboxStaffRecipient,
  pickInboxRecipients,
  pickInboxStaffRecipients,
  resolveInboxClubScope,
} from '../src/lib/inbox/inboxAudienceCore.js'
import { buildClientInboxItem, countInboxAttention } from '../src/lib/inbox/inboxClientViewCore.js'
import {
  changeInboxQuestionType,
  emptyInboxDraft,
  inboxAudienceLineRu,
  inboxHallsLabelRu,
  inboxOptionsFromText,
  inboxRecipientsLabelRu,
  inboxStaffRoleChoices,
  inboxStatsLineRu,
  inboxStatusLabelRu,
  inboxTriggerReachRu,
} from '../src/lib/inbox/inboxAdminUiCore.js'
import { isMilestoneTrainingRow, nthTrainingDate, pickMilestoneCampaigns } from '../src/lib/inbox/inboxTriggerCore.js'
import { formatLoyaltyJournalRow, mergeLoyaltyJournalSources } from '../src/lib/loyalty/loyaltyJournalUiCore.js'
import {
  firstMissingInboxAnswer,
  inboxBadgeText,
  inboxItemMetaRu,
  inboxPointsLineRu,
  inboxThanksRu,
  toggleInboxMultiOption,
} from '../src/lib/client/clientInboxUiCore.js'
import {
  canRedeemSurveyPoints,
  canViewSurveyPoints,
  clipSurveyPointsComment,
  computeSurveyPoints,
  decideSurveyPointsRedeem,
  surveyPointsHistory,
} from '../src/lib/inbox/inboxPointsCore.js'
import { buildInboxPushPayload } from '../api/_lib/inbox/inboxPushJob.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-10-08T12:00:00.000Z'

// --- Черновик ---
ok(normalizeInboxCampaignDraft({}).error === 'Выберите: объявление или опрос', 'без вида — ошибка')
ok(normalizeInboxCampaignDraft({ kind: 'notice', title: '  ' }).error === 'Впишите заголовок', 'пустой заголовок')
ok(normalizeInboxCampaignDraft({ kind: 'notice', title: 'Т', club_ids: [C1] }).error === 'Впишите текст объявления', 'объявление без текста')
const notice = normalizeInboxCampaignDraft({
  kind: 'notice',
  title: ' Зал закрыт 1 января ',
  body: 'Ждём 2-го',
  club_ids: [C1, C1, 'bad'],
  halls: ['ТЗ', 'pz', 'x'],
  questions: [{ type: 'text', text: 'лишнее' }],
  reward_points: 50,
})
ok(notice.ok && notice.campaign.title === 'Зал закрыт 1 января', 'объявление: заголовок обрезан по краям')
ok(notice.campaign.club_ids.join() === C1, 'клубы: дубли и мусор отброшены')
ok(notice.campaign.halls.join() === 'tz,pz', 'залы: русские коды → канон, мусор отброшен')
ok(notice.campaign.questions.length === 0 && notice.campaign.reward_points === 0, 'у объявления нет вопросов и баллов')
ok(notice.campaign.expires_in_days === 14, 'срок по умолчанию 14 дней')
ok(normalizeInboxCampaignDraft({ kind: 'notice', title: 'Т', body: 'x' }).error === 'Выберите клуб', 'без клуба нельзя')
ok(normalizeInboxCampaignDraft({ kind: 'survey', title: 'Т', club_ids: [C1] }).error === 'Добавьте хотя бы один вопрос', 'опрос без вопросов')
ok(
  normalizeInboxCampaignDraft({ kind: 'survey', title: 'Т', club_ids: [C1], questions: [{ type: 'single', text: 'Что?', options: ['a', 'a'] }] }).error ===
    'Вопрос 1: нужно минимум 2 варианта',
  'варианты: дубли схлопнуты, меньше двух — ошибка',
)
ok(
  normalizeInboxCampaignDraft({ kind: 'survey', title: 'Т', club_ids: [C1], questions: [{ type: 'rating', text: '' }] }).error ===
    'Вопрос 1: впишите текст',
  'вопрос без текста',
)
ok(
  normalizeInboxCampaignDraft({ kind: 'survey', title: 'Т', club_ids: [C1], questions: [{ type: 'rating', text: 'a' }], reward_points: -5 }).error ===
    'Баллы — от 0 до 10000',
  'отрицательные баллы нельзя',
)
const survey = normalizeInboxCampaignDraft({
  kind: 'survey',
  title: 'Как вам клуб?',
  club_ids: [C1],
  reward_points: '50',
  expires_in_days: 999,
  questions: [
    { id: 'evil', type: 'rating', text: 'Оценка тренера' },
    { type: 'single', text: 'Чаще ходите', options: ['Утром', 'Вечером'] },
    { type: 'multi', text: 'Что улучшить', options: ['Душ', 'Музыка', 'Парковка'] },
    { type: 'text', text: 'Пожелания', required: false },
  ],
})
ok(survey.ok && survey.campaign.questions.map((q) => q.id).join() === 'q1,q2,q3,q4', 'id вопросов выдаёт сервер по порядку')
ok(survey.campaign.reward_points === 50 && survey.campaign.expires_in_days === 60, 'баллы числом, срок не больше 60 дней')
ok(survey.campaign.questions[3].required === false && survey.campaign.questions[0].required === true, 'необязательный вопрос помечен')
ok(inboxExpiresAtIso(NOW, 14) === '2026-10-22T12:00:00.000Z', 'срок = отправка + N дней')
ok(isInboxCampaignOpen({ expires_at: '2026-10-22T12:00:00.000Z' }, NOW), 'опрос открыт до срока')
ok(!isInboxCampaignOpen({ expires_at: '2026-10-22T12:00:00.000Z', closed_at: NOW }, NOW), 'закрыт вручную — ответы не принимаем')
ok(!isInboxCampaignOpen({ expires_at: '2026-10-01T00:00:00.000Z' }, NOW), 'срок вышел — закрыт')

// --- Ответы ---
const qs = survey.campaign.questions
ok(normalizeInboxAnswers(qs, {}).error === 'Ответьте на вопрос 1', 'обязательный вопрос пропущен')
ok(normalizeInboxAnswers(qs, { q1: 7 }).error?.startsWith('Вопрос 1: ответ не подходит'), 'оценка вне 1–5')
ok(normalizeInboxAnswers(qs, { q1: 5, q2: 2, q3: [0] }).error?.startsWith('Вопрос 2'), 'индекс варианта вне списка')
ok(normalizeInboxAnswers(qs, { q1: 5, q2: 1, q3: [] }).error === 'Ответьте на вопрос 3', 'пустой выбор в обязательном multi')
const a1 = normalizeInboxAnswers(qs, { q1: 5, q2: 1, q3: [2, 0, 2], q4: '  Спасибо  ', extra: 'x' })
ok(a1.ok && a1.answers.q3.join() === '0,2' && a1.answers.q4 === 'Спасибо', 'multi без дублей и по порядку, текст обрезан')
ok(!('extra' in a1.answers), 'лишние ключи не сохраняем')
const a2 = normalizeInboxAnswers(qs, { q1: 3, q2: 0, q3: [1], q4: '' })
ok(a2.ok && !('q4' in a2.answers), 'необязательный пустой — без ключа')

// --- Итоги ---
const deliveries = [
  { answered_at: '2026-10-08T10:00:00Z', read_at: 'x', answers: a1.answers, client_name: 'Анна' },
  { answered_at: '2026-10-08T11:00:00Z', read_at: 'x', answers: a2.answers, client_name: 'Олег' },
  { read_at: 'x' },
  {},
]
const res = summarizeInboxResults(qs, deliveries)
ok(res[0].average === 4 && res[0].distribution.join() === '0,0,1,0,1' && res[0].count === 2, 'оценка: среднее и распределение')
ok(res[1].options.map((o) => o.count).join() === '1,1', 'один вариант: счёт по вариантам')
ok(res[2].options.map((o) => o.count).join() === '1,1,1', 'несколько вариантов: каждый отмеченный считается')
ok(res[3].texts.length === 1 && res[3].texts[0].client_name === 'Анна', 'свои ответы: только непустые, с именем')
const st = inboxCampaignStats(deliveries)
ok(st.recipients === 4 && st.read === 3 && st.answered === 2, 'охват: получили / прочитали / ответили')

// --- Доступ ---
const admin = { isAdmin: true }
const sup = { isSupervisor: true, profile: { club_id: C1 } }
const trainer = { isTrainer: true, profile: { club_id: C1 } }
ok(resolveInboxClubScope(admin, [C1, C2]).clubIds?.length === 2, 'админ — любые клубы')
ok(resolveInboxClubScope(sup, []).clubIds?.join() === C1, 'управляющий без выбора — свой клуб')
ok(resolveInboxClubScope(sup, [C1, C2]).status === 403, 'управляющий в чужой клуб — 403')
ok(resolveInboxClubScope({ isSupervisor: true, profile: {} }, [C1]).status === 403, 'управляющий без клуба — 403')
ok(resolveInboxClubScope(trainer, [C1]).status === 403, 'тренер рассылать не может')
ok(resolveInboxClubScope({}, [C1]).status === 403, 'пустая роль — нет доступа')
const net = { club_ids: [C1, C2] }
ok(canViewInboxCampaign(sup, net) && !canViewInboxCampaign(sup, { club_ids: [C2] }), 'управляющий видит рассылки своего клуба')
ok(!canCloseInboxCampaign(sup, net) && canCloseInboxCampaign(sup, { club_ids: [C1] }), 'сетевую рассылку закрывает только админ')
ok(canCloseInboxCampaign(admin, net) && !canViewInboxCampaign(trainer, net), 'админ закрывает любую; тренер не видит')
ok(inboxDeliveryClubFilter(sup) === C1 && inboxDeliveryClubFilter(admin) === null, 'итоги управляющего — только его клуб')

// --- Получатели ---
const AS_OF = '2026-10-08'
const clients = [
  { id: 'pz', club_id: C1, trainer_id: 't1' },
  { id: 'tz', club_id: C1, desk_hall: 'tz' },
  { id: 'closed', club_id: C1, trainer_id: 't1' },
  { id: 'arch', club_id: C1, archived_at: '2026-01-01' },
  { id: 'noapp', club_id: C1, trainer_id: 't1' },
]
const live = { start_date: '2026-09-01', end_date: '2026-12-01', total_trainings: 10, used_trainings: 2 }
const membershipsByClient = new Map([
  ['pz', [{ ...live, hall: 'pz' }]],
  ['tz', [{ ...live, hall: 'tz', total_trainings: 0 }]],
  ['closed', [{ ...live, hall: 'pz' }]],
  ['arch', [{ ...live, hall: 'pz' }]],
  ['noapp', [{ ...live, hall: 'pz' }]],
])
const lifecycleRows = [{ client_id: 'closed', hall: 'pz', closed_at: '2026-10-01T00:00:00Z' }]
const liveClientIds = new Set(['pz', 'tz', 'closed', 'arch'])
const all = pickInboxRecipients({ clients, membershipsByClient, lifecycleRows, liveClientIds, halls: [], asOf: AS_OF })
ok(all.matched === 4 && all.recipients.map((r) => r.client_id).join() === 'pz,tz,closed', 'все залы: без архива; дойдёт только со входом')
const pzOnly = pickInboxRecipients({ clients, membershipsByClient, lifecycleRows, liveClientIds, halls: ['pz'], asOf: AS_OF })
ok(pzOnly.matched === 2 && pzOnly.recipients.map((r) => r.client_id).join() === 'pz', 'ПЗ: закрытое направление и ТЗ не входят')
const tzOnly = pickInboxRecipients({ clients, membershipsByClient, lifecycleRows, liveClientIds, halls: ['tz'], asOf: AS_OF })
ok(tzOnly.recipients.length === 1 && tzOnly.recipients[0].club_id === C1, 'ТЗ: безлимит по сроку — открыт')
const expired = pickInboxRecipients({
  clients: [{ id: 'old', club_id: C1, trainer_id: 't1' }],
  membershipsByClient: new Map([['old', [{ ...live, hall: 'pz', end_date: '2026-09-30' }]]]),
  lifecycleRows: [],
  liveClientIds: new Set(['old']),
  halls: ['pz'],
  asOf: AS_OF,
})
ok(expired.matched === 0, 'ПЗ: абонемент закончился — направление не открыто')

// --- Вид для клиента ---
const campaign = {
  id: 'camp',
  kind: 'survey',
  title: 'Как вам клуб?',
  body: 'Пара вопросов',
  questions: qs,
  club_ids: [C1],
  created_by: 'admin-user',
  expires_at: '2026-10-22T12:00:00.000Z',
}
const fresh = { id: 'd1', campaign_id: 'camp', client_id: 'pz', club_id: C1, created_at: NOW, reward_points: 50 }
const item = buildClientInboxItem(fresh, campaign, NOW)
ok(item.status === 'new' && item.open && item.attention && item.reward_points === 50, 'новый опрос: требует внимания, баллы видны')
ok(!('body' in item) && !('questions' in item), 'в списке — без текста и вопросов')
const full = buildClientInboxItem({ ...fresh, read_at: NOW }, campaign, NOW, true)
ok(full.questions.length === 4 && full.answers === null && full.attention, 'прочитан, но не пройден — точка горит')
const keys = new Set(Object.keys(full))
ok(!['club_id', 'club_ids', 'client_id', 'campaign_id', 'created_by'].some((k) => keys.has(k)), 'id клуба, клиента и автора не уходят')
const done = buildClientInboxItem({ ...fresh, read_at: NOW, answered_at: NOW, answers: a1.answers }, campaign, NOW, true)
ok(done.status === 'answered' && done.answers.q1 === 5 && !done.attention, 'пройден — свои ответы, точки нет')
const closedItem = buildClientInboxItem({ ...fresh, read_at: NOW }, { ...campaign, closed_at: NOW }, NOW)
ok(!closedItem.open && !closedItem.attention, 'закрытый опрос не зовёт пройти')
const noticeItem = buildClientInboxItem({ ...fresh, reward_points: 0 }, { ...campaign, kind: 'notice' }, NOW)
ok(noticeItem.open && noticeItem.reward_points === 0 && noticeItem.attention, 'объявление: непрочитанное зовёт')
ok(
  countInboxAttention(
    [
      { delivery: fresh, campaign },
      { delivery: { ...fresh, read_at: NOW }, campaign: { ...campaign, kind: 'notice' } },
      { delivery: { ...fresh, read_at: NOW, answered_at: NOW }, campaign },
    ],
    NOW,
  ) === 1,
  'точка на конверте: только непрочитанное и непройденное',
)

// --- Подписи экранов ---
ok(inboxItemMetaRu({ kind: 'survey', open: true, reward_points: 50 }) === 'Опрос · +50 баллов', 'клиент: опрос с баллами')
ok(inboxItemMetaRu({ kind: 'survey', open: false }) === 'Опрос закрыт' && inboxItemMetaRu({ kind: 'notice' }) === 'Объявление', 'клиент: закрыт / объявление')
ok(inboxItemMetaRu({ kind: 'survey', status: 'answered', open: false }) === 'Опрос пройден', 'клиент: пройденный — не «закрыт»')
ok(inboxBadgeText(0) === '' && inboxBadgeText(3) === '3' && inboxBadgeText(12) === '9+', 'точка: пусто / число / 9+')
ok(firstMissingInboxAnswer(qs, { q1: 5, q2: 0, q3: [] }) === 3 && firstMissingInboxAnswer(qs, a1.answers) === 0, 'форма: первый пропущенный обязательный')
ok(firstMissingInboxAnswer(qs, { q1: 5, q2: 0, q3: [1], q4: '  ' }) === 0, 'форма: необязательный пустой не мешает')
ok(toggleInboxMultiOption([2], 0).join() === '0,2' && toggleInboxMultiOption([0, 2], 2).join() === '0', 'форма: переключение вариантов')
ok(inboxThanksRu({ reward_points: 1 }).includes('1 балл ') && inboxThanksRu({}) === 'Спасибо, ответ отправлен!', 'спасибо: с баллами и без')
ok(inboxAudienceLineRu({ matched: 420, recipients: 37 }) === 'Дойдёт до 37 из 420 — у остальных нет приложения', 'охват: часть без приложения')
ok(inboxAudienceLineRu({ matched: 5, recipients: 0 }).includes('отправлять некому'), 'охват: никого с приложением')
ok(inboxAudienceLineRu({ matched: 3, recipients: 3 }) === 'Дойдёт до всех: 3', 'охват: все с приложением')
ok(inboxStatsLineRu('survey', { recipients: 40, read: 20, answered: 10 }).endsWith('10 ответили (25%)'), 'итоги: процент ответивших')
ok(inboxStatsLineRu('notice', { recipients: 0, read: 0, answered: 0 }) === '0 получили · 0 прочитали', 'итоги объявления без деления на ноль')
ok(inboxHallsLabelRu([]) === 'Все залы' && inboxHallsLabelRu(['pz', 'az']) === 'ПЗ, АЗ', 'подпись залов')
ok(changeInboxQuestionType({ type: 'single', text: 'x', options: ['a', 'b'] }, 'rating').options.join() === 'a,b', 'смена типа не теряет варианты')
const fromForm = normalizeInboxCampaignDraft({
  ...emptyInboxDraft('survey', [C1]),
  title: 'Т',
  questions: [{ type: 'single', text: 'Q', options: inboxOptionsFromText('Утром\n\n Вечером \n') }],
})
ok(fromForm.ok && fromForm.campaign.questions[0].options.join() === 'Утром,Вечером', 'варианты из textarea: пустые строки отброшены')

// --- Push ---
const push = buildInboxPushPayload({ id: 'camp', kind: 'survey', title: 'Как вам клуб?', reward_points: 50 }, 'FIT-CITY')
ok(push.body === 'Опрос: Как вам клуб? · +50 баллов' && push.url === '/me/inbox' && push.tag === 'inbox-camp', 'push: текст, ссылка, тег')
ok(buildInboxPushPayload({ id: 'n', kind: 'notice', title: 'Закрыты 1.01' }, '').title === 'Сообщение от клуба', 'push: без названия клуба')

const staffPush = buildInboxPushPayload({ id: 's', kind: 'survey', audience: 'staff', title: 'Удобно ли расписание?', reward_points: 50 }, 'FIT-CITY')
ok(staffPush.url === '/messages' && !staffPush.body.includes('баллов'), 'push команде: ведёт в /messages, без баллов')

// --- Сотрудники ---
ok(
  normalizeInboxCampaignDraft({ kind: 'notice', audience: 'staff', title: 'Т', body: 'Б', club_ids: [C1] }).error ===
    'Отметьте, кому из сотрудников отправить',
  'команда без ролей — ошибка',
)
ok(normalizeInboxCampaignDraft({ kind: 'notice', audience: 'vip', title: 'Т', body: 'Б', club_ids: [C1] }).ok === false, 'чужая аудитория — ошибка')
ok(normalizeInboxCampaignDraft({ kind: 'notice', title: 'Т', body: 'Б', club_ids: [C1] }).campaign.audience === 'clients', 'без аудитории — клиенты (старые формы)')
const staffDraft = normalizeInboxCampaignDraft({
  kind: 'survey',
  audience: 'staff',
  staff_roles: ['sales', 'admin', 'trainer', 'trainer'],
  title: 'Как вам смены?',
  questions: [{ type: 'rating', text: 'Оценка' }],
  reward_points: 100,
  halls: ['pz'],
  club_ids: [C1],
})
ok(staffDraft.ok && staffDraft.campaign.staff_roles.join() === 'trainer,sales', 'роли: только известные, без дублей, по порядку')
ok(staffDraft.campaign.reward_points === 0 && staffDraft.campaign.halls.length === 0, 'команде: без баллов и фильтра зала')
ok(
  inboxStaffRoleOf('Тренер') === 'trainer' &&
    inboxStaffRoleOf('sales_manager') === 'sales' &&
    inboxStaffRoleOf('управляющий') === 'supervisor' &&
    inboxStaffRoleOf('admin') === null &&
    inboxStaffRoleOf('') === null,
  'роль users.role → ключ (кириллица ок, админ и пустая — нет)',
)
ok(inboxStaffRoleValues(['sales']).includes('менеджер по продажам') && !inboxStaffRoleValues(['sales']).includes('trainer'), 'фильтр запроса по ролям')
const staffPick = pickInboxStaffRecipients({
  users: [
    { id: 'me', club_id: C1, role: 'supervisor' },
    { id: 't1', club_id: C1, role: 'trainer' },
    { id: 't2', club_id: C1, role: 'тренер', is_active: false },
    { id: 's1', club_id: C1, role: 'sales_manager' },
    { id: 'x', club_id: C1, role: '' },
  ],
  roles: ['trainer', 'supervisor'],
  excludeUserId: 'me',
})
ok(staffPick.recipients.map((r) => r.user_id).join() === 't1' && staffPick.matched === 1, 'команда: без отправителя, отключённых, чужих ролей и пустой роли')
ok(
  isInboxStaffRecipient(trainer) && isInboxStaffRecipient(sup) && isInboxStaffRecipient({ isSalesManager: true }),
  'ящик сотрудника: тренер, управляющий, менеджер',
)
ok(!isInboxStaffRecipient(admin) && !isInboxStaffRecipient({}), 'ящик сотрудника: не админ и не пустая роль')
ok(inboxStaffRoleChoices(true).join() === 'trainer,sales' && inboxStaffRoleChoices(false).length === 3, 'управляющий не пишет управляющим')
ok(
  inboxRecipientsLabelRu({ audience: 'staff', staff_roles: ['trainer', 'sales'] }) === 'Сотрудники · тренеры, менеджеры продаж' &&
    inboxRecipientsLabelRu({ halls: ['pz'] }) === 'Клиенты · ПЗ',
  'подпись получателей в списке',
)
ok(
  inboxAudienceLineRu({ matched: 4, recipients: 4 }, 'staff') === 'Получат сотрудников: 4' &&
    inboxAudienceLineRu({ matched: 0, recipients: 0 }, 'staff').startsWith('В выбранных клубах нет'),
  'охват команды',
)

// --- Баллы за опросы ---
const pts = computeSurveyPoints(
  [
    { reward_points: 50, reward_granted_at: NOW },
    { reward_points: 30, reward_granted_at: null },
    { reward_points: 20, reward_granted_at: NOW },
  ],
  [{ points: 40 }],
)
ok(pts.earned === 70 && pts.redeemed === 40 && pts.balance === 30, 'баланс: только начисленные минус списания')
ok(computeSurveyPoints([], [{ points: 5 }]).balance === 0, 'баланс не уходит в минус')
ok(decideSurveyPointsRedeem({ balance: 30, points: 30, expected_balance: 30 }).ok, 'списание всего баланса')
ok(decideSurveyPointsRedeem({ balance: 30, points: 31, expected_balance: 30 }).status === 409, 'больше баланса — отказ')
ok(decideSurveyPointsRedeem({ balance: 30, points: 0, expected_balance: 30 }).status === 400, 'ноль — отказ')
ok(decideSurveyPointsRedeem({ balance: 30, points: 'abc', expected_balance: 30 }).status === 400, 'не число — отказ')
ok(decideSurveyPointsRedeem({ balance: 30, points: 10, expected_balance: 40 }).status === 409, 'устаревший баланс — отказ')
ok(decideSurveyPointsRedeem({ balance: 30, points: 7.9, expected_balance: 30 }).points === 7, 'дробь отбрасывается')
const own = { profile: { club_id: C1 } }
ok(canViewSurveyPoints({ isAdmin: true }, C2) && canRedeemSurveyPoints({ isAdmin: true }, C2), 'админ: любой клуб')
ok(canRedeemSurveyPoints({ ...own, isSalesManager: true }, C1), 'менеджер продаж списывает в своём клубе')
ok(!canViewSurveyPoints({ ...own, isSalesManager: true }, C2), 'менеджер продаж: чужой клуб закрыт')
ok(canViewSurveyPoints({ ...own, isSupervisor: true }, C1) && !canRedeemSurveyPoints({ ...own, isSupervisor: true }, C1), 'управляющий видит, но не списывает')
ok(!canViewSurveyPoints({ ...own, isTrainer: true }, C1), 'тренер баллы не видит')
ok(!canViewSurveyPoints({ isSalesManager: true }, ''), 'менеджер без клуба — нет доступа')
const hist = surveyPointsHistory(
  [{ reward_points: 50, reward_granted_at: '2026-10-01T10:00:00Z', title: 'Как вам клуб?' }],
  [{ points: 20, created_at: '2026-10-05T10:00:00Z', comment: '' }],
)
ok(hist.length === 2 && hist[0].delta === -20 && hist[0].label === 'Списание на стойке' && hist[1].label === 'Как вам клуб?', 'лента: новые сверху')
ok(clipSurveyPointsComment('x'.repeat(300)).length === 200, 'комментарий обрезается')
ok(inboxPointsLineRu(0) === '' && inboxPointsLineRu(21).startsWith('21 балл '), 'плашка баланса у клиента')
ok(inboxThanksRu({ reward_points: 50 }).includes('уже на вашем счёте'), 'спасибо: баллы уже начислены')

// --- Общий журнал баллов ---
const journal = mergeLoyaltyJournalSources(
  [{ id: 'l1', client_id: C1, at: '2026-10-02T10:00:00Z', points: 300, comment: 'смузи' }],
  [{ id: 's1', client_id: C2, created_at: '2026-10-05T10:00:00Z', points: 20, comment: '' }],
)
ok(journal.length === 2 && journal[0].source === 'survey' && journal[0].at === '2026-10-05T10:00:00Z' && journal[1].source === 'pz', 'журнал: опросы и ПЗ в одной ленте, новые сверху')
ok(mergeLoyaltyJournalSources(Array.from({ length: 5 }, (_, i) => ({ id: String(i), at: NOW })), [], 3).length === 3, 'журнал: лимит строк')
ok(formatLoyaltyJournalRow(journal[0]).source === 'survey' && formatLoyaltyJournalRow({}).source === 'pz', 'журнал: источник строки')

// --- Автоопрос после 10-й тренировки ---
const tr = (date, extra = {}) => ({ date, status: 'completed', type: 'Силовая', ...extra })
const nine = Array.from({ length: 9 }, (_, i) => tr(`2026-10-0${i + 1}`))
const ten = [...nine, tr('2026-10-10')]
ok(nthTrainingDate(nine, 10) === null && nthTrainingDate(ten, 10) === '2026-10-10', '10-я тренировка: дата рубежа')
ok(nthTrainingDate([...nine, tr('2026-10-10', { type: 'Списание' })], 10) === null, 'списание не считается тренировкой')
ok(nthTrainingDate([...nine, tr('2026-10-10', { status: 'draft' })], 10) === null, 'черновик не считается')
ok(nthTrainingDate([tr('2026-10-10'), ...nine], 10) === '2026-10-10', 'порядок — по дате, не по приходу')
const auto = { id: 'a1', kind: 'survey', trigger: 'trainings_10', club_ids: [C1], created_at: '2026-10-05T08:00:00Z', closed_at: null }
const pick = (over = {}) => pickMilestoneCampaigns({ campaigns: [auto], trainings: ten, clubId: C1, deliveredIds: [], ...over })
ok(pick().length === 1, 'дошёл до 10 после запуска — опрос положен')
ok(pick({ trainings: nine }).length === 0, '9 тренировок — рано')
ok(pick({ deliveredIds: ['a1'] }).length === 0, 'второй раз не приходит')
ok(pick({ clubId: C2 }).length === 0, 'чужой клуб — нет')
ok(pickMilestoneCampaigns({ campaigns: [{ ...auto, closed_at: NOW }], trainings: ten, clubId: C1 }).length === 0, 'закрытый автоопрос — нет')
ok(pickMilestoneCampaigns({ campaigns: [{ ...auto, created_at: '2026-10-11T08:00:00Z' }], trainings: ten, clubId: C1 }).length === 0, 'рубеж пройден до запуска — старичкам не шлём')
ok(pickMilestoneCampaigns({ campaigns: [{ ...auto, trigger: null }], trainings: ten, clubId: C1 }).length === 0, 'обычная рассылка — не автоопрос')
ok(isMilestoneTrainingRow({ client_id: C1, status: 'completed', type: 'Силовая' }) && !isMilestoneTrainingRow({ client_id: C1, status: 'draft' }) && !isMilestoneTrainingRow({ client_id: C1, status: 'completed', type: 'Списание' }), 'какие записи sync будят проверку')
const autoDraft = { kind: 'survey', title: 'Как вам 10 тренировок?', questions: [{ type: 'rating', text: 'Оценка' }], club_ids: [C1], halls: ['tz'], trigger: 'trainings_10' }
const autoOk = normalizeInboxCampaignDraft(autoDraft)
ok(autoOk.ok && autoOk.campaign.trigger === 'trainings_10' && autoOk.campaign.halls.length === 0, 'автоопрос: черновик, залы не фильтруем')
ok(!normalizeInboxCampaignDraft({ ...autoDraft, kind: 'notice', body: 'x' }).ok, 'автоопрос — не объявление')
ok(!normalizeInboxCampaignDraft({ ...autoDraft, audience: 'staff', staff_roles: ['trainer'] }).ok, 'автоопрос — не команде')
ok(!normalizeInboxCampaignDraft({ ...autoDraft, trigger: 'hack' }).ok, 'неизвестный триггер — отказ')
ok(normalizeInboxCampaignDraft({ ...autoDraft, trigger: null }).campaign.trigger === null, 'обычный опрос — без триггера')
ok(isInboxCampaignOpen({ trigger: 'trainings_10', expires_at: '2020-01-01T00:00:00Z' }, NOW) && !isInboxCampaignOpen({ trigger: 'trainings_10', closed_at: NOW }, NOW), 'автоопрос открыт, пока не закроют')
ok(inboxStatusLabelRu({ kind: 'survey', trigger: 'trainings_10', open: true }) === 'Автоопрос · идёт', 'подпись автоопроса в списке')
ok(inboxRecipientsLabelRu({ trigger: 'trainings_10' }) === 'Клиенты · после 10-й тренировки', 'кому: после 10-й тренировки')
ok(inboxTriggerReachRu('trainings_10').includes('пока опрос не закроете') && inboxTriggerReachRu(null) === '', 'охват автоопроса — правило')

if (failed) {
  console.error(`\nverify-inbox: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-inbox: OK')
