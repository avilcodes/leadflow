import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrismaClient } from '../setup';
import { createActivity } from '@/lib/activity';

describe('Activity System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createActivity', () => {
    it('creates an activity record', async () => {
      const mockActivity = {
        id: 'act-1',
        eventType: 'lead.created',
        leadId: 'lead-1',
        userId: 'user-1',
        createdAt: new Date(),
      };

      mockPrismaClient.activity.findFirst.mockResolvedValue(null);
      mockPrismaClient.activity.create.mockResolvedValue(mockActivity);

      const result = await createActivity({
        eventType: 'lead.created',
        leadId: 'lead-1',
        userId: 'user-1',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('act-1');
      expect(result!.eventType).toBe('lead.created');
      expect(mockPrismaClient.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'lead.created',
          leadId: 'lead-1',
          userId: 'user-1',
        }),
      });
    });

    it('creates activity with all optional fields', async () => {
      const mockActivity = {
        id: 'act-2',
        eventType: 'email.sent',
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        emailMessageId: 'email-1',
        userId: 'user-1',
        provider: 'brevo',
        providerEventId: 'brevo-evt-123',
        metadata: { subject: 'Test Email' },
        createdAt: new Date(),
      };

      mockPrismaClient.activity.findFirst.mockResolvedValue(null);
      mockPrismaClient.activity.create.mockResolvedValue(mockActivity);

      const result = await createActivity({
        eventType: 'email.sent',
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        emailMessageId: 'email-1',
        userId: 'user-1',
        provider: 'brevo',
        providerEventId: 'brevo-evt-123',
        metadata: { subject: 'Test Email' },
      });

      expect(result).not.toBeNull();
      expect(result!.eventType).toBe('email.sent');
    });

    it('creates activity without optional fields', async () => {
      const mockActivity = {
        id: 'act-3',
        eventType: 'campaign.created',
        createdAt: new Date(),
      };

      mockPrismaClient.activity.create.mockResolvedValue(mockActivity);

      const result = await createActivity({
        eventType: 'campaign.created',
      });

      expect(result).not.toBeNull();
      expect(result!.eventType).toBe('campaign.created');
    });
  });

  describe('idempotency with providerEventId', () => {
    it('skips duplicate provider events', async () => {
      const existingActivity = {
        id: 'act-existing',
        eventType: 'email.delivered',
        providerEventId: 'brevo-evt-456',
        createdAt: new Date(),
      };

      mockPrismaClient.activity.findFirst.mockResolvedValue(existingActivity);

      const result = await createActivity({
        eventType: 'email.delivered',
        providerEventId: 'brevo-evt-456',
        provider: 'brevo',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('act-existing');
      expect(mockPrismaClient.activity.create).not.toHaveBeenCalled();
    });

    it('checks for duplicate with correct query', async () => {
      mockPrismaClient.activity.findFirst.mockResolvedValue(null);
      mockPrismaClient.activity.create.mockResolvedValue({
        id: 'act-new',
        eventType: 'email.opened',
        providerEventId: 'brevo-evt-789',
      });

      await createActivity({
        eventType: 'email.opened',
        providerEventId: 'brevo-evt-789',
      });

      expect(mockPrismaClient.activity.findFirst).toHaveBeenCalledWith({
        where: {
          providerEventId: 'brevo-evt-789',
          eventType: 'email.opened',
        },
      });
    });

    it('does not check for duplicates when no providerEventId', async () => {
      mockPrismaClient.activity.create.mockResolvedValue({
        id: 'act-new',
        eventType: 'lead.created',
      });

      await createActivity({
        eventType: 'lead.created',
        leadId: 'lead-1',
      });

      expect(mockPrismaClient.activity.findFirst).not.toHaveBeenCalled();
    });

    it('allows same providerEventId with different eventTypes', async () => {
      // First call - no duplicate found
      mockPrismaClient.activity.findFirst.mockResolvedValueOnce(null);
      mockPrismaClient.activity.create.mockResolvedValueOnce({
        id: 'act-1',
        eventType: 'email.delivered',
        providerEventId: 'brevo-evt-100',
      });

      await createActivity({
        eventType: 'email.delivered',
        providerEventId: 'brevo-evt-100',
      });

      // Second call with different event type - no duplicate found
      mockPrismaClient.activity.findFirst.mockResolvedValueOnce(null);
      mockPrismaClient.activity.create.mockResolvedValueOnce({
        id: 'act-2',
        eventType: 'email.opened',
        providerEventId: 'brevo-evt-100',
      });

      await createActivity({
        eventType: 'email.opened',
        providerEventId: 'brevo-evt-100',
      });

      expect(mockPrismaClient.activity.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('returns null and does not throw on database error', async () => {
      mockPrismaClient.activity.create.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await createActivity({
        eventType: 'lead.created',
        leadId: 'lead-1',
      });

      // createActivity should catch the error and return null
      expect(result).toBeNull();
    });

    it('returns null on findFirst error during idempotency check', async () => {
      mockPrismaClient.activity.findFirst.mockRejectedValue(
        new Error('Query timeout')
      );

      const result = await createActivity({
        eventType: 'email.delivered',
        providerEventId: 'evt-err',
      });

      expect(result).toBeNull();
    });

    it('does not propagate errors to caller', async () => {
      mockPrismaClient.activity.create.mockRejectedValue(
        new Error('Constraint violation')
      );

      // This should not throw
      const result = await createActivity({
        eventType: 'lead.updated',
      });

      expect(result).toBeNull();
    });

    it('handles errorInfo parameter', async () => {
      const mockActivity = {
        id: 'act-err',
        eventType: 'lead.enrichment.failed',
        errorInfo: { code: 'TIMEOUT', provider: 'apify' },
      };

      mockPrismaClient.activity.create.mockResolvedValue(mockActivity);

      const result = await createActivity({
        eventType: 'lead.enrichment.failed',
        leadId: 'lead-1',
        errorInfo: { code: 'TIMEOUT', provider: 'apify' },
      });

      expect(result).not.toBeNull();
      expect(mockPrismaClient.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          errorInfo: { code: 'TIMEOUT', provider: 'apify' },
        }),
      });
    });
  });
});
