# Календарь звонков


[![hexlet-check](https://github.com/azeos1101/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/azeos1101/ai-for-developers-project-386/actions)

Разработайте совместно с ИИ сервис для бронирования календаря

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Стек

- **Ruby** + **Sinatra** — лёгкий веб-фреймворк (без авторизации, один владелец календаря)
- **Хранение в памяти процесса** — типы встреч и брони живут в `Store` (Ruby `Mutex` для атомарности проверки конфликтов). **Ограничение: перезапуск процесса сбрасывает все записи.**
- **React (JSX) + Vite** — фронтенд; Sinatra отдаёт собранный `frontend/dist`, в dev-режиме — Vite с прокси `/api` на Sinatra
- **Кастомный CSS** — стилизация под эталон (светлая тема, оранжевый акцент)
- **TypeSpec → OpenAPI 3 → клиентский SDK** — API проектируется контрактом (`contract/main.tsp`), спецификация генерируется (`openapi/openapi.yaml`), SDK для фронтенда генерирует `@hey-api/openapi-ts` в `frontend/src/sdk/`

## Установка

```bash
git clone https://github.com/azeos1101/ai-for-developers-project-386.git
cd ai-for-developers-project-386
mise run install   # зависимости: гемы, компилятор контракта и фронтенд
mise run generate  # TypeSpec → OpenAPI → SDK в frontend/src/sdk/ (нужен только при смене контракта)
```

`mise run install` ставит и Schemathesis для `check:contract`: `pipx` и `pipx:schemathesis` зафиксированы в `[tools]` mise.toml.

## Использование

```bash
mise run build  # сборка фронтенда в frontend/dist
mise run run    # сервер на http://localhost:4567
mise run dev    # Vite dev-сервер с прокси /api на :4567
mise run setup  # демо-данные в уже запущенный сервис через его API (адрес из переменной PORT)
mise run check  # линтеры + тесты + сверка сгенерированного
mise run check:contract  # Schemathesis: фаззинг запущенного сервера по openapi/openapi.yaml (в check не входит)
```

`make` — тонкая обёртка над этими командами (`make install`, `make generate`, `make run`, `make test`, `make lint`, `make check`).

## Зафиксированные параметры спецификации

- **Окно записи**: 14 календарных дней, начиная с сегодняшнего; окно сдвигается со временем. Слот нельзя занять в прошлом (старт не раньше текущего момента).
- **Часы работы владельца**: 09:00–18:00 **Europe/Moscow** (UTC+3).
- **Шаг доступных стартов**: 30 минут; слот должен целиком помещаться в рабочие часы.
- **Длительность слота** = длительность выбранного типа встречи.
- **Пересечение интервалов запрещено**, включая частичное наложение разных типов встреч. Встреча может начинаться в момент окончания предыдущей.
- **Гонки**: проверка конфликта и создание брони атомарны (мьютекс). При одновременных запросах создаётся только одна бронь, остальные получают `409 Conflict`.

## API

Контракт: `contract/main.tsp` (TypeSpec) → спецификация: `openapi/openapi.yaml`.

| Метод | Маршрут | Описание |
|---|---|---|
| GET | `/api/meeting-types` | Список типов встреч |
| POST | `/api/meeting-types` | Создание типа встречи (владелец) |
| GET | `/api/availability?date=&meeting_type_id=` | Слоты дня с доступностью |
| GET | `/api/availability/days?meeting_type_id=` | Счётчики свободных слотов по всем дням окна |
| GET | `/api/bookings` | Предстоящие брони (все типы) |
| POST | `/api/bookings` | Создание брони (`201` / `409` / `422`) |

Страницы: `GET /` (главная страница: вводная о сервисе + «Записаться →») → `GET /booking` (страница записи: выбор типа встречи, GLOSSARY.md; `?type=` — календарь и слоты) → `GET /booking/confirm` (форма) → успех; `GET /events` («Предстоящие события» + управление типами встреч).

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.

---

# Исследование оригинала (Cal.com): раздел Events

Исследование проведено на живом аккаунте Cal.com (app.cal.com, ноябрь 2026): создано тестовое событие, пройдены все этапы от создания до публикации и удаления.

## Жизненный цикл события

```
Создание (mad-libs форма) → Черновик (Draft, редактор из 12 табов) → Публикация (Publish)
→ Публичная страница + регистрация гостей (RSVP) → Управление гостями → Отмена (Cancel event) / Удаление (Delete)
```

## Этап 1. Создание (`/events/new`)

Экран в стиле «mad-libs» — предложение с кликабельными подчёркнутыми фрагментами:

> I'm hosting **my event** on **Nov 15 at 5:00 PM** until **6:00 PM** **somewhere**.

Атрибуты, задаваемые при создании:

| Атрибут | По умолчанию | Примечание |
|---|---|---|
| `title` | «my event» | contenteditable-поле |
| `starts_at` | сегодня, 17:00 | date-picker (прошедшие даты недоступны) + поле времени |
| `ends_at` | сегодня, 18:00 | только время |
| `location` | «somewhere» | contenteditable-поле (текст/ссылка) |
| `visibility` | `public` | radio: Public / Private |
| `requires_confirmation` | выкл | тумблер «Require approval» |
| `timezone` | TZ аккаунта | селектор (Europe/Moscow) |

Кнопка «Create event» (⌘↵). Событие сразу создаётся в БД со статусом **Draft** и автогенерированным slug из названия (`cal.com/test-standup-event`), после чего открывается редактор черновика.

## Этап 2. Черновик (`/events/:id?tabName=...`)

Шапка: бейдж **Draft** (жёлтый), превью (моб./десктоп), кнопки **Publish** и **Save**. Справа — live-preview публичной страницы.

### Setup

- **Basics**: Title; Visibility (Public = «опубликовано на Discover, любой может найти и зарегистрироваться» / Private); About the event (rich-text описание); тумблер «Translate using AI»; URL (редактируемый slug); Starts/Ends (datetime); Timezone
- **Appearance**: Category (селектор, напр. Meetup); Theme (System default / Light / Dark); Cover — Poster (автогенерация: Layout + Shuffle, Palette, Text style, цвета Background/Text/Accent в hex) или Image (загрузка своей обложки)
- **Locations**: список локаций; у каждой — тип (Cal Video / In Person (Organizer Address) / …), значение, Label для гостей, Capacity (−/+ , Unlimited); «+ Add a location»; блок **Live streams** («+ Add live stream», показывается публично)
- **Page content**: **Lineup** (спикеры/участники, до 30, свой заголовок блока); **Schedule** (программа события, до 50 пунктов, привязка людей к пунктам)
- **Hosts**: список хостов (создатель помечен Creator); приглашение внешних co-hosts по email (могут редактировать событие и управлять гостями)

### Attendance

- **Settings**: тумблер **Capacity** (лимит мест); тумблер **Waitlist** (лист ожидания при заполнении); **Registration window** — открытие регистрации (по умолч. «When published») и закрытие (по умолч. «When the event starts»)
- **Guests**: в черновике недоступно — «Publish this event to invite guests and manage the roster»

### Registration experience

- **Registration form**: настраиваемые вопросы (Booking questions); обязательные по умолчанию: **Your name** (Name), **Email address** (Email); «+ Add a question». У гостя в форме есть чекбокс «Show my name on the public guest list» (Yes/No) и кнопка «Register in one click»
- **Payment**: тумблер **Paid event** — цена задаётся per location; гость платит за выбранную локацию при RSVP; пустая цена = бесплатно

### Policies

- **Privacy & security**: тумблер **Requires confirmation** (брони ждут одобрения — то же, что «Require approval» при создании); тумблер **Hide host's email**; **Public guests** (radio: Don't show guests / Show guest names — по умолч. / Show going count only); тумблер **Event chat** (чат между гостями и хостами)

### Automation

- **Workflows**: привязка воркфлоу (авто-напоминания)
- **Webhooks**: отправка регистрационных событий во внешние сервисы

## Этап 3. Публикация

Кнопка **Publish** → бейдж меняется на **Published** (зелёный), тост «Event published», модалка **Share event**:

- ссылка на событие (`cal.com/:slug`) + копирование
- шаринг: WhatsApp, X, LinkedIn, Email
- QR-код для постеров + Download

После публикации в шапке появляются действия: открыть страницу, копировать ссылку, embed (`</>`), поделиться, **снять с публикации** (красная иконка).

## Этап 4. Публичная страница (`cal.com/:slug`)

- Обложка-постер, название, бейдж даты (МЕС/ДД), «Sunday, November 15, 5:00–6:00 PM GMT+3», бейдж «Today»
- Локация (Cal Video), блок **Registration** с кнопкой Register (для хоста — «Manage event»)
- **Hosted by** (хост + кнопка Share event), счётчик «N Going», список гостей / «No guests yet»
- Регистрация гостя: имя*, email*, «Show my name on the public guest list» → «Register in one click»

## Этап 5. Управление

**Список событий** (`/events`): карточка — постер, дата/время, название, локация, хост; действия: открыть страницу, копировать ссылку, меню (⋯): **Edit, Duplicate, View guests, Share event, Embed, Cancel event, Delete**.

**Guests** (после публикации) — kanban-доска из 5 колонок: **Invited / Pending / Going / Maybe / Not going** (хост автоматически в «Going» с пометкой Host). Поиск гостей, Invite guests, Message guests, Message history, Check-in mode, Download (экспорт списка).

**Delete**: модалка-подтверждение «Delete event? Guests will be notified that it is cancelled. This cannot be undone.» → Cancel / Delete. **Cancel event** — отмена с уведомлением гостей без удаления.

## Модель данных для нашего MVP (Events)

```
Event:   id, title, slug, description, starts_at, ends_at, timezone,
         status (draft/published/canceled), visibility (public/private),
         requires_confirmation, capacity (null = безлимит), waitlist,
         registration_opens_at, registration_closes_at, category,
         guests_privacy (hide/names/count), host_id
Location: id, event_id, type (cal_video/in_person/link), value, label, capacity, price
Host:    id, event_id, name, email, role (creator/co-host)
Guest:   id, event_id, name, email, status (invited/pending/going/maybe/not_going),
         show_name_publicly, checked_in_at
Question: id, event_id, label, type, required
```

Минимум для MVP: создание (title, starts/ends, location, visibility, require approval) → черновик (Basics + Locations + Capacity/Waitlist + Registration form) → Publish → публичная страница с RSVP-формой → список гостей по статусам → Cancel/Delete.

---

# Эталонное поведение клиентской части (Hexlet reference)

Источник: https://files.hexlet.app/a/2ipc5m (7 скриншотов + видео `.webm`). Это тот флоу, который увидит клиент по нашей ссылке. Интерфейс на русском, светлая тема, оранжевый акцент, шапка с логотипом «Calendar» и навигацией «Записаться» / «Предстоящие события».

## Экраны

### 1. Лендинг
- Бейдж «БЫСТРАЯ ЗАПИСЬ НА ЗВОНОК», заголовок «Calendar», подпись «Один экран, понятные слоты, быстрая бронь…»
- Кнопка «Записаться →»
- Карточка «Что доступно прямо сейчас»: фиксированные 30-минутные слоты с 09:00 до 18:00; проверка конфликта при бронировании; просмотр предстоящих событий в отдельном разделе

### 2. «Запись на звонок» — выбор даты и слота (3 колонки)
- **Информация**: Выбранная дата («суббота, 28 марта» / «Дата не выбрана»); Выбранное время («09:00 - 09:30» / «Время не выбрано»); Свободно (число свободных слотов дня, от 18 до 0); Длительность («30 мин» / «Нет слотов на этот день»)
- **Календарь**: месяц («март 2026 г.»), переключение стрелками ← →, неделя с понедельника (Пн Вт Ср Чт Пт Сб Вс); у доступных дней бейдж «N св.» (число свободных слотов); выбранный день — оранжевая рамка. Прошлые дни и текущий день — без бейджей (слоты только на будущие даты)
- **Статус слотов**: до выбора даты — «Выберите дату в календаре.»; после — список всех слотов дня: «09:00 - 09:30 — Занято» (серый, недоступен) / «Свободно»; выбранный слот подсвечен оранжевым; кнопки **«Назад»** и **«Продолжить»** (неактивна, пока не выбран свободный слот)

### 3. «Подтверждение записи»
- Слева — блок «Информация» с выбранными датой/временем
- Справа — форма: **Имя**, **Email**, кнопка **«Подтвердить запись»**; кнопка **«Изменить»** возвращает к выбору слота

### 4. Успех
- «Бронь подтверждена. До встречи!» + кнопка «Забронировать еще» (возврат на экран записи)

### 5. «Предстоящие события»
Список карточек броней: **Имя** (жирным), email, «Слот: `2026-03-28-09:00`» (формат `YYYY-MM-DD-HH:MM` — начало слота), «Создано: `27.03.2026, 14:40`» (формат `DD.MM.YYYY, HH:MM`).

## Бизнес-правила (зафиксированы по эталону)

- Слоты фиксированные: **30 минут, с 09:00 до 18:00** → 18 слотов в день
- Занятый слот забронировать нельзя — **проверка конфликта при бронировании** (после брони слот становится «Занято», счётчики «Свободно» и «N св.» уменьшаются)
- Бронь = имя + email + слот; один слот — одна бронь
- Данные демо-примеров: `Demo User <timestamp>`, `demo-<timestamp>@example.com`

## Минимальная модель для клиентского флоу (актуализирована)

```
MeetingType: id, name, description, duration (минуты)
Booking:     id, meeting_type_id, name, email, date (YYYY-MM-DD),
             start (HH:MM), end (HH:MM), created_at
```

Слоты: шаг 30 минут в часы 09:00–18:00 Europe/Moscow, длительность = длительность типа встречи, окно — 14 дней от сегодня (см. «Зафиксированные параметры спецификации» выше). Конфликт — по пересечению интервалов независимо от типа встречи.

Маршруты: `GET /` (лендинг) → `GET /booking` (календарь + слоты) → `POST /api/bookings` (создание, с проверкой конфликта → `409` «слот занят») → успех; `GET /events` («Предстоящие события» — список будущих броней всех типов).
