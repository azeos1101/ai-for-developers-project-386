# frozen_string_literal: true

ENV['RACK_ENV'] = 'test'

require 'minitest/autorun'
require 'rack/test'
require 'committee'
require_relative '../lib/app'

OPENAPI_PATH = File.expand_path('../openapi/openapi.yaml', __dir__)

# Сверка rack-тестов с контрактом (тикет #21, спецификация #19): каждый запрос проверяет
# RequestValidation, каждый ответ — ResponseValidation по openapi/openapi.yaml. Пути, которых
# нет в контракте (SPA catch-all и неизвестные /api/*, ADR-0001), комитет пропускает не сверяя.
VALIDATED_APP = Committee::Middleware::RequestValidation.new(
  Committee::Middleware::ResponseValidation.new(
    App,
    schema_path: OPENAPI_PATH,
    validate_success_only: false,
    raise: true
  ),
  schema_path: OPENAPI_PATH,
  raise: true
)

# Общие ассерты и фикстуры rack-тестов.
class Minitest
  class Test
    # POST JSON на контрактный маршрут; Content-Type задаём явно, как требует схема.
    def post_json(path, hash)
      post path, JSON.generate(hash), 'CONTENT_TYPE' => 'application/json'
    end
  end
end
