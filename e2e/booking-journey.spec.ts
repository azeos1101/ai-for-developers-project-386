import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Финальный эталонный сквозной сценарий спецификации #19 (тикет #32): ровно один флоу
// гостя от главной до видимости брони владельцу — главная → «Записаться →» → выбор типа
// из списка кликом → день окна по бейджу свободных слотов → свободный слот → «Продолжить»
// → имя + email → «Подтвердить запись» → «Бронь подтверждена. До встречи!» → шапка
// «Предстоящие события» → карточка брони со всеми полями.
// Ни одной подмены ответов API: сервер настоящий (Sinatra отдаёт собранный фронтенд),
// данные готовятся запросами к API (route-шпионы только считают, не fulfil'). Тип встречи —
// свой уникальный slug, создаётся в beforeAll: хранилище старта пусто, сидов нет.
// ДЕТЕРМИНИРОВАННОСТЬ: бронь на день +2 от сегодня по Europe/Moscow — все старты будущего
// дня свободны, статусы не зависят от часов прогона.
// Свой сервер на порту 4588 (webServer в конфиге): хранилище в памяти процесса, конвенция
// изоляции портов из #21–#28. Локаторы — по ролям и доступным именам, не по CSS (ADR-0002).
test.use({ baseURL: 'http://127.0.0.1:4588/' })

const TYPE_ID = 'booking-journey-60'
const TYPE_NAME = 'Сквозной созвон'
const GUEST_NAME = 'Анна Петрова'
const GUEST_EMAIL = 'anna@example.com'
// Слот 60-минутного типа: интервал и старт фиксированы — день +2 весь свободен.
const SLOT_INTERVAL = '10:00 - 11:00'
const SLOT_START = '10:00'

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

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

interface BookingJson {
  date: string
  start: string
  created_at: string
}

function moscowNow(): Date {
  return new Date(Date.now() + MOSCOW_OFFSET_MS)
}

// Дата на offset дней от сегодня по Moscow как YYYY-MM-DD (окно начинается сегодня);
// день +2 целиком в будущем — выбор дня и слота не зависит от часов прогона.
function futureDay(offset: number): string {
  const moscow = moscowNow()
  moscow.setUTCDate(moscow.getUTCDate() + offset)
  const month = String(moscow.getUTCMonth() + 1).padStart(2, '0')
  const day = String(moscow.getUTCDate()).padStart(2, '0')
  return `${moscow.getUTCFullYear()}-${month}-${day}`
}

// Доступное имя дня в сетке: «22 ноября» (exact — иначе «1 декабря» попадается в «11/21/31 декабря»).
function dayName(key: string): string {
  return `${Number(key.slice(8, 10))} ${MONTHS_GENITIVE[Number(key.slice(5, 7)) - 1]}`
}

function dayButton(page: Page, key: string) {
  return page.getByRole('button', { name: dayName(key), exact: true })
}

// Открыть день окна: при переходе в следующий месяц переключаемся стрелкой, пока день
// не станет кликабельным (образец openDay из booking-flow.spec.ts).
async function openDay(page: Page, key: string): Promise<void> {
  const cell = dayButton(page, key)
  const next = page.getByRole('button', { name: 'Следующий месяц' })

  while ((await cell.count()) === 0 || !(await cell.isEnabled())) {
    await expect(next).toBeEnabled()
    await next.click()
  }
}

