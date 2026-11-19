import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Страница записи с валидным ?type= — календарь окна со счётчиками свободных слотов
// (спецификация #19, тикет #23, user stories 3–6): все 14 дней окна кликабельны с бейджем
// «N св.» (бейдж только при available_count > 0, нулевой день окна всё равно кликабелен —
// так «всё занято» отличимо от «день недоступен»); прошедшие и внеоконные дни не кликабельны;
// стрелки месяцев блокируются на границах окна. Счётчики сверяются с ответом API — он источник
// чисел для интерфейса, сами числа по правилам проверяет rack-тест под committee. Файл идёт
// последовательно на собственном сервере порта 4582 (webServer в конфиге): хранилище живёт
// в памяти процесса и фикстуры мешали бы строгой сверке списков у соседних спеков.
// Локаторы — по ролям и доступным именам, не по CSS (ADR-0002).
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: 'http://127.0.0.1:4582/' })

const TYPE_ID = 'cal-intro-call'
const TYPE_NAME = 'Календарный созвон'

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

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

// «Сейчас» по Moscow: фиксированный UTC+3 без летнего времени — то же правило, что на сервере;
// части даты читаем через getUTC*.
function moscowNow(): Date {
  return new Date(Date.now() + MOSCOW_OFFSET_MS)
}

function dateKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function monthNominative(key: string): string {
  return `${MONTHS_NOMINATIVE[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)} г.`
}

// Доступное имя дня в сетке: «20 ноября» — число и месяц в родительном падеже.
// exact: true — иначе «1 декабря» попадает и на «11 декабря», и на «21/31 декабря».
function dayButton(page: Page, key: string) {
  return page.getByRole('button', {
    name: `${Number(key.slice(8, 10))} ${MONTHS_GENITIVE[Number(key.slice(5, 7)) - 1]}`,
    exact: true,
  })
}

async function getDays(request: APIRequestContext, typeId: string): Promise<DayCount[]> {
  const response = await request.get('/api/availability/days', { params: { meeting_type_id: typeId } })
  expect(response.ok(), `не удалось получить счётчики по дням: ${response.status()}`).toBe(true)
  const body = (await response.json()) as { days: DayCount[] }
  return body.days
}

test.beforeAll(async ({ request }) => {
  const response = await request.post('/api/meeting-types', {
    data: { id: TYPE_ID, name: TYPE_NAME, description: 'Тип для проверки календаря', duration: 30 },
  })
  expect(response.ok(), `не удалось создать тип ${TYPE_ID}: ${response.status()}`).toBe(true)
})

test('известный ?type= — 14 кликабельных дней окна, бейдж «N св.» только при счётчике больше нуля', async ({
  request,
  page,
}) => {
  const days = await getDays(request, TYPE_ID)
  expect(days).toHaveLength(14)

  await page.goto(`/booking?type=${TYPE_ID}`)
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()

  const nextArrow = page.getByRole('button', { name: 'Следующий месяц' })
  let shownMonth = days[0].date.slice(0, 7)

  for (const day of days) {
    // Окно может переходить в следующий месяц — переключаемся стрелкой, она внутри окна активна.
    if (day.date.slice(0, 7) !== shownMonth) {
      await expect(nextArrow).toBeEnabled()
      await nextArrow.click()
      shownMonth = day.date.slice(0, 7)
    }

    const cell = dayButton(page, day.date)
    // День окна кликабелен и при нуле свободных слотов — так он отличим от недоступного дня.
    await expect(cell).toBeEnabled()

    if (day.available_count > 0) {
      await expect(cell).toContainText(`${day.available_count} св.`)
    } else {
      // Нулевой день окна остаётся в сетке без бейджа (после дневных стартов так бывает сегодня).
      await expect(cell).toHaveText(String(Number(day.date.slice(8, 10))))
    }
  }

  // Клик по дню окна не ломает календарь; выбор дня и колонка слотов — следующий тикет.
  // Берём последний день окна — он в текущем виде месяца после переключения стрелкой.
  await dayButton(page, days[days.length - 1].date).click()
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()
})

test('прошедший и внеоконный день не кликабельны, сегодняшний — обычный день окна', async ({ request, page }) => {
  const days = await getDays(request, TYPE_ID)
  const today = moscowNow()

  await page.goto(`/booking?type=${TYPE_ID}`)
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible()

  // Сегодняшний день — обычный день окна: кликабелен, бейдж соответствует счётчику API.
  const todayCell = dayButton(page, days[0].date)
  await expect(todayCell).toBeEnabled()

  if (days[0].available_count > 0) {
    await expect(todayCell).toContainText(`${days[0].available_count} св.`)
  }

  // День перед окном (вчера) — серый и некликабельный. Когда сегодня первый день месяца,
  // вчера виден только при заполнении недели, — берём первый день за концом окна (он вне окна).
  const blockedKey = today.getUTCDate() === 1 ? dateKey(shiftDays(today, 14)) : dateKey(shiftDays(today, -1))
  await expect(dayButton(page, blockedKey)).toBeDisabled()
})

test('стрелки переключения месяцев блокируются на границах окна', async ({ request, page }) => {
  const days = await getDays(request, TYPE_ID)
  const firstMonth = monthNominative(days[0].date)
  const lastMonth = monthNominative(days[days.length - 1].date)

  const prev = page.getByRole('button', { name: 'Предыдущий месяц' })
  const next = page.getByRole('button', { name: 'Следующий месяц' })

  await page.goto(`/booking?type=${TYPE_ID}`)
  await expect(page.getByRole('heading', { level: 2, name: firstMonth })).toBeVisible()
  await expect(prev).toBeDisabled()

  if (firstMonth !== lastMonth) {
    await expect(next).toBeEnabled()
    await next.click()
    await expect(page.getByRole('heading', { level: 2, name: lastMonth })).toBeVisible()
    await expect(next).toBeDisabled()
    await expect(prev).toBeEnabled()

    await prev.click()
    await expect(page.getByRole('heading', { level: 2, name: firstMonth })).toBeVisible()
    await expect(prev).toBeDisabled()
  } else {
    // Всё окно в одном месяце — обе стрелки заблокированы сразу.
    await expect(next).toBeDisabled()
  }
})

test('неизвестный ?type= — список типов вместо календаря', async ({ page }) => {
  await page.goto('/booking?type=net-tipa-vovse')

  await expect(page.getByRole('region', { name: 'Календарь' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: TYPE_NAME })).toBeVisible()
})
