# LocalStack Inspector UI — Setup & Testing Guide

## Prerequisites

- Node.js 22+
- Docker & Docker Compose
- AWS CLI (for sending test data)

---

## Local Development (without Docker)

Requires a running LocalStack instance on `localhost:4566`.

```bash
# Install dependencies
npm install

# Start dev server (proxies API calls to localhost:4566)
npm run dev
```

Open http://localhost:5173. Vite proxies `/_aws/*`, `/_localstack/*`, and `/_aws_api/*` to LocalStack.

---

## Docker Compose (Full Stack)

Spins up LocalStack + the UI in separate containers.

```bash
# Build and start
docker compose up --build -d

# Check status
docker compose ps

# View logs
docker compose logs -f ui
docker compose logs -f localstack
```

- **UI:** http://localhost:8080
- **LocalStack API:** http://localhost:14566 (remapped to avoid conflicts)

### Stop

```bash
docker compose down
```

---

## Sending Test Data

Once LocalStack is running (either standalone or via compose), use the AWS CLI to send test messages.

### SES Emails

```bash
# Set endpoint (adjust port if using compose)
export LS=http://localhost:14566

# Verify sender identity (required before sending)
aws --endpoint-url=$LS ses verify-email-identity \
  --email-address sender@test.com

# Send a plain text email
aws --endpoint-url=$LS ses send-email \
  --from sender@test.com \
  --destination 'ToAddresses=["recipient@test.com"]' \
  --message 'Subject={Data="Test Subject"},Body={Text={Data="Hello from LocalStack"}}'

# Send an HTML email
aws --endpoint-url=$LS ses send-email \
  --from sender@test.com \
  --destination 'ToAddresses=["recipient@test.com"]' \
  --message 'Subject={Data="HTML Email"},Body={Html={Data="<h1>Hello!</h1><p>This is <b>HTML</b>.</p>"}}'

# Send to multiple recipients with CC
aws --endpoint-url=$LS ses verify-email-identity --email-address alerts@company.com
aws --endpoint-url=$LS ses send-email \
  --from alerts@company.com \
  --destination 'ToAddresses=["dev@team.com"],CcAddresses=["manager@team.com"]' \
  --message 'Subject={Data="Deploy Complete"},Body={Text={Data="v2.1.0 deployed to staging"}}'
```

### SNS Messages

```bash
# Create a topic
aws --endpoint-url=$LS sns create-topic --name my-events

# Publish messages (the UI auto-subscribes an SQS inspector queue)
aws --endpoint-url=$LS sns publish \
  --topic-arn arn:aws:sns:us-east-1:000000000000:my-events \
  --message '{"event":"user.signup","userId":"u-12345"}' \
  --subject "User Signup"

aws --endpoint-url=$LS sns publish \
  --topic-arn arn:aws:sns:us-east-1:000000000000:my-events \
  --message '{"event":"order.placed","orderId":"ord-789","amount":42.50}' \
  --subject "New Order"

# Create a second topic — the UI will auto-discover and subscribe
aws --endpoint-url=$LS sns create-topic --name alerts
aws --endpoint-url=$LS sns publish \
  --topic-arn arn:aws:sns:us-east-1:000000000000:alerts \
  --message '{"severity":"warning","service":"api-gateway","message":"High latency detected"}' \
  --subject "Latency Alert"
```

**Note:** Only messages published _after_ the UI creates the inspector queue will be visible. The UI creates the queue on first load and subscribes to all existing topics. New topics are auto-discovered on each poll cycle (3s).

---

## Verification Checklist

### Image Build

```bash
docker build -t localstack-ui:local .
docker images localstack-ui:local  # Should be ~50 MB
```

### Standalone Container (no LocalStack)

```bash
docker run --rm -p 8080:8080 localstack-ui:local

# nginx health check
curl http://localhost:8080/healthz
# Expected: ok

# SPA serves
curl -s http://localhost:8080/ | grep "<title>"
# Expected: <title>LocalStack Inspector</title>

# API returns clean 503 (no backend)
curl -s http://localhost:8080/_aws/ses
# Expected: {"error":"localstack_unavailable","message":"LocalStack is still starting — retrying automatically"}
```

### Full Stack

```bash
docker compose up --build -d

# Wait for healthy
docker compose ps  # localstack should show (healthy)

# Health through proxy
curl http://localhost:8080/_localstack/health | python3 -m json.tool

# SES through proxy (after sending test email)
curl http://localhost:8080/_aws/ses | python3 -m json.tool

# SNS topic listing through proxy
curl -X POST -d "Action=ListTopics" http://localhost:8080/_aws_api/sns/

# SQS queue exists (created by UI)
curl -X POST -d "Action=ListQueues" http://localhost:8080/_aws_api/sqs/
```

### Browser Verification

1. Open http://localhost:8080
2. **Status bar** should show green dot, LocalStack version, and service badges (ses, sns, sqs)
3. **SES panel** should list sent emails; click one to see the detail modal
4. **SNS panel** should show topic badges and messages after publishing
5. Open DevTools Console — should be free of errors

---

## Linting & Formatting

```bash
npm run lint          # ESLint check
npm run format:check  # Prettier check (no writes)
npm run format        # Prettier fix
npm run typecheck     # TypeScript only
npm run build         # Full build (typecheck + Vite)
```

The pre-commit hook (Husky + lint-staged) runs automatically on `git commit`.

---

## Docker Hub Publishing

### Manual Push

```bash
docker build -t your-user/localstack-ui:latest .
docker push your-user/localstack-ui:latest
```

### GitHub Actions (Automated)

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add two repository secrets:
   - `DOCKERHUB_USERNAME` — your Docker Hub username
   - `DOCKERHUB_TOKEN` — a Docker Hub [access token](https://hub.docker.com/settings/security)
3. Push to `main` or create a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds, tags (`main`, `1.0.0`, `1.0`, `<sha>`), and pushes to Docker Hub.

---

## Helm Deployment (Kubernetes)

```bash
# Update the image repository in values.yaml
# ui.image.repository: your-dockerhub-user/localstack-ui

# Install
helm install localstack ./helm/localstack -n localstack --create-namespace

# Upgrade
helm upgrade localstack ./helm/localstack -n localstack

# Port-forward to access
kubectl port-forward -n localstack svc/localstack 8080:8080
```

The Helm chart deploys LocalStack and the UI as sidecar containers in a single pod. The nginx config is injected via ConfigMap — no image rebuild needed for proxy changes.

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| 403 FORBIDDEN in browser | LocalStack rejects `Referer` header | Ensure nginx strips `Origin` and `Referer` headers |
| Blank screen on email click | Missing `CcAddresses`/`BccAddresses` in API response | Fixed with `?? []` null guards |
| SNS shows 0 messages | Messages published before UI queue subscription | Only post-subscription messages appear; publish new ones |
| "Service 's3' is not enabled" | SES not initialized after container restart | Send an email first, then the `/_aws/ses` endpoint works |
| Port 4566 already allocated | Another LocalStack running | Use remapped port (14566) in docker-compose.yml |
