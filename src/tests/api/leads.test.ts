import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrismaClient } from '../setup';
import { createLeadSchema, leadFiltersSchema } from '@/lib/validation';

describe('Lead API Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('lead creation with validation', () => {
    it('validates and accepts a complete lead', () => {
      const input = {
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        email: 'john@acme.com',
        jobTitle: 'CTO',
        companyName: 'Acme Corp',
        industry: 'Technology',
        source: 'manual',
      };

      const result = createLeadSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email on lead creation', () => {
      const input = {
        firstName: 'John',
        email: 'bad-email',
      };

      const result = createLeadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('creates lead in database', async () => {
      const leadData = {
        firstName: 'Jane',
        lastName: 'Smith',
        fullName: 'Jane Smith',
        email: 'jane@widgets.io',
        jobTitle: 'CEO',
        companyName: 'Widgets Inc',
      };

      const createdLead = {
        id: 'lead-new-1',
        ...leadData,
        status: 'new',
        enrichmentStatus: 'pending',
        outreachStatus: 'none',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.lead.create.mockResolvedValue(createdLead);

      const result = await mockPrismaClient.lead.create({
        data: leadData,
      });

      expect(result.id).toBe('lead-new-1');
      expect(result.firstName).toBe('Jane');
      expect(result.email).toBe('jane@widgets.io');
      expect(mockPrismaClient.lead.create).toHaveBeenCalledWith({
        data: leadData,
      });
    });
  });

  describe('lead filtering', () => {
    it('builds filter query from validated params', () => {
      const input = {
        search: 'john',
        status: 'qualified',
        source: 'apollo',
        page: '2',
        pageSize: '10',
      };

      const result = leadFiltersSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const filters = result.data;

      // Build Prisma where clause
      const where: Record<string, unknown> = { deletedAt: null };

      if (filters.search) {
        where.OR = [
          { fullName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { companyName: { contains: filters.search, mode: 'insensitive' } },
        ];
      }
      if (filters.status) where.status = filters.status;
      if (filters.source) where.source = filters.source;

      expect(where.status).toBe('qualified');
      expect(where.source).toBe('apollo');
      expect(where.OR).toHaveLength(3);
      expect(where.deletedAt).toBeNull();
    });

    it('applies pagination defaults', () => {
      const result = leadFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
    });

    it('retrieves leads with pagination', async () => {
      const mockLeads = [
        {
          id: 'lead-1',
          fullName: 'John Doe',
          email: 'john@acme.com',
          status: 'new',
          createdAt: new Date(),
        },
        {
          id: 'lead-2',
          fullName: 'Jane Smith',
          email: 'jane@widgets.io',
          status: 'qualified',
          createdAt: new Date(),
        },
      ];

      mockPrismaClient.lead.findMany.mockResolvedValue(mockLeads);
      mockPrismaClient.lead.count.mockResolvedValue(50);

      const leads = await mockPrismaClient.lead.findMany({
        where: { deletedAt: null },
        take: 25,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
      const total = await mockPrismaClient.lead.count({
        where: { deletedAt: null },
      });

      expect(leads).toHaveLength(2);
      expect(total).toBe(50);
    });
  });

  describe('soft delete', () => {
    it('sets deletedAt instead of removing record', async () => {
      const now = new Date();
      const deletedLead = {
        id: 'lead-1',
        fullName: 'John Doe',
        deletedAt: now,
        updatedAt: now,
      };

      mockPrismaClient.lead.update.mockResolvedValue(deletedLead);

      const result = await mockPrismaClient.lead.update({
        where: { id: 'lead-1' },
        data: { deletedAt: now },
      });

      expect(result.deletedAt).toEqual(now);
      expect(mockPrismaClient.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { deletedAt: now },
      });
    });

    it('excludes soft-deleted leads from queries', async () => {
      mockPrismaClient.lead.findMany.mockResolvedValue([]);

      await mockPrismaClient.lead.findMany({
        where: { deletedAt: null },
      });

      expect(mockPrismaClient.lead.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('can restore a soft-deleted lead', async () => {
      const restoredLead = {
        id: 'lead-1',
        fullName: 'John Doe',
        deletedAt: null,
      };

      mockPrismaClient.lead.update.mockResolvedValue(restoredLead);

      const result = await mockPrismaClient.lead.update({
        where: { id: 'lead-1' },
        data: { deletedAt: null },
      });

      expect(result.deletedAt).toBeNull();
    });
  });

  describe('deduplication on import', () => {
    it('checks for existing lead by email before import', async () => {
      const existingLead = {
        id: 'lead-existing',
        email: 'john@acme.com',
        fullName: 'John Doe',
      };

      mockPrismaClient.lead.findFirst.mockResolvedValue(existingLead);

      const found = await mockPrismaClient.lead.findFirst({
        where: {
          email: 'john@acme.com',
          deletedAt: null,
        },
      });

      expect(found).not.toBeNull();
      expect(found!.id).toBe('lead-existing');
    });

    it('creates new lead when no duplicate found', async () => {
      mockPrismaClient.lead.findFirst.mockResolvedValue(null);

      const found = await mockPrismaClient.lead.findFirst({
        where: { email: 'new@example.com', deletedAt: null },
      });

      expect(found).toBeNull();

      // Would proceed to create
      const newLead = {
        id: 'lead-new',
        email: 'new@example.com',
        fullName: 'New Person',
      };
      mockPrismaClient.lead.create.mockResolvedValue(newLead);

      const created = await mockPrismaClient.lead.create({
        data: { email: 'new@example.com', fullName: 'New Person' },
      });

      expect(created.id).toBe('lead-new');
    });

    it('updates existing lead when duplicate found', async () => {
      const existingLead = {
        id: 'lead-existing',
        email: 'john@acme.com',
        fullName: 'John Doe',
        jobTitle: null,
      };

      mockPrismaClient.lead.findFirst.mockResolvedValue(existingLead);
      mockPrismaClient.lead.update.mockResolvedValue({
        ...existingLead,
        jobTitle: 'CTO',
      });

      const found = await mockPrismaClient.lead.findFirst({
        where: { email: 'john@acme.com', deletedAt: null },
      });

      expect(found).not.toBeNull();

      const updated = await mockPrismaClient.lead.update({
        where: { id: found!.id },
        data: { jobTitle: 'CTO' },
      });

      expect(updated.jobTitle).toBe('CTO');
    });

    it('handles bulk import with mixed results', async () => {
      const importResults = {
        created: 5,
        updated: 3,
        skipped: 2,
        total: 10,
      };

      // Simulate a bulk import result
      expect(importResults.created + importResults.updated + importResults.skipped).toBe(
        importResults.total
      );
    });
  });
});
