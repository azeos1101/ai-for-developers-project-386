# AGENTS.md — Календарь звонков (учебный проект Хекслета)

Сервис бронирования звонков. Бекенд: Ruby + Sinatra (JSON API + отдача собранного фронтенда из `frontend/dist`). Фронтенд: React (JSX) + Vite, TypeScript — только в генерируемом SDK. Хранение в памяти процесса (запланирован `Store` + `Mutex` для атомарности проверки конфликтов).
API проектируется контрактом: `contract/main.tsp` (TypeSpec) → `openapi/openapi.yaml` (генерируется) → `frontend/src/sdk/` (генерируется).
Требования и зафиксированные параметры (окно 14 дней, 09:00–18:00 Europe/Moscow, шаг 30 мин, 409 при пересечении) — в `README.md`. Состояние и план по шагам — в `docs/plan.md`.

## Команды

- `mise run install` — зависимости.
- `mise run check` — линт + тесты (rack + Playwright e2e) + сверка сгенерированного. **Задача не готова, пока `mise run check` не прошёл.** Git-хуки (`hk.pkl`): pre-commit — `lint`, pre-push — `check`.
- `mise run test` — только тесты; `mise run lint` — только линтеры; `mise run generate` — пересобрать OpenAPI и SDK.
- `mise run run` — сервер на http://localhost:4567 (порт из переменной `PORT`); `mise run dev` — Vite с прокси `/api` на :4567; `mise run build` — сборка фронтенда.
- `mise run docker:smoke` — собрать Docker-образ и проверить запуск контейнера; `E2E_BASE_URL=<ссылка> mise run test:e2e:remote` — e2e против развёрнутого сервиса (файлы выката — `deploy/`).
- CI (`.github/workflows/check.yml`) на каждый push: `install` → `build` → `check`.

## Правила

- Падение проверки печатает `rule N: …; fix: …` — исправляй ровно по `fix`, не обходи проверку.
- `openapi/` и `frontend/src/sdk/` генерируются (`.gitattributes`). Руками не править: меняй `contract/main.tsp`, затем `mise run generate` (`generate:check` ловит расхождение).
- Меняешь API → сначала контракт, потом код и тесты. Код должен отвечать ровно по контракту (коды 201/409/422).
- Исправляй причину, а не симптом: никаких `rescue nil`, пустых `rescue`, «значений по умолчанию» вместо ошибки (ast-grep-правила в `ast-grep/rules/`).
- Тесты: minitest + rack-test, через HTTP-интерфейс приложения, без моков своего кода. Сначала тест, который падает, потом код.
- Ожидаемое значение в тесте берётся из требования (README), а не вычисляется проверяемым кодом.
- Коммиты — Conventional Commits, описание по-русски: `feat: запись на свободный слот`.
- Каждый коммит реализации ссылается на закрываемый тикет: в конце описания — `(#N)`, где N — номер тикета из истории этого репозитория, например `feat: запись на свободный слот (#12)`.
- Не трогай `.github/workflows/hexlet-check.yml` — по нему Хекслет проверяет проект.
- Не меняй файлы, которых не касается задача. Чужие незакоммиченные изменения не трогай.
- Не делай `git push` и не коммить без просьбы (push — только после явного «да»).
- Застрял: одна и та же ошибка проверки дважды подряд → вызови субагента `advisor`, не перебирай варианты.
- Готовая задача: `mise run check` зелёный + ревью субагента `review`.
- Перед «готово» опиши: что изменено, какие команды запускал и их результат, что не проверено.

## Agent skills

В OpenCode скиллы набора вызываются просьбой по имени («Запусти скилл wayfinder») или ссылкой `@.agents/skills/<имя>/SKILL.md`.

### Issue tracker

Задачи ведутся в GitHub Issues репозитория `azeos1101/ai-for-developers-project-386` (через `gh` CLI). См. `docs/agents/issue-tracker.md`.

### Triage labels

Используются пять меток по умолчанию: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. См. `docs/agents/triage-labels.md`.

### Domain docs

Один контекст: словарь `GLOSSARY.md` в корне, решения — `docs/adr/`. См. `docs/agents/domain.md`.
