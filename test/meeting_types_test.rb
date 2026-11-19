# frozen_string_literal: true

require_relative 'test_helper'

# GET /api/meeting-types по контракту — список без ошибок: 200 MeetingType[] в порядке
# заведения (фиксируется в @doc) и пустой массив на пустом хранилище (спецификация #19).
# Формат ответа проверяет комитет: весь трафик этого теста сверяется с openapi/openapi.yaml.
class MeetingTypesTest < Minitest::Test
  include Rack::Test::Methods

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
  end

  def test_empty_store_returns_empty_array
    get '/api/meeting-types'

    assert_equal 200, last_response.status
    assert_equal 'application/json', last_response.headers['content-type']
    assert_equal [], JSON.parse(last_response.body)
  end

  def test_created_types_returned_in_insertion_order
    create_type(id: 'consult', name: 'Консультация', duration: 60)
    create_type(id: 'intro-call', name: 'Созвон-знакомство', duration: 30)

    get '/api/meeting-types'

    ids = JSON.parse(last_response.body).map { |type| type['id'] }

    assert_equal %w[consult intro-call], ids
  end

  private

  # Создаёт тип через контрактный POST и сверяет 201; матрица 422/409 создания — тикет #22.
  def create_type(id:, name:, duration:)
    post_json '/api/meeting-types', { id: id, name: name, description: '', duration: duration }

    assert_equal 201, last_response.status
  end
end
