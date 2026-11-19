import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Экран подтверждения и экран успеха по спецификации #19 (тикет #25, user stories 11–14, 17–18, 20):
// полный happy path гостя — тип → календарь → день → слот → «Продолжить» → подтверждение с
// именем/email → «Подтвердить запись» → «Бронь подтверждена. До встречи!» → «Забронировать ещё»
// на /booking с тем же типом и сброшенным выбором. Клиентские проверки — ровно правила контракта
// (подсказки появляются при submit и перепроверяются на вводе), 422 — баннер с текстом
// спецификации, имя и email сохранены. Битые query-параметры подтверждения — редирект на /booking.
// ДЕТЕРМИНИРОВАННОСТЬ: бронь ставится на день +2 от сегодня — все его старты в будущем и
// свободны, поэтому статусы не зависят от часов прогона. Файл идёт последовательно на
// собственном сервере порта 4584 (webServer в конфиге): хранилище в памяти процесса.
// Локаторы — по ролям и доступным именам, не по CSS (ADR-0002).
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: 'http://127.0.0.1:4584/' })

const TYPE_ID = 'booking-flow-60'
const TYPE_NAME = 'Бронировочный созвон'

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

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function dateKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

// Длинная подпись дня для колонки информации: «22 ноября 2026 г.».
function dayCaption(key: string): string {
  return `${Number(key.slice(8, 10))} ${MONTHS_GENITIVE[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)} г.`
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

function infoRegion(page: Page) {
  return page.getByRole('region', { name: 'Информация' })
}

function confirmHeading(page: Page) {
  return page.getByRole('heading', { name: 'Подтверждение записи' })
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
    data: { id: TYPE_ID, name: TYPE_NAME, description: 'Тип для сквозного сценария', duration: 60 },
  })
  expect(response.ok(), `не удалось создать тип ${TYPE_ID}: ${response.status()}`).toBe(true)
})

test('полный путь гостя: слот → подтверждение → успех → «Забронировать ещё»', async ({ request, page }) => {
  const days = await getDays(request)
  const day = days[2].date // +2 дня от сегодня — весь день в будущем и свободен

  await openBookingForType(page)
  await openDay(page, day)
  await slotsRegion(page).getByRole('button', { name: '10:00 - 11:00 Свободно' }).click()
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page).toHaveURL(
    new RegExp(`/booking/confirm\\?type=${TYPE_ID}&date=${day}&start=10(%3A|:)00$`),
  )
  await expect(confirmHeading(page)).toBeVisible()
  // Ссылка переживает refresh: параметры в URL, после перезагрузки экран тот же.
  await page.reload()
  await expect(confirmHeading(page)).toBeVisible()

  // Экран показывает выбранное: тип, дату и интервал слота.
  const confirmInfo = infoRegion(page)
  await expect(confirmInfo.getByText(TYPE_NAME)).toBeVisible()
  await expect(confirmInfo.getByText(dayCaption(day))).toBeVisible()
  await expect(confirmInfo.getByText('10:00 - 11:00')).toBeVisible()

  await page.getByLabel('Имя').fill('Demo User')
  await page.getByLabel('Email').fill('demo@example.com')

  // Проверка блокировки кнопки детерминированна: route с continue задерживает прохождение
  // реального запроса (ответ отдаёт настоящий сервер, подмены нет) — в окне задержки
  // проверяем disabled, второй клик и ровно один POST, потом ответ уводит на успех.
  let bookingRequests = 0
  page.on('request', (sent) => {
    if (sent.method() === 'POST' && new URL(sent.url()).pathname === '/api/bookings') {
      bookingRequests += 1
    }
  })
  await page.route(
    (url) => new URL(url.href).pathname === '/api/bookings',
    (route) => setTimeout(() => void route.continue(), 400),
    { times: 1 },
  )

  const submit = page.getByRole('button', { name: 'Подтвердить запись' })
  await submit.click()
  // Двойной клик не создаст две брони: сразу после клика кнопка заблокирована на время запроса.
  await expect(submit).toBeDisabled()
  // Сила-клик по заблокированной кнопке — та же попытка второго клика, что и у пользователя.
  await submit.click({ force: true })
  expect(bookingRequests).toBe(1)

  await expect(page).toHaveURL(
    new RegExp(`/booking/success\\?type=${TYPE_ID}&date=${day}&start=10(%3A|:)00$`),
  )
  await expect(page.getByText('Бронь подтверждена. До встречи!')).toBeVisible()
  // Детали брони на экране успеха не показываем.
  await expect(page.getByText('Demo User')).toHaveCount(0)

  await page.getByRole('link', { name: 'Забронировать ещё' }).click()

  // Тот же тип, выбор сброшен — обычное состояние страницы записи со свежими запросами.
  await expect(page).toHaveURL(new RegExp(`/booking\\?type=${TYPE_ID}$`))
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()
  await expect(infoRegion(page).getByText('Дата не выбрана')).toBeVisible()
  await expect(infoRegion(page).getByText('Время не выбрано')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
})

