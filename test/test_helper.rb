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
    strict_reference_validation: true,
    validate_success_only: false,
    raise: true
  ),
  schema_path: OPENAPI_PATH,
  strict_reference_validation: true,
  raise: true
)

# Обёртка только со сверкой ответов. RequestValidation с raise: true отбивает некорректные
# запросы до приложения, а негативные тесты ждут 422/409/404 от самого приложения (согласование
# тикета #22): они гоняются через этот вариант, ответ всё равно сверяется с openapi/openapi.yaml.
RESPONSE_ONLY_APP = Committee::Middleware::ResponseValidation.new(
  App,
  schema_path: OPENAPI_PATH,
  strict_reference_validation: true,
  validate_success_only: false,
  raise: true
)

# Общие ассерты и фикстуры rack-тестов.
module Minitest
  class Test
    # POST JSON на контрактный маршрут; Content-Type задаём явно, как требует схема.
    def post_json(path, hash)
      post path, JSON.generate(hash), 'CONTENT_TYPE' => 'application/json'
    end
  end
end
