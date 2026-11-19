import { expect, test } from '@playwright/test'

// ADR-0001: на неизвестном пути фронтенд рисует «Страницу не найдена» со ссылкой на главную.
test('неизвестный путь показывает страницу «Страница не найдена»', async ({ page }) => {
  await page.goto('/net-such-page')

  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/')
})
