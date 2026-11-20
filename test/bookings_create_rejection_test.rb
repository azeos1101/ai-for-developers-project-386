# frozen_string_literal: true

require_relative 'test_helper'

# POST /api/bookings — матрица 422 validation (спецификация #19, user story 37, тикет #25):
# пустое name (≥ 1 символ), email короче 3 (значения не тримятся), неизвестный
# meeting_type_id, дата в прошлом/вне 14-дневного окна/кривого формата, старт не на сетке
# 30 минут, старт не влезающий в рабочие часы (60 минут в 17:30), старт в прошлом сегодня.
# Негативные запросы идут через RESPONSE_ONLY_APP (согласование тикета #22):
# RequestValidation отбивал бы кривое тело до маршрута, а тест ждёт 422 от приложения;
# форму тела {code, message} сверяет комитет. Даты — относительно «сейчас» по Moscow;
# «старт в прошлом» — на фиксированном «сейчас» (полдень Moscow через Time.stub, как в
# тестах доступности), чтобы прогон не зависел от часов.
class BookingsCreateRejectionTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600

  def app = RESPONSE_ONLY_APP

  def setup
    App.settings.store.reset!
  end

  def test_empty_name_returns_validation
    create_consult_type

    post_booking(name: '')

    assert_equal 422, last_response.status
    assert_equal 'validation', JSON.parse(last_response.body)['code']
  end

  def test_email_shorter_than_three_returns_validation
    create_consult_type

    # Значения не тримятся: « » — один символ, «a » — два, оба короче трёх.
    ['ab', ' ', 'a '].each do |email|
      post_booking(email: email)

      assert_equal 422, last_response.status, "email #{email.inspect} должно отклоняться"

      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_unknown_meeting_type_returns_validation
    post_booking(meeting_type_id: 'net-tipa')

    assert_equal 422, last_response.status
    assert_equal 'validation', JSON.parse(last_response.body)['code']
  end

  def test_past_date_returns_validation
    create_consult_type

    [moscow_date(-1), '2020-01-01'].each do |date|
      post_booking(date: date)

      assert_equal 422, last_response.status, "дата #{date.inspect} должна отклоняться"

      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_date_beyond_the_window_returns_validation
    create_consult_type

    post_booking(date: moscow_date(14))

    assert_equal 422, last_response.status
    assert_equal 'validation', JSON.parse(last_response.body)['code']
  end

  def test_malformed_or_impossible_date_returns_validation
    create_consult_type

    ['сегодня', '2026-13-01', '2026-02-30', '31.12.2026'].each do |date|
      post_booking(date: date)

      assert_equal 422, last_response.status, "дата #{date.inspect} должна отклоняться"

      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_start_off_the_thirty_minute_grid_returns_validation
    create_consult_type

    # 09:60/09:90 формально кратны 30 остатку минут, но таких минут не бывает:
    # на сетке стартов только :00 и :30 (найдено на ревью ветки, тикет #24).
    ['10:15', '10:00:30', '09:60', '09:90'].each do |start|
      post_booking(start: start)

      assert_equal 422, last_response.status, "старт #{start.inspect} должен отклоняться"

      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_start_not_fitting_into_working_hours_returns_validation
    create_consult_type

    # Фикстура правил: 60-минутный слот в 17:30 кончается в 18:30 — вне часов; утро раньше 09:00.
    ['17:30', '08:30'].each do |start|
      post_booking(start: start)

      assert_equal 422, last_response.status, "старт #{start.inspect} должен отклоняться"

      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_start_in_the_past_today_returns_validation
    create_consult_type

    Time.stub(:now, moscow_noon_today_utc) do
      post_booking(date: moscow_date(0), start: '09:00')
    end

    assert_equal 422, last_response.status
    assert_equal 'validation', JSON.parse(last_response.body)['code']
  end

  private

  def create_consult_type
    post_json '/api/meeting-types', { id: 'consult', name: 'Созвон', description: '', duration: 60 }

    assert_equal 201, last_response.status
  end

  # POST /api/bookings с корректным слотом на +2 дня; вызывающий тест подменяет одно поле.
  def post_booking(**overrides)
    input = {
      meeting_type_id: 'consult',
      name: 'Иван',
      email: 'ivan@example.com',
      date: moscow_date(2),
      start: '10:00'
    }.merge(overrides)

    post_json '/api/bookings', input
  end

  # Дата окна на offset дней от сегодняшнего дня по Moscow (окно начинается сегодня).
  def moscow_date(offset)
    ((Time.now.getutc + MOSCOW_UTC_OFFSET) + (offset * 24 * 3600)).strftime('%Y-%m-%d')
  end

  # Фиксированное «сейчас»: полдень сегодняшнего дня по Moscow моментом UTC.
  def moscow_noon_today_utc
    today = (Time.now.getutc + MOSCOW_UTC_OFFSET).to_date

    Time.utc(today.year, today.month, today.day, 12) - MOSCOW_UTC_OFFSET
  end
end
