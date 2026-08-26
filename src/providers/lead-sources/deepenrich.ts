import type { LeadSourceProvider, LeadSearchQuery, LeadSearchResult, LeadData } from '@/types';
import logger from '@/lib/logger';

export class DeepEnrichProvider implements LeadSourceProvider {
  name = 'deepenrich';
  private apiKey: string;
  private baseUrl = 'https://api.deepenrich.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchLeads(query: LeadSearchQuery): Promise<LeadSearchResult> {
    try {
      const body: Record<string, unknown> = {
        limit: query.limit || 25,
        offset: query.offset || 0,
      };

      if (query.query) {
        body.query = query.query;
      }
      if (query.jobTitle) {
        body.job_title = query.jobTitle;
      }
      if (query.company) {
        body.company_name = query.company;
      }
      if (query.location) {
        body.location = query.location;
      }
      if (query.industry) {
        body.industry = query.industry;
      }

      const response = await fetch(`${this.baseUrl}/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('DeepEnrich API error', { status: response.status, error: errorText });
        throw new Error(`DeepEnrich API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const results = data.results || data.data || [];

      const leads: LeadData[] = results.map((item: Record<string, unknown>) =>
        this.normalizeDeepEnrichLead(item)
      );

      return {
        leads,
        total: data.total || data.total_count || leads.length,
        hasMore: data.has_more ?? leads.length >= (query.limit || 25),
      };
    } catch (error) {
      logger.error('DeepEnrich searchLeads failed', { error, query });
      throw error;
    }
  }

  async getLeadById(id: string): Promise<LeadData | null> {
    try {
      const response = await fetch(`${this.baseUrl}/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`DeepEnrich API error: ${response.status}`);
      }

      const data = await response.json();
      const result = data.result || data.data;
      if (!result) return null;

      return this.normalizeDeepEnrichLead(result);
    } catch (error) {
      logger.error('DeepEnrich getLeadById failed', { error, id });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query: 'test', limit: 1 }),
      });

      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'DeepEnrich authentication failed: invalid API key' };
      }

      if (response.ok || response.status === 422) {
        // 422 may occur for minimal test payload but means auth passed
        return { success: true, message: 'Connected to DeepEnrich successfully' };
      }

      const errorText = await response.text();
      return { success: false, message: `DeepEnrich connection failed: ${response.status} ${errorText}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `DeepEnrich connection failed: ${message}` };
    }
  }

  private normalizeDeepEnrichLead(item: Record<string, unknown>): LeadData {
    const person = (item.person as Record<string, unknown>) || item;
    const company = (item.company as Record<string, unknown>) || {};

    const firstName = (person.first_name || person.firstName) as string | undefined;
    const lastName = (person.last_name || person.lastName) as string | undefined;
    const fullName = (person.full_name || person.fullName) as string | undefined
      || ([firstName, lastName].filter(Boolean).join(' ') || undefined);

    return {
      firstName,
      lastName,
      fullName,
      jobTitle: (person.job_title || person.title || person.jobTitle) as string | undefined,
      email: (person.email || person.work_email) as string | undefined,
      phone: (person.phone || person.phone_number) as string | undefined,
      linkedinUrl: (person.linkedin_url || person.linkedin) as string | undefined,
      location: (person.location || person.city) as string | undefined,
      website: (person.website || company.website) as string | undefined,
      companyName: (company.name || company.company_name || person.company_name) as string | undefined,
      companyDomain: (company.domain || company.company_domain) as string | undefined,
      companyLinkedinUrl: (company.linkedin_url || company.linkedin) as string | undefined,
      industry: (company.industry || person.industry) as string | undefined,
      companySize: (company.size || company.employee_count || company.company_size) as string | undefined,
      revenue: (company.revenue || company.annual_revenue) as string | undefined,
      funding: (company.funding || company.total_funding) as string | undefined,
      source: 'deepenrich',
      sourceLeadId: (item.id || person.id) as string | undefined,
      rawSourceData: item,
    };
  }
}
