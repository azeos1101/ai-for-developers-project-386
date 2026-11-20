# frozen_string_literal: true

require_relative 'test_helper'

# Неизвестный маршрут /api/* отвечает 404 в JSON по модели ApiError (ADR-0001),
# чтобы API-клиент никогда не получал HTML вместо ответа.
class ApiNotFoundTest < Minitest::Test
  include Rack::Test::Methods

  def app = VALIDATED_APP

  def test_unknown_api_route_returns_json_not_found
    get '/api/no-such-endpoint'

    assert_not_found_json
  end

  def test_api_root_itself_returns_json_not_found
    get '/api'

    assert_not_found_json
  end

  private

  # Ожидаемая форма ответа взята из контракта (ApiError: code + message), а не из кода приложения.
  def assert_not_found_json
    assert_equal 404, last_response.status
    assert_equal 'application/json', last_response.headers['content-type']

    body = JSON.parse(last_response.body)

    assert_equal 'not_found', body.fetch('code')
    refute_empty body.fetch('message')
  end
end
