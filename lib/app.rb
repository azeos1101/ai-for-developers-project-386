# frozen_string_literal: true

require 'json'
require 'sinatra/base'

class App < Sinatra::Base
  set :public_folder, File.expand_path('../frontend/dist', __dir__)

  get '/api/health' do
    content_type :json
    { status: 'ok' }.to_json
  end

  get '/' do
    index_path = File.join(settings.public_folder, 'index.html')
    if File.exist?(index_path)
      send_file(index_path)
    else
      'Frontend is not built. Run: mise run build'
    end
  end
end
