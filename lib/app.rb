# frozen_string_literal: true

require 'json'
require 'sinatra/base'
require_relative 'store'
require_relative 'usecases'
require_relative 'usecases/create_meeting_type'
require_relative 'usecases/list_meeting_types'
require_relative 'usecases/list_days_availability'
require_relative 'usecases/list_day_slots'
require_relative 'usecases/create_booking'

class App < Sinatra::Base
  set :public_folder, File.expand_path('../frontend/dist', __dir__)
  # ADR-0001: порт из переменной PORT, по умолчанию 4567.
  set :port, Integer(ENV.fetch('PORT', 4567))
  # Хранилище в памяти процесса: типы встреч и будущие брони живут до перезапуска (README).
  set :store, Store.new

  # Матрица кодов отказа из контракта: код use-case → [HTTP-статус, машинный код].
  FAILURE_BY_CODE = {
    validation: [422, 'validation'],
    conflict: [409, 'conflict'],
    not_found: [404, 'not_found']
  }.freeze

  get '/api/health' do
    content_type :json
    { status: 'ok' }.to_json
  end

  # Контракт: GET /api/meeting-types → 200 MeetingType[] без ошибок, порядок заведения.
  get '/api/meeting-types' do
    content_type :json
    UseCases::ListMeetingTypes.new(store: settings.store).call.value.to_json
  end

  # Контракт: POST /api/meeting-types → 201 MeetingType; 422 validation; 409 conflict (занят id).
  post '/api/meeting-types' do
    result = UseCases::CreateMeetingType.new(store: settings.store).call(request.body.read)

    case result
    when UseCases::Success
      status 201
      content_type :json
      result.value.to_json
    when UseCases::Failure
      status_code, code = FAILURE_BY_CODE.fetch(result.code)
      status status_code
      content_type :json
      { code: code, message: result.message }.to_json
    end
  end

  # Контракт: GET /api/availability?date=&meeting_type_id= → 200 Availability (только влезающие
  # в часы старты шагом 30 минут); неизвестный тип — 404 not_found; дата в прошлом, вне окна
  # или неверного формата — 422 validation (спецификация #19, слоты дня — тикет #24).
  get '/api/availability' do
    result = UseCases::ListDaySlots.new(store: settings.store).call(
      date: params['date'],
      meeting_type_id: params['meeting_type_id']
    )

    case result
    when UseCases::Success
      content_type :json
      result.value.to_json
    when UseCases::Failure
      status_code, code = FAILURE_BY_CODE.fetch(result.code)
      status status_code
      content_type :json
      { code: code, message: result.message }.to_json
    end
  end

  # Контракт: GET /api/availability/days?meeting_type_id= → 200 AvailabilitySummary (все 14 дней
  # окна по возрастанию, включая нули); неизвестный тип — 404 not_found; неверный формат
  # параметра — 422 validation (спецификация #19, счётчики по дням — тикет #23).
  get '/api/availability/days' do
    result = UseCases::ListDaysAvailability.new(store: settings.store).call(params['meeting_type_id'])

    case result
    when UseCases::Success
      content_type :json
      result.value.to_json
    when UseCases::Failure
      status_code, code = FAILURE_BY_CODE.fetch(result.code)
      status status_code
      content_type :json
      { code: code, message: result.message }.to_json
    end
  end

  # Контракт: POST /api/bookings → 201 Booking (полная бронь: id, денормализованный
  # meeting_type_name, end, created_at ISO 8601); 422 validation — формат полей, дата вне
  # окна, старт не на сетке/в часах/в прошлом, неизвестный meeting_type_id; 409 conflict —
  # пересечение интервалов, проверка и запись атомарны (матрица #19, правило — тикет #26).
  post '/api/bookings' do
    result = UseCases::CreateBooking.new(store: settings.store).call(request.body.read)

    case result
    when UseCases::Success
      status 201
      content_type :json
      result.value.to_json
    when UseCases::Failure
      status_code, code = FAILURE_BY_CODE.fetch(result.code)
      status status_code
      content_type :json
      { code: code, message: result.message }.to_json
    end
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
