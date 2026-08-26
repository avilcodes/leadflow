# LeadFlow Architecture

## System Overview

LeadFlow follows a modular, provider-abstracted architecture built on Next.js 15 App Router.

### Key Design Decisions

1. **Provider Abstraction**: All external services (lead sources, enrichment, AI, email) are accessed through typed interfaces. Swapping Apollo for ZoomInfo means implementing one new class.

2. **Event Sourcing Pattern**: Every significant action creates an Activity record. The lead detail page reconstructs the complete timeline from these events.

3. **Async-First Processing**: Enrichment, AI analysis, email generation, and sending are designed for background processing via BullMQ. API routes queue work and return immediately.

4. **Idempotent Webhooks**: Webhook processing uses provider event IDs for deduplication. Processing the same Brevo webhook twice has no side effects.

5. **Safety by Default**: Email sending is disabled unless `EMAIL_SENDING_ENABLED=true`. Rate limits, suppression lists, and do-not-contact flags prevent accidental mass emailing.

## Data Flow

```
Lead Sources (Apollo/Prospeo/Deepenrich/CSV/Manual)
        │
        ▼
  ┌─ Normalize ──── Deduplicate ──── Save Lead ─┐
  │                                               │
  │  ┌──────────── Enrich (Apify) ──────────┐    │
  │  │  LinkedIn Profile Scrape              │    │
  │  │  Website Content Crawl                │    │
  │  │  Company Information                  │    │
  │  └──────────────────────────────────────-┘    │
  │                    │                          │
  │                    ▼                          │
  │         AI Analysis (OpenRouter)              │
  │  ┌─ Signals, Pain Points, Priorities ─┐      │
  │  │  Personalization Opportunities      │      │
  │  │  Outreach Angle                     │      │
  │  │  Confidence Score                   │      │
  │  └────────────────────────────────────-┘      │
  │                    │                          │
  │                    ▼                          │
  │       Email Generation (OpenRouter)           │
  │  ┌─ Hyper-personalized content ───────┐      │
  │  │  Not template-based                 │      │
  │  │  Uses all research data             │      │
  │  └────────────────────────────────────-┘      │
  │                    │                          │
  │          Human Review / Approval              │
  │                    │                          │
  │                    ▼                          │
  │            Send via Brevo                     │
  │                    │                          │
  │         Brevo Webhooks ──→ Event Tracking     │
  │  (delivered/opened/clicked/bounced/replied)   │
  │                    │                          │
  │                    ▼                          │
  │           Activity Timeline                   │
  └───────────────────────────────────────────────┘
```

## Database Schema

### Core Entities
- **Users** — Authentication and ownership
- **Leads** — Central entity with all contact/company data
- **Companies** — Optional company records linked to leads
- **Tags/LeadTags** — Flexible categorization

### Source Tracking
- **LeadSourceRecords** — Raw import data per provider per lead

### Enrichment
- **EnrichmentJobs** — Track each Apify actor run
- **AiAnalyses** — Store structured analysis output + model metadata

### Outreach
- **Campaigns** — Outreach campaign configuration and stats
- **CampaignLeads** — Many-to-many with per-lead status
- **EmailMessages** — Generated email content and sending status
- **EmailEvents** — Granular email tracking events

### System
- **Activities** — Complete audit trail of every action
- **BackgroundJobs** — Job queue state
- **WebhookEvents** — Raw webhook payloads for debugging
- **SuppressionList** — Bounced/unsubscribed/complained emails
- **ApiCredentials** — Encrypted provider API keys

## Security Model

- JWT-based authentication with httpOnly cookies
- Password hashing with bcrypt (12 rounds)
- Middleware-level route protection
- API key encryption at rest
- Webhook idempotency tokens
- Rate limiting on campaign sending
- Suppression list enforcement
- Do-not-contact flag on leads
- Email sending kill switch (ENV var)
