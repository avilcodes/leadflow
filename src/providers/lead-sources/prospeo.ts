import type { LeadSourceProvider, LeadSearchQuery, LeadSearchResult, LeadData } from '@/types';
import logger from '@/lib/logger';

export class ProspeoProvider implements LeadSourceProvider {
  name = 'prospeo';
  private apiKey: string;
  private baseUrl = 'https://api.prospeo.io';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchLeads(query: LeadSearchQuery): Promise<LeadSearchResult> {
    // Prospeo's primary use is email finding; for search we use domain search
    if (query.company) {
      return this.domainSearch(query);
    }

    // For individual lookups, use email finder with LinkedIn URL or name+company
    if (query.query) {
      return this.emailFinderSearch(query);
    }

    return { leads: [], total: 0, hasMore: false };
  }

  private async emailFinderSearch(query: LeadSearchQuery): Promise<LeadSearchResult> {
    try {
      const body: Record<string, unknown> = {};

      // If query looks like a LinkedIn URL, use linkedin_url finder
      if (query.query && query.query.includes('linkedin.com')) {
        body.url = query.query;
      } else {
        body.full_name = query.query;
        if (query.company) {
          body.company = query.company;
        }
      }

      const response = await fetch(`${this.baseUrl}/email-finder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KEY': this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Prospeo email-finder error', { status: response.status, error: errorText });
        throw new Error(`Prospeo API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      if (data.error) {
        logger.warn('Prospeo email-finder returned error', { error: data.error });
        return { leads: [], total: 0, hasMore: false };
      }

      const lead = this.normalizeProspeoResult(data.response);
      return {
        leads: lead ? [lead] : [],
        total: lead ? 1 : 0,
        hasMore: false,
      };
    } catch (error) {
      logger.error('Prospeo emailFinderSearch failed', { error, query });
      throw error;
    }
  }

  private async domainSearch(query: LeadSearchQuery): Promise<LeadSearchResult> {
    try {
      const body: Record<string, unknown> = {
        company: query.company,
        limit: query.limit || 25,
      };

      if (query.jobTitle) {
        body.title = query.jobTitle;
      }

      const response = await fetch(`${this.baseUrl}/domain-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KEY': this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Prospeo domain-search error', { status: response.status, error: errorText });
        throw new Error(`Prospeo API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      if (data.error) {
        logger.warn('Prospeo domain-search returned error', { error: data.error });
        return { leads: [], total: 0, hasMore: false };
      }

      const emailList = data.response?.email_list || [];
      const leads: LeadData[] = emailList
        .map((item: Record<string, unknown>) => this.normalizeProspeoResult(item))
        .filter((lead: LeadData | null): lead is LeadData => lead !== null);

      return {
        leads,
        total: data.response?.total || leads.length,
        hasMore: leads.length >= (query.limit || 25),
      };
    } catch (error) {
      logger.error('Prospeo domainSearch failed', { error, query });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/email-finder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KEY': this.apiKey,
        },
        body: JSON.stringify({ url: 'https://www.linkedin.com/in/test' }),
      });

      // A 401/403 means bad key; other errors are acceptable for a connectivity test
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Prospeo authentication failed: invalid API key' };
      }

      return { success: true, message: 'Connected to Prospeo successfully' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Prospeo connection failed: ${message}` };
    }
  }

  private normalizeProspeoResult(result: Record<string, unknown> | undefined): LeadData | null {
    if (!result) return null;

    const firstName = result.first_name as string | undefined;
    const lastName = result.last_name as string | undefined;
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined;

    return {
      firstName,
      lastName,
      fullName,
      jobTitle: result.title as string | undefined,
      email: result.email as string | undefined,
      phone: result.phone_number as string | undefined,
      linkedinUrl: result.linkedin as string | undefined,
      location: result.location as string | undefined,
      companyName: result.company_name as string | undefined,
      companyDomain: result.domain as string | undefined,
      industry: result.industry as string | undefined,
      source: 'prospeo',
      sourceLeadId: result.id as string | undefined,
      rawSourceData: result,
    };
  }
}
