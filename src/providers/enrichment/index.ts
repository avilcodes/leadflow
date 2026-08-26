import type { EnrichmentProvider } from '@/types';
import { ApifyProvider } from './apify';

export { ApifyProvider } from './apify';

export type EnrichmentProviderName = 'apify';

export function createEnrichmentProvider(
  provider: EnrichmentProviderName,
  apiKey: string,
  config?: Record<string, unknown>
): EnrichmentProvider {
  switch (provider) {
    case 'apify':
      return new ApifyProvider(apiKey, config as {
        defaultActorId?: string;
        actorIds?: {
          linkedin_scrape?: string;
          website_scrape?: string;
          company_info?: string;
        };
      });
    default:
      throw new Error(`Unknown enrichment provider: ${provider}`);
  }
}

export function getEnrichmentProvider(): EnrichmentProvider {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error('APIFY_API_KEY not configured');
  return new ApifyProvider(apiKey, {
    actorIds: {
      linkedin_scrape: process.env.APIFY_LINKEDIN_ACTOR_ID,
      website_scrape: process.env.APIFY_WEBSITE_ACTOR_ID,
    },
  });
}
