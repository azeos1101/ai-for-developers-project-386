# frozen_string_literal: true

require_relative 'test_helper'

# ADR-0001: Sinatra отдаёт index.html по catch-all на все GET-маршруты вне /api,
# а «Страницу не найдена» рисует фронтенд.
class SpaCatchAllTest < Minitest::Test
  include Rack::Test::Methods

  def app = App

  def test_booking_path_serves_index_html
    get '/booking'

    assert_spa_index
  end

  def test_unknown_path_serves_index_html
    get '/kakaya-to-stranitsa'

    assert_spa_index
  end

  def test_nested_unknown_path_serves_index_html
    get '/vlastelin/predstoyashchie-vstrechi'

    assert_spa_index
  end

  private

  # Ожидаемое значение — title из frontend/index.html (ADR-0001: один статичный
  # <title>Запись на звонок</title>). send_file отдаёт тело бинарной строкой.
  def assert_spa_index
    assert_equal 200, last_response.status
    assert_includes last_response.headers['content-type'], 'text/html'

    body = last_response.body.dup.force_encoding(Encoding::UTF_8)

    assert_includes body, '<title>Запись на звонок</title>'
    assert_includes body, '<div id="root">'
  end
end
