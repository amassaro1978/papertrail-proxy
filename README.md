# PaperTrail Copilot — Backend Proxy

Backend proxy server that sits between the PaperTrail Copilot iOS app and Claude's API. The app **never** calls Claude directly — all AI requests go through this server.

## Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌───────────────┐
│  iOS App     │──────▶│  Proxy (Express)  │──────▶│  Claude API   │
│  (no API key)│◀──────│  Port 3334        │◀──────│  Anthropic    │
└──────────────┘       └──────────────────┘       └───────────────┘
                              │
                       ┌──────┴──────┐
                       │  SQLite DB  │
                       │  - devices  │
                       │  - usage    │
                       └─────────────┘
```

**Key design decisions:**
- API key stored server-side only — never sent to clients
- Device authentication via UUID tokens
- Per-device rate limiting (10 req/min)
- Usage tracking with monthly resets
- Free tier: 10 actions/month, Pro tier: unlimited

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| POST | `/api/auth/register` | None | Register device, get token |
| POST | `/api/analyze` | Bearer | Analyze document image via Claude |
| POST | `/api/draft` | Bearer | Generate draft via Claude |
| GET | `/api/usage` | Bearer | Get usage stats |
| POST | `/api/subscription/verify` | Bearer | Verify IAP receipt (placeholder) |

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file and add your API key
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Start server
node server.js
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
| `PORT` | No | 3334 | Server port |
| `RATE_LIMIT_PER_MIN` | No | 10 | Max requests per device per minute |
| `FREE_TIER_LIMIT` | No | 10 | Free tier monthly actions |

## Testing

```bash
# Register a device
curl -X POST http://localhost:3334/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "test-device-123"}'

# Check usage (use token from register response)
curl http://localhost:3334/api/usage \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Deployment

For production:
1. Use a process manager like PM2: `pm2 start server.js --name papertrail-proxy`
2. Put behind a reverse proxy (nginx/Caddy) with HTTPS
3. Set `ANTHROPIC_API_KEY` as an environment variable (not in .env)
4. The SQLite DB file (`papertrail.db`) is created automatically — back it up

## File Structure

```
papertrail-proxy/
├── server.js      # Express app, routes, middleware
├── db.js          # SQLite database layer
├── auth.js        # Authentication & usage-check middleware
├── claude.js      # Claude API calls (prompts from aiService.ts)
├── .env.example   # Environment variable template
└── README.md      # This file
```
