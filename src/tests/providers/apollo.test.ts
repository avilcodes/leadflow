import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeadSearchQuery, LeadSearchResult, LeadData } from '@/types';

// ─── Apollo Provider Logic (matching provider pattern) ───

interface ApolloSearchResponse {
  people: Array<{
    id: string;
    first_name: string;
    last_name: string;
    name: string;
    title: string;
    email: string;
    phone_numbers?: Array<{ sanitized_number: string }>;
    linkedin_url: string;
    city: string;
    state: string;
    country: string;
    organization?: {
      name: string;
      website_url: string;
      linkedin_url: string;
      industry: string;
      estimated_num_employees: number;
      annual_revenue_printed: string;
    };
  }>;
  pagination: {
    total_entries: number;
    per_page: number;
    page: number;
    total_pages: number;
  };
}

class ApolloProvider {
  private apiKey: string;
  private baseUrl = 'https://api.apollo.io/v1';
  name = 'apollo';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchLeads(query: LeadSearchQuery): Promise<LeadSearchResult> {
    const response = await fetch(`${this.baseUrl}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify({
        q_person_title: query.jobTitle,
        q_organization_name: query.company,
        person_locations: query.location ? [query.location] : undefined,
        per_page: query.limit || 25,
        page: query.offset ? Math.floor(query.offset / (query.limit || 25)) + 1 : 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apollo API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as ApolloSearchResponse;

    const leads: LeadData[] = data.people.map((person) => ({
      firstName: person.first_name,
      lastName: person.last_name,
      fullName: person.name,
      jobTitle: person.title,
      email: person.email,
      phone: person.phone_numbers?.[0]?.sanitized_number,
      linkedinUrl: person.linkedin_url,
      location: [person.city, person.state, person.country]
        .filter(Boolean)
        .join(', '),
      companyName: person.organization?.name,
      website: person.organization?.website_url,
      companyLinkedinUrl: person.organization?.linkedin_url,
      industry: person.organization?.industry,
      companySize: person.organization?.estimated_num_employees?.toString(),
      revenue: person.organization?.annual_revenue_printed,
      source: 'apollo',
      sourceLeadId: person.id,
      rawSourceData: person as unknown as Record<string, unknown>,
    }));

    return {
      leads,
      total: data.pagination.total_entries,
      hasMore: data.pagination.page < data.pagination.total_pages,
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/mixed_people/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ per_page: 1, page: 1 }),
      });

      if (response.ok) {
        return { success: true, message: 'Connected to Apollo API' };
      }
      return {
        success: false,
        message: `Apollo API returned status ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${(error as Error).message}`,
      };
    }
  }
}

// ─── Tests ───

const mockFetch = vi.fn();

describe('ApolloProvider', () => {
  let provider: ApolloProvider;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    provider = new ApolloProvider('test-api-key');
  });

  describe('searchLeads', () => {
    const mockApolloResponse: ApolloSearchResponse = {
      people: [
        {
          id: 'apollo-123',
          first_name: 'Sarah',
          last_name: 'Johnson',
          name: 'Sarah Johnson',
          title: 'VP of Engineering',
          email: 'sarah@techcorp.com',
          phone_numbers: [{ sanitized_number: '+14155551234' }],
          linkedin_url: 'https://linkedin.com/in/sarahjohnson',
          city: 'San Francisco',
          state: 'California',
          country: 'United States',
          organization: {
            name: 'TechCorp',
            website_url: 'https://techcorp.com',
            linkedin_url: 'https://linkedin.com/company/techcorp',
            industry: 'Software',
            estimated_num_employees: 500,
            annual_revenue_printed: '$50M',
          },
        },
      ],
      pagination: {
        total_entries: 150,
        per_page: 25,
        page: 1,
        total_pages: 6,
      },
    };

    it('maps Apollo response fields to LeadData correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApolloResponse,
      });

      const result = await provider.searchLeads({ jobTitle: 'VP' });

      expect(result.leads).toHaveLength(1);
      const lead = result.leads[0];
      expect(lead.firstName).toBe('Sarah');
      expect(lead.lastName).toBe('Johnson');
      expect(lead.fullName).toBe('Sarah Johnson');
      expect(lead.jobTitle).toBe('VP of Engineering');
      expect(lead.email).toBe('sarah@techcorp.com');
      expect(lead.phone).toBe('+14155551234');
      expect(lead.linkedinUrl).toBe('https://linkedin.com/in/sarahjohnson');
      expect(lead.location).toBe('San Francisco, California, United States');
      expect(lead.companyName).toBe('TechCorp');
      expect(lead.website).toBe('https://techcorp.com');
      expect(lead.companyLinkedinUrl).toBe(
        'https://linkedin.com/company/techcorp'
      );
      expect(lead.industry).toBe('Software');
      expect(lead.companySize).toBe('500');
      expect(lead.revenue).toBe('$50M');
      expect(lead.source).toBe('apollo');
      expect(lead.sourceLeadId).toBe('apollo-123');
    });

    it('returns total count and hasMore flag', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApolloResponse,
      });

      const result = await provider.searchLeads({});
      expect(result.total).toBe(150);
      expect(result.hasMore).toBe(true);
    });

    it('sets hasMore to false on last page', async () => {
      const lastPageResponse = {
        ...mockApolloResponse,
        pagination: { total_entries: 10, per_page: 25, page: 1, total_pages: 1 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => lastPageResponse,
      });

      const result = await provider.searchLeads({});
      expect(result.hasMore).toBe(false);
    });

    it('sends correct request with API key header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApolloResponse,
      });

      await provider.searchLeads({ jobTitle: 'CEO', company: 'Acme' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.apollo.io/v1/mixed_people/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('passes query parameters in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApolloResponse,
      });

      await provider.searchLeads({
        jobTitle: 'CTO',
        company: 'Acme',
        location: 'New York',
        limit: 10,
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.q_person_title).toBe('CTO');
      expect(body.q_organization_name).toBe('Acme');
      expect(body.person_locations).toEqual(['New York']);
      expect(body.per_page).toBe(10);
    });

    it('handles person without organization', async () => {
      const noOrgResponse: ApolloSearchResponse = {
        people: [
          {
            id: 'apollo-456',
            first_name: 'Bob',
            last_name: 'Smith',
            name: 'Bob Smith',
            title: 'Freelancer',
            email: 'bob@gmail.com',
            linkedin_url: '',
            city: 'Austin',
            state: 'Texas',
            country: 'United States',
          },
        ],
        pagination: { total_entries: 1, per_page: 25, page: 1, total_pages: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => noOrgResponse,
      });

      const result = await provider.searchLeads({});
      expect(result.leads[0].companyName).toBeUndefined();
      expect(result.leads[0].industry).toBeUndefined();
    });

    it('throws on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(provider.searchLeads({})).rejects.toThrow(
        'Apollo API error: 401 - Unauthorized'
      );
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(provider.searchLeads({})).rejects.toThrow('Network failure');
    });
  });

  describe('testConnection', () => {
    it('returns success on valid API key', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const result = await provider.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected to Apollo API');
    });

    it('returns failure on invalid API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('401');
    });

    it('returns failure on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('ECONNREFUSED');
    });
  });
});
