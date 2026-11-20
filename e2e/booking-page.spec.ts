import { expect, test, type APIRequestContext } from '@playwright/test'

// Страница записи по спецификации #19 (user stories 2, 19, 21): без ?type= и с неизвестным
// ?type= — список типов встреч; пустое хранилище — одно пустое состояние. Фикстуры создают
// типы через API (хранилище старта пусто, сидов нет). Локаторы — по ролям и доступным
// текстам, не по CSS (ADR-0002). Сервер в e2e один на весь прогон (webServer), поэтому
// файл идёт последовательно: пустое состояние проверяется до создания типов фикстурами.
test.describe.configure({ mode: 'serial' })

type MeetingTypeFixture = {
  id: string
  name: string
  description: string
  duration: number
}

async function createMeetingType(request: APIRequestContext, type: MeetingTypeFixture): Promise<void> {
  const response = await request.post('/api/meeting-types', { data: type })
  expect(response.ok(), `не удалось создать тип ${type.id}: ${response.status()}`).toBe(true)
}

test('пустое хранилище — одно пустое состояние, списка типов нет', async ({ page }) => {
  await page.goto('/booking')

  await expect(page.getByRole('heading', { name: 'Страница записи' })).toBeVisible()
  await expect(page.getByText('Владелец ещё не завёл типы встреч. Загляните позже.')).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
})

test('список типов: название, описание и длительность «NN мин» в порядке заведения', async ({ request, page }) => {
  await createMeetingType(request, {
    id: 'intro-call',
    name: 'Созвон-знакомство',
    description: 'Короткий звонок, чтобы познакомиться',
    duration: 30,
  })
  await createMeetingType(request, {
    id: 'consult',
    name: 'Консультация',
    description: 'Час разбора вашего проекта',
    duration: 60,
  })

  await page.goto('/booking')

  const cards = page.getByRole('article')
  await expect(cards).toHaveCount(2)

  await expect(cards.nth(0).getByRole('heading', { name: 'Созвон-знакомство' })).toBeVisible()
  await expect(cards.nth(0)).toContainText('Короткий звонок, чтобы познакомиться')
  await expect(cards.nth(0)).toContainText('30 мин')

  await expect(cards.nth(1).getByRole('heading', { name: 'Консультация' })).toBeVisible()
  await expect(cards.nth(1)).toContainText('Час разбора вашего проекта')
  await expect(cards.nth(1)).toContainText('60 мин')
})

test('неизвестный ?type= — тот же список типов, без ошибки', async ({ page }) => {
  await page.goto('/booking?type=net-sushchestvuet')

  await expect(page.getByText('Владелец ещё не завёл типы встреч. Загляните позже.')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Созвон-знакомство' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(2)
})
