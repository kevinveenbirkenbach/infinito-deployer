.PHONY: setup env dirs up down logs ps refresh-catalog test-arch test-env-up test-env-down web-sync venv install test clean

# Use docker compose v2 by default; override via env if needed:
#   make setup DOCKER_COMPOSE="docker-compose"
DOCKER_COMPOSE ?= docker compose
COMPOSE_FILE   ?= docker-compose.yml
ENV_FILE       ?= .env

VENV_DIR       ?= .venv
PYTHON         := $(VENV_DIR)/bin/python
PIP            := $(VENV_DIR)/bin/pip

# Make tests import the app packages
export PYTHONPATH := $(PWD)/apps/api

# Keep state in repo-local directory for tests (no /state permission issues)
TEST_STATE_DIR := $(PWD)/state

setup: env dirs up
	@echo "✔ Setup completed and stack is up."

env:
	@if [ ! -f "$(ENV_FILE)" ]; then \
		echo "→ Creating $(ENV_FILE) from env.example"; \
		cp env.example "$(ENV_FILE)"; \
	else \
		echo "→ $(ENV_FILE) already exists, skipping"; \
	fi

dirs:
	@mkdir -p state
	@echo "→ Ensured state/ directory exists"

up:
	@echo "→ Starting stack via compose ($(COMPOSE_FILE), env=$(ENV_FILE))"
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" up -d --build --remove-orphans

down:
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" down

logs:
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" logs -f --tail=200

restart: down up

ps:
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" ps

refresh-catalog:
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" up -d --force-recreate catalog
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" restart api

web-sync:
	@echo "→ Syncing web sources into running container"
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" up -d web
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" exec -T web sh -lc 'rm -rf /tmp/web-src && mkdir -p /tmp/web-src'
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" cp apps/web/. web:/tmp/web-src
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" exec -T web sh -lc 'cd /tmp/web-src && npm install && npm run build'
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" exec -T web sh -lc 'rm -rf /app/.next /app/public /app/server.js /app/package.json /app/node_modules; mkdir -p /app/.next; cp -a /tmp/web-src/.next/standalone/. /app/; cp -a /tmp/web-src/.next/static /app/.next/; cp -a /tmp/web-src/public /app/public'
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" restart web
	@echo "✔ Web container refreshed."

test-arch:
	@COMPOSE_PROFILES=test $(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" up -d --build test-arch

test-env-up:
	@COMPOSE_PROFILES=test $(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" up -d --build

test-env-down:
	@COMPOSE_PROFILES=test $(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" down

venv:
	@test -d "$(VENV_DIR)" || python -m venv "$(VENV_DIR)"
	@$(PIP) install -U pip setuptools wheel

install: venv
	@$(PIP) install -r requirements.txt

test: dirs install
	@echo "→ Running Python unit tests"
	@STATE_DIR="$(TEST_STATE_DIR)" $(PYTHON) -m unittest discover -s tests/python -p "test_*.py" -t . -v
	@echo "→ Running Python integration tests"
	@if ls tests/python/integration/test_*.py >/dev/null 2>&1; then STATE_DIR="$(TEST_STATE_DIR)" $(PYTHON) -m unittest discover -s tests/python/integration -p "test_*.py" -t . -v; else echo "→ (no python integration tests)"; fi
	@echo "→ Running Node unit tests"
	@STATE_DIR="$(TEST_STATE_DIR)" node --test tests/node/unit/*.mjs
	@echo "→ Running Node integration tests"
	@if ls tests/node/integration/*.mjs >/dev/null 2>&1; then STATE_DIR="$(TEST_STATE_DIR)" node --test tests/node/integration/*.mjs; else echo "→ (no node integration tests)"; fi

clean:
	@rm -rf "$(VENV_DIR)" state
	@echo "→ Removed .venv/ and state/"
