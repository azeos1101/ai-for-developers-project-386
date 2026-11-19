import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Страница предстоящих событий по спецификации #19 (тикеты #22): форма создания типа встречи
// и блок списка типов; пустое хранилище — оба блока на месте, форма доступна. Файл идёт
// последовательно и использует собственный сервер на порту 4581 (webServer в конфиге):
// хранилище живёт в памяти процесса, и на общем сервере фикстуры других файлов мешали бы
// проверке пустого состояния и состава списка. Фикстуры создают типы через API.
// Локаторы — по ролям и доступным текстам, не по CSS (ADR-0002).
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: 'http://127.0.0.1:4581/' })

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

async function fillTypeForm(
  page: Page,
  type: { id: string; name: string; description: string; durationMinutes: number },
): Promise<void> {
  await page.getByLabel('id', { exact: true }).fill(type.id)
  await page.getByLabel('Название').fill(type.name)
  await page.getByLabel('Описание').fill(type.description)
  await page.getByLabel('Длительность').selectOption(String(type.durationMinutes))
}

test('пустое хранилище — форма создания и список типов на месте, форма доступна', async ({ page }) => {
  await page.goto('/events')

  await expect(page.getByRole('form', { name: 'Создание типа встречи' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Типы встреч' })).toBeVisible()
  await expect(page.getByText('Типы встреч ещё не заведены — создайте первый тип ниже.')).toBeVisible()

  await expect(page.getByPlaceholder('intro-call')).toBeEditable()
  await expect(page.getByRole('button', { name: 'Создать тип встречи' })).toBeEnabled()
  await expect(page.getByLabel('Длительность').locator('option')).toHaveText([
    '30 мин',
    '60 мин',
    '90 мин',
    '120 мин',
    '150 мин',
    '180 мин',
    '210 мин',
    '240 мин',
  ])
})

test('созданный тип появляется в списке без перезагрузки, форма очищается', async ({ page }) => {
  await page.goto('/events')

  await fillTypeForm(page, {
    id: 'coffee-chat',
    name: 'Кофейный чат',
    description: 'Неформальный разговор за кофе',
    durationMinutes: 30,
  })
  await page.getByRole('button', { name: 'Создать тип встречи' }).click()

  const cards = page.getByRole('article')
  await expect(cards).toHaveCount(1)
  await expect(cards.nth(0).getByRole('heading', { name: /Кофейный чат/ })).toBeVisible()
  await expect(cards.nth(0)).toContainText('30 мин')
  await expect(cards.nth(0)).toContainText('coffee-chat')
  await expect(cards.nth(0)).toContainText('Неформальный разговор за кофе')

  await expect(page.getByLabel('id', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Название')).toHaveValue('')
  await expect(page.getByLabel('Описание')).toHaveValue('')
  await expect(page.getByLabel('Длительность')).toHaveValue('30')
})

test('занятый id — баннер про существующий тип и подсветка поля id', async ({ request, page }) => {
  await createMeetingType(request, {
    id: 'intro-call',
    name: 'Созвон-знакомство',
    description: '',
    duration: 30,
  })

  await page.goto('/events')

  await fillTypeForm(page, { id: 'intro-call', name: 'Повтор созвона', description: '', durationMinutes: 60 })
  await page.getByRole('button', { name: 'Создать тип встречи' }).click()

  await expect(page.getByRole('alert')).toHaveText('Тип с таким id уже существует.')
  await expect(page.getByLabel('id', { exact: true })).toHaveAttribute('aria-invalid', 'true')
})

test('некорректные поля — баннер о проверке полей', async ({ page }) => {
  await page.goto('/events')

  await fillTypeForm(page, { id: 'Ab C', name: 'Кривой id', description: '', durationMinutes: 30 })
  await page.getByRole('button', { name: 'Создать тип встречи' }).click()

  await expect(page.getByRole('alert')).toHaveText('Не удалось создать тип встречи. Проверьте поля.')
})
