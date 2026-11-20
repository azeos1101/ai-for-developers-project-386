# syntax=docker/dockerfile:1

# Этап 1: сборка фронтенда. node 25.9.0 — та же версия, что [tools] node в mise.toml.
FROM node:25.9.0-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Этап 2: установка гемов. build-essential нужен для нативных расширений (nio4r у puma);
# в runtime-образе компилятора не остаётся. Та же база ruby:3.3.11-slim — скомпилированные
# гемы работают в runtime без пересборки.
FROM ruby:3.3.11-slim AS gems
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# В официальном ruby-образе BUNDLE_APP_CONFIG указывает в GEM_HOME; фиксируем путь,
# чтобы локальный конфиг лёг в /app/.bundle и его можно было скопировать в runtime.
ENV BUNDLE_APP_CONFIG=/app/.bundle
COPY Gemfile Gemfile.lock ./
# development/test не ставятся: только production-гемы (puma, rackup, sinatra);
# --frozen — строго по Gemfile.lock; deployment true — гемы в ./vendor/bundle.
RUN bundle config set --local without development test \
  && bundle config set --local deployment true \
  && bundle install --frozen

# Этап 3: runtime. ruby 3.3.11-slim — та же версия, что [tools] ruby в mise.toml.
FROM ruby:3.3.11-slim

# curl нужен healthcheck'у контейнера (deploy/compose.yaml) и дымовой проверке.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Непривилегированный пользователь: приложение работает не от root.
RUN useradd --create-home --uid 1000 app
WORKDIR /app

COPY --from=gems /app/vendor/bundle ./vendor/bundle
COPY --from=gems /app/.bundle ./.bundle
COPY Gemfile Gemfile.lock ./

COPY config.ru ./
COPY lib ./lib
COPY --from=frontend /build/dist ./frontend/dist

USER app

# Порт из переменной PORT (используется и при деплое, и в проверках), по умолчанию 8080.
ENV PORT=8080
ENV BUNDLE_APP_CONFIG=/app/.bundle
# production: rackup без RACK_ENV поднимает development, а Sinatra 4 в development
# пропускает только localhost-хосты (host_authorization) — за обратным прокси каждый
# запрос приходит с Host боевого домена и получал 403 «Host not permitted». В production
# любой Host разрешён, а необработанные ошибки не отдают стек(trace) наружу.
ENV RACK_ENV=production
ENV APP_ENV=production
EXPOSE 8080

# Старт автоматически: rackup берёт обработчик puma из Gemfile; -o 0.0.0.0 обязателен —
# у rackup по умолчанию localhost, а платформе нужен внешний интерфейс.
CMD ["sh", "-c", "exec bundle exec rackup -o 0.0.0.0 -p \"${PORT:-8080}\" config.ru"]
