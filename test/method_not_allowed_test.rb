# frozen_string_literal: true

require_relative 'test_helper'

# Метод, которого контракт не объявил для известного пути API, — 405 с заголовком Allow
# (RFC 9110), а не 404: путь существует, просто этот метод на нём неприменим. Неизвестный
# путь /api/* по-прежнему 404 JSON (ADR-0001). Найдено Schemathesis, ST204 (#30).
class MethodNotAllowedTest < Minitest::Test
  include Rack::Test::Methods

  def app = RESPONSE_ONLY_APP

  def test_put_on_health_is_method_not_allowed
    put '/api/health'

    assert_method_not_allowed('GET')
  end

  def test_options_on_bookings_lists_get_and_post
    options '/api/bookings'

    assert_method_not_allowed('GET, POST')
  end

  def test_post_on_availability_is_method_not_allowed
    post_json '/api/availability', {}

    assert_method_not_allowed('GET')
  end

  def test_put_on_unknown_api_path_stays_json_not_found
    put '/api/no-such-endpoint'

    assert_equal 404, last_response.status
    assert_equal 'not_found', JSON.parse(last_response.body).fetch('code')
  end

  private

  # Ожидаемое значение — из RFC 9110 (405 обязателен с Allow), список методов диктует
  # матрица контракта contract/main.tsp, а не реализация Sinatra-роутов.
  def assert_method_not_allowed(expected_allow)
    assert_equal 405, last_response.status
    assert_equal expected_allow, last_response.headers['Allow']
    assert_equal 'application/json', last_response.headers['content-type']
  end
end
