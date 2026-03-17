# LocalStack Inspector UI — Build Observations & Lessons Learned

## Overview

LocalStack Inspector is a lightweight React SPA that provides real-time visibility into SES emails and SNS messages flowing through a LocalStack instance. It runs as an nginx sidecar container alongside LocalStack, proxying internal API calls and serving the UI on port 8080.

**Stack:** React 19, Vite 7, Tailwind CSS v4 (`@tailwindcss/vite` plugin), TypeScript, nginx 1.27-alpine

**Image size:** 49.9 MB (multi-stage build: node:22-alpine → nginx:1.27-alpine)

---

## Architecture Decisions

### Why nginx sidecar (not embedded in LocalStack)?

- LocalStack's internal web UI is a Pro feature; this is a free alternative
- Sidecar shares the pod network namespace in Kubernetes — `localhost:4566` resolves to LocalStack with zero network hop
- nginx config is injected via ConfigMap, so the Docker image never needs rebuilding for port/proxy changes
- The UI auto-refreshes every 5s, so the brief LocalStack startup window is handled gracefully

### The 4-Layer Startup Sequence (no initContainer needed)

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| 1 | `upstream localstack {}` in nginx config | nginx starts cleanly even if port 4566 is not yet bound |
| 2 | `error_page 502 503 504 = @localstack_unavailable` | Clean JSON 503 while LocalStack warms up (~10-20s) |
| 3 | `readinessProbe` on the localstack container | K8s won't route Ingress traffic until health check passes |
| 4 | UI auto-refresh (5s SES, 3s SNS polling) | Browser recovers automatically without user action |

**Why not an initContainer?** InitContainers run _before_ any main container starts. In a sidecar pod, LocalStack IS a main container — it hasn't started yet when initContainers execute, so any probe against `localhost:4566` would loop forever.

### SNS Message Visibility via SQS Inspector Queue

LocalStack's internal `/_aws/sns/platform-endpoint-messages` and `/_aws/sns/sms-messages` endpoints only capture push notifications and SMS — **not standard topic publishes**. There is no `/_aws/sns/messages` endpoint.

**Solution:** The UI automatically:
1. Creates a hidden SQS queue (`_localstack-ui-inspector`)
2. Discovers all SNS topics via `ListTopics`
3. Subscribes the queue to every topic
4. Polls the queue every 3 seconds for new messages
5. Re-checks for new topics on each poll cycle

This uses the standard AWS Query API (XML over HTTP POST) routed through an nginx `/_aws_api/{service}/` proxy path. The `Host` header is set to `{service}.us-east-1.localhost.localstack.cloud` so LocalStack routes to the correct service.

---

## Bugs Encountered & Root Causes

### 1. 403 FORBIDDEN from LocalStack (browser only, curl works)

**Symptom:** All `/_aws/*` and `/_localstack/*` requests returned 403 when made from the browser, but worked fine via curl.

**Root cause:** Browsers automatically send `Origin` and `Referer` headers with fetch requests. LocalStack rejects requests that include a `Referer` header (not `Origin` as initially suspected).

**Diagnosis process:**
```bash
# Isolated the offending header by testing each one individually
curl -so /dev/null -w "%{http_code}" -H "Origin: http://localhost:8080" http://localhost:8080/_aws/ses  # 200
curl -so /dev/null -w "%{http_code}" -H "Referer: http://localhost:8080/" http://localhost:8080/_aws/ses  # 403!
```

**Fix:** Strip both headers in every nginx proxy location:
```nginx
proxy_set_header   Origin  "";
proxy_set_header   Referer "";
```

This must be applied to ALL proxy locations — `/_aws/`, `/_localstack/`, and `/_aws_api/`.

### 2. `Cannot read properties of undefined (reading 'length')` — Email Detail Modal

**Symptom:** Clicking an email in the SES list crashed the app with a white screen.

**Root cause:** LocalStack omits `CcAddresses` and `BccAddresses` from the `Destination` object when they are empty. The React component accessed `msg.Destination.CcAddresses.length` without a null guard.

**Actual API response:**
```json
{
  "Destination": {
    "ToAddresses": ["recipient@test.com"]
  }
}
```
Note: no `CcAddresses` or `BccAddresses` keys at all.

**Fix:** Use nullish coalescing on every `Destination` field access:
```tsx
{(msg.Destination.ToAddresses ?? []).join(', ')}
{(msg.Destination.CcAddresses ?? []).length > 0 && ( ... )}
```

### 3. `sms_messages.forEach is not a function` — SNS Component

**Symptom:** React crash on the SNS Messages component.

**Root cause:** The `/_aws/sns/sms-messages` endpoint returns `sms_messages` as an **object** `{}`, not an **array** `[]`. The TypeScript interface assumed it was always an array.

