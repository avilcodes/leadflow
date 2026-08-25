// ─── Provider Interfaces ───

export interface LeadData {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  location?: string;
  website?: string;
  companyName?: string;
  companyDomain?: string;
  companyLinkedinUrl?: string;
  industry?: string;
  companySize?: string;
  revenue?: string;
  funding?: string;
  source?: string;
  sourceLeadId?: string;
  rawSourceData?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
}

export interface LeadSourceProvider {
  name: string;
  searchLeads(query: LeadSearchQuery): Promise<LeadSearchResult>;
  getLeadById?(id: string): Promise<LeadData | null>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}

export interface LeadSearchQuery {
  query?: string;
  jobTitle?: string;
  company?: string;
  location?: string;
  industry?: string;
  limit?: number;
  offset?: number;
}

export interface LeadSearchResult {
  leads: LeadData[];
  total: number;
  hasMore: boolean;
}

export interface EnrichmentProvider {
  name: string;
  enrich(input: EnrichmentInput): Promise<EnrichmentResult>;
  getJobStatus?(jobId: string): Promise<EnrichmentJobStatus>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}

export interface EnrichmentInput {
  leadId: string;
  type: 'linkedin_scrape' | 'website_scrape' | 'company_info' | 'custom';
  url?: string;
  additionalInput?: Record<string, unknown>;
}

export interface EnrichmentResult {
  jobId?: string;
  status: 'completed' | 'running' | 'failed';
  rawOutput?: Record<string, unknown>;
  normalizedOutput?: Record<string, unknown>;
  error?: string;
}

export interface EnrichmentJobStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
}

export interface AIProvider {
  name: string;
  analyze(input: AIAnalysisInput): Promise<AIAnalysisResult>;
  generateEmail(input: EmailGenerationInput): Promise<EmailGenerationResult>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}

export interface AIAnalysisInput {
  leadData: LeadData;
  enrichmentData?: Record<string, unknown>;
  linkedinData?: Record<string, unknown>;
  websiteData?: Record<string, unknown>;
  companyData?: Record<string, unknown>;
}

export interface AIAnalysisResult {
  personSummary: string;
  companySummary: string;
  currentContext: string;
  signals: string[];
  painPoints: string[];
  priorities: string[];
  personalizations: string[];
  outreachAngle: string;
  relevanceReasons: string[];
  confidenceScore: number;
  rawResponse: Record<string, unknown>;
  tokensUsed?: number;
  model: string;
}

export interface EmailGenerationInput {
  leadData: LeadData;
  analysis: AIAnalysisResult;
  campaignConfig: {
    objective?: string;
    targetAudience?: string;
    productDescription?: string;
    valueProposition?: string;
    tone?: string;
    emailLength?: string;
    cta?: string;
    customInstructions?: string;
    senderName?: string;
    senderCompany?: string;
  };
}

export interface EmailGenerationResult {
  subject: string;
  htmlBody: string;
  textBody: string;
  rawResponse: Record<string, unknown>;
  tokensUsed?: number;
  model: string;
}

export interface EmailProvider {
  name: string;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  createContact?(contact: EmailContact): Promise<{ id: string }>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}

export interface SendEmailInput {
  to: { email: string; name?: string };
  from: { email: string; name?: string };
  replyTo?: { email: string; name?: string };
  subject: string;
  htmlContent: string;
  textContent?: string;
  tags?: string[];
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  messageId: string;
  provider: string;
  status: 'sent' | 'queued' | 'failed';
  error?: string;
}

export interface EmailContact {
  email: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, unknown>;
}

// ─── API Types ───

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LeadFilters {
  search?: string;
  status?: string;
  enrichmentStatus?: string;
  outreachStatus?: string;
  source?: string;
  companyName?: string;
  industry?: string;
  location?: string;
  tags?: string[];
  createdAfter?: string;
  createdBefore?: string;
}

// ─── Event Types ───

export type ActivityEventType =
  | 'lead.created'
  | 'lead.imported'
  | 'lead.updated'
  | 'lead.deleted'
  | 'lead.enrichment.started'
  | 'lead.enrichment.completed'
  | 'lead.enrichment.failed'
  | 'lead.linkedin_scraped'
  | 'lead.website_scraped'
  | 'lead.ai_analysis.started'
  | 'lead.ai_analysis.completed'
  | 'lead.ai_analysis.failed'
  | 'email.generated'
  | 'email.edited'
  | 'email.approved'
  | 'email.rejected'
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.replied'
  | 'email.bounced'
  | 'email.unsubscribed'
  | 'campaign.created'
  | 'campaign.started'
  | 'campaign.paused'
  | 'campaign.resumed'
  | 'campaign.completed'
  | 'campaign.failed';

// ─── Dashboard Types ───

export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  enrichedLeads: number;
  leadsNeedingReview: number;
  emailsGenerated: number;
  emailsSent: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  activeCampaigns: number;
  failedJobs: number;
}

export interface RecentActivity {
  id: string;
  eventType: string;
  leadName?: string;
  campaignName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
