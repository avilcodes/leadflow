import type { AIProvider } from '@/types';
import { OpenRouterProvider } from './openrouter';

export { OpenRouterProvider } from './openrouter';

export type AIProviderName = 'openrouter';

export function createAIProvider(
  provider: AIProviderName,
  apiKey: string,
  config?: Record<string, unknown>
): AIProvider {
  switch (provider) {
    case 'openrouter':
      return new OpenRouterProvider(apiKey, config as {
        defaultModel?: string;
        analysisModel?: string;
        emailModel?: string;
        siteUrl?: string;
        siteName?: string;
      });
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

export function getAIProvider(): AIProvider {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');
  return new OpenRouterProvider(apiKey, {
    defaultModel: process.env.OPENROUTER_DEFAULT_MODEL,
  });
}