**Fix:** Check with `Array.isArray()` before iterating, and handle both shapes. (Later replaced entirely with the SQS-based approach.)

### 4. SNS Messages showing 0 despite queue subscription existing

**Symptom:** The UI showed the topic name and "Listening on 1 topic via SQS inspector queue" but never displayed any messages.

**Root cause (1 — React):** The polling `useEffect` used a ref (`setupDoneRef`) as a gate condition, but refs don't trigger re-renders. When setup completed, the ref was updated but the effect never re-ran. Changed to `useState(ready)` to properly trigger the polling effect.

**Root cause (2 — AWS Query API):** Initially put query parameters in the URL query string (`?Action=ReceiveMessage&QueueUrl=...`). The `QueueUrl` value contains `://` characters that can cause encoding issues through the nginx proxy. Moved all parameters to the POST body (standard AWS Query API form), which is more reliable:
```typescript
// Before (fragile)
fetch(`/_aws_api/sqs/?${queryString}`, { method: 'POST' })

// After (correct)
fetch('/_aws_api/sqs/', { method: 'POST', body: urlEncodedParams })
```

### 5. SES returning "Service 's3' is not enabled" after container recreate

**Symptom:** The `/_aws/ses` endpoint returned an XML error about S3 not being enabled.

**Root cause:** After `docker compose up --build` recreates the LocalStack container, the SES service needs the first API call to initialize. The `/_aws/ses` internal endpoint relies on internal S3-backed storage in LocalStack v4. Once an email is actually sent, the endpoint works.

**Not a bug per se** — just a LocalStack cold-start behavior. The UI's error display and auto-retry handle it gracefully.

---

## Tailwind CSS v4 + Vite Compatibility

At the time of this build (March 2026):

- **Vite 8.0.0** shipped March 12, 2026
- **`@tailwindcss/vite@4.2.1`** (latest stable) supports `vite ^5.2.0 || ^6 || ^7` — **not Vite 8**
- Vite 8 support was [merged the same day](https://github.com/tailwindlabs/tailwindcss/pull/19790) but not yet released
- **`@vitejs/plugin-react@6.x`** requires Vite 8; **`@5.x`** supports Vite 4-7

**Decision:** Downgraded to Vite 7 + `@vitejs/plugin-react@5.1.4` to use stable `@tailwindcss/vite`. The PostCSS approach (`@tailwindcss/postcss`) works with any Vite version but is no longer the recommended path for Tailwind v4.

Tailwind v4 configuration is zero-config — just `@import "tailwindcss"` in CSS, no `tailwind.config.js` needed. The `prettier-plugin-tailwindcss` plugin handles automatic class sorting.

---

## nginx Proxy Design

Three nginx configs exist for different deployment contexts:

| File | Upstream | Use Case |
|------|----------|----------|
| `nginx.conf` | `localhost:4566` | Baked into Docker image; used in K8s sidecar (shared pod network) |
| `nginx-compose.conf` | `localstack:4566` | Volume-mounted in docker-compose (separate containers) |
| `helm/.../configmap.yaml` | `localhost:{{ port }}` | Helm-templated; injected via ConfigMap volumeMount |

All three share the same proxy structure:

```
/_aws/            → LocalStack internal API (SES messages, etc.)
/_localstack/     → LocalStack health endpoint
/_aws_api/{svc}/  → Standard AWS Query API (SNS, SQS) with Host-based routing
/                 → Static SPA files with fallback to index.html
/healthz          → nginx health check (always 200)
```

The `/_aws_api/{service}/` location uses a regex to extract the service name and set the `Host` header:
```nginx
location ~ ^/_aws_api/([^/]+)/(.*) {
    proxy_pass         http://localstack/$2?$args;
    proxy_set_header   Host $1.us-east-1.localhost.localstack.cloud;
}
```

This allows the browser to call `/_aws_api/sns/` and have LocalStack route it to the SNS service, or `/_aws_api/sqs/` for SQS, without needing separate proxy blocks per service.

---

## GitHub Actions CI/CD

The workflow (`.github/workflows/docker-publish.yml`) triggers on:
- Push to `main` — tags image as `main`
- Version tags (`v*`) — tags as `1.0.0`, `1.0`, and SHA
- Pull requests — builds only (no push)

Uses Docker Buildx with GitHub Actions cache (`type=gha`) for fast rebuilds. Requires two repository secrets:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

---

## Pre-commit Quality Gates

Husky pre-commit hook runs `lint-staged`:
- `*.{ts,tsx}` → ESLint fix + Prettier format
- `*.{json,css,html,yml,yaml}` → Prettier format

ESLint config integrates `eslint-plugin-prettier` so formatting violations are surfaced as lint errors. Prettier is configured with `prettier-plugin-tailwindcss` for deterministic class ordering.
