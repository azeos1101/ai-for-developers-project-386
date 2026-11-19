# frozen_string_literal: true

require 'json'
require 'sinatra/base'

class App < Sinatra::Base
  set :public_folder, File.expand_path('../frontend/dist', __dir__)
  # ADR-0001: порт из переменной PORT, по умолчанию 4567.
  set :port, Integer(ENV.fetch('PORT', 4567))

  get '/api/health' do
    content_type :json
    { status: 'ok' }.to_json
  end

  # ADR-0001: catch-all на все GET вне /api — отдать index.html, карту маршрутов рисует react-router.
  # Запросы к /api пропускаем дальше (pass), чтобы за них отвечал not_found с JSON.
  get '/*' do
    pass if api_request?

    index_path = File.join(settings.public_folder, 'index.html')
    if File.exist?(index_path)
      send_file(index_path)
    else
      'Frontend is not built. Run: mise run build'
    end
  end

  # ADR-0001: неизвестный маршрут /api/* — 404 в JSON по модели ApiError, не HTML.
  not_found do
    next unless api_request?

    content_type :json
    { code: 'not_found', message: "No route for #{request.request_method} #{request.path_info}" }.to_json
  end

  helpers do
    def api_request?
      path = request.path_info
      path == '/api' || path.start_with?('/api/')
    end
  end
end
