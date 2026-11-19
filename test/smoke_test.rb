# frozen_string_literal: true

require_relative 'test_helper'

class SmokeTest < Minitest::Test
  include Rack::Test::Methods

  def app = App

  def test_health_returns_ok
    get '/api/health'

    assert_equal 200, last_response.status
    assert_equal 'application/json', last_response.headers['content-type']
    assert_equal({ 'status' => 'ok' }, JSON.parse(last_response.body))
  end

  def test_root_responds
    get '/'

    assert_equal 200, last_response.status
  end
end
