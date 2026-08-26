import type { LeadSourceProvider } from '@/types';
import { ApolloProvider } from './apollo';
import { ProspeoProvider } from './prospeo';
import { DeepEnrichProvider } from './deepenrich';

export { ApolloProvider } from './apollo';
export { ProspeoProvider } from './prospeo';
export { DeepEnrichProvider } from './deepenrich';
export { parseCsvToLeads, detectCsvColumns, suggestMappings } from './csv';
export type { CsvFieldMapping, CsvImportOptions } from './csv';

export type LeadSourceProviderName = 'apollo' | 'prospeo' | 'deepenrich';

export function createLeadSourceProvider(
  provider: LeadSourceProviderName,
  apiKey: string
): LeadSourceProvider {
  switch (provider) {
    case 'apollo':
      return new ApolloProvider(apiKey);
    case 'prospeo':
      return new ProspeoProvider(apiKey);
    case 'deepenrich':
      return new DeepEnrichProvider(apiKey);
    default:
      throw new Error(`Unknown lead source provider: ${provider}`);
  }
}

export function getLeadSourceProvider(name: string): LeadSourceProvider {
  const envMap: Record<string, string | undefined> = {
    apollo: process.env.APOLLO_API_KEY,
    prospeo: process.env.PROSPEO_API_KEY,
    deepenrich: process.env.DEEPENRICH_API_KEY,
  };
  const apiKey = envMap[name];
  if (!apiKey) throw new Error(`${name} API key not configured`);
  return createLeadSourceProvider(name as LeadSourceProviderName, apiKey);
}
