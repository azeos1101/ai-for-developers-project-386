import { defineConfig, devices } from '@playwright/test'

// ADR-0002: e2e идут против настоящего запущенного сервера (Sinatra отдаёт собранный
// frontend/dist), браузер — chromium, сервер поднимается сам на порту 4580.
const PORT = 4580

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'mise run run',
    env: { PORT: String(PORT) },
    cwd: '..',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
