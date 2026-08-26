# LeadFlow

AI-powered lead intelligence and hyper-personalized outreach platform.

[![CI](https://github.com/avilcodes/leadflow/actions/workflows/ci.yml/badge.svg)](https://github.com/avilcodes/leadflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

LeadFlow is a full-stack platform that automates the entire lead-to-outreach pipeline:

1. **Import leads** from Apollo.io, Prospeo, Deepenrich, CSV, or manual entry
2. **Enrich** with LinkedIn and website data via Apify actors
3. **AI-analyze** each lead using OpenRouter (any LLM model)
4. **Generate hyper-personalized emails** — not templates, but genuinely unique content
5. **Send** via Brevo with full delivery/open/click/reply tracking
6. **Track everything** in a comprehensive activity timeline

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Queue | BullMQ + Redis |
| UI | Tailwind CSS + Lucide Icons + Recharts |
| Auth | JWT (jose) + bcrypt |
| AI | OpenRouter API (any model) |
| Email | Brevo (Sendinblue) |
| Scraping | Apify Actors |
| Lead Sources | Apollo.io, Prospeo, Deepenrich |

## Quick Start with GitHub Codespaces

The fastest way to run LeadFlow — **zero local setup required**:

1. Go to [github.com/avilcodes/leadflow](https://github.com/avilcodes/leadflow)
2. Click **Code** → **Codespaces** → **Create codespace on main**
3. Wait for the container to build (~2 minutes)
4. The devcontainer auto-runs: `npm install`, `prisma generate`, `prisma db push`, `npm run db:seed`
5. Run `npm run dev` — the app is live at the forwarded port 3000

**Demo credentials:**
- Admin: `admin@leadflow.demo` / `password123`
- User: `user@leadflow.demo` / `password123`

## Local Development

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- Redis 7+

### Setup

```bash
git clone https://github.com/avilcodes/leadflow.git
cd leadflow

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials and API keys

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Seed demo data
npm run db:seed

# Start development server
npm run dev

# In a separate terminal, start the background worker
npm run worker
```

### Docker Compose

```bash
docker compose up -d
# App: http://localhost:3000
# Worker runs automatically
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `REDIS_URL` | Redis connection string | ✅ |
| `AUTH_SECRET` | JWT signing secret (32+ chars) | ✅ |
| `APP_URL` | Application base URL | ✅ |
| `APOLLO_API_KEY` | Apollo.io API key | ❌ |
| `PROSPEO_API_KEY` | Prospeo API key | ❌ |
| `DEEPENRICH_API_KEY` | Deepenrich API key | ❌ |
| `APIFY_API_KEY` | Apify API token | ❌ |
| `OPENROUTER_API_KEY` | OpenRouter API key | ❌ |
| `OPENROUTER_DEFAULT_MODEL` | Default AI model | ❌ |
| `BREVO_API_KEY` | Brevo API key | ❌ |
| `EMAIL_SENDING_ENABLED` | Enable email sending (`true`/`false`) | ❌ |
| `EMAIL_RATE_LIMIT_PER_HOUR` | Max emails per hour | ❌ |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  Next.js App Router · React · Tailwind · Charts  │
├─────────────────────────────────────────────────┤
│                   API Layer                      │
│  REST Routes · Auth · Validation · Rate Limiting │
├──────────┬──────────┬──────────┬────────────────┤
│ Lead     │ Campaign │ Email    │ Activity       │
│ Service  │ Service  │ Service  │ Service        │
├──────────┴──────────┴──────────┴────────────────┤
│              Provider Abstraction                │
│  ┌──────────┐ ┌───────────┐ ┌────┐ ┌─────┐    │
│  │LeadSource│ │Enrichment │ │ AI │ │Email│    │
│  │Provider  │ │Provider   │ │Prov│ │Prov │    │
│  ├──────────┤ ├───────────┤ ├────┤ ├─────┤    │
│  │Apollo    │ │Apify      │ │Open│ │Brevo│    │
│  │Prospeo   │ │           │ │Rout│ │     │    │
│  │Deepenrich│ │           │ │er  │ │     │    │
│  │CSV       │ │           │ │    │ │     │    │
│  └──────────┘ └───────────┘ └────┘ └─────┘    │
├─────────────────────────────────────────────────┤
│              Background Jobs (BullMQ)            │
│  Import · Enrich · Analyze · Generate · Send     │
├──────────────────┬──────────────────────────────┤
│   PostgreSQL     │        Redis                  │
│   (Data Store)   │     (Job Queue)               │
└──────────────────┴──────────────────────────────┘
```

## Adding a New Lead Provider

1. Create `src/providers/lead-sources/your-provider.ts`
2. Implement the `LeadSourceProvider` interface:
   ```typescript
   export class YourProvider implements LeadSourceProvider {
     name = 'your-provider';
     async searchLeads(query) { /* ... */ }
     async testConnection() { /* ... */ }
   }
   ```
3. Register in `src/providers/lead-sources/index.ts`
4. Add API key to `.env.example` and settings UI

## Adding a New AI Provider

1. Create `src/providers/ai/your-provider.ts`
2. Implement the `AIProvider` interface with `analyze()` and `generateEmail()`
3. Register in `src/providers/ai/index.ts`

## Adding a New Email Channel

1. Create `src/providers/email/your-channel.ts` or a new channel directory
2. Implement the `EmailProvider` interface
3. The campaign `channel` field already supports: email, linkedin, whatsapp, sms

## Webhook Setup

### Brevo Webhooks

1. Go to Brevo → Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/api/webhooks/brevo`
3. Select events: delivered, opened, click, hard_bounce, soft_bounce, spam, unsubscribed
4. Save

## Deployment

### Vercel + Neon

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Create a database on [Neon](https://neon.tech) (free tier)
4. Set environment variables in Vercel
5. Deploy

### Railway

1. Create project on [Railway](https://railway.app)
2. Add PostgreSQL and Redis services
3. Deploy from GitHub
4. Set environment variables

## API Documentation

See [docs/API.md](docs/API.md) for complete API reference.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## License

MIT — see [LICENSE](LICENSE).
