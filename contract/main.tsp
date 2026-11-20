import "@typespec/http";
import "@typespec/openapi";
import "@typespec/json-schema";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Call Booking Service" })
@info(#{ version: "1.0.0" })
@doc("""
  Упрощённый сервис бронирования времени по мотивам Cal.com.

  Правила предметной области (зафиксированы в контракте):
  - Окно записи: 14 календарных дней, начиная с сегодняшнего (по Europe/Moscow), окно сдвигается со временем.
  - Часы работы владельца: 09:00-18:00 Europe/Moscow (UTC+3).
  - Шаг доступных стартов: 30 минут (09:00, 09:30, ..., слот должен целиком помещаться в рабочие часы).
  - Длительность слота совпадает с длительностью выбранного типа встречи.
  - Слот нельзя занять в прошлом: старт должен быть не раньше текущего момента.
  - Пересечение интервалов запрещено, включая частичное наложение разных типов встреч.
    Встреча может начинаться в момент окончания предыдущей.
  - Правила действуют и для одновременных запросов: создаться может только одна бронь,
    остальные получают 409 Conflict.
  """)
namespace CallBooking;

/** Тип встречи, заведённый владельцем календаря */
model MeetingType {
  /** Идентификатор типа встречи — слаг, который задаёт владелец */
  @pattern("^[a-z0-9-]{1,64}$") id: string;

  /** Название (например, «Созвон-знакомство») */
  @minLength(1) name: string;

  /** Описание встречи */
  description: string;

  /** Длительность встречи в минутах — от 30 до 240 включительно, кратна 30 */
  @minValue(30)
  @maxValue(240)
  @JsonSchema.multipleOf(30)
  duration: integer;
}

/** Запрос на создание типа встречи; id задаёт владелец */
model MeetingTypeInput {
  /** Идентификатор типа встречи — слаг `^[a-z0-9-]{1,64}$` (например, `intro-call`) */
  @pattern("^[a-z0-9-]{1,64}$") id: string;

  /** Название встречи */
  @minLength(1) name: string;

  /** Описание встречи */
  description?: string = "";

  /** Длительность встречи в минутах — от 30 до 240 включительно, кратна 30 */
  @minValue(30)
  @maxValue(240)
  @JsonSchema.multipleOf(30)
  duration: integer;
}

/** Один слот дня в разрезе доступности */
model Slot {
  /** Время начала слота, HH:MM (Europe/Moscow) */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") start: string;

  /** Время окончания слота, HH:MM (Europe/Moscow) */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") end: string;

  /** true, если слот свободен и его можно забронировать */
  available: boolean;
}

/**
  Доступность слотов на конкретную дату для типа встречи.

  День содержит только старты с шагом 30 минут, чей слот целиком помещается
  в рабочие часы; старты, не влезающие в часы, не возвращаются. Прошедшие старты
  сегодняшнего дня возвращаются с `available: false`.
*/
model Availability {
  /** Дата в формате YYYY-MM-DD */
  @pattern("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$") date: string;

  /** Идентификатор типа встречи (слаг) */
  @pattern("^[a-z0-9-]{1,64}$") meeting_type_id: string;

  /** Все влезающие в рабочие часы старты дня с шагом 30 минут, помеченные доступностью */
  slots: Slot[];
}

/** Число свободных слотов одного дня окна записи */
model DayAvailability {
  /** Дата в формате YYYY-MM-DD */
  @pattern("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$") date: string;

  /** Число стартов, доступных для брони (целиком в рабочих часах, не прошедшие, без пересечений) */
  @minValue(0) available_count: integer;
}

/**
  Доступность по дням всего 14-дневного окна для типа встречи.

  Содержит все дни окна по возрастанию даты, включая дни с нулём свободных слотов.
*/
model AvailabilitySummary {
  /** Идентификатор типа встречи (слаг) */
  @pattern("^[a-z0-9-]{1,64}$") meeting_type_id: string;

  /** Все 14 дней окна по возрастанию даты */
  days: DayAvailability[];
}

/** Бронь звонка */
model Booking {
  /** Идентификатор брони */
  id: integer;

  /** Тип встречи (слаг) */
  @pattern("^[a-z0-9-]{1,64}$") meeting_type_id: string;

  /** Название типа встречи (денормализовано для удобства клиента) */
  meeting_type_name: string;

  /** Длительность слота в минутах */
  @minValue(30)
  @maxValue(240)
  @JsonSchema.multipleOf(30)
  duration: integer;

  /** Имя гостя */
  @minLength(1) name: string;

  /** Email гостя */
  @minLength(3) email: string;

  /** Дата слота, YYYY-MM-DD */
  @pattern("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$") date: string;

  /** Начало слота, HH:MM */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") start: string;

  /** Конец слота, HH:MM */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") end: string;

  /** Момент создания брони, ISO 8601 */
  created_at: string;
}

/** Запрос на создание брони */
model BookingInput {
  /** Тип встречи (слаг) */
  @pattern("^[a-z0-9-]{1,64}$") meeting_type_id: string;

  /** Имя гостя */
  @minLength(1) name: string;

  /** Email гостя */
  @minLength(3) email: string;

  /** Дата слота, YYYY-MM-DD */
  @pattern("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$") date: string;

  /** Начало слота, HH:MM (Europe/Moscow), шаг 30 минут */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") start: string;
}

/** Состояние сервиса */
model HealthStatus {
  status: "ok";
}

/** Машинночитаемый код ошибки API */
enum ErrorCode {
  /** Поле или значение не прошло форматную или доменную проверку */
  validation: "validation",

  /** Тип встречи с таким идентификатором не существует */
  not_found: "not_found",

  /** Запрошенное время уже занято, включая гонку одновременных запросов */
  conflict: "conflict",
}

/** Отказ по формату поля или доменным правилам */
@error
model ValidationError {
  @statusCode statusCode: 422;

  /** Причина отказа */
  code: ErrorCode.validation;

  /** Человекочитаемое объяснение отказа */
  message: string;
}

/** Тип встречи с таким идентификатором не существует */
@error
model NotFoundError {
  @statusCode statusCode: 404;

  /** Причина отказа */
  code: ErrorCode.not_found;

  /** Человекочитаемое объяснение отказа */
  message: string;
}

/** Время уже занято (фактический конфликт интервалов или гонка) */
@error
model ConflictError {
  @statusCode statusCode: 409;

  /** Причина отказа */
  code: ErrorCode.conflict;

  /** Человекочитаемое объяснение отказа */
  message: string;
}

@route("/api")
interface Api {
  /** Проверка живости сервиса */
  @route("/health")
  @get health(): HealthStatus;

  /** Список типов встреч */
  @route("/meeting-types")
  @get listMeetingTypes(): MeetingType[];

  @doc("""
    Создание типа встречи. `id` задаёт владелец — слаг `^[a-z0-9-]{1,64}$`.
    Неверный формат `id`, названия или длительности (вне 30-240 или не кратна 30) —
    422 validation; занятый `id` — 409 conflict.
    """)
  @route("/meeting-types")
  @post createMeetingType(@body input: MeetingTypeInput): {
    @statusCode statusCode: 201;
    @body type: MeetingType;
  } | ValidationError | ConflictError;

  @doc("""
    Счётчики свободных слотов по всем дням окна записи за один запрос.
    Ответ содержит все 14 дней окна по возрастанию даты, включая дни с нулём
    свободных слотов. Неизвестный `meeting_type_id` — 404 not_found;
    неверный формат параметра — 422 validation.
    """)
  @route("/availability/days")
  @get getAvailabilityDays(
    /** Идентификатор типа встречи (слаг) */
    @query @pattern("^[a-z0-9-]{1,64}$") meeting_type_id: string,
  ): AvailabilitySummary | NotFoundError | ValidationError;

  @doc("""
    Доступность стартов конкретной даты: только старты с шагом 30 минут, целиком
    влезающие в рабочие часы 09:00-18:00. Прошедшие старты сегодняшнего дня —
    `available: false`. Неизвестный `meeting_type_id` — 404 not_found; дата в
    прошлом, вне окна или неверного формата — 422 validation.
    """)
  @route("/availability")
  @get getAvailability(
    /** Дата в формате YYYY-MM-DD */
    @query @pattern("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$") date: string,
    /** Идентификатор типа встречи (слаг) */
    @query @pattern("^[a-z0-9-]{1,64}$") meeting_type_id: string,
  ): Availability | NotFoundError | ValidationError;

  @doc("""
    Предстоящие брони: только со стартом строго позже текущего момента
    (Europe/Moscow), отсортированы по дате и началу по возрастанию;
    пустой массив, когда записей нет.
    """)
  @route("/bookings")
  @get listBookings(): Booking[];

  @doc("""
    Запись на слот. Формат полей и доменные правила (дата вне окна, старт в прошлом,
    старт не на сетке 30 минут или не влезающий в часы, неизвестный
    `meeting_type_id`) — 422 validation. Пересечение интервалов, включая частичное
    наложение разных типов встреч и одновременные запросы, — 409 conflict;
    при гонке создаётся ровно одна бронь.
    """)
  @route("/bookings")
  @post createBooking(@body input: BookingInput): {
    @statusCode statusCode: 201;
    @body booking: Booking;
  } | ValidationError | ConflictError;
}
