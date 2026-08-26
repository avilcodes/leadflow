import { describe, it, expect } from 'vitest';
import type { LeadData } from '@/types';

// ─── Deduplication Logic (inline, matching what the app would use) ───

interface ExistingLead {
  id: string;
  email: string | null;
  linkedinUrl: string | null;
  fullName: string | null;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  phone: string | null;
  location: string | null;
  website: string | null;
  companyDomain: string | null;
  industry: string | null;
  companySize: string | null;
  revenue: string | null;
  funding: string | null;
  source: string | null;
}

function findDuplicates(
  incoming: LeadData,
  existingLeads: ExistingLead[]
): ExistingLead[] {
  const matches: ExistingLead[] = [];

  for (const existing of existingLeads) {
    // Match on email (exact, case-insensitive)
    if (
      incoming.email &&
      existing.email &&
      incoming.email.toLowerCase() === existing.email.toLowerCase()
    ) {
      matches.push(existing);
      continue;
    }

    // Match on LinkedIn URL (normalized)
    if (incoming.linkedinUrl && existing.linkedinUrl) {
      const normalizeLinkedIn = (url: string) =>
        url.toLowerCase().replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '');
      if (
        normalizeLinkedIn(incoming.linkedinUrl) ===
        normalizeLinkedIn(existing.linkedinUrl)
      ) {
        matches.push(existing);
        continue;
      }
    }

    // Match on fullName + companyName
    if (
      incoming.fullName &&
      existing.fullName &&
      incoming.companyName &&
      existing.companyName &&
      incoming.fullName.toLowerCase() === existing.fullName.toLowerCase() &&
      incoming.companyName.toLowerCase() === existing.companyName.toLowerCase()
    ) {
      matches.push(existing);
      continue;
    }
  }

  return matches;
}

function mergeLeadData(
  existing: ExistingLead,
  incoming: LeadData
): Partial<LeadData> {
  const merged: Partial<LeadData> = {};

  const fields: (keyof LeadData & keyof ExistingLead)[] = [
    'firstName',
    'lastName',
    'fullName',
    'jobTitle',
    'email',
    'phone',
    'linkedinUrl',
    'location',
    'website',
    'companyName',
    'companyDomain',
    'industry',
    'companySize',
    'revenue',
    'funding',
  ];

  for (const field of fields) {
    const incomingValue = incoming[field];
    const existingValue = existing[field];

    if (incomingValue !== undefined && incomingValue !== null && incomingValue !== '') {
      // Incoming has a value - use it
      (merged as Record<string, unknown>)[field] = incomingValue;
    } else if (existingValue !== undefined && existingValue !== null && existingValue !== '') {
      // Preserve existing value when incoming is null/undefined/empty
      (merged as Record<string, unknown>)[field] = existingValue;
    }
  }

  return merged;
}

interface DeduplicationResult {
  new: LeadData[];
  updated: Array<{ existingId: string; mergedData: Partial<LeadData> }>;
  skipped: LeadData[];
}

function deduplicateImport(
  incomingLeads: LeadData[],
  existingLeads: ExistingLead[]
): DeduplicationResult {
  const result: DeduplicationResult = {
    new: [],
    updated: [],
    skipped: [],
  };

  for (const incoming of incomingLeads) {
    const duplicates = findDuplicates(incoming, existingLeads);

    if (duplicates.length === 0) {
      result.new.push(incoming);
    } else if (duplicates.length === 1) {
      const mergedData = mergeLeadData(duplicates[0], incoming);
      result.updated.push({ existingId: duplicates[0].id, mergedData });
    } else {
      // Multiple matches - skip to avoid ambiguity
      result.skipped.push(incoming);
    }
  }

  return result;
}

// ─── Tests ───

