import { expect, test } from '@playwright/test'

// Эталон браузерного теста (ADR-0002): содержимое страниц проверяется на собранном
// фронтенде, локаторы — по ролям и доступным именам, не по CSS-классам.
// Строковые локаторы getByText ищут подстроку точно (с учётом регистра).
test('главная страница рассказывает про сервис', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Запись на звонок')
  await expect(page.getByRole('heading', { level: 1, name: 'Запись на звонок' })).toBeVisible()
  await expect(page.getByText('Выберите тип встречи и свободное время')).toBeVisible()
  await expect(page.getByText('ближайшие 14 дней')).toBeVisible()
  await expect(page.getByText('Регистрация не нужна')).toBeVisible()
})

test('с главной страницы есть ссылка на страницу записи', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: /Записаться/ })).toHaveAttribute('href', '/booking')
})
