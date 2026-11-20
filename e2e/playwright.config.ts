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
// Четвёртый сервер на 4583 — спека слотов дня (#24): свои фикстуры типов, чтобы не трогать
// строгие сверки состава списков на 4580/4581 и календарные проверки на 4582.
const SLOTS_PORT = 4583
// Пятый сервер на 4584 — сквозной сценарий бронирования (#25): он создаёт брони, а память
// процесса общая на весь сервер — соседние спеки сверяют счётчики и списки строго.
const BOOKING_FLOW_PORT = 4584
// Шестой сервер на 4585 — конфликт слота (#26): свои брони и строгая сверка занятых
// слотов, чтобы не мешать сквозному сценарию на 4584 и сверкам соседних спеков.
const BOOKING_CONFLICT_PORT = 4585
// Седьмой сервер на 4586 — список предстоящих броней (#27): первому тесту нужно пустое
// хранилище броней, а фикстуры создаются внутри файла — процесс только свой.
const UPCOMING_BOOKINGS_PORT = 4586
// Восьмой сервер на 4587 — шапка и заголовки (#28): фикстура создаёт тип для deep-link'а
// подтверждения, чтобы не трогать строгие сверки составов списков на соседних портах.
const HEADER_PORT = 4587

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
  webServer: [
    server(PORT),
    server(ISOLATED_PORT),
    server(CALENDAR_PORT),
    server(SLOTS_PORT),
    server(BOOKING_FLOW_PORT),
    server(BOOKING_CONFLICT_PORT),
    server(UPCOMING_BOOKINGS_PORT),
    server(HEADER_PORT),
  ],
})
