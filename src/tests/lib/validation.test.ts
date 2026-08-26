import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  createLeadSchema,
  createCampaignSchema,
  leadFiltersSchema,
  registerSchema,
  updateLeadSchema,
  csvImportSchema,
  updateCredentialSchema,
} from '@/lib/validation';

describe('loginSchema', () => {
  it('accepts valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
      expect(result.data.password).toBe('password123');
    }
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid email');
    }
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 6 characters', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '12345',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Password must be at least 6 characters'
      );
    }
  });

  it('accepts password exactly 6 characters', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '123456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts valid registration', () => {
    const result = registerSchema.safeParse({
      email: 'newuser@example.com',
      password: 'securepassword',
      name: 'New User',
    });
    expect(result.success).toBe(true);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: '1234567',
      name: 'User',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'securepassword',
      name: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('createLeadSchema', () => {
  it('accepts valid lead with email', () => {
    const result = createLeadSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      companyName: 'Acme Corp',
    });
    expect(result.success).toBe(true);
  });

  it('validates email format when provided', () => {
    const result = createLeadSchema.safeParse({
      firstName: 'John',
      email: 'not-valid-email',
    });
    expect(result.success).toBe(false);
  });

  it('allows empty string for email (optional)', () => {
    const result = createLeadSchema.safeParse({
      firstName: 'John',
      email: '',
    });
    expect(result.success).toBe(true);
  });

  it('allows lead with no email', () => {
    const result = createLeadSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
    });
    expect(result.success).toBe(true);
  });

  it('validates URL format for linkedinUrl', () => {
    const result = createLeadSchema.safeParse({
      firstName: 'John',
      linkedinUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid LinkedIn URL', () => {
    const result = createLeadSchema.safeParse({
      linkedinUrl: 'https://linkedin.com/in/johndoe',
    });
    expect(result.success).toBe(true);
  });

  it('validates website URL format', () => {
    const result = createLeadSchema.safeParse({
      website: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = createLeadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts custom fields as record', () => {
    const result = createLeadSchema.safeParse({
      customFields: { score: 85, tier: 'enterprise' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts tags as string array', () => {
    const result = createLeadSchema.safeParse({
      tags: ['Hot Lead', 'Enterprise'],
    });
    expect(result.success).toBe(true);
  });
});

describe('updateLeadSchema', () => {
  it('accepts status update', () => {
    const result = updateLeadSchema.safeParse({
      status: 'qualified',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateLeadSchema.safeParse({
      status: 'invalid-status',
    });
    expect(result.success).toBe(false);
  });

  it('accepts doNotContact boolean', () => {
    const result = updateLeadSchema.safeParse({
      doNotContact: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('createCampaignSchema', () => {
  it('accepts valid campaign with required name', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Q4 Outreach',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty campaign name', () => {
    const result = createCampaignSchema.safeParse({
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('applies default tone as professional', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Test Campaign',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tone).toBe('professional');
    }
  });

  it('applies default emailLength as medium', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Test Campaign',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emailLength).toBe('medium');
    }
  });

  it('applies default channel as email', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Test Campaign',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe('email');
    }
  });

  it('applies default sequenceSteps as 1', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Test Campaign',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sequenceSteps).toBe(1);
    }
  });

  it('applies default timezone as UTC', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Test Campaign',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('UTC');
    }
  });

  it('applies default autoApprove as false', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Test Campaign',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoApprove).toBe(false);
    }
  });

  it('rejects invalid emailLength', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Test',
      emailLength: 'extra-long',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid channel', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Test',
      channel: 'telegram',
    });
    expect(result.success).toBe(false);
  });

  it('validates sequenceSteps range (1-10)', () => {
    const tooLow = createCampaignSchema.safeParse({
      name: 'Test',
      sequenceSteps: 0,
    });
    expect(tooLow.success).toBe(false);

    const tooHigh = createCampaignSchema.safeParse({
      name: 'Test',
      sequenceSteps: 11,
    });
    expect(tooHigh.success).toBe(false);

    const valid = createCampaignSchema.safeParse({
      name: 'Test',
      sequenceSteps: 5,
    });
    expect(valid.success).toBe(true);
  });
});

describe('leadFiltersSchema', () => {
  it('applies default page as 1', () => {
    const result = leadFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
    }
  });

  it('applies default pageSize as 25', () => {
    const result = leadFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(25);
    }
  });

  it('applies default sortBy as createdAt', () => {
    const result = leadFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortBy).toBe('createdAt');
    }
  });

  it('applies default sortOrder as desc', () => {
    const result = leadFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('coerces string page to number', () => {
    const result = leadFiltersSchema.safeParse({ page: '3' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(typeof result.data.page).toBe('number');
    }
  });

  it('coerces string pageSize to number', () => {
    const result = leadFiltersSchema.safeParse({ pageSize: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(50);
    }
  });

  it('rejects page less than 1', () => {
    const result = leadFiltersSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects pageSize greater than 100', () => {
    const result = leadFiltersSchema.safeParse({ pageSize: 101 });
    expect(result.success).toBe(false);
  });

  it('accepts all filter fields', () => {
    const result = leadFiltersSchema.safeParse({
      search: 'John',
      status: 'qualified',
      enrichmentStatus: 'completed',
      outreachStatus: 'sent',
      source: 'apollo',
      companyName: 'Acme',
      industry: 'Technology',
      location: 'San Francisco',
      tags: ['Hot Lead'],
      page: 2,
      pageSize: 10,
      sortBy: 'fullName',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid sortOrder', () => {
    const result = leadFiltersSchema.safeParse({ sortOrder: 'random' });
    expect(result.success).toBe(false);
  });
});

describe('csvImportSchema', () => {
  it('accepts valid mappings', () => {
    const result = csvImportSchema.safeParse({
      mappings: { 'First Name': 'firstName', Email: 'email' },
    });
    expect(result.success).toBe(true);
  });

  it('applies default source as csv', () => {
    const result = csvImportSchema.safeParse({
      mappings: { Email: 'email' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('csv');
    }
  });
});

describe('updateCredentialSchema', () => {
  it('accepts valid provider credential', () => {
    const result = updateCredentialSchema.safeParse({
      provider: 'apollo',
      apiKey: 'ak_test_1234567890',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid provider', () => {
    const result = updateCredentialSchema.safeParse({
      provider: 'unknown-provider',
      apiKey: 'key123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty API key', () => {
    const result = updateCredentialSchema.safeParse({
      provider: 'brevo',
      apiKey: '',
    });
    expect(result.success).toBe(false);
  });
});
