# Workspace Logging – API Audit Logs, Retention & Rotation

## Goal

Introduce a per-workspace logging system that records **all API actions**
with user identity information and configurable retention/rotation rules.

The system must:

- Log API activity per workspace
- Support anonymous and authenticated users
- Allow configurable file size, folder size, retention, and filters
- Never commit log files to Git
- Store logs under a dedicated `logs/` directory
- Compress older logs automatically
- Remain deterministic and workspace-isolated

---

# 1. Log Storage Structure

## 1.1 Folder Location

Each workspace must contain:

```

logs/

```

inside the workspace root.

Example:

```

workspace/
inventory.yml
host_vars/
group_vars/
logs/
.git/

````

## 1.2 Git Integration Rules

- `logs/` must be added to `.gitignore`
- No log file may ever be committed
- No autosave commit may include log changes

**Acceptance Criteria**

- `logs/` exists per workspace
- `.gitignore` includes `logs/`
- Git history never contains log files

---

# 2. What Must Be Logged

Every API request handled by the backend must create a log entry,
including:

- Timestamp (UTC, ISO 8601)
- Workspace ID
- API endpoint (method + path)
- HTTP status code
- Execution time (ms)
- User identity:
  - `anonymous`
  - OR authenticated username (from trusted header)
- Client IP (if available)
- Optional: request ID / correlation ID

Sensitive content rules:

- Never log plaintext secrets
- Never log vault passwords
- Mask sensitive fields using existing masking rules

**Acceptance Criteria**

- Every API action results in one structured log entry
- No plaintext secrets appear in logs

---

# 3. Log Format

Default format:

- Structured JSON lines (one JSON object per line)
- UTF-8 encoded
- No ANSI formatting

Example entry:

```json
{
  "timestamp": "2026-02-14T18:22:33Z",
  "workspace_id": "abc123",
  "user": "anonymous",
  "method": "POST",
  "path": "/api/workspaces/abc123/files",
  "status": 200,
  "duration_ms": 42
}
````

The last 5 log files must remain unformatted (plain JSONL).

---

# 4. Rotation & Retention

## 4.1 Log File Size

Right-click on the `logs/` folder must allow configuration of:

* Maximum single log file size
* Default: 20 MB

When file exceeds size:

* Rotate to new file
* Name pattern example:

  * `api.log`
  * `api.1.log`
  * `api.2.log`

## 4.2 Maximum Folder Size

Configurable via context menu:

* Maximum total size of `logs/` folder
* Oldest archives deleted first when exceeded

## 4.3 Retention Period

Configurable retention period:

* Default: 6 months
* Logs older than retention must be deleted automatically

## 4.4 Compression Rules

* The latest 5 log files must remain uncompressed
* Older log files must be compressed regularly (ZIP)
* Compression may occur:

  * On rotation
  * Or via scheduled cleanup task

Compressed naming example:

```
api.2026-01-01.log.zip
```

**Acceptance Criteria**

* Active log files rotate at configured size
* Only last 5 remain uncompressed
* Older logs are ZIP-compressed
* Retention cleanup removes expired logs
* Folder size enforcement removes oldest archives first

---

# 5. Configurable Logging Policy (Context Menu)

Right-click on `logs/` folder must allow configuration of:

* Maximum log file size (default 20 MB)
* Maximum total folder size
* Retention duration (default 6 months)
* Which API categories are logged

## 5.1 API Filter Configuration

Allow defining:

* Log all API calls (default)
* Log only:

  * write operations
  * authentication events
  * deployment events
  * error responses (>=400)
* Exclude specific endpoints (e.g., health checks)

Filtering must be deterministic and workspace-scoped.

**Acceptance Criteria**

* Logging configuration stored per workspace
* Changes apply immediately
* Health endpoints can be excluded

---

# 6. Security & Privacy

* No plaintext secrets ever logged
* Masking identical to SSE masking
* Logs are workspace-scoped
* No cross-workspace visibility
* Logs never exported in ZIP by default (configurable future option)

**Acceptance Criteria**

* Secret leakage impossible through logging
* Logs isolated per workspace

---

# 7. Backend API

Required endpoints:

* `GET /api/workspaces/{id}/logs/config`
* `PUT /api/workspaces/{id}/logs/config`
* `GET /api/workspaces/{id}/logs/files`
* `GET /api/workspaces/{id}/logs/files/{filename}`
* `DELETE /api/workspaces/{id}/logs/files/{filename}`

Rules:

* Config updates validated
* Log download supports compressed files
* No API endpoint exposes logs from other workspaces

---

# 8. UI Behavior

## 8.1 File Browser

* `logs/` visible in file tree
* Right-click → Configure Logging
* Right-click on file → Download / Delete

## 8.2 Configuration Modal

Fields:

* Max file size (MB)
* Max folder size (MB or GB)
* Retention duration (days/months)
* Log filters (checkboxes)
* Save / Cancel

**Acceptance Criteria**

* Changes saved via API
* Immediate enforcement of new size limits
* Invalid configurations rejected clearly

---

# 9. Performance Requirements

* Logging must be non-blocking
* File writes must not delay API responses
* Rotation/compression must not block active requests
* Compression and cleanup may run in background task

---

# 10. Testing (Required)

## Backend

* Log entry created per API request
* Masking verified
* Rotation triggers at configured size
* Compression keeps last 5 uncompressed
* Retention deletes expired logs
* Folder size limit deletes oldest archives

## Frontend (Playwright)

* `logs/` folder visible
* Right-click opens config modal
* Changing size applies correctly
* Download log works
* Health endpoint excluded when configured

**Acceptance Criteria**

* Tests pass headless in CI
* No real secrets used

---

# Status

🟩 Done
