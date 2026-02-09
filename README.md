### Vision Summary — *Infinito Deployer* (WIP)

**Infinito Deployer** is a web-based deployment dashboard that transforms the **Infinito.Nexus role ecosystem** into a **guided, observable, and repeatable deployment experience**.

When a user opens the dashboard, they are immediately presented with a **catalog of deployable applications**, displayed as **clean, visual tiles**. Each tile represents an Ansible role and clearly communicates its **maturity level** (pre-alpha, alpha, beta, stable), **supported deployment targets** (universal, server, workstation), and **identity** via an automatically resolved logo (derived from role metadata or a smart fallback).

From this catalog, users can **filter, search, and select applications** without needing to understand the underlying Ansible structure. Once selected, they configure **where and how** the deployment should run:

* target host (localhost, IP address, or domain),
* user and authentication method (password or SSH key),
* and role-specific inventory variables.

Before execution, the system **generates and previews the exact inventory** that will be used. This makes the process transparent and auditable rather than implicit or opaque.

When deployment starts, the platform executes **the same CLI and Ansible commands** used by experienced operators, but exposes them through a **live, Docker-like web terminal**. Users can observe each step in real time, cancel safely, and trust that secrets are masked and never leaked.

At its core, Infinito Deployer does **not replace** Infinito.Nexus—it **orchestrates it**:

* the CLI remains the single source of truth,
* inventories remain reproducible,
* deployments remain deterministic.

The result is a bridge between **infrastructure-as-code discipline** and **human-friendly operations**:
a single interface where complex, multi-role deployments become **discoverable, explainable, and safely executable**—for experts and non-experts alike.

---

## Local Operation with Docker Compose

### Prerequisites

* Docker Engine
* Docker Compose v2 (`docker compose`)
* A local clone of **Infinito.Nexus** (required for `roles/`)

### One-Time Setup

1. Clone this repository.
2. Check out Infinito.Nexus into `./infinito-nexus`
   (or adjust the path later in `.env`).
3. Start the stack:

```bash
make setup
```

`make setup` performs the following steps:

* creates `.env` from `env.example` (if it does not exist),
* ensures the `./state` directory exists,
* starts `docker compose` (including image builds).

### Important `.env` Variables

* `INFINITO_REPO_HOST_PATH` must point to your local Infinito.Nexus path
* `CORS_ALLOW_ORIGINS` should include the Web UI URL
* `NEXT_PUBLIC_API_BASE_URL` must point to the API endpoint

Example (local setup):

* `INFINITO_REPO_HOST_PATH=./infinito-nexus`
* `CORS_ALLOW_ORIGINS=http://localhost:3000`
* `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

### Start / Stop / Logs

```bash
make up
```

```bash
make logs
```

```bash
make down
```

### URLs After Startup

* Web UI: [http://localhost:3000](http://localhost:3000)
* API Health: [http://localhost:8000/health](http://localhost:8000/health)
