import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrismaClient } from '../setup';

// ─── Webhook Processing Logic (matching app behavior) ───

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
    outreachStatus: 'opened', // keep as opened, click is a sub-event
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

async function processBrevoWebhook(
  event: BrevoWebhookEvent,
  prisma: typeof mockPrismaClient
): Promise<{ processed: boolean; reason?: string }> {
  const eventMapping = EVENT_MAP[event.event];
  if (!eventMapping) {
    return { processed: false, reason: `Unknown event type: ${event.event}` };
  }

  // Idempotency check
  const existingEvent = await prisma.webhookEvent.findFirst({
    where: {
      provider: 'brevo',
      providerEventId: `${event['message-id']}-${event.event}-${event.ts_event}`,
    },
  });

  if (existingEvent) {
    return { processed: false, reason: 'Duplicate event' };
  }

  // Store webhook event
  const webhookRecord = await prisma.webhookEvent.create({
    data: {
      provider: 'brevo',
      eventType: event.event,
      providerEventId: `${event['message-id']}-${event.event}-${event.ts_event}`,
      payload: event as unknown as Record<string, unknown>,
      status: 'processing',
    },
  });

  // Find email message
  const emailMessage = await prisma.emailMessage.findFirst({
    where: { providerMessageId: event['message-id'] },
  });

  if (!emailMessage) {
    await prisma.webhookEvent.update({
      where: { id: webhookRecord.id },
      data: { status: 'failed', errorMessage: 'Email message not found' },
    });
    return { processed: false, reason: 'Email message not found' };
  }

  // Update email message status
  const updateData: Record<string, unknown> = {
    [eventMapping.emailField]: new Date(event.date),
  };

  // Update status only if it's a progression
  if (event.event === 'delivered') {
    updateData.status = 'delivered';
  }

  await prisma.emailMessage.update({
    where: { id: emailMessage.id },
    data: updateData,
  });

  // Update lead outreach status
  if (emailMessage.leadId) {
    await prisma.lead.update({
      where: { id: emailMessage.leadId },
      data: { outreachStatus: eventMapping.outreachStatus },
    });
  }

  // Create activity
  await prisma.activity.create({
    data: {
      eventType: eventMapping.activityType,
      leadId: emailMessage.leadId,
      campaignId: emailMessage.campaignId,
      emailMessageId: emailMessage.id,
      provider: 'brevo',
      providerEventId: `${event['message-id']}-${event.event}-${event.ts_event}`,
      metadata: {
        email: event.email,
        event: event.event,
        reason: event.reason,
        link: event.link,
      },
    },
  });

  // Mark webhook as processed
  await prisma.webhookEvent.update({
    where: { id: webhookRecord.id },
    data: { status: 'processed', processedAt: new Date() },
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
      mockPrismaClient.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValue({
        id: 'wh-1',
        status: 'processing',
      });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValue(mockEmailMessage);
      mockPrismaClient.emailMessage.update.mockResolvedValue({});
      mockPrismaClient.lead.update.mockResolvedValue({});
      mockPrismaClient.activity.create.mockResolvedValue({ id: 'act-1' });
      mockPrismaClient.webhookEvent.update.mockResolvedValue({});

      const result = await processBrevoWebhook(baseEvent, mockPrismaClient);

      expect(result.processed).toBe(true);
      expect(mockPrismaClient.emailMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'email-1' },
          data: expect.objectContaining({
            deliveredAt: expect.any(Date),
            status: 'delivered',
          }),
        })
      );
    });

    it('processes opened event', async () => {
      const openedEvent = { ...baseEvent, event: 'opened', ts_event: 1705312300 };

      mockPrismaClient.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValue({ id: 'wh-2' });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValue(mockEmailMessage);
      mockPrismaClient.emailMessage.update.mockResolvedValue({});
      mockPrismaClient.lead.update.mockResolvedValue({});
      mockPrismaClient.activity.create.mockResolvedValue({});
      mockPrismaClient.webhookEvent.update.mockResolvedValue({});

      const result = await processBrevoWebhook(openedEvent, mockPrismaClient);
      expect(result.processed).toBe(true);

      expect(mockPrismaClient.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { outreachStatus: 'opened' },
      });
    });

    it('processes click event with link metadata', async () => {
      const clickEvent: BrevoWebhookEvent = {
        ...baseEvent,
        event: 'click',
        ts_event: 1705312400,
        link: 'https://example.com/landing',
      };

      mockPrismaClient.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValue({ id: 'wh-3' });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValue(mockEmailMessage);
      mockPrismaClient.emailMessage.update.mockResolvedValue({});
      mockPrismaClient.lead.update.mockResolvedValue({});
      mockPrismaClient.activity.create.mockResolvedValue({});
      mockPrismaClient.webhookEvent.update.mockResolvedValue({});

      const result = await processBrevoWebhook(clickEvent, mockPrismaClient);
      expect(result.processed).toBe(true);

      expect(mockPrismaClient.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'email.clicked',
          metadata: expect.objectContaining({
            link: 'https://example.com/landing',
          }),
        }),
      });
    });

    it('processes hard_bounce event', async () => {
      const bounceEvent: BrevoWebhookEvent = {
        ...baseEvent,
        event: 'hard_bounce',
        ts_event: 1705312500,
        reason: 'Mailbox does not exist',
      };

      mockPrismaClient.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValue({ id: 'wh-4' });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValue(mockEmailMessage);
      mockPrismaClient.emailMessage.update.mockResolvedValue({});
      mockPrismaClient.lead.update.mockResolvedValue({});
      mockPrismaClient.activity.create.mockResolvedValue({});
      mockPrismaClient.webhookEvent.update.mockResolvedValue({});

      const result = await processBrevoWebhook(bounceEvent, mockPrismaClient);
      expect(result.processed).toBe(true);

      expect(mockPrismaClient.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { outreachStatus: 'bounced' },
      });
    });

    it('returns unknown for unmapped event types', async () => {
      const unknownEvent = { ...baseEvent, event: 'complaint' };

      const result = await processBrevoWebhook(unknownEvent, mockPrismaClient);
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

      mockPrismaClient.webhookEvent.findFirst.mockResolvedValue({
        id: 'wh-existing',
        provider: 'brevo',
        providerEventId: '<msg-123@brevo.com>-delivered-1705312200',
      });

      const result = await processBrevoWebhook(event, mockPrismaClient);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('Duplicate event');
      expect(mockPrismaClient.webhookEvent.create).not.toHaveBeenCalled();
      expect(mockPrismaClient.emailMessage.update).not.toHaveBeenCalled();
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

      // First event - no duplicate
      mockPrismaClient.webhookEvent.findFirst.mockResolvedValueOnce(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValueOnce({ id: 'wh-1' });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValueOnce({
        id: 'email-1',
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        providerMessageId: '<msg-123@brevo.com>',
      });
      mockPrismaClient.emailMessage.update.mockResolvedValueOnce({});
      mockPrismaClient.lead.update.mockResolvedValueOnce({});
      mockPrismaClient.activity.create.mockResolvedValueOnce({});
      mockPrismaClient.webhookEvent.update.mockResolvedValueOnce({});

      const result1 = await processBrevoWebhook(deliveredEvent, mockPrismaClient);
      expect(result1.processed).toBe(true);

      // Second event - different type, no duplicate
      mockPrismaClient.webhookEvent.findFirst.mockResolvedValueOnce(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValueOnce({ id: 'wh-2' });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValueOnce({
        id: 'email-1',
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        providerMessageId: '<msg-123@brevo.com>',
      });
      mockPrismaClient.emailMessage.update.mockResolvedValueOnce({});
      mockPrismaClient.lead.update.mockResolvedValueOnce({});
      mockPrismaClient.activity.create.mockResolvedValueOnce({});
      mockPrismaClient.webhookEvent.update.mockResolvedValueOnce({});

      const result2 = await processBrevoWebhook(openedEvent, mockPrismaClient);
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

      mockPrismaClient.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValue({ id: 'wh-5' });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValue(null);
      mockPrismaClient.webhookEvent.update.mockResolvedValue({});

      const result = await processBrevoWebhook(event, mockPrismaClient);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('Email message not found');
      expect(mockPrismaClient.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'wh-5' },
        data: { status: 'failed', errorMessage: 'Email message not found' },
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

      mockPrismaClient.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValue({ id: 'wh-6' });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValue({
        id: 'email-2',
        leadId: 'lead-2',
        campaignId: 'campaign-1',
        providerMessageId: '<msg-456@brevo.com>',
      });
      mockPrismaClient.emailMessage.update.mockResolvedValue({});
      mockPrismaClient.lead.update.mockResolvedValue({});
      mockPrismaClient.activity.create.mockResolvedValue({});
      mockPrismaClient.webhookEvent.update.mockResolvedValue({});

      await processBrevoWebhook(event, mockPrismaClient);

      expect(mockPrismaClient.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-2' },
        data: { outreachStatus: 'delivered' },
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

      mockPrismaClient.webhookEvent.findFirst.mockResolvedValue(null);
      mockPrismaClient.webhookEvent.create.mockResolvedValue({ id: 'wh-7' });
      mockPrismaClient.emailMessage.findFirst.mockResolvedValue({
        id: 'email-3',
        leadId: 'lead-3',
        campaignId: 'campaign-2',
        providerMessageId: '<msg-789@brevo.com>',
      });
      mockPrismaClient.emailMessage.update.mockResolvedValue({});
      mockPrismaClient.lead.update.mockResolvedValue({});
      mockPrismaClient.activity.create.mockResolvedValue({ id: 'act-1' });
      mockPrismaClient.webhookEvent.update.mockResolvedValue({});

      await processBrevoWebhook(event, mockPrismaClient);

      expect(mockPrismaClient.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'email.opened',
          leadId: 'lead-3',
          campaignId: 'campaign-2',
          emailMessageId: 'email-3',
          provider: 'brevo',
          providerEventId: '<msg-789@brevo.com>-opened-1705314000',
        }),
      });
    });
  });
});
