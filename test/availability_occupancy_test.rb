# frozen_string_literal: true

require_relative 'test_helper'

# Пометка занятых слотов в обоих эндпоинтах доступности (спецификация #19, тикет #25):
# старт недоступен, когда его слот пересекается с уже созданной бронью. Ожидаемые значения —
# из правил пересечения («бронь 60 минут в 10:00 ⇒ бронь 30 минут в 10:30 отклоняется,
# бронь в 11:00 допустима»): бронь consult 60 мин 10:00–11:00 снимает из свободных старты
# 09:30, 10:00 и 10:30 (все пересекаются) и оставляет 11:00 (примыкание разрешено);
# счётчики дней считаются без этих стартов — 14 для 60-минутного типа (17 − 3) и 16 для
# 30-минутного (18 − 2; его слот 09:30–10:00 только примыкает). Фикстура ставится на день
# +2 от сегодня (Moscow) — весь день в будущем, статусы не зависят от часов прогона.
# Формат ответов сверяет комитет.
class AvailabilityOccupancyTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600

  # Фикстура правил для брони 60 мин 10:00–11:00: старт 60-минутного типа недоступен,
  # если его слот [старт, старт+60) пересекается с бронью; 11:00–12:00 только примыкает.
  SIXTY_STATUSES_AROUND_BOOKING = {
    '09:30' => false, '10:00' => false, '10:30' => false, '11:00' => true
  }.freeze

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
    create_type(id: 'consult', duration: 60)
    create_type(id: 'intro-call', duration: 30)
    book_consult_at('10:00')
  end

  def test_slot_starts_overlapping_a_booking_are_not_available
    body = request_slots('consult', moscow_date(2))

    statuses = body['slots'].to_h { |slot| [slot['start'], slot['available']] }

    assert_equal(SIXTY_STATUSES_AROUND_BOOKING, statuses.slice(*SIXTY_STATUSES_AROUND_BOOKING.keys))
    assert_equal(14, statuses.count { |_start, available| available })
  end

  def test_short_type_starts_overlapping_a_longer_booking_are_not_available
    body = request_slots('intro-call', moscow_date(2))

    statuses = body['slots'].to_h { |slot| [slot['start'], slot['available']] }

    # Частичное наложение разных типов: слоты 10:00–10:30 и 10:30–11:00 внутри брони,
    # 09:30–10:00 и 11:00–11:30 только примыкают и остаются свободны.
    short_statuses = { '09:30' => true, '10:00' => false, '10:30' => false, '11:00' => true }

    assert_equal(short_statuses, statuses.slice(*short_statuses.keys))
    assert_equal(16, statuses.count { |_start, available| available })
  end

  def test_days_counter_excludes_starts_overlapping_a_booking
    days = request_days('consult')

    assert_equal(14, days.find { |day| day['date'] == moscow_date(2) }['available_count'])
    assert_equal(17, days.find { |day| day['date'] == moscow_date(3) }['available_count'])
  end

  def test_days_counter_for_short_type_excludes_overlapping_starts
    days = request_days('intro-call')

    assert_equal(16, days.find { |day| day['date'] == moscow_date(2) }['available_count'])
    assert_equal(18, days.find { |day| day['date'] == moscow_date(3) }['available_count'])
  end

  private

  def create_type(id:, duration:)
    post_json '/api/meeting-types', { id: id, name: 'Созвон', description: '', duration: duration }

    assert_equal 201, last_response.status
  end

  # POST /api/bookings → 201: фикстура брони consult на день +2 от сегодня по Moscow.
  def book_consult_at(start)
    post_json '/api/bookings', {
      meeting_type_id: 'consult', name: 'Demo User', email: 'demo@example.com',
      date: moscow_date(2), start: start
    }

    assert_equal 201, last_response.status
  end

  def request_slots(type_id, date)
    get '/api/availability', { date: date, meeting_type_id: type_id }

    assert_equal 200, last_response.status

    JSON.parse(last_response.body)
  end

  def request_days(type_id)
    get '/api/availability/days', { meeting_type_id: type_id }

    assert_equal 200, last_response.status

    JSON.parse(last_response.body)['days']
  end

  # Дата окна на offset дней от сегодняшнего дня по Moscow (окно начинается сегодня).
  def moscow_date(offset)
    ((Time.now.getutc + MOSCOW_UTC_OFFSET) + (offset * 24 * 3600)).strftime('%Y-%m-%d')
  end
end
