import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendEmailInput, SendEmailResult, EmailContact } from '@/types';

// ─── Brevo Provider Logic (matching provider pattern) ───

class BrevoProvider {
  private apiKey: string;
  private baseUrl = 'https://api.brevo.com/v3';
  name = 'brevo';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const response = await fetch(`${this.baseUrl}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: input.from.email, name: input.from.name },
        to: [{ email: input.to.email, name: input.to.name }],
        replyTo: input.replyTo
          ? { email: input.replyTo.email, name: input.replyTo.name }
          : undefined,
        subject: input.subject,
        htmlContent: input.htmlContent,
        textContent: input.textContent,
        tags: input.tags,
        headers: input.headers,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Brevo API error: ${response.status} - ${(errorData as Record<string, string>).message || 'Unknown error'}`
      );
    }

    const data = (await response.json()) as { messageId: string };

    return {
      messageId: data.messageId,
      provider: 'brevo',
      status: 'sent',
    };
  }

  async createContact(
    contact: EmailContact
  ): Promise<{ id: string }> {
    const response = await fetch(`${this.baseUrl}/contacts`, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: contact.email,
        attributes: {
          FIRSTNAME: contact.firstName,
          LASTNAME: contact.lastName,
          ...contact.attributes,
        },
        updateEnabled: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Brevo API error: ${response.status} - ${(errorData as Record<string, string>).message || 'Unknown error'}`
      );
    }

    const data = (await response.json()) as { id: number };
    return { id: data.id.toString() };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/account`, {
        headers: { 'api-key': this.apiKey },
      });

      if (response.ok) {
        return { success: true, message: 'Connected to Brevo API' };
      }
      return {
        success: false,
        message: `Brevo API returned status ${response.status}`,
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

describe('BrevoProvider', () => {
  let provider: BrevoProvider;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    provider = new BrevoProvider('xkeysib-test-api-key');
  });

  describe('sendEmail', () => {
    const emailInput: SendEmailInput = {
      to: { email: 'recipient@example.com', name: 'Recipient' },
      from: { email: 'sender@leadflow.com', name: 'Sender' },
      replyTo: { email: 'reply@leadflow.com', name: 'Reply' },
      subject: 'Test Subject',
      htmlContent: '<p>Hello World</p>',
      textContent: 'Hello World',
      tags: ['campaign-q4'],
      headers: { 'X-Mailin-custom': 'leadflow-123' },
    };

    it('sends correct request format to Brevo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messageId: '<msg-123@brevo.com>' }),
      });

      await provider.sendEmail(emailInput);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'api-key': 'xkeysib-test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sender).toEqual({
        email: 'sender@leadflow.com',
        name: 'Sender',
      });
      expect(body.to).toEqual([
        { email: 'recipient@example.com', name: 'Recipient' },
      ]);
      expect(body.replyTo).toEqual({
        email: 'reply@leadflow.com',
        name: 'Reply',
      });
      expect(body.subject).toBe('Test Subject');
      expect(body.htmlContent).toBe('<p>Hello World</p>');
      expect(body.textContent).toBe('Hello World');
      expect(body.tags).toEqual(['campaign-q4']);
    });

    it('returns messageId and provider on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messageId: '<msg-456@brevo.com>' }),
      });

      const result = await provider.sendEmail(emailInput);
      expect(result.messageId).toBe('<msg-456@brevo.com>');
      expect(result.provider).toBe('brevo');
      expect(result.status).toBe('sent');
    });

    it('sends without replyTo when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messageId: '<msg-789@brevo.com>' }),
      });

      const inputWithoutReply: SendEmailInput = {
        to: { email: 'to@example.com' },
        from: { email: 'from@example.com' },
        subject: 'No Reply',
        htmlContent: '<p>Test</p>',
      };

      await provider.sendEmail(inputWithoutReply);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.replyTo).toBeUndefined();
    });

    it('throws on API error with message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid sender email' }),
      });

      await expect(provider.sendEmail(emailInput)).rejects.toThrow(
        'Brevo API error: 400 - Invalid sender email'
      );
    });

    it('throws on API error without message body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('parse error');
        },
      });

      await expect(provider.sendEmail(emailInput)).rejects.toThrow(
        'Brevo API error: 500'
      );
    });

    it('throws on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(provider.sendEmail(emailInput)).rejects.toThrow(
        'Network timeout'
      );
    });
  });

  describe('createContact', () => {
    it('sends correct request format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12345 }),
      });

      const contact: EmailContact = {
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        attributes: { COMPANY: 'Acme Corp' },
      };

      await provider.createContact(contact);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.email).toBe('john@example.com');
      expect(body.attributes.FIRSTNAME).toBe('John');
      expect(body.attributes.LASTNAME).toBe('Doe');
      expect(body.attributes.COMPANY).toBe('Acme Corp');
      expect(body.updateEnabled).toBe(true);
    });

    it('returns string id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 67890 }),
      });

      const result = await provider.createContact({
        email: 'test@example.com',
      });
      expect(result.id).toBe('67890');
    });

    it('throws on duplicate contact error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Contact already exists' }),
      });

      await expect(
        provider.createContact({ email: 'dup@example.com' })
      ).rejects.toThrow('Contact already exists');
    });
  });

  describe('testConnection', () => {
    it('returns success when API responds OK', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await provider.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected to Brevo API');
    });

    it('returns failure on auth error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('401');
    });

    it('returns failure on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('DNS resolution failed');
    });
  });
});