describe('Lead Deduplication', () => {
  const makeExisting = (overrides: Partial<ExistingLead> = {}): ExistingLead => ({
    id: 'existing-1',
    email: null,
    linkedinUrl: null,
    fullName: null,
    companyName: null,
    firstName: null,
    lastName: null,
    jobTitle: null,
    phone: null,
    location: null,
    website: null,
    companyDomain: null,
    industry: null,
    companySize: null,
    revenue: null,
    funding: null,
    source: null,
    ...overrides,
  });

  describe('findDuplicates', () => {
    it('matches on email (case-insensitive)', () => {
      const existing = [
        makeExisting({ id: 'lead-1', email: 'John.Doe@Acme.com' }),
        makeExisting({ id: 'lead-2', email: 'jane@other.com' }),
      ];
      const incoming: LeadData = { email: 'john.doe@acme.com' };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe('lead-1');
    });

    it('does not match when email is missing on incoming', () => {
      const existing = [makeExisting({ id: 'lead-1', email: 'john@acme.com' })];
      const incoming: LeadData = { fullName: 'John Doe' };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(0);
    });

    it('does not match when email is missing on existing', () => {
      const existing = [makeExisting({ id: 'lead-1', fullName: 'John Doe' })];
      const incoming: LeadData = { email: 'john@acme.com' };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(0);
    });

    it('matches on LinkedIn URL (normalized)', () => {
      const existing = [
        makeExisting({
          id: 'lead-1',
          linkedinUrl: 'https://www.linkedin.com/in/johndoe/',
        }),
      ];
      const incoming: LeadData = {
        linkedinUrl: 'https://linkedin.com/in/johndoe',
      };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe('lead-1');
    });

    it('matches on LinkedIn URL with different protocols', () => {
      const existing = [
        makeExisting({
          id: 'lead-1',
          linkedinUrl: 'http://linkedin.com/in/janedoe',
        }),
      ];
      const incoming: LeadData = {
        linkedinUrl: 'https://www.linkedin.com/in/janedoe/',
      };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(1);
    });

    it('matches on fullName + companyName (case-insensitive)', () => {
      const existing = [
        makeExisting({
          id: 'lead-1',
          fullName: 'John Doe',
          companyName: 'Acme Corp',
        }),
      ];
      const incoming: LeadData = {
        fullName: 'john doe',
        companyName: 'acme corp',
      };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe('lead-1');
    });

    it('does not match on fullName alone without companyName', () => {
      const existing = [
        makeExisting({ id: 'lead-1', fullName: 'John Doe' }),
      ];
      const incoming: LeadData = { fullName: 'John Doe' };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(0);
    });

    it('does not match on companyName alone without fullName', () => {
      const existing = [
        makeExisting({ id: 'lead-1', companyName: 'Acme Corp' }),
      ];
      const incoming: LeadData = { companyName: 'Acme Corp' };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(0);
    });

    it('returns multiple matches if lead matches several existing leads', () => {
      const existing = [
        makeExisting({ id: 'lead-1', email: 'john@acme.com' }),
        makeExisting({ id: 'lead-2', email: 'john@acme.com' }),
      ];
      const incoming: LeadData = { email: 'john@acme.com' };

      const matches = findDuplicates(incoming, existing);
      expect(matches).toHaveLength(2);
    });

    it('returns empty array when no existing leads', () => {
      const matches = findDuplicates({ email: 'john@acme.com' }, []);
      expect(matches).toHaveLength(0);
    });
  });

  describe('mergeLeadData', () => {
    it('prefers non-null incoming values', () => {
      const existing = makeExisting({
        firstName: 'John',
        lastName: 'Doe',
        jobTitle: 'Manager',
      });
      const incoming: LeadData = {
        firstName: 'Jonathan',
        lastName: 'Doe',
        jobTitle: 'Senior Manager',
      };

      const merged = mergeLeadData(existing, incoming);
      expect(merged.firstName).toBe('Jonathan');
      expect(merged.jobTitle).toBe('Senior Manager');
    });

    it('preserves existing values when incoming is null', () => {
      const existing = makeExisting({
        firstName: 'John',
        lastName: 'Doe',
        jobTitle: 'Manager',
        phone: '+1234567890',
        location: 'New York',
      });
      const incoming: LeadData = {
        firstName: 'John',
        // lastName, jobTitle, phone, location are undefined
      };

      const merged = mergeLeadData(existing, incoming);
      expect(merged.firstName).toBe('John');
      expect(merged.lastName).toBe('Doe');
      expect(merged.jobTitle).toBe('Manager');
      expect(merged.phone).toBe('+1234567890');
      expect(merged.location).toBe('New York');
    });

    it('preserves existing values when incoming is empty string', () => {
      const existing = makeExisting({
        email: 'john@acme.com',
        phone: '+1234567890',
      });
      const incoming: LeadData = {
        email: '',
        phone: '',
      };

      const merged = mergeLeadData(existing, incoming);
      expect(merged.email).toBe('john@acme.com');
      expect(merged.phone).toBe('+1234567890');
    });

    it('fills in gaps from incoming data', () => {
      const existing = makeExisting({
        firstName: 'John',
        email: 'john@acme.com',
        // phone and linkedinUrl are null
      });
      const incoming: LeadData = {
        phone: '+1234567890',
        linkedinUrl: 'https://linkedin.com/in/johndoe',
      };

      const merged = mergeLeadData(existing, incoming);
      expect(merged.firstName).toBe('John');
      expect(merged.email).toBe('john@acme.com');
      expect(merged.phone).toBe('+1234567890');
      expect(merged.linkedinUrl).toBe('https://linkedin.com/in/johndoe');
    });

    it('handles all fields being null on existing', () => {
      const existing = makeExisting({});
      const incoming: LeadData = {
        firstName: 'Jane',
        email: 'jane@example.com',
      };

      const merged = mergeLeadData(existing, incoming);
      expect(merged.firstName).toBe('Jane');
      expect(merged.email).toBe('jane@example.com');
    });
  });

  describe('deduplicateImport', () => {
    it('categorizes leads with no matches as new', () => {
      const existingLeads = [
        makeExisting({ id: 'lead-1', email: 'existing@acme.com' }),
      ];
      const incomingLeads: LeadData[] = [
        { email: 'new-lead@other.com', fullName: 'New Lead' },
      ];

      const result = deduplicateImport(incomingLeads, existingLeads);
      expect(result.new).toHaveLength(1);
      expect(result.updated).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it('categorizes single-match leads as updated', () => {
      const existingLeads = [
        makeExisting({ id: 'lead-1', email: 'john@acme.com', firstName: 'John' }),
      ];
      const incomingLeads: LeadData[] = [
        { email: 'john@acme.com', firstName: 'Jonathan', jobTitle: 'CEO' },
      ];

      const result = deduplicateImport(incomingLeads, existingLeads);
      expect(result.new).toHaveLength(0);
      expect(result.updated).toHaveLength(1);
      expect(result.updated[0].existingId).toBe('lead-1');
      expect(result.updated[0].mergedData.firstName).toBe('Jonathan');
      expect(result.updated[0].mergedData.jobTitle).toBe('CEO');
      expect(result.skipped).toHaveLength(0);
    });

    it('skips leads with multiple matches', () => {
      const existingLeads = [
        makeExisting({ id: 'lead-1', email: 'john@acme.com' }),
        makeExisting({ id: 'lead-2', email: 'john@acme.com' }),
      ];
      const incomingLeads: LeadData[] = [
        { email: 'john@acme.com', fullName: 'John Doe' },
      ];

      const result = deduplicateImport(incomingLeads, existingLeads);
      expect(result.new).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
    });

    it('handles mixed batch of new, updated, and skipped', () => {
      const existingLeads = [
        makeExisting({ id: 'lead-1', email: 'existing1@acme.com' }),
        makeExisting({ id: 'lead-2', email: 'duplicate@acme.com' }),
        makeExisting({ id: 'lead-3', email: 'duplicate@acme.com' }),
      ];
      const incomingLeads: LeadData[] = [
        { email: 'brand-new@other.com', fullName: 'Brand New' },
        { email: 'existing1@acme.com', jobTitle: 'Updated Title' },
        { email: 'duplicate@acme.com', fullName: 'Ambiguous' },
      ];

      const result = deduplicateImport(incomingLeads, existingLeads);
      expect(result.new).toHaveLength(1);
      expect(result.new[0].email).toBe('brand-new@other.com');
      expect(result.updated).toHaveLength(1);
      expect(result.updated[0].existingId).toBe('lead-1');
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].email).toBe('duplicate@acme.com');
    });

    it('handles empty incoming list', () => {
      const result = deduplicateImport([], [makeExisting({ id: 'lead-1' })]);
      expect(result.new).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it('handles empty existing list', () => {
      const incoming: LeadData[] = [
        { email: 'a@example.com' },
        { email: 'b@example.com' },
      ];
      const result = deduplicateImport(incoming, []);
      expect(result.new).toHaveLength(2);
      expect(result.updated).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });
  });
});
