import type { LeadSourceProvider, LeadSearchQuery, LeadSearchResult, LeadData } from '@/types';
import logger from '@/lib/logger';

export class ApolloProvider implements LeadSourceProvider {
  name = 'apollo';
  private apiKey: string;
  private baseUrl = 'https://api.apollo.io/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchLeads(query: LeadSearchQuery): Promise<LeadSearchResult> {
    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      page: query.offset ? Math.floor(query.offset / (query.limit || 25)) + 1 : 1,
      per_page: query.limit || 25,
    };

    if (query.query) {
      body.q_keywords = query.query;
    }
    if (query.jobTitle) {
      body.person_titles = [query.jobTitle];
    }
    if (query.company) {
      body.q_organization_name = query.company;
    }
    if (query.location) {
      body.person_locations = [query.location];
    }
    if (query.industry) {
      body.organization_industry_tag_ids = [query.industry];
    }

    try {
      const response = await fetch(`${this.baseUrl}/mixed_people/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Apollo API error', { status: response.status, error: errorText });
        throw new Error(`Apollo API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const people = data.people || [];

      const leads: LeadData[] = people.map((person: Record<string, unknown>) =>
        this.normalizeApolloLead(person)
      );

      return {
        leads,
        total: data.pagination?.total_entries || leads.length,
        hasMore: data.pagination?.page < data.pagination?.total_pages,
      };
    } catch (error) {
      logger.error('Apollo searchLeads failed', { error, query });
      throw error;
    }
  }

  async getLeadById(id: string): Promise<LeadData | null> {
    try {
      const response = await fetch(`${this.baseUrl}/people/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          id,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Apollo API error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.person) return null;

      return this.normalizeApolloLead(data.person);
    } catch (error) {
      logger.error('Apollo getLeadById failed', { error, id });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/mixed_people/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          per_page: 1,
          page: 1,
        }),
      });

      if (response.ok) {
        return { success: true, message: 'Connected to Apollo.io successfully' };
      }

      const errorText = await response.text();
      return { success: false, message: `Apollo.io connection failed: ${response.status} ${errorText}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Apollo.io connection failed: ${message}` };
    }
  }

  private normalizeApolloLead(person: Record<string, unknown>): LeadData {
    const org = (person.organization as Record<string, unknown>) || {};
    return {
      firstName: person.first_name as string | undefined,
      lastName: person.last_name as string | undefined,
      fullName: person.name as string | undefined,
      jobTitle: person.title as string | undefined,
      email: person.email as string | undefined,
      phone: (person.phone_numbers as Array<Record<string, unknown>>)?.[0]?.sanitized_number as string | undefined,
      linkedinUrl: person.linkedin_url as string | undefined,
      location: [person.city, person.state, person.country].filter(Boolean).join(', ') || undefined,
      website: org.website_url as string | undefined,
      companyName: org.name as string | undefined,
      companyDomain: org.primary_domain as string | undefined,
      companyLinkedinUrl: org.linkedin_url as string | undefined,
      industry: org.industry as string | undefined,
      companySize: this.normalizeCompanySize(org.estimated_num_employees as number | undefined),
      revenue: org.annual_revenue_printed as string | undefined,
      funding: org.total_funding_printed as string | undefined,
      source: 'apollo',
      sourceLeadId: person.id as string | undefined,
      rawSourceData: person,
    };
  }

  private normalizeCompanySize(employees?: number): string | undefined {
    if (!employees) return undefined;
    if (employees <= 10) return '1-10';
    if (employees <= 50) return '11-50';
    if (employees <= 200) return '51-200';
    if (employees <= 500) return '201-500';
    if (employees <= 1000) return '501-1000';
    if (employees <= 5000) return '1001-5000';
    if (employees <= 10000) return '5001-10000';
    return '10001+';
  }
}