// Ожидаемая подпись «Создано: DD.MM.YYYY, HH:MM»: created_at из API пересчитывается в
// Europe/Moscow (фиксированный UTC+3 — время сервиса), как в upcoming-bookings.spec.ts.
function createdCaption(createdAtIso: string): string {
  const moscow = new Date(new Date(createdAtIso).getTime() + MOSCOW_OFFSET_MS)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(moscow.getUTCDate())}.${pad(moscow.getUTCMonth() + 1)}.${moscow.getUTCFullYear()}, ${pad(moscow.getUTCHours())}:${pad(moscow.getUTCMinutes())}`
}

function bookingsRegion(page: Page) {
  return page.getByRole('region', { name: 'Предстоящие события' })
}

test.beforeAll(async ({ request }) => {
  const response = await request.post('/api/meeting-types', {
    data: { id: TYPE_ID, name: TYPE_NAME, description: 'Тип для сквозного сценария', duration: 60 },
  })
  expect(response.ok(), `не удалось создать тип ${TYPE_ID}: ${response.status()}`).toBe(true)
})

test('гость записывается от главной, владелец видит бронь на «Предстоящих событиях»', async ({
  request,
  page,
}) => {
  const day = futureDay(2)

  // 1. Гость открывает главную и по CTA «Записаться →» (exact — в шапке есть «Записаться»)
  // переходит на страницу записи.
  await page.goto('/')
  await page.getByRole('link', { name: 'Записаться →', exact: true }).click()
  await expect(page).toHaveURL(/\/booking$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Страница записи' })).toBeVisible()

  // 2. Тип из списка: карточка подготовленного типа видна, выбор — клик по ссылке с
  // доступным именем = название типа.
  const typeCard = page.getByRole('article').filter({ hasText: TYPE_NAME })
  await expect(typeCard.getByRole('heading', { name: TYPE_NAME })).toBeVisible()
  await page.getByRole('link', { name: TYPE_NAME, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/booking\\?type=${TYPE_ID}$`))
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()

  // 3. День окна по бейджу свободных слотов: счётчик дня +2 из API (день целиком в будущем —
  // бейдж ненулевой), бейдж в сетке сверяется с ним, затем клик по дню.
  const daysResponse = await request.get('/api/availability/days', { params: { meeting_type_id: TYPE_ID } })
  expect(daysResponse.ok(), `не удалось получить счётчики по дням: ${daysResponse.status()}`).toBe(true)
  const summary = (await daysResponse.json()) as { days: DayCount[] }
  const dayEntry = summary.days.find((entry) => entry.date === day)
  expect(dayEntry, `дня ${day} нет в окне доступности`).toBeTruthy()
  expect(dayEntry!.available_count).toBeGreaterThan(0)

  const cell = dayButton(page, day)
  await openDay(page, day)
  await expect(cell.getByText(`${dayEntry!.available_count} св.`)).toBeVisible()
  await cell.click()

  // 4. Свободный слот, «Продолжить», подтверждение с именем и email, успех.
  await page.getByRole('region', { name: 'Слоты' }).getByRole('button', { name: `${SLOT_INTERVAL} Свободно` }).click()
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(
    new RegExp(`/booking/confirm\\?type=${TYPE_ID}&date=${day}&start=10(%3A|:)00$`),
  )

  await page.getByLabel('Имя').fill(GUEST_NAME)
  await page.getByLabel('Email').fill(GUEST_EMAIL)
  await page.getByRole('button', { name: 'Подтвердить запись' }).click()

  await expect(page).toHaveURL(/\/booking\/success/)
  await expect(page.getByText('Бронь подтверждена. До встречи!')).toBeVisible()

  // 5. Переход по шапке на «Предстоящие события» — карточка созданной брони со всеми полями.
  await page.getByRole('link', { name: 'Предстоящие события', exact: true }).click()
  await expect(page).toHaveURL(/\/events$/)

  const bookingsResponse = await request.get('/api/bookings')
  expect(bookingsResponse.ok(), `не удалось получить брони: ${bookingsResponse.status()}`).toBe(true)
  const bookings = (await bookingsResponse.json()) as BookingJson[]
  const booking = bookings.find((entry) => entry.date === day && entry.start === SLOT_START)
  expect(booking, `брони на ${day} ${SLOT_START} нет в GET /api/bookings`).toBeTruthy()

  const card = bookingsRegion(page).getByRole('article')
  await expect(card).toHaveCount(1)
  await expect(card.getByText(GUEST_NAME, { exact: true })).toBeVisible()
  await expect(card.getByText(GUEST_EMAIL, { exact: true })).toBeVisible()
  await expect(card.getByText(`Слот: ${day}-${SLOT_START}`, { exact: true })).toBeVisible()
  await expect(card.getByText(`Создано: ${createdCaption(booking!.created_at)}`, { exact: true })).toBeVisible()
  await expect(card.getByText(`${TYPE_NAME} · 60 мин`, { exact: true })).toBeVisible()
})
