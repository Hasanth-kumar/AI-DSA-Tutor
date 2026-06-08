# n8n Workflows

Thin orchestration only — business logic lives in the backend API.

1. **Trigger** (Cron / Webhook)
2. **HTTP request** to the backend
3. Backend sends WhatsApp via Meta Cloud API

## Workflows

| File | Schedule | Endpoint |
|------|----------|----------|
| `daily-plan.workflow.json` | 7 AM daily | `POST /api/notifications/daily-plan` |
| `revision-check.workflow.json` | 9 PM daily | `POST /api/notifications/revision-check` |
| `weekly-digest.workflow.json` | Sunday 8 PM | `POST /api/notifications/weekly-digest` |

Incoming messages (`plan`, `done`, `hint`, …) go to **Meta webhook** → `POST /webhooks/whatsapp` (no n8n needed).

Import into n8n at `http://localhost:5678` after `pnpm docker:up`.

See [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md) for Meta app, webhook, and env configuration.

**Note:** BullMQ schedulers can send the same notifications if `ENABLE_SCHEDULERS=true` — use n8n or schedulers, not both, unless you want duplicate messages.
