import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDb } from '../setup';

// ─── Webhook Processing Logic (matching app behavior with Firestore) ───

interface BrevoWebhookEvent {
  event: string;
  email: string;
  'message-id': string;
  date: string;
  ts_event: number;
  tag?: string;
  reason?: string;
  link?: string;
}

type EmailStatusMap = Record<
  string,
  {
    emailField: string;
    outreachStatus: string;
    activityType: string;
  }
>;

const EVENT_MAP: EmailStatusMap = {
  delivered: {
    emailField: 'deliveredAt',
    outreachStatus: 'delivered',
    activityType: 'email.delivered',
  },
  opened: {
    emailField: 'openedAt',
    outreachStatus: 'opened',
    activityType: 'email.opened',
  },
  click: {
    emailField: 'clickedAt',
    outreachStatus: 'opened',
    activityType: 'email.clicked',
  },
  hard_bounce: {
    emailField: 'bouncedAt',
    outreachStatus: 'bounced',
    activityType: 'email.bounced',
  },
  soft_bounce: {
    emailField: 'bouncedAt',
    outreachStatus: 'bounced',
    activityType: 'email.bounced',
  },
  unsubscribe: {
    emailField: 'unsubscribedAt',
    outreachStatus: 'none',
    activityType: 'email.unsubscribed',
  },
};

interface MockDbType {
  webhookEvents: typeof mockDb.webhookEvents;
  emailMessages: typeof mockDb.emailMessages;
  leads: typeof mockDb.leads;
  activities: typeof mockDb.activities;
}

async function processBrevoWebhook(
  event: BrevoWebhookEvent,
  db: MockDbType
): Promise<{ processed: boolean; reason?: string }> {
  const eventMapping = EVENT_MAP[event.event];
  if (!eventMapping) {
    return { processed: false, reason: `Unknown event type: ${event.event}` };
  }

  const providerEventId = `${event['message-id']}-${event.event}-${event.ts_event}`;

  // Idempotency check
  const existingEvent = await db.webhookEvents.findFirst({
    provider: 'brevo',
    providerEventId,
  });

  if (existingEvent) {
    return { processed: false, reason: 'Duplicate event' };
  }

  // Store webhook event
  const webhookRecord = await db.webhookEvents.create({
    provider: 'brevo',
    eventType: event.event,
    providerEventId,
    payload: event as unknown as Record<string, unknown>,
    status: 'processing',
  });

  // Find email message
  const emailMessage = await db.emailMessages.findFirst({
    providerMessageId: event['message-id'],
  });

  if (!emailMessage) {
    await db.webhookEvents.update(webhookRecord.id, {
      status: 'failed',
      errorMessage: 'Email message not found',
    });
    return { processed: false, reason: 'Email message not found' };
  }

  // Update email message status
  const updateData: Record<string, unknown> = {
    [eventMapping.emailField]: new Date(event.date),
  };

  if (event.event === 'delivered') {
    updateData.status = 'delivered';
  }

  await db.emailMessages.update(emailMessage.id, updateData);

  // Update lead outreach status
  if (emailMessage.leadId) {
    await db.leads.update(emailMessage.leadId as string, {
      outreachStatus: eventMapping.outreachStatus,
    });
  }

  // Create activity
  await db.activities.create({
    eventType: eventMapping.activityType,
    leadId: emailMessage.leadId,
    campaignId: emailMessage.campaignId,
    emailMessageId: emailMessage.id,
    provider: 'brevo',
    providerEventId,
    metadata: {
      email: event.email,
      event: event.event,
      reason: event.reason,
      link: event.link,
    },
  });

  // Mark webhook as processed
  await db.webhookEvents.update(webhookRecord.id, {
    status: 'processed',
    processedAt: new Date(),
  });

  return { processed: true };
}

// ─── Tests ───

