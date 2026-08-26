import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDb } from '../setup';
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

      mockDb.activities.findFirst.mockResolvedValue(null);
      mockDb.activities.create.mockResolvedValue(mockActivity);

      const result = await createActivity({
        eventType: 'lead.created',
        leadId: 'lead-1',
        userId: 'user-1',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('act-1');
      expect(result!.eventType).toBe('lead.created');
      expect(mockDb.activities.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'lead.created',
          leadId: 'lead-1',
          userId: 'user-1',
        }),
      );
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

      mockDb.activities.findFirst.mockResolvedValue(null);
      mockDb.activities.create.mockResolvedValue(mockActivity);

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

      mockDb.activities.create.mockResolvedValue(mockActivity);

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

      mockDb.activities.findFirst.mockResolvedValue(existingActivity);

      const result = await createActivity({
        eventType: 'email.delivered',
        providerEventId: 'brevo-evt-456',
        provider: 'brevo',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('act-existing');
      expect(mockDb.activities.create).not.toHaveBeenCalled();
    });

    it('checks for duplicate with correct query', async () => {
      mockDb.activities.findFirst.mockResolvedValue(null);
      mockDb.activities.create.mockResolvedValue({
        id: 'act-new',
        eventType: 'email.opened',
        providerEventId: 'brevo-evt-789',
      });

      await createActivity({
        eventType: 'email.opened',
        providerEventId: 'brevo-evt-789',
      });

      expect(mockDb.activities.findFirst).toHaveBeenCalledWith({
        providerEventId: 'brevo-evt-789',
        eventType: 'email.opened',
      });
    });

    it('does not check for duplicates when no providerEventId', async () => {
      mockDb.activities.create.mockResolvedValue({
        id: 'act-new',
        eventType: 'lead.created',
      });

      await createActivity({
        eventType: 'lead.created',
        leadId: 'lead-1',
      });

      expect(mockDb.activities.findFirst).not.toHaveBeenCalled();
    });

    it('allows same providerEventId with different eventTypes', async () => {
      mockDb.activities.findFirst.mockResolvedValueOnce(null);
      mockDb.activities.create.mockResolvedValueOnce({
        id: 'act-1',
        eventType: 'email.delivered',
        providerEventId: 'brevo-evt-100',
      });

      await createActivity({
        eventType: 'email.delivered',
        providerEventId: 'brevo-evt-100',
      });

      mockDb.activities.findFirst.mockResolvedValueOnce(null);
      mockDb.activities.create.mockResolvedValueOnce({
        id: 'act-2',
        eventType: 'email.opened',
        providerEventId: 'brevo-evt-100',
      });

      await createActivity({
        eventType: 'email.opened',
        providerEventId: 'brevo-evt-100',
      });

      expect(mockDb.activities.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('returns null and does not throw on database error', async () => {
      mockDb.activities.create.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await createActivity({
        eventType: 'lead.created',
        leadId: 'lead-1',
      });

      expect(result).toBeNull();
    });

    it('returns null on findFirst error during idempotency check', async () => {
      mockDb.activities.findFirst.mockRejectedValue(
        new Error('Query timeout')
      );

      const result = await createActivity({
        eventType: 'email.delivered',
        providerEventId: 'evt-err',
      });

      expect(result).toBeNull();
    });

    it('does not propagate errors to caller', async () => {
      mockDb.activities.create.mockRejectedValue(
        new Error('Constraint violation')
      );

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

      mockDb.activities.create.mockResolvedValue(mockActivity);

      const result = await createActivity({
        eventType: 'lead.enrichment.failed',
        leadId: 'lead-1',
        errorInfo: { code: 'TIMEOUT', provider: 'apify' },
      });

      expect(result).not.toBeNull();
      expect(mockDb.activities.create).toHaveBeenCalledWith(
        expect.objectContaining({
          errorInfo: { code: 'TIMEOUT', provider: 'apify' },
        }),
      );
    });
  });
});
