import "@typespec/http";
import "@typespec/openapi";

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
  /** Идентификатор типа встречи */
  id: integer;

  /** Название (например, «Созвон-знакомство») */
  @minLength(1) name: string;

  /** Описание встречи */
  description: string;

  /** Длительность встречи в минутах */
  @minValue(1) duration: integer;
}

/** Запрос на создание типа встречи */
model MeetingTypeInput {
  @minLength(1) name: string;
  description?: string = "";
  @minValue(1) duration: integer;
}

/** Один слот дня в разрезе доступности */
model Slot {
  /** Время начала слота, HH:MM (Europe/Moscow) */
  @pattern("^\\d{2}:\\d{2}$") start: string;

  /** Время окончания слота, HH:MM (Europe/Moscow) */
  @pattern("^\\d{2}:\\d{2}$") end: string;

  /** true, если слот свободен и его можно забронировать */
  available: boolean;
}

/** Доступность слотов на конкретную дату для типа встречи */
model Availability {
  /** Дата в формате YYYY-MM-DD */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string;

  /** Идентификатор типа встречи */
  meeting_type_id: integer;

  /** Все старты дня с шагом 30 минут, помеченные доступностью */
  slots: Slot[];
}

/** Бронь звонка */
model Booking {
  id: integer;

  /** Тип встречи */
  meeting_type_id: integer;

  /** Название типа встречи (денормализовано для удобства клиента) */
  meeting_type_name: string;

  /** Длительность слота в минутах */
  duration: integer;

  /** Имя гостя */
  @minLength(1) name: string;

  /** Email гостя */
  @minLength(3) email: string;

  /** Дата слота, YYYY-MM-DD */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string;

  /** Начало слота, HH:MM */
  @pattern("^\\d{2}:\\d{2}$") start: string;

  /** Конец слота, HH:MM */
  @pattern("^\\d{2}:\\d{2}$") end: string;

  /** Момент создания брони, ISO 8601 */
  created_at: string;
}

/** Запрос на создание брони */
model BookingInput {
  meeting_type_id: integer;
  @minLength(1) name: string;
  @minLength(3) email: string;
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string;
  @pattern("^\\d{2}:\\d{2}$") start: string;
}

/** Состояние сервиса */
model HealthStatus {
  status: "ok";
}

/** Коды ошибок API */
enum ErrorCode {
  validation: "validation",
  not_found: "not_found",
  conflict: "conflict",
}

@error
model ApiError {
  code: ErrorCode;
  message: string;
}

@route("/api")
interface Api {
  @route("/health")
  @get health(): HealthStatus;

  @route("/meeting-types")
  @get listMeetingTypes(): MeetingType[];

  @route("/meeting-types")
  @post createMeetingType(@body input: MeetingTypeInput): {
    @statusCode statusCode: 201;
    @body type: MeetingType;
  } | ApiError;

  @route("/availability")
  @get getAvailability(
    /** Дата в формате YYYY-MM-DD */
    @query @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string,
    /** Идентификатор типа встречи */
    @query meeting_type_id: integer,
  ): Availability | ApiError;

  @route("/bookings")
  @get listBookings(): Booking[];

  @route("/bookings")
  @post createBooking(@body input: BookingInput): {
    @statusCode statusCode: 201;
    @body booking: Booking;
  } | ApiError;
}
