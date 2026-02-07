### Vision Summary — *Infinito Deployer* (WIP)

**Infinito Deployer** is a web-based deployment dashboard that turns the **Infinito.Nexus role ecosystem** into a **guided, observable, and repeatable deployment experience**.

A user opens the dashboard and immediately sees a **catalog of deployable applications**, presented as **clean, visual tiles**. Each tile represents an Ansible role and clearly communicates its **maturity status** (pre-alpha, alpha, beta, stable), **supported deployment targets** (universal, server, workstation), and **identity** via an automatically resolved logo (from role metadata or a smart icon fallback).

From this catalog, users can **filter, search, and select applications** without needing to understand the underlying Ansible structure. Once selected, they configure **where and how** the deployment should run:

* target host (localhost, IP, domain),
* user and authentication method (password or SSH key),
* and role-specific inventory variables.

Before execution, the system **generates and previews the exact inventory** that will be used—making the process transparent and auditable rather than implicit.

When the deployment starts, it runs **the same CLI and Ansible commands** used by power users, but exposes them through a **live, docker-like web terminal**. Users can watch every step in real time, cancel safely, and trust that secrets are masked and never leaked.

At its core, Infinito Deployer does **not replace** Infinito.Nexus—it **orchestrates it**:

* the CLI remains the source of truth,
* inventories remain reproducible,
* deployments remain deterministic.

The result is a bridge between **infrastructure-as-code discipline** and **human-friendly operations**:
a single interface where complex, multi-role deployments become **discoverable, explainable, and safely executable**—by experts and non-experts alike.

---

## Quickstart

```bash
make setup
```

Then open:
- Web UI: http://localhost:3000
- API: http://localhost:8000/health

---

## Development

Show logs:
```bash
make logs
```

Refresh catalog (invokable apps only) and restart API:
```bash
make refresh-catalog
```

Run an Arch Linux test target (SSH) via compose profile:
```bash
COMPOSE_PROFILES=test make up
```
Use these credentials in the UI:
- Host: `test-arch` (from the API container)
- User: `deploy`
- Auth: password `deploy`

From the host, SSH is available on `localhost:2222` (override with `TEST_ARCH_SSH_PORT`).

Stop stack:
```bash
make down
```
