import { firestore } from './firebase';
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type CollectionReference,
} from 'firebase-admin/firestore';

// ─── Collection Names ───

export const COLLECTIONS = {
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
} as const;

// ─── Timestamp Helpers ───

function toJSDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
}

function convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      result[key] = value.toDate();
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ─── Document Helpers ───

export function docToObject<T = Record<string, unknown>>(
  doc: DocumentSnapshot
): (T & { id: string }) | null {
  if (!doc.exists) return null;
  const data = convertTimestamps(doc.data() as Record<string, unknown>);
  return { id: doc.id, ...data } as T & { id: string };
}

function prepareData(data: Record<string, unknown>): Record<string, unknown> {
  const prepared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value instanceof Date) {
      prepared[key] = Timestamp.fromDate(value);
    } else {
      prepared[key] = value;
    }
  }
  return prepared;
}

// ─── Query Builder ───

export interface WhereClause {
  [field: string]: unknown;
}

export interface QueryOptions {
  where?: WhereClause;
  orderBy?: string | { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

function applySimpleWhere(
  query: Query,
  where: WhereClause
): Query {
  let q = query;
  for (const [field, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if (value === null) {
      q = q.where(field, '==', null);
    } else {
      q = q.where(field, '==', value);
    }
  }
  return q;
}

// ─── Collection Helper Class ───

class CollectionHelper {
  private ref: CollectionReference;

  constructor(collectionName: string) {
    this.ref = firestore.collection(collectionName);
  }

  get collection() {
    return this.ref;
  }

  /** Get a single document by ID */
  async findById(id: string): Promise<(DocumentData & { id: string }) | null> {
    const doc = await this.ref.doc(id).get();
    return docToObject(doc);
  }

  /** Find the first document matching simple equality conditions */
  async findFirst(
    where: WhereClause,
    orderBy?: { field: string; direction: 'asc' | 'desc' }
  ): Promise<(DocumentData & { id: string }) | null> {
    let q: Query = this.ref;
    q = applySimpleWhere(q, where);
    if (orderBy) q = q.orderBy(orderBy.field, orderBy.direction);
    q = q.limit(1);
    const snap = await q.get();
    if (snap.empty) return null;
    return docToObject(snap.docs[0]);
  }

  /** Find a document by a unique field (like email, provider, name) */
  async findByField(
    field: string,
    value: unknown
  ): Promise<(DocumentData & { id: string }) | null> {
    const snap = await this.ref.where(field, '==', value).limit(1).get();
    if (snap.empty) return null;
    return docToObject(snap.docs[0]);
  }

  /** Find multiple documents with query options */
  async findMany(options: QueryOptions = {}): Promise<(DocumentData & { id: string })[]> {
    let q: Query = this.ref;
    if (options.where) {
      q = applySimpleWhere(q, options.where);
    }
    if (options.orderBy) {
      const ob = typeof options.orderBy === 'string'
        ? { field: options.orderBy, direction: 'desc' as const }
        : options.orderBy;
      q = q.orderBy(ob.field, ob.direction);
    }
    if (options.offset) q = q.offset(options.offset);
    if (options.limit) q = q.limit(options.limit);
    const snap = await q.get();
    return snap.docs.map((d) => docToObject(d)!);
  }

  /** Create a new document with auto-generated ID */
  async create(data: Record<string, unknown>): Promise<DocumentData & { id: string }> {
    const now = new Date();
    const docData = prepareData({
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    });
    const docRef = await this.ref.add(docData);
    const doc = await docRef.get();
    return docToObject(doc)!;
  }

  /** Create a document with a specific ID */
  async createWithId(
    id: string,
    data: Record<string, unknown>
  ): Promise<DocumentData & { id: string }> {
    const now = new Date();
    const docData = prepareData({
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    });
    await this.ref.doc(id).set(docData);
    const doc = await this.ref.doc(id).get();
    return docToObject(doc)!;
  }

  /** Update a document by ID */
  async update(
    id: string,
    data: Record<string, unknown>
  ): Promise<DocumentData & { id: string }> {
    const docData = prepareData({
      ...data,
      updatedAt: data.updatedAt || new Date(),
    });
    await this.ref.doc(id).update(docData);
    const doc = await this.ref.doc(id).get();
    return docToObject(doc)!;
  }

  /** Update many documents matching simple where conditions */
  async updateMany(
    where: WhereClause,
    data: Record<string, unknown>
  ): Promise<{ count: number }> {
    let q: Query = this.ref;
    q = applySimpleWhere(q, where);
    const snap = await q.get();
    const batch = firestore.batch();
    const updateData = prepareData({ ...data, updatedAt: new Date() });
    for (const doc of snap.docs) {
      batch.update(doc.ref, updateData);
    }
    await batch.commit();
    return { count: snap.size };
  }

  /** Delete a document by ID (hard delete) */
  async delete(id: string): Promise<void> {
    await this.ref.doc(id).delete();
  }

  /** Delete many documents matching simple where conditions */
  async deleteMany(where: WhereClause): Promise<{ count: number }> {
    let q: Query = this.ref;
    q = applySimpleWhere(q, where);
    const snap = await q.get();
    const batch = firestore.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    return { count: snap.size };
  }

  /** Count documents matching simple where conditions */
  async count(where: WhereClause = {}): Promise<number> {
    let q: Query = this.ref;
    q = applySimpleWhere(q, where);
    const snap = await q.count().get();
    return snap.data().count;
  }

  /** Upsert: find by field, update if exists, create if not */
  async upsert(
    uniqueField: string,
    uniqueValue: unknown,
    updateData: Record<string, unknown>,
    createData: Record<string, unknown>
  ): Promise<DocumentData & { id: string }> {
    const existing = await this.findByField(uniqueField, uniqueValue);
    if (existing) {
      return this.update(existing.id, updateData);
    }
    return this.create(createData);
  }

  /** Increment a numeric field atomically */
  async increment(
    id: string,
    field: string,
    amount: number = 1
  ): Promise<void> {
    await this.ref.doc(id).update({
      [field]: FieldValue.increment(amount),
      updatedAt: Timestamp.fromDate(new Date()),
    });
  }

  /** Run a Firestore query directly on the collection */
  query(): CollectionReference {
    return this.ref;
  }
}

// ─── Specialized Query Helpers ───

/**
 * Case-insensitive search: Firestore doesn't support case-insensitive queries natively.
 * We use a searchable lowercase version of the field for exact contains matching.
 * For simple use cases, filter in-memory after fetching.
 */
export async function searchLeads(
  options: {
    search?: string;
    status?: string;
    enrichmentStatus?: string;
    outreachStatus?: string;
    source?: string;
    companyName?: string;
    industry?: string;
    location?: string;
    tags?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }
): Promise<{ leads: (DocumentData & { id: string })[]; total: number }> {
  const {
    search, status, enrichmentStatus, outreachStatus, source,
    sortBy = 'createdAt', sortOrder = 'desc',
    page = 1, pageSize = 25,
  } = options;

  let q: Query = firestore.collection(COLLECTIONS.LEADS);

  // Apply equality filters (Firestore can handle these natively)
  q = q.where('deletedAt', '==', null);
  if (status) q = q.where('status', '==', status);
  if (enrichmentStatus) q = q.where('enrichmentStatus', '==', enrichmentStatus);
  if (outreachStatus) q = q.where('outreachStatus', '==', outreachStatus);
  if (source) q = q.where('source', '==', source);

  // Order
  q = q.orderBy(sortBy, sortOrder);

  // Get all matching docs (we'll filter in-memory for text search and paginate)
  const snap = await q.get();
  let results = snap.docs.map((d) => docToObject(d)!);

  // In-memory text search (case-insensitive)
  if (search) {
    const lower = search.toLowerCase();
    results = results.filter((r) => {
      const fullName = ((r.fullName as string) || '').toLowerCase();
      const email = ((r.email as string) || '').toLowerCase();
      const company = ((r.companyName as string) || '').toLowerCase();
      const title = ((r.jobTitle as string) || '').toLowerCase();
      return fullName.includes(lower) || email.includes(lower) ||
        company.includes(lower) || title.includes(lower);
    });
  }

  // In-memory contains filters
  if (options.companyName) {
    const lower = options.companyName.toLowerCase();
    results = results.filter(r => ((r.companyName as string) || '').toLowerCase().includes(lower));
  }
  if (options.industry) {
    const lower = options.industry.toLowerCase();
    results = results.filter(r => ((r.industry as string) || '').toLowerCase().includes(lower));
  }
  if (options.location) {
    const lower = options.location.toLowerCase();
    results = results.filter(r => ((r.location as string) || '').toLowerCase().includes(lower));
  }

  // Tag filtering: filter leads that have any of the specified tags
  if (options.tags && options.tags.length > 0) {
    results = results.filter(r => {
      const leadTags = (r.tags as string[]) || [];
      return options.tags!.some(t => leadTags.includes(t));
    });
  }

  const total = results.length;

  // Pagination
  const start = (page - 1) * pageSize;
  const paged = results.slice(start, start + pageSize);

  return { leads: paged, total };
}

/**
 * Get lead with all related data (replaces Prisma include)
 */
export async function getLeadWithRelations(
  leadId: string,
  includes?: {
    company?: boolean;
    leadTags?: boolean;
    enrichmentJobs?: boolean | { limit?: number };
    aiAnalyses?: boolean | { limit?: number; where?: WhereClause };
    emailMessages?: boolean | { limit?: number };
    campaignLeads?: boolean;
    activities?: boolean | { limit?: number };
    sourceRecords?: boolean;
  }
): Promise<(DocumentData & { id: string }) | null> {
  const lead = await db.leads.findById(leadId);
  if (!lead) return null;

  if (includes?.company && lead.companyId) {
    lead.company = await db.companies.findById(lead.companyId as string);
  }

  if (includes?.leadTags) {
    const tagDocs = await db.leadTags.findMany({
      where: { leadId },
    });
    // Fetch tag details
    const tags = await Promise.all(
      tagDocs.map(async (lt) => {
        const tag = await db.tags.findById(lt.tagId as string);
        return { ...lt, tag };
      })
    );
    lead.leadTags = tags;
  }

  if (includes?.enrichmentJobs) {
    const opts: QueryOptions = {
      where: { leadId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    };
    if (typeof includes.enrichmentJobs === 'object' && includes.enrichmentJobs.limit) {
      opts.limit = includes.enrichmentJobs.limit;
    }
    lead.enrichmentJobs = await db.enrichmentJobs.findMany(opts);
  }

  if (includes?.aiAnalyses) {
    const opts: QueryOptions = {
      where: { leadId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    };
    if (typeof includes.aiAnalyses === 'object') {
      if (includes.aiAnalyses.limit) opts.limit = includes.aiAnalyses.limit;
      if (includes.aiAnalyses.where) {
        opts.where = { ...opts.where, ...includes.aiAnalyses.where };
      }
    }
    lead.aiAnalyses = await db.aiAnalyses.findMany(opts);
  }

  if (includes?.emailMessages) {
    const opts: QueryOptions = {
      where: { leadId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    };
    if (typeof includes.emailMessages === 'object' && includes.emailMessages.limit) {
      opts.limit = includes.emailMessages.limit;
    }
    lead.emailMessages = await db.emailMessages.findMany(opts);
  }

  if (includes?.campaignLeads) {
    const cls = await db.campaignLeads.findMany({ where: { leadId } });
    // Fetch campaign info
    lead.campaignLeads = await Promise.all(
      cls.map(async (cl) => {
        const campaign = await db.campaigns.findById(cl.campaignId as string);
        return {
          ...cl,
          campaign: campaign
            ? { id: campaign.id, name: campaign.name, status: campaign.status }
            : null,
        };
      })
    );
  }

  if (includes?.activities) {
    const opts: QueryOptions = {
      where: { leadId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    };
    if (typeof includes.activities === 'object' && includes.activities.limit) {
      opts.limit = includes.activities.limit;
    }
    lead.activities = await db.activities.findMany(opts);
  }

  if (includes?.sourceRecords) {
    lead.sourceRecords = await db.leadSourceRecords.findMany({
      where: { leadId },
      orderBy: { field: 'importedAt', direction: 'desc' },
    });
  }

  return lead;
}

/**
 * Get campaign with related data
 */
export async function getCampaignWithRelations(
  campaignId: string,
  includes?: {
    campaignLeads?: boolean | { includeLeads?: boolean; where?: WhereClause };
    emailMessages?: boolean | { includeLeads?: boolean };
    createdBy?: boolean;
    counts?: boolean;
  }
): Promise<(DocumentData & { id: string }) | null> {
  const campaign = await db.campaigns.findById(campaignId);
  if (!campaign) return null;

  if (includes?.campaignLeads) {
    const clOpts: QueryOptions = { where: { campaignId } };
    if (typeof includes.campaignLeads === 'object' && includes.campaignLeads.where) {
      clOpts.where = { ...clOpts.where, ...includes.campaignLeads.where };
    }
    const cls = await db.campaignLeads.findMany(clOpts);

    if (typeof includes.campaignLeads === 'object' && includes.campaignLeads.includeLeads) {
      campaign.campaignLeads = await Promise.all(
        cls.map(async (cl) => {
          const lead = await db.leads.findById(cl.leadId as string);
          return { ...cl, lead };
        })
      );
    } else {
      campaign.campaignLeads = cls;
    }
  }

  if (includes?.emailMessages) {
    const emails = await db.emailMessages.findMany({
      where: { campaignId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    if (typeof includes.emailMessages === 'object' && includes.emailMessages.includeLeads) {
      campaign.emailMessages = await Promise.all(
        emails.map(async (em) => {
          const lead = await db.leads.findById(em.leadId as string);
          return { ...em, lead };
        })
      );
    } else {
      campaign.emailMessages = emails;
    }
  }

  if (includes?.createdBy && campaign.createdById) {
    const user = await db.users.findById(campaign.createdById as string);
    campaign.createdBy = user
      ? { id: user.id, name: user.name, email: user.email }
      : null;
  }

  if (includes?.counts) {
    const [leadCount, emailCount] = await Promise.all([
      db.campaignLeads.count({ campaignId }),
      db.emailMessages.count({ campaignId }),
    ]);
    campaign._count = { campaignLeads: leadCount, emailMessages: emailCount };
  }

  return campaign;
}

/**
 * Get email message with related data
 */
export async function getEmailWithRelations(
  emailId: string,
  includes?: {
    lead?: boolean | { select?: string[] };
    campaign?: boolean | { select?: string[] };
    emailEvents?: boolean;
  }
): Promise<(DocumentData & { id: string }) | null> {
  const email = await db.emailMessages.findById(emailId);
  if (!email) return null;

  if (includes?.lead && email.leadId) {
    const lead = await db.leads.findById(email.leadId as string);
    if (typeof includes.lead === 'object' && includes.lead.select) {
      const selected: Record<string, unknown> = { id: lead?.id };
      for (const field of includes.lead.select) {
        if (lead) selected[field] = (lead as Record<string, unknown>)[field];
      }
      email.lead = selected;
    } else {
      email.lead = lead;
    }
  }

  if (includes?.campaign && email.campaignId) {
    const campaign = await db.campaigns.findById(email.campaignId as string);
    if (typeof includes.campaign === 'object' && includes.campaign.select) {
      const selected: Record<string, unknown> = { id: campaign?.id };
      for (const field of includes.campaign.select) {
        if (campaign) selected[field] = (campaign as Record<string, unknown>)[field];
      }
      email.campaign = selected;
    } else {
      email.campaign = campaign;
    }
  }

  if (includes?.emailEvents) {
    email.emailEvents = await db.emailEvents.findMany({
      where: { emailMessageId: emailId },
      orderBy: { field: 'occurredAt', direction: 'desc' },
    });
  }

  return email;
}

/**
 * Get activities with optional lead inclusion
 */
export async function getActivitiesWithLeads(
  options: QueryOptions & { includeLead?: boolean }
): Promise<{ activities: (DocumentData & { id: string })[]; total: number }> {
  const activities = await db.activities.findMany(options);

  if (options.includeLead) {
    const enriched = await Promise.all(
      activities.map(async (a) => {
        if (a.leadId) {
          const lead = await db.leads.findById(a.leadId as string);
          return {
            ...a,
            lead: lead
              ? { id: lead.id, fullName: lead.fullName, email: lead.email, companyName: lead.companyName }
              : null,
          };
        }
        return { ...a, lead: null };
      })
    );
    const total = await db.activities.count(options.where || {});
    return { activities: enriched, total };
  }

  const total = await db.activities.count(options.where || {});
  return { activities, total };
}

/**
 * Dashboard aggregation helpers
 */
export async function getDashboardStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // These queries run in parallel
  const [
    totalLeads,
    totalEmailMessages,
    activeCampaigns,
    failedJobs,
  ] = await Promise.all([
    db.leads.count({ deletedAt: null }),
    db.emailMessages.count({}),
    db.campaigns.count({ status: 'running' }),
    db.backgroundJobs.count({ status: 'failed' }),
  ]);

  // Get all non-deleted leads for in-memory aggregation
  const leadsSnap = await firestore.collection(COLLECTIONS.LEADS)
    .where('deletedAt', '==', null)
    .select('source', 'status', 'enrichmentStatus', 'outreachStatus', 'createdAt')
    .get();

  let newLeads = 0;
  let enrichedLeads = 0;
  let leadsNeedingReview = 0;
  const sourceCount: Record<string, number> = {};
  const statusCount: Record<string, number> = {};

  for (const doc of leadsSnap.docs) {
    const d = doc.data();
    const createdAt = toJSDate(d.createdAt);
    if (createdAt && createdAt >= thirtyDaysAgo) newLeads++;
    if (d.enrichmentStatus === 'completed') enrichedLeads++;
    if (d.enrichmentStatus === 'completed' && d.outreachStatus === 'none') leadsNeedingReview++;

    const src = (d.source as string) || 'unknown';
    sourceCount[src] = (sourceCount[src] || 0) + 1;
    const st = d.status as string;
    statusCount[st] = (statusCount[st] || 0) + 1;
  }

  // Get email stats
  const emailSnap = await firestore.collection(COLLECTIONS.EMAIL_MESSAGES)
    .select('status', 'deliveredAt', 'openedAt', 'clickedAt', 'repliedAt', 'bouncedAt', 'unsubscribedAt')
    .get();

  let emailsSent = 0;
  let emailsDelivered = 0;
  let emailsOpened = 0;
  let emailsClicked = 0;
  let emailsReplied = 0;
  let emailsBounced = 0;
  let emailsUnsubscribed = 0;

  for (const doc of emailSnap.docs) {
    const d = doc.data();
    if (d.status === 'sent') emailsSent++;
    if (d.deliveredAt) emailsDelivered++;
    if (d.openedAt) emailsOpened++;
    if (d.clickedAt) emailsClicked++;
    if (d.repliedAt) emailsReplied++;
    if (d.bouncedAt) emailsBounced++;
    if (d.unsubscribedAt) emailsUnsubscribed++;
  }

  // Get recent activities
  const recentActivitiesRaw = await db.activities.findMany({
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: 15,
  });
  const recentActivities = await Promise.all(
    recentActivitiesRaw.map(async (a) => {
      if (a.leadId) {
        const lead = await db.leads.findById(a.leadId as string);
        return {
          ...a,
          lead: lead ? { id: lead.id, fullName: lead.fullName, email: lead.email, companyName: lead.companyName } : null,
        };
      }
      return { ...a, lead: null };
    })
  );

  const safeDiv = (a: number, b: number) => b > 0 ? Math.round((a / b) * 1000) / 10 : 0;

  return {
    stats: {
      totalLeads,
      newLeads,
      enrichedLeads,
      leadsNeedingReview,
      emailsGenerated: totalEmailMessages,
      emailsSent,
      deliveryRate: safeDiv(emailsDelivered, emailsSent),
      openRate: safeDiv(emailsOpened, emailsDelivered),
      clickRate: safeDiv(emailsClicked, emailsDelivered),
      replyRate: safeDiv(emailsReplied, emailsDelivered),
      bounceRate: safeDiv(emailsBounced, emailsSent),
      unsubscribeRate: safeDiv(emailsUnsubscribed, emailsDelivered),
      activeCampaigns,
      failedJobs,
    },
    recentActivities,
    leadsBySource: Object.entries(sourceCount).map(([source, count]) => ({ source, count })),
    leadsByStatus: Object.entries(statusCount).map(([status, count]) => ({ status, count })),
  };
}

// ─── Exported DB Object ───

export const db = {
  users: new CollectionHelper(COLLECTIONS.USERS),
  leads: new CollectionHelper(COLLECTIONS.LEADS),
  companies: new CollectionHelper(COLLECTIONS.COMPANIES),
  leadSourceRecords: new CollectionHelper(COLLECTIONS.LEAD_SOURCE_RECORDS),
  tags: new CollectionHelper(COLLECTIONS.TAGS),
  leadTags: new CollectionHelper(COLLECTIONS.LEAD_TAGS),
  enrichmentJobs: new CollectionHelper(COLLECTIONS.ENRICHMENT_JOBS),
  aiAnalyses: new CollectionHelper(COLLECTIONS.AI_ANALYSES),
  campaigns: new CollectionHelper(COLLECTIONS.CAMPAIGNS),
  campaignLeads: new CollectionHelper(COLLECTIONS.CAMPAIGN_LEADS),
  emailMessages: new CollectionHelper(COLLECTIONS.EMAIL_MESSAGES),
  emailEvents: new CollectionHelper(COLLECTIONS.EMAIL_EVENTS),
  activities: new CollectionHelper(COLLECTIONS.ACTIVITIES),
  apiCredentials: new CollectionHelper(COLLECTIONS.API_CREDENTIALS),
  backgroundJobs: new CollectionHelper(COLLECTIONS.BACKGROUND_JOBS),
  webhookEvents: new CollectionHelper(COLLECTIONS.WEBHOOK_EVENTS),
  suppressionEntries: new CollectionHelper(COLLECTIONS.SUPPRESSION_ENTRIES),

  // Direct Firestore access for complex queries
  firestore,

  // Re-export FieldValue for atomic operations
  FieldValue,
};

export default db;
