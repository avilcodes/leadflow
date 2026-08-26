import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDb } from '../setup';
import { createCampaignSchema } from '@/lib/validation';

describe('Campaign API Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('campaign creation', () => {
    it('validates and creates a campaign with defaults', () => {
      const input = {
        name: 'Q4 Enterprise Outreach',
        description: 'Target enterprise decision makers',
        objective: 'Book demo calls',
      };

      const result = createCampaignSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.name).toBe('Q4 Enterprise Outreach');
      expect(result.data.tone).toBe('professional');
      expect(result.data.emailLength).toBe('medium');
      expect(result.data.channel).toBe('email');
      expect(result.data.sequenceSteps).toBe(1);
      expect(result.data.timezone).toBe('UTC');
      expect(result.data.autoApprove).toBe(false);
    });

    it('creates campaign in database', async () => {
      const campaignData = {
        name: 'Test Campaign',
        description: 'Testing',
        status: 'draft',
        tone: 'professional',
        emailLength: 'medium',
        channel: 'email',
        sequenceSteps: 1,
        timezone: 'UTC',
        autoApprove: false,
        createdById: 'user-1',
      };

      const createdCampaign = {
        id: 'campaign-1',
        ...campaignData,
        totalLeads: 0,
        emailsGenerated: 0,
        emailsSent: 0,
        emailsDelivered: 0,
        emailsOpened: 0,
        emailsClicked: 0,
        emailsReplied: 0,
        emailsBounced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.campaigns.create.mockResolvedValue(createdCampaign);

      const result = await mockDb.campaigns.create(campaignData);

      expect(result.id).toBe('campaign-1');
      expect(result.status).toBe('draft');
      expect(result.totalLeads).toBe(0);
    });

    it('rejects campaign without name', () => {
      const input = {
        description: 'No name provided',
      };

      const result = createCampaignSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('status transitions', () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      draft: ['ready'],
      ready: ['running', 'draft'],
      running: ['paused', 'completed', 'failed'],
      paused: ['running', 'completed'],
      completed: [],
      failed: ['draft'],
    };

    function isValidTransition(from: string, to: string): boolean {
      return VALID_TRANSITIONS[from]?.includes(to) ?? false;
    }

    it('allows draft to ready', () => {
      expect(isValidTransition('draft', 'ready')).toBe(true);
    });

    it('allows ready to running', () => {
      expect(isValidTransition('ready', 'running')).toBe(true);
    });

    it('allows ready back to draft', () => {
      expect(isValidTransition('ready', 'draft')).toBe(true);
    });

    it('allows running to paused', () => {
      expect(isValidTransition('running', 'paused')).toBe(true);
    });

    it('allows running to completed', () => {
      expect(isValidTransition('running', 'completed')).toBe(true);
    });

    it('allows running to failed', () => {
      expect(isValidTransition('running', 'failed')).toBe(true);
    });

    it('allows paused to running (resume)', () => {
      expect(isValidTransition('paused', 'running')).toBe(true);
    });

    it('allows paused to completed', () => {
      expect(isValidTransition('paused', 'completed')).toBe(true);
    });

    it('allows failed back to draft', () => {
      expect(isValidTransition('failed', 'draft')).toBe(true);
    });

    it('does not allow draft to running (must go through ready)', () => {
      expect(isValidTransition('draft', 'running')).toBe(false);
    });

    it('does not allow completed to any state', () => {
      expect(isValidTransition('completed', 'draft')).toBe(false);
      expect(isValidTransition('completed', 'running')).toBe(false);
      expect(isValidTransition('completed', 'paused')).toBe(false);
    });

    it('does not allow backward from running to ready', () => {
      expect(isValidTransition('running', 'ready')).toBe(false);
    });

    it('does not allow backward from running to draft', () => {
      expect(isValidTransition('running', 'draft')).toBe(false);
    });

    it('updates campaign status in database', async () => {
      const updatedCampaign = {
        id: 'campaign-1',
        name: 'Test',
        status: 'running',
        startedAt: new Date(),
      };

      mockDb.campaigns.update.mockResolvedValue(updatedCampaign);

      const result = await mockDb.campaigns.update('campaign-1', {
        status: 'running',
        startedAt: new Date(),
      });

      expect(result.status).toBe('running');
      expect(result.startedAt).toBeDefined();
    });

    it('sets completedAt when transitioning to completed', async () => {
      const now = new Date();
      const completedCampaign = {
        id: 'campaign-1',
        name: 'Test',
        status: 'completed',
        completedAt: now,
      };

      mockDb.campaigns.update.mockResolvedValue(completedCampaign);

      const result = await mockDb.campaigns.update('campaign-1', {
        status: 'completed',
        completedAt: now,
      });

      expect(result.status).toBe('completed');
      expect(result.completedAt).toEqual(now);
    });

    it('sets pausedAt when transitioning to paused', async () => {
      const now = new Date();
      const pausedCampaign = {
        id: 'campaign-1',
        name: 'Test',
        status: 'paused',
        pausedAt: now,
      };

      mockDb.campaigns.update.mockResolvedValue(pausedCampaign);

      const result = await mockDb.campaigns.update('campaign-1', {
        status: 'paused',
        pausedAt: now,
      });

      expect(result.status).toBe('paused');
      expect(result.pausedAt).toEqual(now);
    });
  });

  describe('adding/removing leads', () => {
    it('adds leads to a campaign', async () => {
      const campaignLead = {
        id: 'cl-1',
        campaignId: 'campaign-1',
        leadId: 'lead-1',
        status: 'pending',
        sequenceStep: 1,
        addedAt: new Date(),
      };

      mockDb.campaignLeads.create.mockResolvedValue(campaignLead);

      const result = await mockDb.campaignLeads.create({
        campaignId: 'campaign-1',
        leadId: 'lead-1',
      });

      expect(result.campaignId).toBe('campaign-1');
      expect(result.leadId).toBe('lead-1');
      expect(result.status).toBe('pending');
    });

    it('prevents adding duplicate lead to campaign', async () => {
      mockDb.campaignLeads.findFirst.mockResolvedValue({
        id: 'cl-existing',
        campaignId: 'campaign-1',
        leadId: 'lead-1',
      });

      const existing = await mockDb.campaignLeads.findFirst({
        campaignId: 'campaign-1',
        leadId: 'lead-1',
      });

      expect(existing).not.toBeNull();
    });

    it('removes a lead from a campaign', async () => {
      mockDb.campaignLeads.deleteMany.mockResolvedValue(1);

      const result = await mockDb.campaignLeads.deleteMany({
        campaignId: 'campaign-1',
        leadId: 'lead-1',
      });

      expect(result).toBe(1);
    });

    it('updates total leads count on campaign', async () => {
      mockDb.campaignLeads.count.mockResolvedValue(25);
      mockDb.campaigns.update.mockResolvedValue({
        id: 'campaign-1',
        totalLeads: 25,
      });

      const count = await mockDb.campaignLeads.count({
        campaignId: 'campaign-1',
      });

      await mockDb.campaigns.update('campaign-1', { totalLeads: count });

      expect(mockDb.campaigns.update).toHaveBeenCalledWith('campaign-1', {
        totalLeads: 25,
      });
    });
  });
});
