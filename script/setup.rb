# frozen_string_literal: true

# Наполняет УЖЕ ЗАПУЩЕННЫЙ сервис демонстрационными данными через его же HTTP API
# (спецификация #19, тикет #29): адрес — как у `mise run run`, порт из переменной PORT.
# Сидов на старте процесса нет — задача только POSTит типы встреч и брони.
# Повторный запуск терпим к 409 (занятые id/слоты — это «уже есть»), 422 и сетевые
# ошибки роняют задачу с внятным сообщением.

require 'date'
require 'json'
require 'net/http'

HOST = 'localhost'
PORT = Integer(ENV.fetch('PORT', 4567))
# Europe/Moscow: пояс без летнего времени, фиксированный +03:00 (README).
MOSCOW_OFFSET = '+03:00'

# Типы встреч по спецификации #19: intro-call 30 мин и consult 60 мин.
MEETING_TYPES = [
  { id: 'intro-call', name: 'Созвон-знакомство', description: 'Короткий первый созвон.', duration: 30 },
  { id: 'consult', name: 'Консультация', description: 'Час работы по вашему вопросу.', duration: 60 }
].freeze

# Старт завтрашнего дня всегда внутри 14-дневного окна и в прошлом его не оставляет:
# берём завтра, слоты на сетке 30 минут целиком в 09:00–18:00 и не пересекаются:
# intro-call 10:00–10:30, consult 11:00–12:00, intro-call 14:00–14:30.
SLOT_DAY_OFFSET = 1
BOOKING_SLOTS = [
  { meeting_type_id: 'intro-call', start: '10:00' },
  { meeting_type_id: 'consult', start: '11:00' },
  { meeting_type_id: 'intro-call', start: '14:00' }
].freeze

def post(path, payload)
  Net::HTTP.start(HOST, PORT) do |http|
    request = Net::HTTP::Post.new(path, 'Content-Type' => 'application/json')
    request.body = payload.to_json
    http.request(request)
  end
rescue SystemCallError, SocketError, IOError, Timeout::Error => e
  abort "setup: POST #{path} на http://#{HOST}:#{PORT} не прошёл (сервер запущен — `mise run run`?): " \
        "#{e.class}: #{e.message}"
end

def failure_message(response)
  JSON.parse(response.body.to_s).fetch('message', response.body.to_s)
rescue JSON::ParserError, TypeError
  response.body.to_s
end

# 201 — создали, 409 — уже есть (повторный запуск), всё остальное — падение задачи.
def report(what, response)
  status = response.code.to_i
  case status
  when 201
    puts "#{what} — создано (201)"
  when 409
    puts "#{what} — уже есть (409)"
  else
    abort "setup: #{what} не создан: сервер вернул #{status}: #{failure_message(response)}"
  end
end

def create_meeting_type(type)
  report("тип #{type[:id]}", post('/api/meeting-types', type))
end

def create_booking(slot, guest:, date:)
  payload = slot.merge(guest).merge(date: date)
  report("бронь #{slot[:meeting_type_id]} на #{date} #{slot[:start]}", post('/api/bookings', payload))
end

def run
  now = Time.now.getlocal(MOSCOW_OFFSET)
  stamp = now.strftime('%Y%m%d%H%M%S')
  guest = { name: "Demo User #{stamp}", email: "demo-#{stamp}@example.com" }
  date = (now.to_date + SLOT_DAY_OFFSET).strftime('%Y-%m-%d')

  MEETING_TYPES.each { |type| create_meeting_type(type) }
  BOOKING_SLOTS.each { |slot| create_booking(slot, guest: guest, date: date) }
  puts "setup: демо-данные загружены через API на http://#{HOST}:#{PORT}"
end

run
