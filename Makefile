.PHONY: setup env dirs up down logs ps venv install test clean

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
export STATE_DIR := $(PWD)/state

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

ps:
	@$(DOCKER_COMPOSE) --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)" ps

venv:
	@test -d "$(VENV_DIR)" || python -m venv "$(VENV_DIR)"
	@$(PIP) install -U pip setuptools wheel

install: venv
	@$(PIP) install -r requirements.txt

test: dirs install
	@echo "→ Running unit tests (unittest)"
	@$(PYTHON) -m unittest discover -s tests -p "test_*.py" -v

clean:
	@rm -rf "$(VENV_DIR)" state
	@echo "→ Removed .venv/ and state/"
