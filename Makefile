# Тонкая обёртка над mise-задачами (см. mise.toml).
.PHONY: install generate run test lint check
install: ; mise run install
generate: ; mise run generate
run: ; mise run run
test: ; mise run test
lint: ; mise run lint
check: ; mise run check
