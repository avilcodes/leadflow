import type { EmailProvider, SendEmailInput, SendEmailResult, EmailContact } from '@/types';
import logger from '@/lib/logger';

export class BrevoProvider implements EmailProvider {
  name = 'brevo';
  private apiKey: string;
  private baseUrl = 'https://api.brevo.com/v3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const body: Record<string, unknown> = {
        sender: {
          email: input.from.email,
          name: input.from.name || input.from.email,
        },
        to: [
          {
            email: input.to.email,
            name: input.to.name || input.to.email,
          },
        ],
        subject: input.subject,
        htmlContent: input.htmlContent,
      };

      if (input.textContent) {
        body.textContent = input.textContent;
      }

      if (input.replyTo) {
        body.replyTo = {
          email: input.replyTo.email,
          name: input.replyTo.name || input.replyTo.email,
        };
      }

      if (input.tags && input.tags.length > 0) {
        body.tags = input.tags;
      }

      if (input.headers) {
        body.headers = input.headers;
      }

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        const errorMessage = errorData.message || `HTTP ${response.status}`;
        logger.error('Brevo sendEmail error', {
          status: response.status,
          error: errorMessage,
          to: input.to.email,
        });
        return {
          messageId: '',
          provider: 'brevo',
          status: 'failed',
          error: `Brevo error: ${errorMessage}`,
        };
      }

      const data = await response.json();

      logger.info('Brevo email sent', {
        messageId: data.messageId,
        to: input.to.email,
      });

      return {
        messageId: data.messageId || '',
        provider: 'brevo',
        status: 'sent',
      };
    } catch (error) {
      logger.error('Brevo sendEmail failed', { error, to: input.to.email });
      return {
        messageId: '',
        provider: 'brevo',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createContact(contact: EmailContact): Promise<{ id: string }> {
    try {
      const body: Record<string, unknown> = {
        email: contact.email,
        attributes: {
          ...(contact.attributes || {}),
        },
        updateEnabled: true,
      };

      if (contact.firstName) {
        (body.attributes as Record<string, unknown>).FIRSTNAME = contact.firstName;
      }
      if (contact.lastName) {
        (body.attributes as Record<string, unknown>).LASTNAME = contact.lastName;
      }

      const response = await fetch(`${this.baseUrl}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`Brevo create contact error: ${errorData.message || response.status}`);
      }

      const data = await response.json();
      return { id: String(data.id) };
    } catch (error) {
      logger.error('Brevo createContact failed', { error, email: contact.email });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/account`, {
        headers: {
          'api-key': this.apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const companyName = data.companyName || 'Unknown';
        return { success: true, message: `Connected to Brevo (${companyName})` };
      }

      if (response.status === 401) {
        return { success: false, message: 'Brevo authentication failed: invalid API key' };
      }

      return { success: false, message: `Brevo connection failed: ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Brevo connection failed: ${message}` };
    }
  }
}
