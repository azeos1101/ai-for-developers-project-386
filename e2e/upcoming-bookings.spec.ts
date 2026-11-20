import { expect, test, type APIRequestContext } from '@playwright/test'

// Список предстоящих броней на странице предстоящих событий по спецификации #19
// (тикеты #27, user stories 31–33): карточка брони со всеми полями («Слот: …», «Создано: …»,
// «тип · NN мин») и пустое состояние «Предстоящих событий пока нет.». Файл идёт последовательно
// на собственном сервере порта 4586 (webServer в конфиге): первый тест проверяет пустое
// состояние до создания фикстур, хранилище другого сервера для этого не пригоден.
// Фикстуры создают тип и бронь через API. Локаторы — по ролям и доступным текстам (ADR-0002),
// форматные строки карточки сверяются целиком.
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: 'http://127.0.0.1:4586/' })

const TYPE_ID = 'upcoming-bookings-60'
const TYPE_NAME = 'Грядущий созвон'

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

function moscowNow(): Date {
  return new Date(Date.now() + MOSCOW_OFFSET_MS)
}

// Дата на offset дней от сегодняшнего дня по Moscow как YYYY-MM-DD (окно начинается сегодня);
// день +2 целиком в будущем — карточка не зависит от часов прогона.
function futureDay(offset: number): string {
  const moscow = moscowNow()
  moscow.setUTCDate(moscow.getUTCDate() + offset)
  const month = String(moscow.getUTCMonth() + 1).padStart(2, '0')
  const day = String(moscow.getUTCDate()).padStart(2, '0')
  return `${moscow.getUTCFullYear()}-${month}-${day}`
}

// Ожидаемая подпись «Создано: DD.MM.YYYY, HH:MM»: created_at из API пересчитывается в
// Europe/Moscow (фиксированный UTC+3 — время сервиса) независимо от реализации фронта.
function createdCaption(createdAtIso: string): string {
  const moscow = new Date(new Date(createdAtIso).getTime() + MOSCOW_OFFSET_MS)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(moscow.getUTCDate())}.${pad(moscow.getUTCMonth() + 1)}.${moscow.getUTCFullYear()}, ${pad(moscow.getUTCHours())}:${pad(moscow.getUTCMinutes())}`
}

async function createBookingFixture(request: APIRequestContext): Promise<string> {
  const type = await request.post('/api/meeting-types', {
    data: { id: TYPE_ID, name: TYPE_NAME, description: 'Тип для списка предстоящих', duration: 60 },
  })
  expect(type.ok(), `не удалось создать тип ${TYPE_ID}: ${type.status()}`).toBe(true)

  const booking = await request.post('/api/bookings', {
    data: {
      meeting_type_id: TYPE_ID,
      name: 'Мария Смирнова',
      email: 'maria@example.com',
      date: futureDay(2),
      start: '10:00',
    },
  })
  expect(booking.status(), `бронь-фикстура не создалась: ${booking.status()}`).toBe(201)

  const body = (await booking.json()) as { created_at: string }
  return body.created_at
}

function bookingsRegion(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: 'Предстоящие события' })
}

test('пустой список броней — текст пустоты, блок управления типами не пострадал', async ({ page }) => {
  await page.goto('/events')

  await expect(bookingsRegion(page).getByText('Предстоящих событий пока нет.')).toBeVisible()

  // Оба блока на месте: форма создания типа и список типов работают со своими текстами.
  await expect(page.getByRole('form', { name: 'Создание типа встречи' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Типы встреч' })).toBeVisible()
  await expect(page.getByText('Типы встреч ещё не заведены — создайте первый тип ниже.')).toBeVisible()
})

test('созданная через API бронь — карточка со всеми полями', async ({ request, page }) => {
  const createdAt = await createBookingFixture(request)
  const day = futureDay(2)

  await page.goto('/events')

  const card = bookingsRegion(page).getByRole('article')
  await expect(card).toHaveCount(1)
  await expect(card.getByText('Мария Смирнова', { exact: true })).toBeVisible()
  await expect(card.getByText('maria@example.com', { exact: true })).toBeVisible()
  await expect(card.getByText(`Слот: ${day}-10:00`, { exact: true })).toBeVisible()
  await expect(card.getByText(`Создано: ${createdCaption(createdAt)}`, { exact: true })).toBeVisible()
  await expect(card.getByText(`${TYPE_NAME} · 60 мин`, { exact: true })).toBeVisible()

  // Тип попал и в свой блок — карточка брони его не вытеснила.
  await expect(page.getByRole('region', { name: 'Типы встреч' }).getByRole('article')).toHaveCount(1)
})
