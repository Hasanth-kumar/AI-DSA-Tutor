# WhatsApp (Meta Cloud API) — Phase 3 setup

Single-user bot: commands and cron notifications go to **your** number only (`WHATSAPP_DEFAULT_RECIPIENT`). No multi-recipient or team routing.

## 1. Meta Developer Console

1. Create an app at [developers.facebook.com](https://developers.facebook.com) → **Business** type.
2. Add **WhatsApp** product → **API Setup**.
3. Copy **Phone number ID**, generate a **Permanent access token** (System User with `whatsapp_business_messaging`).
4. Add your personal number as a **test recipient** (required in dev mode).

## 2. Environment variables

Add to repo root `.env`:

```bash
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_permanent_token
WHATSAPP_VERIFY_TOKEN=pick_a_random_string_for_webhook
WHATSAPP_DEFAULT_RECIPIENT=15551234567
WHATSAPP_API_VERSION=v21.0
# Optional: lock bot to your number only
WHATSAPP_ALLOWED_RECIPIENTS=15551234567
# Optional: secure n8n cron endpoints
WHATSAPP_NOTIFY_SECRET=another_random_string
```

`WHATSAPP_DEFAULT_RECIPIENT` is your WhatsApp ID (country code + number, no `+`).

## 3. Webhook (incoming messages)

Expose your API publicly (ngrok, Cloudflare Tunnel, or deploy):

```bash
ngrok http 3000
```

In Meta → WhatsApp → **Configuration** → **Webhook**:

| Field | Value |
|--------|--------|
| Callback URL | `https://YOUR_HOST/webhooks/whatsapp` |
| Verify token | Same as `WHATSAPP_VERIFY_TOKEN` |
| Subscribe | `messages` |

Start the API: `pnpm dev`

## 4. Commands (reply in WhatsApp)

| Command | Example |
|---------|---------|
| Daily plan | `plan` |
| Log session | `done Coin Change 45 80` |
| Weekly stats | `progress` |
| AI hint | `hint Coin Change` |
| Help | `help` |

## 5. Scheduled messages

**Option A — in-process scheduler (built-in)**  
If `ENABLE_SCHEDULERS=true` and WhatsApp env vars are set, the backend sends the weekly digest automatically via node-cron (`WEEKLY_DIGEST_CRON`, `SCHEDULER_TIMEZONE`). Daily plan / revision pushes were removed in favor of on-demand use.

**Option B — n8n**  
For daily plan / revision pushes, import `daily-plan.workflow.json` and `revision-check.workflow.json`. Set n8n env `WHATSAPP_NOTIFY_SECRET`. Adjust cron timezone in n8n if needed.

Manual test:

```bash
curl -X POST http://localhost:3000/api/notifications/daily-plan \
  -H "X-Notify-Secret: $WHATSAPP_NOTIFY_SECRET"
```

## 6. Production templates

Outside the 24-hour customer care window, proactive messages may require **approved message templates** in Meta Business Manager. For personal use, message yourself at least once every 24h, or use templates for cron pushes.

## 7. OpenRouter hints

Ensure `OPENROUTER_API_KEY` is set in `.env` and the model in `OPENROUTER_MODEL` is available on your OpenRouter account.
