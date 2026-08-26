# LeadFlow API Documentation

Base URL: `http://localhost:3000/api`

All responses follow the format:
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "page": 1, "pageSize": 25, "total": 100, "totalPages": 4 }
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message"
}
```

## Authentication

### POST /api/auth/register
Create a new account. First user becomes admin.
```json
{ "name": "John", "email": "john@example.com", "password": "securepass123" }
```

### POST /api/auth/login
```json
{ "email": "john@example.com", "password": "securepass123" }
```
Response sets `leadflow-session` cookie.

### POST /api/auth/logout
Clears session cookie.

### GET /api/auth/me
Returns current authenticated user.

## Leads

### GET /api/leads
List leads with filtering and pagination.

Query params: `search`, `status`, `enrichmentStatus`, `outreachStatus`, `source`, `companyName`, `industry`, `location`, `tags[]`, `page`, `pageSize`, `sortBy`, `sortOrder`

### POST /api/leads
Create a lead manually.
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@acme.com",
  "jobTitle": "VP Engineering",
  "companyName": "Acme Corp",
  "tags": ["Enterprise"]
}
```

### GET /api/leads/:id
Full lead detail with enrichment jobs, AI analyses, emails, and activities.

### PUT /api/leads/:id
Update lead fields.

### DELETE /api/leads/:id
Soft-delete a lead.

### POST /api/leads/import
Import from CSV (multipart) or provider results (JSON).

### GET /api/leads/export
Export leads as CSV. Accepts same filter params as GET /api/leads.

### POST /api/leads/:id/enrich
Start enrichment. Body: `{ "types": ["linkedin_scrape", "website_scrape"] }`

### POST /api/leads/:id/analyze
Run AI analysis. Body: `{ "model": "anthropic/claude-sonnet-4" }` (optional)

### POST /api/leads/:id/generate-email
Generate personalized email. Body includes campaign config fields.

### POST /api/leads/bulk
Bulk operations. Body: `{ "action": "enrich|analyze|delete|tag|update-status", "leadIds": [...], "params": {} }`

## Campaigns

### GET /api/campaigns
### POST /api/campaigns
### GET /api/campaigns/:id
### PUT /api/campaigns/:id
### DELETE /api/campaigns/:id

### POST /api/campaigns/:id/leads
Add leads: `{ "leadIds": ["id1", "id2"] }`

### DELETE /api/campaigns/:id/leads
Remove leads: `{ "leadIds": ["id1"] }`

### POST /api/campaigns/:id/generate-emails
Generate emails for all pending campaign leads.

### POST /api/campaigns/:id/start
Start sending approved emails.

### POST /api/campaigns/:id/pause
Pause a running campaign.

### POST /api/campaigns/:id/resume
Resume a paused campaign.

## Emails

### GET /api/emails/:id
### PUT /api/emails/:id
Edit or approve/reject: `{ "status": "approved" }` or `{ "subject": "...", "htmlBody": "..." }`

### POST /api/emails/:id/send
Send a single email.

## Dashboard

### GET /api/dashboard
Returns stats, recent activities, leads by source/status.

## Activities

### GET /api/activities
Query params: `leadId`, `campaignId`, `eventType`, `page`, `pageSize`

## Settings

### GET /api/settings/credentials
List configured providers (keys masked).

### POST /api/settings/credentials
Save API key: `{ "provider": "apollo", "apiKey": "..." }`

### POST /api/settings/credentials/:provider/test
Test provider connection.

## Webhooks

### POST /api/webhooks/brevo
Brevo webhook endpoint. Processes delivery, open, click, bounce, unsubscribe, reply events.
Idempotent — safe to receive duplicate events.
