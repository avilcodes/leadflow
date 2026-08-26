import { vi, beforeEach } from 'vitest';

// ─── Mock Environment Variables ───

process.env.FIREBASE_PROJECT_ID = 'leadflow-test';
process.env.AUTH_SECRET = 'test-secret-key-for-testing-only-32ch';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

// ─── Mock Firebase ───

vi.mock('@/lib/firebase', () => ({
  firestore: {
    collection: vi.fn(() => ({
      doc: vi.fn(),
      add: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
      get: vi.fn(),
      count: vi.fn(),
    })),
    batch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(),
    })),
    settings: vi.fn(),
  },
}));

// ─── Mock DB Module ───

function createMockHelper() {
  return {
    findById: vi.fn(),
    findFirst: vi.fn(),
    findByField: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createWithId: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    increment: vi.fn(),
    query: vi.fn(),
    collection: {},
  };
}

const mockDb = {
  users: createMockHelper(),
  leads: createMockHelper(),
  companies: createMockHelper(),
  leadSourceRecords: createMockHelper(),
  tags: createMockHelper(),
  leadTags: createMockHelper(),
  enrichmentJobs: createMockHelper(),
  aiAnalyses: createMockHelper(),
  campaigns: createMockHelper(),
  campaignLeads: createMockHelper(),
  emailMessages: createMockHelper(),
  emailEvents: createMockHelper(),
  activities: createMockHelper(),
  apiCredentials: createMockHelper(),
  backgroundJobs: createMockHelper(),
  webhookEvents: createMockHelper(),
  suppressionEntries: createMockHelper(),
  firestore: {
    collection: vi.fn(),
    batch: vi.fn(),
  },
  FieldValue: {
    increment: vi.fn((n: number) => ({ _increment: n })),
    serverTimestamp: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  default: mockDb,
  db: mockDb,
  searchLeads: vi.fn(),
  getLeadWithRelations: vi.fn(),
  getCampaignWithRelations: vi.fn(),
  getEmailWithRelations: vi.fn(),
  getActivitiesWithLeads: vi.fn(),
  getDashboardStats: vi.fn(),
  docToObject: vi.fn(),
  COLLECTIONS: {
    USERS: 'users',
    LEADS: 'leads',
    COMPANIES: 'companies',
    LEAD_SOURCE_RECORDS: 'leadSourceRecords',
    TAGS: 'tags',
    LEAD_TAGS: 'leadTags',
    ENRICHMENT_JOBS: 'enrichmentJobs',
    AI_ANALYSES: 'aiAnalyses',
    CAMPAIGNS: 'campaigns',
    CAMPAIGN_LEADS: 'campaignLeads',
    EMAIL_MESSAGES: 'emailMessages',
    EMAIL_EVENTS: 'emailEvents',
    ACTIVITIES: 'activities',
    API_CREDENTIALS: 'apiCredentials',
    BACKGROUND_JOBS: 'backgroundJobs',
    WEBHOOK_EVENTS: 'webhookEvents',
    SUPPRESSION_ENTRIES: 'suppressionEntries',
  },
}));

// ─── Mock Logger ───

vi.mock('@/lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Mock next/headers ───

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

// ─── Reset all mocks before each test ───

beforeEach(() => {
  vi.clearAllMocks();
});

export { mockDb };
