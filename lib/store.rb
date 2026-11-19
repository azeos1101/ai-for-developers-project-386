# frozen_string_literal: true

# Хранилище в памяти процесса: типы встреч и брони живут до перезапуска (ограничение названо в README).
# Списки хранятся в порядке заведения, мьютекс делает проверку занятости id и добавление атомарными.
class Store
  def initialize
    @mutex = Mutex.new
    @meeting_types = []
    @bookings = []
    @next_booking_id = 1
  end

  # Копия списка типов встреч в порядке заведения.
  def meeting_types
    @mutex.synchronize { @meeting_types.dup }
  end

  # Копия списка броней в порядке заведения (id целые, последовательные).
  def bookings
    @mutex.synchronize { @bookings.dup }
  end

  # Добавляет тип встречи, если id свободен; возвращает false, когда id занят.
  def add_meeting_type(type)
    @mutex.synchronize do
      return false if @meeting_types.any? { |existing| existing[:id] == type[:id] }

      @meeting_types << type
    end
  end

  # Заносит бронь под следующий целый id. Под тем же мьютексом, что и проверка:
  # в следующий тикет сюда добавится проверка пересечений — проверка и создание
  # останутся одной атомарной операцией (гонка даёт ровно одну бронь).
  def add_booking(booking)
    @mutex.synchronize do
      stored = booking.merge(id: @next_booking_id)
      @next_booking_id += 1
      @bookings << stored
      stored
    end
  end

  # Очищает хранилище — фикстура rack-тестов, чтобы каждый тест начинал с пустого хранилища.
  def reset!
    @mutex.synchronize do
      @meeting_types.clear
      @bookings.clear
      @next_booking_id = 1
    end
  end
end
