# План проекта «Календарь звонков»

Срок: **08.12.2026** (отсрочка). Задание целиком — [assignment.md](assignment.md); шаги ниже — по его разделам «Шаг 0–6».

Роли моделей (OpenCode):

| Работа | Агент | Модель |
|---|---|---|
| Интервью, карта решений, спецификация, тикеты (`/grill-with-docs`, `/wayfinder`, `/to-spec`, `/to-tickets`) | `plan` | Kimi k3.1-pro |
| Реализация одного тикета (`/implement`, TDD) | `build` | Qwen на Strata |
| Ревью диффа, помощь при застревании | `review`, `advisor` | Kimi |
| Оркестрация `/implement-spec` | — | Kimi; исполнители по тикетам — Qwen, **по одному** (Strata не тянет параллель) |

Правило для Qwen: один тикет = одна новая сессия; готово = `mise run check` зелёный + ревью `review`.

## Состояние на 2026-11-19

| Шаг | Что требуется | Есть | Не хватает |
|---|---|---|---|
| 0. Описание | Сценарий гостя и владельца в README | ✅ исследование Cal.com, зафиксированные параметры | — |
| 1. Каркас | Бек + фронт запускаются; тест-раннер + дымовой тест; линтеры; одна команда проверок **в GitHub Actions на push**; версии зафиксированы; Conventional Commits в AGENTS.md; AGENTS.md через `/init` и сокращён | `mise.toml`, `mise run check` (RuboCop, ast-grep, vacuum, rake test, `generate:check`), AGENTS.md, контракт | Sinatra-приложение, фронтенд, дымовой тест, workflow CI, правило Conventional Commits (сейчас в AGENTS.md «по-русски, что и зачем» — противоречит заданию), hk-хуки |
| 2. Скиллы | `npx skills@latest add mattpocock/skills`; `setup-matt-pocock-skills` → `docs/agents/`, трекер GitHub Issues; раздел про скиллы в AGENTS.md | — | всё |
| 3. Главная страница | `/grill-with-docs` → `GLOSSARY.md`, `docs/adr/`; `/implement` главной с тестами; CI зелёный | — | всё |
| 4. Проектирование | `/wayfinder` → карта в Issues; `/to-spec`; `/to-tickets` (первый тикет — вся контрактная цепочка; в графе: проверки, API-тесты, Playwright, эксперимент с тестом, release-please) | контракт и параметры в README — вход для интервью | всё |
| 5. Реализация | `/implement-spec`; SDK на фронте; API-тесты по контракту; Playwright с настоящим сервером; тест частичного пересечения 60/30 мин; «временная поломка» теста в тикете; коммиты `(#N)`; release-please | — | всё |
| 6. Docker и деплой | `Dockerfile`, старт по `PORT`; Render через MCP; публичная ссылка в README; шаблон MCP-конфига без секретов | — | всё |

## Порядок работы

### Этап A. Каркас (шаг 1) — облако планирует, Qwen делает, я проверяю
1. Решения по стеку (см. «Открытые вопросы»), запись в README.
2. Sinatra-приложение по официальному getting started: `config.ru`, `GET /` отвечает, `GET /api/health`. Дымовой тест (rack-test).
3. Фронтенд: React (JSX) + Vite по официальному getting started; `vite build` → статика, которую отдаёт Sinatra; в dev — прокси Vite на Sinatra.
4. Цепочка SDK: `mise run generate` = TypeSpec → OpenAPI → SDK (`@hey-api/openapi-ts`); `generate:check` покрывает `frontend/src/sdk/`.
5. `.github/workflows/check.yml`: `jdx/mise-action` → `mise run install` → `mise run check` на каждый push (пины по SHA, `permissions: contents: read`, `timeout-minutes`, `concurrency`).
6. hk: pre-commit — быстрые проверки staged-файлов; pre-push — `mise run check`.
7. AGENTS.md: `/init` в OpenCode, сверка с нашим, сокращение; правило Conventional Commits (`feat:`/`fix:`… + описание по-русски).
8. Push → зелёный CI.

### Этап B. Скиллы (шаг 2)
1. `npx skills@latest add mattpocock/skills` → `.agents/skills/` (видят и OpenCode, и Claude Code); закоммитить.
2. `setup-matt-pocock-skills` на Kimi: трекер — GitHub Issues этого репо, метки по умолчанию, `GLOSSARY.md`, `docs/adr/`.
3. Проверка новой сессией: агент называет трекер и `mise run check`.

### Этап C. Главная страница (шаг 3)
1. `/grill-with-docs` (Kimi) по главной → `GLOSSARY.md`, ADR.
2. `/implement` (Qwen, новая сессия) главной с тестами → `review` → CI зелёный.

### Этап D. Проектирование (шаг 4) — Kimi, несколько сессий
`/wayfinder` → разбор вопросов карты по одному → `/to-spec` → `/to-tickets`. Вход: README (параметры уже зафиксированы), текущий `contract/main.tsp`.

### Этап E. Реализация (шаг 5)
`/implement-spec` по спецификации; тикеты — по одному, Qwen, после каждого `mise run check` + `review`. Добавить в `check`: API-тесты по контракту, Playwright. Эксперимент «временная поломка» правила пересечения — записать в тикет. release-please после первой функции.

### Этап F. Docker и деплой (шаг 6)
`Dockerfile` (multi-stage: сборка фронта → Ruby-образ), старт по `PORT`; выкат на VPS `.44` в Docker под доменом пользователя; Render MCP — шаблон конфигурации и инструкция в README (как в задании); проверка сценария по ссылке; README.

## Принятые решения (2026-11-19)

1. **Стек:** бекенд Ruby + Sinatra (JSON API + отдача собранного фронта), фронтенд **React на JavaScript (JSX) + Vite**. TypeScript не используем в своём коде: его сложно ревьюить. Клиентский SDK генерирует `@hey-api/openapi-ts` (выдаёт TS), Vite собирает его вместе с JSX без отдельной настройки; наш код вызывает только функции SDK.
1a. **Браузерные тесты (шаг 5):** TypeScript + Playwright (`e2e/`, `@playwright/test`), гоняются против настоящего запущенного сервера, входят в `mise run check`. TS здесь — только в e2e-тестах; в коде приложения — JS.
2. **Сервер по контракту:** гем `committee` в API-тестах (каждый запрос/ответ сверяется с `openapi/openapi.yaml`) + Schemathesis отдельной задачей (`mise run check:contract`, фаззинг запущенного сервера; не в каждом `check`).
3. **Сгенерированное в git:** `openapi/` и `sdk/` коммитим, `generate:check` в CI ловит расхождение.
4. **Коммиты:** Conventional Commits, текст по-русски: `feat: запись на свободный слот (#12)`.
5. **Push:** только после явного «да» пользователя на каждый push.
6. **Деплой:** фактически — свой VPS (`.44`) в Docker, домен пропишет пользователь. В README и описании проекта **Render остаётся** как путь из задания (шаблон MCP-конфигурации без секретов + инструкция), рядом — описание нашего выката на VPS и публичная ссылка.

## Открытые вопросы

1. VPS `.44`: способ доступа для выката (SSH-пользователь, есть ли там reverse-proxy/TLS — Caddy/Traefik/nginx), домен.
