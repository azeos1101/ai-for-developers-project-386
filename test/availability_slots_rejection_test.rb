# frozen_string_literal: true

require_relative 'test_helper'

# GET /api/availability — матрица отказов (спецификация #19, тикет #24): неизвестный
# meeting_type_id → 404 code=not_found; дата в прошлом, за 14-дневным окном или неверного
# формата → 422 code=validation. Негативные запросы идут через RESPONSE_ONLY_APP
# (согласование тикета #22): RequestValidation отбил бы кривой query-параметр до маршрута,
# а тест ждёт 422/404 от нашего приложения; форму тела {code, message} сверяет комитет.
class AvailabilitySlotsRejectionTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600

  def app = RESPONSE_ONLY_APP

  def setup
    App.settings.store.reset!
  end

  def test_unknown_type_returns_not_found
    get '/api/availability', { date: moscow_date(2), meeting_type_id: 'net-tipa' }

    assert_equal 404, last_response.status
    assert_equal 'not_found', JSON.parse(last_response.body)['code']
  end

  def test_past_date_returns_validation
    create_consult_type

    [moscow_date(-1), '2020-01-01'].each do |date|
      get '/api/availability', { date: date, meeting_type_id: 'consult' }

      assert_equal 422, last_response.status, "дата #{date.inspect} должна отклоняться"

      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_date_beyond_the_window_returns_validation
    create_consult_type

    get '/api/availability', { date: moscow_date(14), meeting_type_id: 'consult' }

    assert_equal 422, last_response.status
    assert_equal 'validation', JSON.parse(last_response.body)['code']
  end

  def test_malformed_or_impossible_date_returns_validation
    create_consult_type

    ['сегодня', '2026-13-01', '2026-02-30', '31.12.2026'].each do |date|
      get '/api/availability', { date: date, meeting_type_id: 'consult' }

      assert_equal 422, last_response.status, "дата #{date.inspect} должна отклоняться"

      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  private

  # Тип существует — отказ обязан быть из-за даты, а не из-за meeting_type_id.
  def create_consult_type
    post_json '/api/meeting-types', { id: 'consult', name: 'Созвон', description: '', duration: 60 }

    assert_equal 201, last_response.status
  end

  # Дата относительно сегодняшнего дня по Moscow: окно начинается сегодня, поэтому
  # «вчера» — всегда прошлое, а «сегодня + 14» — всегда за окном.
  def moscow_date(offset)
    ((Time.now.getutc + MOSCOW_UTC_OFFSET) + (offset * 24 * 3600)).strftime('%Y-%m-%d')
  end
end
