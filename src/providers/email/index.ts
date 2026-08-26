import type { EmailProvider } from '@/types';
import { BrevoProvider } from './brevo';

export { BrevoProvider } from './brevo';

export type EmailProviderName = 'brevo';

export function createEmailProvider(
  provider: EmailProviderName,
  apiKey: string
): EmailProvider {
  switch (provider) {
    case 'brevo':
      return new BrevoProvider(apiKey);
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}

export function getEmailProvider(): EmailProvider {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY not configured');
  return new BrevoProvider(apiKey);
}
