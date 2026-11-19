import { defineConfig, devices } from '@playwright/test'

// ADR-0002: e2e идут против настоящего запущенного сервера (Sinatra отдаёт собранный
// frontend/dist), браузер — chromium, сервер поднимается сам на порту 4580.
// Второй сервер на 4581 — изолированное хранилище для файлов, которым нужно пустое
// состояние и предсказуемый состав списков: хранилище живёт в памяти процесса и на
// общем сервере фикстуры одного файла ломают проверки другого (тикеты #21, #22).
// Третий сервер на 4582 — спеку календаря (#23) тоже нужен свой процесс: её фикстуры
// расширяют список типов, а соседние спеки сверяют его состав строго по количеству.
const PORT = 4580
const ISOLATED_PORT = 4581
const CALENDAR_PORT = 4582

const server = (port: number) => ({
  command: 'mise run run',
  env: { PORT: String(port) },
  cwd: '..',
  url: `http://127.0.0.1:${port}`,
  reuseExistingServer: false,
  timeout: 60_000,
})

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [server(PORT), server(ISOLATED_PORT), server(CALENDAR_PORT)],
})
