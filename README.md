# RevivePay

RevivePay is a bounded AI revenue-recovery operating system for Razorpay merchants. It detects failed payments, halted subscriptions, and overdue invoices; explains the likely cause; proposes the safest intervention; gates high-value actions; understands customer replies; verifies payment; and stops recovery automatically.

The repository contains a complete deployable hackathon demo, not a static prototype:

- React merchant command centre and customer checkout
- 80-case reproducible synthetic evaluation batch
- Persistent SQLite datastore using Node's built-in `node:sqlite`
- Human approval for high-value actions
- Razorpay Payment Links test-mode adapter
- Signed webhook verification and event-ID deduplication
- OpenRouter free-model or OpenAI reply classification with a deterministic fail-safe fallback
- Promise-to-pay, dispute, hardship, and opt-out stopping rules
- Full decision and execution audit trail
- Docker and Render deployment configuration

## Quick start

Requirements: Node.js 22.5 or newer.

```bash
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`. The safe demo adapter works without credentials.

Production-style local run:

```bash
npm run build
npm start
```

Open `http://localhost:3001`.

## Five-minute demo path

1. Start on **Command centre** and explain recovered value, value-at-risk, baseline uplift, and zero policy violations.
2. Open a **Needs approval** case. Show the diagnosis, recoverability, reason, message, and approval threshold.
3. Approve the action. RevivePay generates a payment link through Razorpay test mode when credentials exist, or through the safe adapter otherwise.
4. Open the customer payment link and complete the test payment. The case closes and all pending reminders are cancelled.
5. On another case, submit `I will pay on Monday`; show promise-to-pay extraction and contact suppression.
6. Submit `This invoice is not mine`; show immediate escalation and automation pause.
7. Click **Run duplicate test**. The first webhook closes the case; the duplicate is ignored and recorded in the audit trail.
8. Open **Evaluation** to show results on the full 80-case batch rather than one selected example.

## Razorpay test-mode setup

Create test-mode credentials and configure:

```dotenv
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
PUBLIC_APP_URL=https://your-domain.example
```

Configure the public endpoint below in the Razorpay test-mode dashboard:

```text
POST https://your-domain.example/api/webhooks/razorpay
```

Useful events include `payment_link.paid`, `payment.captured`, `order.paid`, and `subscription.charged`. RevivePay validates `X-Razorpay-Signature`, requires `X-Razorpay-Event-Id`, and ignores duplicate event IDs. Payment Links carry the recovery case ID as their `reference_id` and in `notes.revive_case_id`.

## OpenRouter setup (recommended for the demo)

Create an OpenRouter API key and add it to `.env`:

```dotenv
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openrouter/free
```

`openrouter/free` automatically selects an available zero-cost model that supports the request. RevivePay records the actual model returned by OpenRouter in the simulator. If the router is rate-limited, unavailable, or returns malformed output, the application fails over to OpenAI when configured and then to the conservative local classifier.

The key remains server-side and is never included in the browser bundle.

## OpenAI setup (optional secondary provider)

Set these variables to enable live customer-reply understanding:

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
```

The OpenAI integration uses the Responses API with a strict JSON schema. Provider priority is OpenRouter → OpenAI → deterministic fallback. The model only classifies and recommends; it never calls a money API directly.

## Safety model

```text
Event → diagnosis → AI recommendation → policy validation → optional human approval
      → deterministic executor → verified webhook → stop and audit
```

Default controls:

- Maximum three contact attempts
- Minimum 24 hours between messages
- Contact only from 09:00–20:00 merchant time
- Human approval above ₹25,000
- Immediate stop for disputes, hardship, opt-outs, or verified payment
- Discounts disabled
- Fail closed when an external service is unavailable

## Evaluation disclosure

The dashboard's batch metrics use seeded synthetic cases and are labelled accordingly. `resetAndSeedDatabase()` deterministically creates the evaluation batch. The fixed-reminder baseline and RevivePay policy are evaluated on the same cases. Do not present these numbers as live merchant performance.

Before final submission, replace or complement the simulator with Razorpay test-mode events and export the locked batch outcomes to a CSV for the repository.

## Test and verify

```bash
npm run typecheck
npm test
npm run build
```

## Docker deployment

```bash
docker compose up --build
```

The application listens on port `3001` and stores data at `/data/revivepay.db` inside the container. The Compose file mounts that directory as a persistent volume.

## Render deployment

The included `render.yaml` defines a Docker web service, health check, environment variables, and 1 GB persistent disk.

1. Push this repository to GitHub.
2. In Render, create a **Blueprint** from the repository.
3. Set `PUBLIC_APP_URL` to the deployed URL.
4. Add optional OpenRouter, OpenAI, and Razorpay test credentials.
5. Deploy and verify `/api/health`.

Any container platform with a persistent `/data` volume works. Without a volume, the app remains usable but resets to the seeded evaluation dataset after a restart.

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Deployment health check |
| `GET /api/dashboard` | Metrics, cases, audit, integration status |
| `GET /api/cases/:id` | Complete case explanation and timeline |
| `POST /api/cases/:id/actions/:actionId/approve` | Human approval and bounded execution |
| `POST /api/cases/:id/reply` | Customer intent classification |
| `POST /api/webhooks/razorpay` | Signed Razorpay webhook ingestion |
| `GET/PUT /api/policies` | Merchant guardrail control plane |
| `POST /api/demo/duplicate-webhook/:id` | Judge-ready failure scenario |
| `POST /api/demo/reset` | Restore reproducible demo state |

## Project structure

```text
server/
  ai.ts          Structured AI classification and fallback
  db.ts          Schema, seed batch, persistence, audit records
  engine.ts      Policy-gated recovery state machine
  index.ts       API, webhook validation, production server
  razorpay.ts    Real test-mode and safe-demo Payment Link adapters
src/
  App.tsx        Merchant dashboard, evaluation, case drawer, checkout
  styles.css     Responsive product UI
```
