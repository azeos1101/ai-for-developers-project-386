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
require_relative 'usecases/list_bookings'

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
    render_result UseCases::ListMeetingTypes.new(store: settings.store).call
  end

  # Контракт: POST /api/meeting-types → 201 MeetingType; 422 validation; 409 conflict (занят id).
  post '/api/meeting-types' do
    render_result UseCases::CreateMeetingType.new(store: settings.store).call(request.body.read),
                  success_status: 201
  end

  # Контракт: GET /api/availability?date=&meeting_type_id= → 200 Availability (только влезающие
  # в часы старты шагом 30 минут); неизвестный тип — 404 not_found; дата в прошлом, вне окна
  # или неверного формата — 422 validation (спецификация #19, слоты дня — тикет #24).
  get '/api/availability' do
    render_result UseCases::ListDaySlots.new(store: settings.store).call(
      date: params['date'],
      meeting_type_id: params['meeting_type_id']
    )
  end

  # Контракт: GET /api/availability/days?meeting_type_id= → 200 AvailabilitySummary (все 14 дней
  # окна по возрастанию, включая нули); неизвестный тип — 404 not_found; неверный формат
  # параметра — 422 validation (спецификация #19, счётчики по дням — тикет #23).
  get '/api/availability/days' do
    render_result UseCases::ListDaysAvailability.new(store: settings.store).call(params['meeting_type_id'])
  end

  # Контракт: POST /api/bookings → 201 Booking (полная бронь: id, денормализованный
  # meeting_type_name, end, created_at ISO 8601); 422 validation — формат полей, дата вне
  # окна, старт не на сетке/в часах/в прошлом, неизвестный meeting_type_id; 409 conflict —
  # пересечение интервалов, проверка и запись атомарны (матрица #19, правило — тикет #26).
  post '/api/bookings' do
    render_result UseCases::CreateBooking.new(store: settings.store).call(request.body.read),
                  success_status: 201
  end

  # Контракт: GET /api/bookings → 200 Booking[] без ошибок: только брони со стартом строго
  # позже текущего момента (Europe/Moscow), отсортированы по дате и началу по возрастанию;
  # пустой массив, когда записей нет (спецификация #19, тикет #27).
  get '/api/bookings' do
    render_result UseCases::ListBookings.new(store: settings.store).call
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

  # Известные пути контракта и объявленные для них методы (матрица contract/main.tsp).
  API_METHODS_BY_PATH = {
    '/api/health' => %w[GET],
    '/api/meeting-types' => %w[GET POST],
    '/api/availability' => %w[GET],
    '/api/availability/days' => %w[GET],
    '/api/bookings' => %w[GET POST]
  }.freeze

  # ADR-0001: неизвестный маршрут /api/* — 404 в JSON по модели ApiError, не HTML.
  # Метод, не объявленный контрактом для известного пути, — 405 с Allow (RFC 9110):
  # путь существует, неприменим метод. Найдено Schemathesis, ST204 (#30).
  not_found do
    next unless api_request?

    content_type :json
    allowed = API_METHODS_BY_PATH[request.path_info]
    if allowed && !allowed.include?(request.request_method)
      status 405
      headers 'Allow' => allowed.join(', ')
      { code: 'not_found', message: "Method #{request.request_method} is not allowed for #{request.path_info}" }.to_json
    else
      { code: 'not_found', message: "No route for #{request.request_method} #{request.path_info}" }.to_json
    end
  end

  helpers do
    # Единый рендер результата use-case (спецификация #19): Success — успех с телом значения,
    # Failure — статус из FAILURE_BY_CODE и тело {code, message} по модели отказа контракта.
    def render_result(result, success_status: 200)
      if result.is_a?(UseCases::Success)
        status success_status
        body = result.value
      else
        status_code, code = FAILURE_BY_CODE.fetch(result.code)
        status status_code
        body = { code: code, message: result.message }
      end
      content_type :json
      body.to_json
    end

    def api_request?
      path = request.path_info
      path == '/api' || path.start_with?('/api/')
    end
  end
end
