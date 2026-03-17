# LocalStack Inspector

A lightweight UI for inspecting SES emails and SNS messages flowing through [LocalStack](https://localstack.cloud). Runs as an nginx sidecar container — no LocalStack Pro required.

![Stack](https://img.shields.io/badge/React_19-blue) ![Stack](https://img.shields.io/badge/Vite_7-purple) ![Stack](https://img.shields.io/badge/Tailwind_v4-cyan) ![Stack](https://img.shields.io/badge/nginx-green) ![Docker](https://img.shields.io/badge/Docker-ready-blue)

## Features

- **SES Inbox** — View all sent emails with subject, sender, recipients, timestamps. Click to expand with HTML preview (sandboxed iframe) or plain text body.
- **SNS Messages** — Real-time visibility into topic publishes via an auto-provisioned SQS inspector queue. Auto-discovers new topics.
- **Status Bar** — Live LocalStack health, version, edition, and active service badges.
- **Auto-refresh** — SES polls every 5s, SNS polls every 3s. Graceful 503 handling during startup.
- **Zero config** — No LocalStack Pro, no API keys, no CORS setup. Just deploy and open.

## Quick Start

### Docker Compose (recommended)

```bash
git clone <repo-url> && cd localstack-ui
docker compose up --build -d
```

Open http://localhost:8080

### Send Test Data

```bash
export LS=http://localhost:14566

# SES
aws --endpoint-url=$LS ses verify-email-identity --email-address test@example.com
aws --endpoint-url=$LS ses send-email \
  --from test@example.com \
  --destination 'ToAddresses=["dev@team.com"]' \
  --message 'Subject={Data="Hello"},Body={Text={Data="Test email from LocalStack"}}'

# SNS
aws --endpoint-url=$LS sns create-topic --name events
aws --endpoint-url=$LS sns publish \
  --topic-arn arn:aws:sns:us-east-1:000000000000:events \
  --message '{"event":"user.signup","userId":"u-123"}' \
  --subject "New User"
```

### Local Development

```bash
npm install
npm run dev    # http://localhost:5173, proxies to LocalStack on :4566
```

## Architecture

```
Browser → nginx (:8080) → LocalStack (:4566)
              │
              ├── /_aws/ses              → SES sent messages (internal API)
              ├── /_localstack/health    → Health + version info
              ├── /_aws_api/{service}/   → Standard AWS API (SNS, SQS)
              └── /                      → Static SPA (React)
```

In Kubernetes, the UI runs as a sidecar container sharing the pod network with LocalStack. The nginx config is injected via ConfigMap — no image rebuild needed for proxy changes.

### Startup Sequence (no initContainer)

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| 1 | `upstream localstack {}` | nginx starts even if LocalStack port isn't bound yet |
| 2 | `error_page 502 503 504` | Clean JSON 503 during startup instead of raw errors |
| 3 | `readinessProbe` | K8s won't route traffic until LocalStack health passes |
| 4 | UI auto-refresh | Browser recovers automatically |

### SNS via SQS Inspector Queue

LocalStack has no internal endpoint for standard SNS topic publishes. The UI automatically creates a hidden SQS queue (`_localstack-ui-inspector`), subscribes it to all discovered topics, and polls for messages.

## Deployment

### Docker Hub

The GitHub Actions workflow builds and pushes on every push to `main` or version tag.

**Required secrets:** `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Helm (Kubernetes)

```bash
helm install localstack ./helm/localstack -n localstack --create-namespace
kubectl port-forward -n localstack svc/localstack 8080:8080
```

Update `ui.image.repository` in `helm/localstack/values.yaml` with your Docker Hub image.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (write) |
| `npm run format:check` | Prettier (check only) |
| `npm run typecheck` | TypeScript only |

Pre-commit hook (Husky) runs ESLint + Prettier via lint-staged.

## Documentation

- [Setup & Testing Guide](docs/SETUP.md)
- [Build Observations & Lessons Learned](docs/OBSERVATIONS.md)
