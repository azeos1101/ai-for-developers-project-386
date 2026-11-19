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

# POST /api/meeting-types — успех: 201 полным типом (спецификация #19). Позитивный запрос
# корректен по контракту, поэтому идёт через VALIDATED_APP: комитет сверяет и тело запроса,
# и ответ с openapi/openapi.yaml.
class MeetingTypeCreateSuccessTest < Minitest::Test
  include Rack::Test::Methods

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
  end

  def test_create_returns_full_meeting_type
    input = { id: 'intro-call', name: 'Созвон-знакомство', description: 'Короткий звонок', duration: 30 }
    expected = {
      'id' => 'intro-call', 'name' => 'Созвон-знакомство',
      'description' => 'Короткий звонок', 'duration' => 30
    }

    post_json '/api/meeting-types', input

    assert_equal 201, last_response.status
    assert_equal expected, JSON.parse(last_response.body)
  end

  def test_created_type_visible_in_list
    post_json '/api/meeting-types', { id: 'consult', name: 'Консультация', description: '', duration: 60 }

    get '/api/meeting-types'

    expected = [{ 'id' => 'consult', 'name' => 'Консультация', 'description' => '', 'duration' => 60 }]

    assert_equal 200, last_response.status
    assert_equal expected, JSON.parse(last_response.body)
  end
end

# POST /api/meeting-types — матрица отказов (спецификация #19): 422 code=validation за
# кривой slug, пустое название и длительность вне 30–240 или не кратную 30; 409 code=conflict
# за занятый id. Негативные запросы идут через RESPONSE_ONLY_APP: RequestValidation с
# raise: true отбил бы некорректное тело до маршрута, а тест ждёт 422/409 от нашего
# приложения. Форму тела {code, message} сверяет комитет, отдельные ассерты по message — лишнее.
class MeetingTypeCreateRejectionTest < Minitest::Test
  include Rack::Test::Methods

  def app = RESPONSE_ONLY_APP

  def setup
    App.settings.store.reset!
  end

  def test_rejects_invalid_slug
    ['Ab C', 'intro_call', 'intro@@call'].each do |id|
      post_json '/api/meeting-types', { id: id, name: 'Созвон', description: '', duration: 30 }

      assert_equal 422, last_response.status, "slug #{id.inspect} должен отклоняться"
      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_rejects_empty_name
    post_json '/api/meeting-types', { id: 'intro-call', name: '', description: '', duration: 30 }

    assert_equal 422, last_response.status
    assert_equal 'validation', JSON.parse(last_response.body)['code']
  end

  def test_rejects_duration_not_multiple_of_step
    post_json '/api/meeting-types', { id: 'intro-call', name: 'Созвон', description: '', duration: 45 }

    assert_equal 422, last_response.status
    assert_equal 'validation', JSON.parse(last_response.body)['code']
  end

  def test_rejects_duration_out_of_range
    [0, 270].each do |duration|
      post_json '/api/meeting-types', { id: 'intro-call', name: 'Созвон', description: '', duration: duration }

      assert_equal 422, last_response.status, "длительность #{duration} должна отклоняться"
      assert_equal 'validation', JSON.parse(last_response.body)['code']
    end
  end

  def test_rejects_taken_id_with_conflict
    post_json '/api/meeting-types', { id: 'intro-call', name: 'Созвон', description: '', duration: 30 }

    assert_equal 201, last_response.status

    post_json '/api/meeting-types',
              { id: 'intro-call', name: 'Другой созвон', description: 'Повтор id', duration: 60 }

    assert_equal 409, last_response.status
    assert_equal 'conflict', JSON.parse(last_response.body)['code']
  end

  def test_rejected_request_leaves_store_untouched
    post_json '/api/meeting-types', { id: 'Ab C', name: '', description: '', duration: 45 }

    assert_equal 422, last_response.status

    get '/api/meeting-types'

    assert_equal [], JSON.parse(last_response.body)
  end
end