test('пустые поля: подсказки по правилам контракта, запрос не уходит, перепроверка на вводе', async ({
  request,
  page,
}) => {
  const days = await getDays(request)

  await page.goto(confirmUrl(days[2].date, '11:00'))
  await expect(confirmHeading(page)).toBeVisible()

  await page.getByRole('button', { name: 'Подтвердить запись' }).click()

  await expect(page.getByText('Введите имя')).toBeVisible()
  await expect(page.getByText('Введите email (не короче 3 символов)')).toBeVisible()
  // Запрос на сервер не уходил: остались на экране, баннеров нет.
  expect(page.url()).toContain('/booking/confirm')
  await expect(page.getByRole('alert')).toHaveCount(0)

  // После первой отправки изменённые поля перепроверяются на вводе: имя исправлено —
  // его подсказка исчезла, короткая почта всё ещё подсвечена.
  await page.getByLabel('Имя').fill('Гость')
  await expect(page.getByText('Введите имя')).toHaveCount(0)
  await expect(page.getByText('Введите email (не короче 3 символов)')).toBeVisible()

  await page.getByLabel('Email').fill('abc')
  await expect(page.getByText('Введите email (не короче 3 символов)')).toHaveCount(0)
})

test('422 от сервера: баннер спецификации, остаёмся на экране, имя и email сохранены', async ({
  page,
}) => {
  const yesterday = dateKey(shiftDays(moscowNow(), -1))

  await page.goto(confirmUrl(yesterday, '10:00'))
  await expect(confirmHeading(page)).toBeVisible()

  await page.getByLabel('Имя').fill('Гость 422')
  await page.getByLabel('Email').fill('guest-422@example.com')
  await page.getByRole('button', { name: 'Подтвердить запись' }).click()

  await expect(page.getByRole('alert')).toHaveText('Записаться на это время не получилось. Выберите другое время.')
  expect(page.url()).toContain('/booking/confirm')
  await expect(page.getByLabel('Имя')).toHaveValue('Гость 422')
  await expect(page.getByLabel('Email')).toHaveValue('guest-422@example.com')
})

test('битые query-параметры подтверждения ведут на /booking', async ({ page }) => {
  await page.goto('/booking/confirm?type=net-tipa&date=2030-01-01&start=10:00')

  await expect(page).toHaveURL(new RegExp('/booking(\\?|/|$)'))
  await expect(page.getByRole('heading', { name: 'Страница записи' })).toBeVisible()

  // Валидный тип сохраняется: редирект ведёт на страницу записи с тем же типом.
  await page.goto(`/booking/confirm?type=${TYPE_ID}&date=bitaya-data&start=10:00`)

  await expect(page).toHaveURL(new RegExp(`/booking\\?type=${TYPE_ID}`))
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()
})
