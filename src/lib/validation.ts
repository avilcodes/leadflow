import { z } from 'zod';

// ─── Auth ───

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
});

// ─── Leads ───

export const createLeadSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  jobTitle: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  location: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  companyName: z.string().optional(),
  companyDomain: z.string().optional(),
  companyLinkedinUrl: z.string().url().optional().or(z.literal('')),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  revenue: z.string().optional(),
  funding: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']).optional(),
  doNotContact: z.boolean().optional(),
});

export const leadFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  enrichmentStatus: z.string().optional(),
  outreachStatus: z.string().optional(),
  source: z.string().optional(),
  companyName: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ─── Campaigns ───

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  senderName: z.string().optional(),
  senderEmail: z.string().email().optional().or(z.literal('')),
  replyToEmail: z.string().email().optional().or(z.literal('')),
  objective: z.string().optional(),
  targetAudience: z.string().optional(),
  productDescription: z.string().optional(),
  valueProposition: z.string().optional(),
  tone: z.string().default('professional'),
  emailLength: z.enum(['short', 'medium', 'long']).default('medium'),
  cta: z.string().optional(),
  customInstructions: z.string().optional(),
  aiModel: z.string().optional(),
  channel: z.enum(['email', 'linkedin', 'whatsapp', 'sms']).default('email'),
  sequenceSteps: z.number().int().min(1).max(10).default(1),
  delayBetweenEmails: z.number().int().min(1).optional(),
  sendingWindow: z.string().optional(),
  timezone: z.string().default('UTC'),
  maxPerHour: z.number().int().min(1).optional(),
  maxPerDay: z.number().int().min(1).optional(),
  autoApprove: z.boolean().default(false),
});

export const updateCampaignSchema = createCampaignSchema.partial();

// ─── Email ───

export const updateEmailSchema = z.object({
  subject: z.string().optional(),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
  status: z.enum(['draft', 'approved', 'rejected']).optional(),
  rejectionReason: z.string().optional(),
});

// ─── Settings ───

export const updateCredentialSchema = z.object({
  provider: z.enum(['apollo', 'prospeo', 'deepenrich', 'apify', 'openrouter', 'brevo']),
  apiKey: z.string().min(1, 'API key is required'),
  config: z.record(z.unknown()).optional(),
});

// ─── CSV ───

export const csvImportSchema = z.object({
  mappings: z.record(z.string()),
  tags: z.array(z.string()).optional(),
  source: z.string().default('csv'),
});
