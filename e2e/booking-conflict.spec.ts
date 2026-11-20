import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Конфликт слота по спецификации #19 (тикет #26, user story 15): занятое время нельзя
// забронировать повторно. Созданная бронь 10:00–11:00 снимает из свободных пересекающиеся
// старты 09:30, 10:00 и 10:30 (бейдж дня считает 17 − 3 = 14), примыкающие 09:00 и 11:00
// остаются свободны. Повторная запись на занятое время deep-link'ом подтверждения даёт
// 409: остаёмся на экране с баннером «Это время уже занято. Выберите другое время.»,
// имя и email сохранены, авто-возврата нет. ДЕТЕРМИНИРОВАННОСТЬ: бронь на день +2 от
// сегодня — все его старты в будущем, статусы не зависят от часов прогона. Файл идёт
// последовательно на собственном сервере порта 4585 (webServer в конфиге): хранилище
// в памяти процесса, брони не мешают строгим сверкам соседних спеков.
// Локаторы — по ролям и доступным именам, не по CSS (ADR-0002).
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: 'http://127.0.0.1:4585/' })

const TYPE_ID = 'booking-conflict-60'
const TYPE_NAME = 'Конфликтный созвон'

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

function moscowNow(): Date {
  return new Date(Date.now() + MOSCOW_OFFSET_MS)
}

function dateKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

// Доступное имя дня в сетке: «20 ноября» (exact — иначе «1 декабря» попадается в «11/21/31 декабря»).
function dayButton(page: Page, key: string) {
  return page.getByRole('button', {
    name: `${Number(key.slice(8, 10))} ${MONTHS_GENITIVE[Number(key.slice(5, 7)) - 1]}`,
    exact: true,
  })
}

// Открыть день окна: при переходе в следующий месяц переключаемся стрелкой, пока день
// не станет кликабельным.
async function openDay(page: Page, key: string): Promise<void> {
  const cell = dayButton(page, key)
  const next = page.getByRole('button', { name: 'Следующий месяц' })

  while ((await cell.count()) === 0 || !(await cell.isEnabled())) {
    await expect(next).toBeEnabled()
    await next.click()
  }

  await cell.click()
}

async function getDays(request: APIRequestContext): Promise<DayCount[]> {
  const response = await request.get('/api/availability/days', { params: { meeting_type_id: TYPE_ID } })
  expect(response.ok(), `не удалось получить счётчики по дням: ${response.status()}`).toBe(true)
  const body = (await response.json()) as { days: DayCount[] }
  return body.days
}

function slotsRegion(page: Page) {
  return page.getByRole('region', { name: 'Слоты' })
}

async function openBookingForType(page: Page): Promise<void> {
  await page.goto(`/booking?type=${TYPE_ID}`)
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()
  await expect(dayButton(page, dateKey(moscowNow()))).toBeEnabled()
}

function confirmUrl(day: string, start: string): string {
  return `/booking/confirm?type=${TYPE_ID}&date=${day}&start=${start}`
}

test.beforeAll(async ({ request }) => {
  const response = await request.post('/api/meeting-types', {
    data: { id: TYPE_ID, name: TYPE_NAME, description: 'Тип для проверки конфликта', duration: 60 },
  })
  expect(response.ok(), `не удалось создать тип ${TYPE_ID}: ${response.status()}`).toBe(true)
})

test('созданная бронь: пересекающиеся слоты «Занято», бейдж дня их не считает', async ({ request, page }) => {
  const day = (await getDays(request))[2].date // +2 дня от сегодня — весь день в будущем

  const booking = await request.post('/api/bookings', {
    data: {
      meeting_type_id: TYPE_ID,
      name: 'Владелец слота',
      email: 'owner@example.com',
      date: day,
      start: '10:00',
    },
  })
  expect(booking.status(), `бронь-фикстура не создалась: ${booking.status()}`).toBe(201)

  await openBookingForType(page)
  await openDay(page, day)

  // Бронь 10:00–11:00: пересекаются старты 09:30, 10:00 и 10:30, примыкающие 09:00 и 11:00 свободны.
  await expect(slotsRegion(page).getByRole('button', { name: '09:30 - 10:30 Занято' })).toBeVisible()
  await expect(slotsRegion(page).getByRole('button', { name: '10:00 - 11:00 Занято' })).toBeVisible()
  await expect(slotsRegion(page).getByRole('button', { name: '10:30 - 11:30 Занято' })).toBeVisible()
  await expect(slotsRegion(page).getByRole('button', { name: '09:00 - 10:00 Свободно' })).toBeVisible()
  await expect(slotsRegion(page).getByRole('button', { name: '11:00 - 12:00 Свободно' })).toBeVisible()
  await expect(slotsRegion(page).getByText('Занято')).toHaveCount(3)

  // Бейдж дня по правилу: 17 стартов минус три пересекающихся — 14.
  await expect(dayButton(page, day)).toContainText('14 св.')
})

test('повторная запись на занятое время: баннер конфликта, имя и email сохранены', async ({
  request,
  page,
}) => {
  const day = (await getDays(request))[2].date

  await page.goto(confirmUrl(day, '10:00'))
  await expect(page.getByRole('heading', { name: 'Подтверждение записи' })).toBeVisible()

  await page.getByLabel('Имя').fill('Гость 409')
  await page.getByLabel('Email').fill('guest-409@example.com')
  await page.getByRole('button', { name: 'Подтвердить запись' }).click()

  // 409: остаёмся на экране, баннер про занятое время, введённые значения не потеряны.
  await expect(page.getByRole('alert')).toHaveText('Это время уже занято. Выберите другое время.')
  expect(page.url()).toContain('/booking/confirm')
  await expect(page.getByLabel('Имя')).toHaveValue('Гость 409')
  await expect(page.getByLabel('Email')).toHaveValue('guest-409@example.com')
})
