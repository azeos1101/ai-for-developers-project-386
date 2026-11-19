import { expect, test } from '@playwright/test'

// Требование шага 3: «главная страница открывается и ведёт на страницу записи» (ADR-0002).
test('кнопка «Записаться» ведёт на заглушку страницы записи', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: /Записаться/ }).click()

  await expect(page).toHaveURL(/\/booking$/)
  await expect(page.getByRole('heading', { name: 'Страница записи' })).toBeVisible()
  await expect(page.getByText('Выбор времени появится позже')).toBeVisible()
  await expect(page.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/')
})

test('заглушка страницы записи игнорирует query-параметры', async ({ page }) => {
  await page.goto('/booking?type=1')

  await expect(page.getByText('Выбор времени появится позже')).toBeVisible()
})
