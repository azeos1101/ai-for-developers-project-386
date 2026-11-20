import { expect, test, type APIRequestContext } from '@playwright/test'

// Тикет #28 (спецификация #19, user stories 23, 46): глобальная шапка на всех экранах
// и динамический document.title по маршруту. Локаторы — по ролям и доступным именам
// (ADR-0002). Свой сервер на порту 4587: фикстура создаёт тип для deep-link'а экрана
// подтверждения и не трогает строгие сверки составов списков у соседних спеков
// (конвенция портов из #21–#27).
test.use({ baseURL: 'http://127.0.0.1:4587/' })

const TYPE_ID = 'header-nav'

// Тип нужен только чтобы deep-link экрана подтверждения не редиректился на /booking.
// Файл создаёт его один раз до тестов; повторный POST от второго теста даёт 409 —
// тип уже есть, это устраивает.
async function createMeetingType(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/meeting-types', {
    data: {
      id: TYPE_ID,
      name: 'Шапка навигации',
      description: 'Тип для deep-link экрана подтверждения',
      duration: 30,
    },
  })
  expect([201, 409].includes(response.status()), `тип ${TYPE_ID} не создан: ${response.status()}`).toBe(true)
}

test.beforeEach(async ({ request }) => {
  await createMeetingType(request)
})

// Дата deep-link'а — через 3 дня, формат YYYY-MM-DD.
function dateInDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const ROUTES = [
  '/',
  '/booking',
  `/booking?type=${TYPE_ID}`,
  `/booking?type=${TYPE_ID}&date=${dateInDays(1)}`,
  `/booking/confirm?type=${TYPE_ID}&date=${dateInDays(1)}&start=10:00`,
  `/booking/success?type=${TYPE_ID}`,
  '/events',
  '/kakaya-to-stranitsa',
]

// Ожидаемые document.title фиксированы тикетом #28 и не берутся из кода страницы.
const TITLED_ROUTES = [
  { route: '/', title: 'Запись на звонок' },
  { route: '/booking', title: 'Записаться' },
  { route: `/booking?type=${TYPE_ID}`, title: 'Записаться' },
  { route: `/booking?type=${TYPE_ID}&date=${dateInDays(1)}`, title: 'Записаться' },
  { route: `/booking/confirm?type=${TYPE_ID}&date=${dateInDays(1)}&start=10:00`, title: 'Записаться' },
  { route: `/booking/success?type=${TYPE_ID}`, title: 'Записаться' },
  { route: '/events', title: 'Предстоящие события' },
  { route: '/kakaya-to-stranitsa', title: 'Страница не найдена' },
]

test('document.title соответствует маршруту', async ({ page }) => {
  for (const { route, title } of TITLED_ROUTES) {
    await test.step(`маршрут ${route}`, async () => {
      await page.goto(route)

      await expect(page).toHaveTitle(title)
    })
  }
})

test('переходы по ссылкам шапки работают', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: 'Предстоящие события', exact: true }).click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(page).toHaveTitle('Предстоящие события')

  await page.getByRole('link', { name: 'Записаться', exact: true }).click()
  await expect(page).toHaveURL(/\/booking$/)
  await expect(page).toHaveTitle('Записаться')

  // Шапка остаётся и на странице записи — возврат к событиям работает оттуда же.
  await page.getByRole('link', { name: 'Предстоящие события', exact: true }).click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(page).toHaveTitle('Предстоящие события')
})

test('на каждом маршруте в шапке ссылки «Записаться» и «Предстоящие события»', async ({ page }) => {
  for (const route of ROUTES) {
    await test.step(`маршрут ${route}`, async () => {
      await page.goto(route)

      const bookingLink = page.getByRole('link', { name: 'Записаться', exact: true })
      await expect(bookingLink).toHaveAttribute('href', '/booking')
      const eventsLink = page.getByRole('link', { name: 'Предстоящие события', exact: true })
      await expect(eventsLink).toHaveAttribute('href', '/events')
    })
  }
})
