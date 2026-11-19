# frozen_string_literal: true

require_relative 'test_helper'

class SmokeTest < Minitest::Test
  include Rack::Test::Methods

  def app = VALIDATED_APP

  def test_health_returns_ok
    get '/api/health'

    assert_equal 200, last_response.status
    assert_equal 'application/json', last_response.headers['content-type']
    assert_equal({ 'status' => 'ok' }, JSON.parse(last_response.body))
  end

  def test_root_serves_built_frontend
    get '/'

    assert_equal 200, last_response.status
    # send_file отдаёт тело бинарной строкой, index.html — UTF-8
    body = last_response.body.dup.force_encoding(Encoding::UTF_8)

    assert_includes body, '<title>Запись на звонок</title>'
  end
end
