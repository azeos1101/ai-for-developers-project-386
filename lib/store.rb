# frozen_string_literal: true

# Хранилище в памяти процесса: типы встреч живут до перезапуска (ограничение названо в README).
# Список хранится в порядке заведения, мьютекс делает проверку занятости id и добавление атомарными.
class Store
  def initialize
    @mutex = Mutex.new
    @meeting_types = []
  end

  # Копия списка типов встреч в порядке заведения.
  def meeting_types
    @mutex.synchronize { @meeting_types.dup }
  end

  # Добавляет тип встречи, если id свободен; возвращает false, когда id занят.
  def add_meeting_type(type)
    @mutex.synchronize do
      return false if @meeting_types.any? { |existing| existing[:id] == type[:id] }

      @meeting_types << type
    end
  end

  # Очищает хранилище — фикстура rack-тестов, чтобы каждый тест начинал с пустого хранилища.
  def reset!
    @mutex.synchronize { @meeting_types.clear }
  end
end
