import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Шаг 6 (#33): сценарий гостя и владельца против РАЗВЁРНУТОГО сервиса. При заданном
// E2E_BASE_URL (mise run test:e2e:remote) playwright.config.ts не поднимает webServer,
// и этот спек идёт по внешнему адресу; в обычном mise run test:e2e он проверяется на
// своём сервере порта 4589 (конвенция изоляции портов #21–#28).
// Хранилище внешнего сервиса НЕ пустое и живёт до перезапуска контейнера, поэтому без
// опоры на пустое состояние: тип встречи с уникальным id по суффиксу прогона, день —
// первый начиная с завтрашнего, у которого в календарном окне есть свободные слоты
// (после повторных прогонов конкретные дни уже заняты бронями, а конфликты считаются
// по всем типам встреч), слот — первый свободный из ответа API, а не захардкоженный;
// карточка брони ищется по имени типа, без строгого количества карточек в списке.
// Финальная проверка — отказ повторной брони того же времени (409).
// Локаторы — по ролям и доступным именам, не по CSS (ADR-0002).
test.use({ baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4589/' })

const RUN_SUFFIX = String(Date.now())
const TYPE_ID = `remote-journey-${RUN_SUFFIX}`
const TYPE_NAME = `Прогон деплоя ${RUN_SUFFIX}`
const GUEST_NAME = 'Гость деплоя'
const GUEST_EMAIL = `guest-${RUN_SUFFIX}@example.com`

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

interface DayCount {
  date: string
  available_count: number
}

interface SlotJson {
  start: string
  end: string
  available: boolean
}

// Доступное имя дня в сетке: «22 ноября» (exact — иначе «1 декабря» попадается в «11/21/31 декабря»).
function dayName(key: string): string {
  return `${Number(key.slice(8, 10))} ${MONTHS_GENITIVE[Number(key.slice(5, 7)) - 1]}`
}

function dayButton(page: Page, key: string) {
  return page.getByRole('button', { name: dayName(key), exact: true })
}

// Открыть день окна: при переходе в следующий месяц переключаемся стрелкой, пока день
// не станет кликабельным (образец openDay из booking-journey.spec.ts).
async function openDay(page: Page, key: string): Promise<void> {
  const cell = dayButton(page, key)
  const next = page.getByRole('button', { name: 'Следующий месяц' })

  while ((await cell.count()) === 0 || !(await cell.isEnabled())) {
    await expect(next).toBeEnabled()
    await next.click()
  }
}

function bookingsRegion(page: Page) {
  return page.getByRole('region', { name: 'Предстоящие события' })
}

function slotsRegion(page: Page) {
  return page.getByRole('region', { name: 'Слоты' })
}

function bookingPayload(start: string, name: string, email: string, day: string) {
  return { meeting_type_id: TYPE_ID, name, email, date: day, start }
}

test.beforeAll(async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok(), `сервис не отвечает на /api/health: ${health.status()}`).toBe(true)

  const response = await request.post('/api/meeting-types', {
    data: { id: TYPE_ID, name: TYPE_NAME, description: 'Тип для проверки развёрнутого сервиса', duration: 60 },
  })
  expect(response.ok(), `не удалось создать тип ${TYPE_ID}: ${response.status()}`).toBe(true)
})

test('гость записывается, владелец видит бронь, повторная бронь отклоняется (409)', async ({
  request,
  page,
}) => {
  // 1. Гость: главная → «Записаться →» → страница записи.
  await page.goto('/')
  await page.getByRole('link', { name: 'Записаться →', exact: true }).click()
  await expect(page).toHaveURL(/\/booking$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Страница записи' })).toBeVisible()

  // 2. Свой тип из списка (имя уникально для прогона — карточка не перепутается с чужими).
  const typeCard = page.getByRole('article').filter({ hasText: TYPE_NAME })
  await expect(typeCard.getByRole('heading', { name: TYPE_NAME })).toBeVisible()
  await page.getByRole('link', { name: TYPE_NAME, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/booking\\?type=${TYPE_ID}$`))
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()

  // 3. День записи: первый начиная с завтрашнего, у которого в окне есть свободные слоты.
  // Завтрашний день и далее целиком в будущем — доступность не зависит от часов прогона;
  // сегодня (индекс 0) пропускаем, часть дня уже прошла. Конкретный день мог быть занят
  // бронями прошлых прогонов — конфликты считаются по всем типам, поэтому берём первый
  // день с ненулевым счётчиком, а бейдж в сетке сверяем с этим счётчиком.
  const daysResponse = await request.get('/api/availability/days', { params: { meeting_type_id: TYPE_ID } })
  expect(daysResponse.ok(), `не удалось получить счётчики по дням: ${daysResponse.status()}`).toBe(true)
  const summary = (await daysResponse.json()) as { days: DayCount[] }
  const dayEntry = summary.days.slice(1).find((entry) => entry.available_count > 0)
  expect(dayEntry, 'в окне доступности нет ни одного дня со свободными слотами').toBeTruthy()
  const day = dayEntry!.date

  const cell = dayButton(page, day)
  await openDay(page, day)
  await expect(cell.getByText(`${dayEntry!.available_count} св.`)).toBeVisible()
  await cell.click()

  // 4. Первый свободный слот дня из API (не захардкоженный — хранилище не пустое),
  // клик по нему в UI, «Продолжить», подтверждение с именем и email, экран успеха.
  const slotsResponse = await request.get('/api/availability', {
    params: { date: day, meeting_type_id: TYPE_ID },
  })
  expect(slotsResponse.ok(), `не удалось получить слоты дня: ${slotsResponse.status()}`).toBe(true)
  const { slots } = (await slotsResponse.json()) as { slots: SlotJson[] }
  const freeSlot = slots.find((slot) => slot.available)
  expect(freeSlot, `на ${day} нет свободных слотов`).toBeTruthy()

  await slotsRegion(page).getByRole('button', { name: `${freeSlot!.start} - ${freeSlot!.end} Свободно` }).click()
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/\/booking\/confirm\?/)

  await page.getByLabel('Имя').fill(GUEST_NAME)
  await page.getByLabel('Email').fill(GUEST_EMAIL)
  await page.getByRole('button', { name: 'Подтвердить запись' }).click()

  await expect(page).toHaveURL(/\/booking\/success/)
  await expect(page.getByText('Бронь подтверждена. До встречи!')).toBeVisible()

  // 5. Владелец: «Предстоящие события» по ссылке шапки — карточка созданной брони
  // (ищется по имени типа: в списке развёрнутого сервиса могут быть чужие брони).
  await page.getByRole('link', { name: 'Предстоящие события', exact: true }).click()
  await expect(page).toHaveURL(/\/events$/)

  const bookings = (await (await request.get('/api/bookings')).json()) as Array<{
    date: string
    start: string
    name: string
    email: string
  }>
  const booking = bookings.find((entry) => entry.date === day && entry.start === freeSlot!.start)
  expect(booking, `брони на ${day} ${freeSlot!.start} нет в GET /api/bookings`).toBeTruthy()

  const card = bookingsRegion(page).getByRole('article').filter({ hasText: TYPE_NAME })
  await expect(card.getByText(GUEST_NAME, { exact: true })).toBeVisible()
  await expect(card.getByText(GUEST_EMAIL, { exact: true })).toBeVisible()
  await expect(card.getByText(`Слот: ${day}-${freeSlot!.start}`, { exact: true })).toBeVisible()
  await expect(card.getByText(`${TYPE_NAME} · 60 мин`, { exact: true })).toBeVisible()

  // 6. Отказ повторной брони того же времени: API даёт 409, а гость на экране
  // подтверждения видит баннер конфликта и остаётся на форме (спецификация #19, тикет #26).
  const duplicate = await request.post('/api/bookings', {
    data: bookingPayload(freeSlot!.start, 'Повтор', 'duplicate@example.com', day),
  })
  expect(duplicate.status(), 'повторная бронь занятого времени не отклонена').toBe(409)

  await page.goto(`/booking/confirm?type=${TYPE_ID}&date=${day}&start=${freeSlot!.start}`)
  await expect(page.getByRole('heading', { name: 'Подтверждение записи' })).toBeVisible()
  await page.getByLabel('Имя').fill('Повтор из UI')
  await page.getByLabel('Email').fill('duplicate-ui@example.com')
  await page.getByRole('button', { name: 'Подтвердить запись' }).click()
  await expect(page.getByRole('alert')).toHaveText('Это время уже занято. Выберите другое время.')
  expect(page.url()).toContain('/booking/confirm')
})
