# frozen_string_literal: true

require_relative 'test_helper'

# GET /api/availability/days — счётчики свободных слотов по всем дням окна за один запрос
# (спецификация #19, user story 39): ровно 14 календарных дней от сегодня (Europe/Moscow,
# UTC+3) по возрастанию даты, включая дни с available_count: 0. Ожидаемые значения — из правил
# окна и часов, а не из реализации: старты шагом 30 минут, целиком влезающие в 09:00–18:00,
# для 30-минутного типа — 18 стартов (09:00…17:30), для 60-минутного — 17 (09:00…17:00);
# сегодня — минус старты, прошедшие на текущий момент. Даты считаются относительно «сейчас»
# по Moscow: окно сдвигается со временем. Формат ответа сверяет комитет по openapi/openapi.yaml.
class AvailabilityDaysSummaryTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600
  WINDOW_DAYS = 14

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
  end

  def test_thirty_minute_type_returns_14_days_with_eighteen_starts_per_full_day
    create_type(id: 'intro-call', duration: 30)

    # Полный будущий день для 30-минутного слота: старты 09:00…17:30 — ровно 18 (правило часов).
    assert_window_by_rules('intro-call', 30, 18)
  end

  def test_sixty_minute_type_returns_seventeen_starts_per_full_day
    create_type(id: 'consult', duration: 60)

    # Для 60-минутного слота старт 17:30 не влезает в 18:00 — полный день 17 стартов (правило часов).
    assert_window_by_rules('consult', 60, 17)
  end

  private

  # Проверка по правилам окна и часов: даты — 14 дней подряд от сегодня (Moscow) по возрастанию;
  # каждый будущий день — ровно full_day_count стартов; сегодня — те же старты минус уже прошедшие
  # (после последнего старта дня это 0, и нулевой день окна обязан остаться в ответе).
  def assert_window_by_rules(type_id, duration_min, full_day_count)
    now_utc = Time.now.getutc
    days = request_days(type_id)

    assert_equal(expected_dates(now_utc), days.map { |day| day['date'] })
    assert_equal(Array.new(WINDOW_DAYS - 1) { full_day_count }, future_counts(days))
    assert_equal(expected_today_count(now_utc, duration_min), days.first['available_count'])
  end

  # Счётчики будущих дней окна (все, кроме сегодняшнего).
  def future_counts(days)
    days[1..].map { |day| day['available_count'] }
  end

  def create_type(id:, duration:)
    post_json '/api/meeting-types', { id: id, name: 'Созвон', description: '', duration: duration }

    assert_equal 201, last_response.status
  end

  # GET /api/availability/days: успех по контракту — 200 и meeting_type_id в ответе (сверку
  # структуры тела делает комитет), возвращаем список дней для ассертов по правилам.
  def request_days(type_id)
    get '/api/availability/days', { meeting_type_id: type_id }

    assert_equal 200, last_response.status

    body = JSON.parse(last_response.body)

    assert_equal type_id, body['meeting_type_id']
    body.fetch('days')
  end

  # Даты окна из правила: 14 календарных дней, начиная с сегодняшнего по Europe/Moscow.
  def expected_dates(now_utc)
    today_moscow = (now_utc + MOSCOW_UTC_OFFSET).to_date

    (0...WINDOW_DAYS).map { |offset| (today_moscow + offset).strftime('%Y-%m-%d') }
  end

  # Границы рабочих часов дня как моменты UTC (Moscow = фиксированный UTC+3, без летнего времени).
  def moscow_day_bounds(date)
    utc_day_start = Time.utc(date.year, date.month, date.day)

    [utc_day_start + (9 * 3600) - MOSCOW_UTC_OFFSET, utc_day_start + (18 * 3600) - MOSCOW_UTC_OFFSET]
  end

  # Число стартов сегодня из правил: сетка 30 минут от 09:00, слот целиком в 09:00–18:00,
  # старт не раньше текущего момента.
  def expected_today_count(now_utc, duration_min)
    today_moscow = (now_utc + MOSCOW_UTC_OFFSET).to_date
    day_start_utc, day_end_utc = moscow_day_bounds(today_moscow)

    starts = []
    start_time = day_start_utc
    while (start_time + (duration_min * 60)) <= day_end_utc
      starts << start_time
      start_time += 30 * 60
    end

    starts.count { |start| start >= now_utc }
  end
end

# GET /api/availability/days — матрица отказов (спецификация #19, user story 40): неизвестный
# meeting_type_id → 404 code=not_found, неверный формат параметра или его отсутствие →
# 422 code=validation. Негативные запросы идут через RESPONSE_ONLY_APP (согласование тикета #22):
# RequestValidation отбил бы кривой query-параметр до маршрута, а тест ждёт 422/404 от нашего
# приложения; форму тела {code, message} сверяет комитет.
class AvailabilityDaysRejectionTest < Minitest::Test
  include Rack::Test::Methods

  def app = RESPONSE_ONLY_APP

  def setup
    App.settings.store.reset!
  end

  def test_unknown_type_returns_not_found
    post_json '/api/meeting-types', { id: 'intro-call', name: 'Созвон', description: '', duration: 30 }

    assert_equal 201, last_response.status

    get '/api/availability/days', { meeting_type_id: 'net-tipa' }

    assert_equal 404, last_response.status
    assert_equal 'not_found', JSON.parse(last_response.body)['code']
  end

  def test_malformed_meeting_type_id_returns_validation
    ['Intro Call', 'intro_call', 'a' * 65].each do |meeting_type_id|
      get '/api/availability/days', { meeting_type_id: meeting_type_id }

      assert_equal 422, last_response.status, "meeting_type_id #{meeting_type_id.inspect} должен отклоняться"

      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_missing_meeting_type_id_returns_validation
    get '/api/availability/days'

    assert_equal 422, last_response.status
    assert_equal 'validation', JSON.parse(last_response.body)['code']
  end
end
