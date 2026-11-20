import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Слоты дня на странице записи (спецификация #19, тикет #24, user stories 7–10): клик по дню
// окна показывает колонку слотов со статусами «Свободно»/«Занято» и колонку информации (дата,
// интервал выбранного слота, число свободных слотов, длительность типа — числа из API).
// «Продолжить» неактивна без выбора свободного слота, выбор ведёт на /booking/confirm с
// query-параметрами type/date/start. ДЕТЕРМИНИРОВАННОСТЬ: основной путь идёт по дню окна
// на +2 дня от сегодня — все его старты в будущем, поэтому статусы не зависят от часов
// прогона; прошедшие статусы сегодняшнего дня сверяются с ответом API, а не с часами.
// Файл идёт последовательно на собственном сервере порта 4583 (webServer в конфиге):
// хранилище в памяти процесса, фикстуры не мешают строгим сверкам соседних спеков.
// Локаторы — по ролям и доступным именам, не по CSS (ADR-0002).
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: 'http://127.0.0.1:4583/' })

const TYPE_ID = 'booking-slots-60'
const TYPE_NAME = 'Слотный созвон'

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

interface Slot {
  start: string
  end: string
  available: boolean
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
// не станет кликабельным (в чужом месяце он серая заглушка или отсутствует).
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

async function getSlots(request: APIRequestContext, date: string): Promise<Slot[]> {
  const response = await request.get('/api/availability', {
    params: { date, meeting_type_id: TYPE_ID },
  })
  expect(response.ok(), `не удалось получить слоты ${date}: ${response.status()}`).toBe(true)
  const body = (await response.json()) as { slots: Slot[] }
  return body.slots
}

function slotsRegion(page: Page) {
  return page.getByRole('region', { name: 'Слоты' })
}

function infoRegion(page: Page) {
  return page.getByRole('region', { name: 'Информация' })
}

async function openBookingForType(page: Page): Promise<void> {
  await page.goto(`/booking?type=${TYPE_ID}`)
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()
  // Готовность календаря: сегодняшний день окна стал кликабельным (граница окна загружена).
  await expect(dayButton(page, dateKey(moscowNow()))).toBeEnabled()
}

test.beforeAll(async ({ request }) => {
  const response = await request.post('/api/meeting-types', {
    data: { id: TYPE_ID, name: TYPE_NAME, description: 'Тип для проверки слотов дня', duration: 60 },
  })
  expect(response.ok(), `не удалось создать тип ${TYPE_ID}: ${response.status()}`).toBe(true)
})

test('день окна показывает слоты «Свободно», «Продолжить» ведёт на подтверждение с параметрами', async ({
  request,
  page,
}) => {
  const days = await getDays(request)
  const day = days[2].date // +2 дня от сегодня — весь день в будущем, статусы не зависят от часов

  const slots = await getSlots(request, day)
  expect(slots.map((slot) => slot.start)).toEqual([
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
  ])
  expect(slots.every((slot) => slot.available)).toBe(true)

  await openBookingForType(page)
  await openDay(page, day)

  // 17 кнопок слотов — кнопки по подписи интервала и статуса; «Продолжить» тоже в секции.
  await expect(
    slotsRegion(page).getByRole('button', { name: /^\d\d:\d\d - \d\d:\d\d (Свободно|Занято)$/ }),
  ).toHaveCount(17)
  await expect(slotsRegion(page).getByText('Свободно')).toHaveCount(17)
  await expect(slotsRegion(page).getByText('Занято')).toHaveCount(0)

  // Колонка информации: дата, время ещё не выбрано, свободные слоты и длительность — из API.
  await expect(infoRegion(page).getByText(dayCaption(day))).toBeVisible()
  await expect(infoRegion(page).getByText('Время не выбрано')).toBeVisible()
  await expect(infoRegion(page).getByText('17', { exact: true })).toBeVisible()
  await expect(infoRegion(page).getByText('60 мин')).toBeVisible()

  const nextButton = page.getByRole('button', { name: 'Продолжить' })
  await expect(nextButton).toBeDisabled()

  await slotsRegion(page).getByRole('button', { name: '10:00 - 11:00 Свободно' }).click()
  await expect(infoRegion(page).getByText('10:00 - 11:00')).toBeVisible()
  await expect(nextButton).toBeEnabled()

  await nextButton.click()

  await expect(page).toHaveURL(
    new RegExp(`/booking/confirm\\?type=${TYPE_ID}&date=${day}&start=10(%3A|:)00$`),
  )
  await expect(page.getByRole('heading', { name: 'Подтверждение записи' })).toBeVisible()
})

test('смена дня сбрасывает выбранный слот', async ({ request, page }) => {
  const days = await getDays(request)

  await openBookingForType(page)

  await openDay(page, days[2].date)
  await slotsRegion(page).getByRole('button', { name: '10:00 - 11:00 Свободно' }).click()
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeEnabled()

  await openDay(page, days[3].date)
  await expect(infoRegion(page).getByText('Время не выбрано')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
})

test('сегодняшний день: статусы слотов совпадают с API, занятые слоты не выбираются', async ({
  request,
  page,
}) => {
  const today = (await getDays(request))[0].date
  const slots = await getSlots(request, today)
  const freeCount = slots.filter((slot) => slot.available).length
  const busyCount = slots.length - freeCount

  await openBookingForType(page)
  await openDay(page, today)

  await expect(slotsRegion(page).getByText('Свободно')).toHaveCount(freeCount)
  await expect(slotsRegion(page).getByText('Занято')).toHaveCount(busyCount)

  // Ранние утренние часы: прошедших стартов ещё нет, выбирать нечего — проверка ниже.
  const firstBusy = slots.find((slot) => !slot.available)
  if (firstBusy !== undefined) {
    const busyButton = slotsRegion(page).getByRole('button', {
      name: `${firstBusy.start} - ${firstBusy.end} Занято`,
    })
    await expect(busyButton).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
    await expect(infoRegion(page).getByText('Время не выбрано')).toBeVisible()
  }
})