describe('Webhook Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Brevo webhook event processing', () => {
    const baseEvent: BrevoWebhookEvent = {
      event: 'delivered',
      email: 'recipient@example.com',
      'message-id': '<msg-123@brevo.com>',
      date: '2024-01-15T10:30:00Z',
      ts_event: 1705312200,
    };

    const mockEmailMessage = {
      id: 'email-1',
      leadId: 'lead-1',
      campaignId: 'campaign-1',
      providerMessageId: '<msg-123@brevo.com>',
      status: 'sent',
    };

    it('processes delivered event and updates email message', async () => {
      mockDb.webhookEvents.findFirst.mockResolvedValue(null);
      mockDb.webhookEvents.create.mockResolvedValue({ id: 'wh-1', status: 'processing' });
      mockDb.emailMessages.findFirst.mockResolvedValue(mockEmailMessage);
      mockDb.emailMessages.update.mockResolvedValue({});
      mockDb.leads.update.mockResolvedValue({});
      mockDb.activities.create.mockResolvedValue({ id: 'act-1' });
      mockDb.webhookEvents.update.mockResolvedValue({});

      const result = await processBrevoWebhook(baseEvent, mockDb);

      expect(result.processed).toBe(true);
      expect(mockDb.emailMessages.update).toHaveBeenCalledWith(
        'email-1',
        expect.objectContaining({
          deliveredAt: expect.any(Date),
          status: 'delivered',
        })
      );
    });

    it('processes opened event', async () => {
      const openedEvent = { ...baseEvent, event: 'opened', ts_event: 1705312300 };

      mockDb.webhookEvents.findFirst.mockResolvedValue(null);
      mockDb.webhookEvents.create.mockResolvedValue({ id: 'wh-2' });
      mockDb.emailMessages.findFirst.mockResolvedValue(mockEmailMessage);
      mockDb.emailMessages.update.mockResolvedValue({});
      mockDb.leads.update.mockResolvedValue({});
      mockDb.activities.create.mockResolvedValue({});
      mockDb.webhookEvents.update.mockResolvedValue({});

      const result = await processBrevoWebhook(openedEvent, mockDb);
      expect(result.processed).toBe(true);

      expect(mockDb.leads.update).toHaveBeenCalledWith('lead-1', {
        outreachStatus: 'opened',
      });
    });

    it('processes click event with link metadata', async () => {
      const clickEvent: BrevoWebhookEvent = {
        ...baseEvent,
        event: 'click',
        ts_event: 1705312400,
        link: 'https://example.com/landing',
      };

      mockDb.webhookEvents.findFirst.mockResolvedValue(null);
      mockDb.webhookEvents.create.mockResolvedValue({ id: 'wh-3' });
      mockDb.emailMessages.findFirst.mockResolvedValue(mockEmailMessage);
      mockDb.emailMessages.update.mockResolvedValue({});
      mockDb.leads.update.mockResolvedValue({});
      mockDb.activities.create.mockResolvedValue({});
      mockDb.webhookEvents.update.mockResolvedValue({});

      const result = await processBrevoWebhook(clickEvent, mockDb);
      expect(result.processed).toBe(true);

      expect(mockDb.activities.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'email.clicked',
          metadata: expect.objectContaining({
            link: 'https://example.com/landing',
          }),
        })
      );
    });

    it('processes hard_bounce event', async () => {
      const bounceEvent: BrevoWebhookEvent = {
        ...baseEvent,
        event: 'hard_bounce',
        ts_event: 1705312500,
        reason: 'Mailbox does not exist',
      };

      mockDb.webhookEvents.findFirst.mockResolvedValue(null);
      mockDb.webhookEvents.create.mockResolvedValue({ id: 'wh-4' });
      mockDb.emailMessages.findFirst.mockResolvedValue(mockEmailMessage);
      mockDb.emailMessages.update.mockResolvedValue({});
      mockDb.leads.update.mockResolvedValue({});
      mockDb.activities.create.mockResolvedValue({});
      mockDb.webhookEvents.update.mockResolvedValue({});

      const result = await processBrevoWebhook(bounceEvent, mockDb);
      expect(result.processed).toBe(true);

      expect(mockDb.leads.update).toHaveBeenCalledWith('lead-1', {
        outreachStatus: 'bounced',
      });
    });

    it('returns unknown for unmapped event types', async () => {
      const unknownEvent = { ...baseEvent, event: 'complaint' };

      const result = await processBrevoWebhook(unknownEvent, mockDb);
      expect(result.processed).toBe(false);
      expect(result.reason).toContain('Unknown event type');
    });
  });

  describe('idempotency', () => {
    it('skips duplicate webhook events', async () => {
      const event: BrevoWebhookEvent = {
        event: 'delivered',
        email: 'test@example.com',
        'message-id': '<msg-123@brevo.com>',
        date: '2024-01-15T10:30:00Z',
        ts_event: 1705312200,
      };

      mockDb.webhookEvents.findFirst.mockResolvedValue({
        id: 'wh-existing',
        provider: 'brevo',
        providerEventId: '<msg-123@brevo.com>-delivered-1705312200',
      });

      const result = await processBrevoWebhook(event, mockDb);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('Duplicate event');
      expect(mockDb.webhookEvents.create).not.toHaveBeenCalled();
      expect(mockDb.emailMessages.update).not.toHaveBeenCalled();
    });

    it('processes same message-id with different event types', async () => {
      const deliveredEvent: BrevoWebhookEvent = {
        event: 'delivered',
        email: 'test@example.com',
        'message-id': '<msg-123@brevo.com>',
        date: '2024-01-15T10:30:00Z',
        ts_event: 1705312200,
      };

      const openedEvent: BrevoWebhookEvent = {
        event: 'opened',
        email: 'test@example.com',
        'message-id': '<msg-123@brevo.com>',
        date: '2024-01-15T10:35:00Z',
        ts_event: 1705312500,
      };

      mockDb.webhookEvents.findFirst.mockResolvedValueOnce(null);
      mockDb.webhookEvents.create.mockResolvedValueOnce({ id: 'wh-1' });
      mockDb.emailMessages.findFirst.mockResolvedValueOnce({
        id: 'email-1',
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        providerMessageId: '<msg-123@brevo.com>',
      });
      mockDb.emailMessages.update.mockResolvedValueOnce({});
      mockDb.leads.update.mockResolvedValueOnce({});
      mockDb.activities.create.mockResolvedValueOnce({});
      mockDb.webhookEvents.update.mockResolvedValueOnce({});

      const result1 = await processBrevoWebhook(deliveredEvent, mockDb);
      expect(result1.processed).toBe(true);

      mockDb.webhookEvents.findFirst.mockResolvedValueOnce(null);
      mockDb.webhookEvents.create.mockResolvedValueOnce({ id: 'wh-2' });
      mockDb.emailMessages.findFirst.mockResolvedValueOnce({
        id: 'email-1',
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        providerMessageId: '<msg-123@brevo.com>',
      });
      mockDb.emailMessages.update.mockResolvedValueOnce({});
      mockDb.leads.update.mockResolvedValueOnce({});
      mockDb.activities.create.mockResolvedValueOnce({});
      mockDb.webhookEvents.update.mockResolvedValueOnce({});

      const result2 = await processBrevoWebhook(openedEvent, mockDb);
      expect(result2.processed).toBe(true);
    });
  });

  describe('email status updates', () => {
    it('handles missing email message gracefully', async () => {
      const event: BrevoWebhookEvent = {
        event: 'delivered',
        email: 'unknown@example.com',
        'message-id': '<msg-unknown@brevo.com>',
        date: '2024-01-15T10:30:00Z',
        ts_event: 1705312200,
      };

      mockDb.webhookEvents.findFirst.mockResolvedValue(null);
      mockDb.webhookEvents.create.mockResolvedValue({ id: 'wh-5' });
      mockDb.emailMessages.findFirst.mockResolvedValue(null);
      mockDb.webhookEvents.update.mockResolvedValue({});

      const result = await processBrevoWebhook(event, mockDb);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('Email message not found');
      expect(mockDb.webhookEvents.update).toHaveBeenCalledWith('wh-5', {
        status: 'failed',
        errorMessage: 'Email message not found',
      });
    });

    it('updates lead outreach status based on event type', async () => {
      const event: BrevoWebhookEvent = {
        event: 'delivered',
        email: 'test@example.com',
        'message-id': '<msg-456@brevo.com>',
        date: '2024-01-15T10:30:00Z',
        ts_event: 1705312200,
      };

      mockDb.webhookEvents.findFirst.mockResolvedValue(null);
      mockDb.webhookEvents.create.mockResolvedValue({ id: 'wh-6' });
      mockDb.emailMessages.findFirst.mockResolvedValue({
        id: 'email-2',
        leadId: 'lead-2',
        campaignId: 'campaign-1',
        providerMessageId: '<msg-456@brevo.com>',
      });
      mockDb.emailMessages.update.mockResolvedValue({});
      mockDb.leads.update.mockResolvedValue({});
      mockDb.activities.create.mockResolvedValue({});
      mockDb.webhookEvents.update.mockResolvedValue({});

      await processBrevoWebhook(event, mockDb);

      expect(mockDb.leads.update).toHaveBeenCalledWith('lead-2', {
        outreachStatus: 'delivered',
      });
    });
  });

  describe('activity creation', () => {
    it('creates activity record for webhook events', async () => {
      const event: BrevoWebhookEvent = {
        event: 'opened',
        email: 'test@example.com',
        'message-id': '<msg-789@brevo.com>',
        date: '2024-01-15T11:00:00Z',
        ts_event: 1705314000,
      };

      mockDb.webhookEvents.findFirst.mockResolvedValue(null);
      mockDb.webhookEvents.create.mockResolvedValue({ id: 'wh-7' });
      mockDb.emailMessages.findFirst.mockResolvedValue({
        id: 'email-3',
        leadId: 'lead-3',
        campaignId: 'campaign-2',
        providerMessageId: '<msg-789@brevo.com>',
      });
      mockDb.emailMessages.update.mockResolvedValue({});
      mockDb.leads.update.mockResolvedValue({});
      mockDb.activities.create.mockResolvedValue({ id: 'act-1' });
      mockDb.webhookEvents.update.mockResolvedValue({});

      await processBrevoWebhook(event, mockDb);

      expect(mockDb.activities.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'email.opened',
          leadId: 'lead-3',
          campaignId: 'campaign-2',
          emailMessageId: 'email-3',
          provider: 'brevo',
          providerEventId: '<msg-789@brevo.com>-opened-1705314000',
        })
      );
    });
  });
});
