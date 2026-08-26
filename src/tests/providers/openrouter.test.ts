import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AIAnalysisInput,
  AIAnalysisResult,
  EmailGenerationInput,
  EmailGenerationResult,
} from '@/types';

// ─── OpenRouter Provider Logic (matching provider pattern) ───

interface OpenRouterChatResponse {
  id: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

class OpenRouterProvider {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private model: string;
  private maxRetries: number;
  name = 'openrouter';

  constructor(apiKey: string, model = 'anthropic/claude-3.5-sonnet', maxRetries = 3) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxRetries = maxRetries;
  }

  private async chatCompletion(
    systemPrompt: string,
    userPrompt: string,
    retryCount = 0
  ): Promise<OpenRouterChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://leadflow.app',
          'X-Title': 'LeadFlow',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 && retryCount < this.maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.chatCompletion(systemPrompt, userPrompt, retryCount + 1);
        }
        throw new Error(
          `OpenRouter API error: ${response.status} - ${errorText}`
        );
      }

      return (await response.json()) as OpenRouterChatResponse;
    } catch (error) {
      if (
        retryCount < this.maxRetries &&
        (error as Error).message.includes('fetch')
      ) {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.chatCompletion(systemPrompt, userPrompt, retryCount + 1);
      }
      throw error;
    }
  }

  async analyze(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    const systemPrompt = `You are a B2B sales intelligence analyst. Analyze the lead and return a JSON object with these fields: personSummary, companySummary, currentContext, signals (array), painPoints (array), priorities (array), personalizations (array), outreachAngle, relevanceReasons (array), confidenceScore (0-1).`;

    const userPrompt = `Analyze this lead:\n${JSON.stringify(input.leadData, null, 2)}`;

    const response = await this.chatCompletion(systemPrompt, userPrompt);
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      personSummary: parsed.personSummary || '',
      companySummary: parsed.companySummary || '',
      currentContext: parsed.currentContext || '',
      signals: parsed.signals || [],
      painPoints: parsed.painPoints || [],
      priorities: parsed.priorities || [],
      personalizations: parsed.personalizations || [],
      outreachAngle: parsed.outreachAngle || '',
      relevanceReasons: parsed.relevanceReasons || [],
      confidenceScore: parsed.confidenceScore || 0,
      rawResponse: response as unknown as Record<string, unknown>,
      tokensUsed: response.usage.total_tokens,
      model: response.model,
    };
  }

  async generateEmail(
    input: EmailGenerationInput
  ): Promise<EmailGenerationResult> {
    const systemPrompt = `You are an expert B2B email copywriter. Generate a personalized outreach email. Return JSON with: subject, htmlBody, textBody.`;

    const userPrompt = `Generate email for:\nLead: ${JSON.stringify(input.leadData)}\nAnalysis: ${JSON.stringify(input.analysis)}\nCampaign: ${JSON.stringify(input.campaignConfig)}`;

    const response = await this.chatCompletion(systemPrompt, userPrompt);
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      subject: parsed.subject,
      htmlBody: parsed.htmlBody,
      textBody: parsed.textBody,
      rawResponse: response as unknown as Record<string, unknown>,
      tokensUsed: response.usage.total_tokens,
      model: response.model,
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (response.ok) {
        return { success: true, message: 'Connected to OpenRouter API' };
      }
      return {
        success: false,
        message: `OpenRouter API returned status ${response.status}`,
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

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    vi.useFakeTimers();
    provider = new OpenRouterProvider('sk-or-test-key', 'anthropic/claude-3.5-sonnet', 2);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockChatResponse = (content: Record<string, unknown>): OpenRouterChatResponse => ({
    id: 'gen-123',
    choices: [
      {
        message: {
          content: JSON.stringify(content),
          role: 'assistant',
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    model: 'anthropic/claude-3.5-sonnet',
  });

  describe('analyze', () => {
    const analysisInput: AIAnalysisInput = {
      leadData: {
        firstName: 'Sarah',
        lastName: 'Johnson',
        fullName: 'Sarah Johnson',
        jobTitle: 'VP of Engineering',
        email: 'sarah@techcorp.com',
        companyName: 'TechCorp',
        industry: 'Software',
      },
    };

    const analysisContent = {
      personSummary: 'Senior engineering leader at a growing SaaS company',
      companySummary: 'Mid-size SaaS company in the developer tools space',
      currentContext: 'Likely scaling engineering team and processes',
      signals: ['Recent hiring push', 'Series B funding'],
      painPoints: ['Developer productivity', 'Team scaling'],
      priorities: ['Improve CI/CD', 'Reduce technical debt'],
      personalizations: ['Mention VP role challenges', 'Reference industry trends'],
      outreachAngle: 'Developer productivity platform for scaling teams',
      relevanceReasons: ['Right seniority level', 'Growing company'],
      confidenceScore: 0.85,
    };

    it('returns structured analysis output', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChatResponse(analysisContent),
      });

      const result = await provider.analyze(analysisInput);

      expect(result.personSummary).toBe(analysisContent.personSummary);
      expect(result.companySummary).toBe(analysisContent.companySummary);
      expect(result.currentContext).toBe(analysisContent.currentContext);
      expect(result.signals).toEqual(analysisContent.signals);
      expect(result.painPoints).toEqual(analysisContent.painPoints);
      expect(result.priorities).toEqual(analysisContent.priorities);
      expect(result.personalizations).toEqual(analysisContent.personalizations);
      expect(result.outreachAngle).toBe(analysisContent.outreachAngle);
      expect(result.relevanceReasons).toEqual(analysisContent.relevanceReasons);
      expect(result.confidenceScore).toBe(0.85);
    });

    it('includes tokens used and model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChatResponse(analysisContent),
      });

      const result = await provider.analyze(analysisInput);
      expect(result.tokensUsed).toBe(300);
      expect(result.model).toBe('anthropic/claude-3.5-sonnet');
    });

    it('includes raw response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChatResponse(analysisContent),
      });

      const result = await provider.analyze(analysisInput);
      expect(result.rawResponse).toBeDefined();
      expect((result.rawResponse as Record<string, unknown>).id).toBe('gen-123');
    });

    it('sends correct headers including referer and title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChatResponse(analysisContent),
      });

      await provider.analyze(analysisInput);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-or-test-key',
            'HTTP-Referer': 'https://leadflow.app',
            'X-Title': 'LeadFlow',
          }),
        })
      );
    });

    it('handles missing fields in response gracefully', async () => {
      const partialContent = {
        personSummary: 'Partial analysis',
        // Missing other fields
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChatResponse(partialContent),
      });

      const result = await provider.analyze(analysisInput);
      expect(result.personSummary).toBe('Partial analysis');
      expect(result.signals).toEqual([]);
      expect(result.painPoints).toEqual([]);
      expect(result.confidenceScore).toBe(0);
    });

    it('throws on non-JSON response content', async () => {
      const badResponse: OpenRouterChatResponse = {
        id: 'gen-bad',
        choices: [{ message: { content: 'Not valid JSON', role: 'assistant' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        model: 'test',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => badResponse,
      });

      await expect(provider.analyze(analysisInput)).rejects.toThrow();
    });
  });

  describe('generateEmail', () => {
    const emailInput: EmailGenerationInput = {
      leadData: {
        firstName: 'Sarah',
        fullName: 'Sarah Johnson',
        email: 'sarah@techcorp.com',
        companyName: 'TechCorp',
        jobTitle: 'VP of Engineering',
      },
      analysis: {
        personSummary: 'Senior engineering leader',
        companySummary: 'Growing SaaS company',
        currentContext: 'Scaling team',
        signals: ['Hiring'],
        painPoints: ['Productivity'],
        priorities: ['CI/CD'],
        personalizations: ['VP role'],
        outreachAngle: 'Developer productivity',
        relevanceReasons: ['Right level'],
        confidenceScore: 0.85,
        rawResponse: {},
        model: 'test',
      },
      campaignConfig: {
        objective: 'Book demo call',
        tone: 'professional',
        emailLength: 'short',
        cta: 'Schedule a 15-minute call',
        senderName: 'Alex',
      },
    };

    const emailContent = {
      subject: 'Quick question about TechCorp engineering',
      htmlBody: '<p>Hi Sarah,</p><p>I noticed TechCorp is scaling...</p>',
      textBody: 'Hi Sarah, I noticed TechCorp is scaling...',
    };

    it('returns subject, htmlBody, and textBody', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChatResponse(emailContent),
      });

      const result = await provider.generateEmail(emailInput);
      expect(result.subject).toBe(emailContent.subject);
      expect(result.htmlBody).toBe(emailContent.htmlBody);
      expect(result.textBody).toBe(emailContent.textBody);
    });

    it('includes tokens used and model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChatResponse(emailContent),
      });

      const result = await provider.generateEmail(emailInput);
      expect(result.tokensUsed).toBe(300);
      expect(result.model).toBe('anthropic/claude-3.5-sonnet');
    });

    it('includes raw response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChatResponse(emailContent),
      });

      const result = await provider.generateEmail(emailInput);
      expect(result.rawResponse).toBeDefined();
    });
  });

  describe('error handling and retries', () => {
    it('retries on 429 rate limit error', async () => {
      const analysisContent = {
        personSummary: 'Test',
        signals: [],
        painPoints: [],
        priorities: [],
        personalizations: [],
        relevanceReasons: [],
        confidenceScore: 0.5,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockChatResponse(analysisContent),
        });

      const promise = provider.analyze({
        leadData: { firstName: 'Test' },
      });

      // Advance past the retry delay
      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result.personSummary).toBe('Test');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries on persistent 429', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      const promise = provider.analyze({
        leadData: { firstName: 'Test' },
      });

      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      await expect(promise).rejects.toThrow('OpenRouter API error: 429');
    });

    it('throws immediately on non-retryable errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      });

      await expect(
        provider.analyze({ leadData: { firstName: 'Test' } })
      ).rejects.toThrow('OpenRouter API error: 401 - Invalid API key');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('testConnection', () => {
    it('returns success on valid API key', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await provider.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected to OpenRouter API');
    });

    it('calls /models endpoint for connection test', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provider.testConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk-or-test-key' },
        })
      );
    });

    it('returns failure on auth error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
    });

    it('returns failure on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');
    });
  });
});
