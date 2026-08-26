import type { EnrichmentProvider, EnrichmentInput, EnrichmentResult, EnrichmentJobStatus } from '@/types';
import logger from '@/lib/logger';

interface ApifyConfig {
  defaultActorId?: string;
  actorIds?: {
    linkedin_scrape?: string;
    website_scrape?: string;
    company_info?: string;
  };
}

export class ApifyProvider implements EnrichmentProvider {
  name = 'apify';
  private apiToken: string;
  private baseUrl = 'https://api.apify.com/v2';
  private config: ApifyConfig;

  constructor(apiToken: string, config?: ApifyConfig) {
    this.apiToken = apiToken;
    this.config = config || {};
  }

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult> {
    const actorId = this.getActorId(input.type);
    if (!actorId) {
      return {
        status: 'failed',
        error: `No Apify actor configured for enrichment type: ${input.type}`,
      };
    }

    try {
      const actorInput = this.buildActorInput(input);

      const response = await fetch(
        `${this.baseUrl}/acts/${actorId}/runs?token=${this.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(actorInput),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Apify start run error', { status: response.status, error: errorText });
        return {
          status: 'failed',
          error: `Apify API error: ${response.status} ${errorText}`,
        };
      }

      const data = await response.json();
      const runId = data.data?.id;

      if (!runId) {
        return {
          status: 'failed',
          error: 'Apify did not return a run ID',
        };
      }

      logger.info('Apify run started', { actorId, runId, type: input.type });

      return {
        jobId: runId,
        status: 'running',
        rawOutput: { runId, actorId, defaultDatasetId: data.data?.defaultDatasetId },
      };
    } catch (error) {
      logger.error('Apify enrich failed', { error, input });
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getJobStatus(jobId: string): Promise<EnrichmentJobStatus> {
    try {
      const response = await fetch(
        `${this.baseUrl}/actor-runs/${jobId}?token=${this.apiToken}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { status: 'failed', error: 'Run not found' };
        }
        throw new Error(`Apify API error: ${response.status}`);
      }

      const data = await response.json();
      const runData = data.data;

      const statusMap: Record<string, EnrichmentJobStatus['status']> = {
        READY: 'pending',
        RUNNING: 'running',
        SUCCEEDED: 'completed',
        FAILED: 'failed',
        ABORTING: 'failed',
        ABORTED: 'failed',
        TIMED_OUT: 'failed',
      };

      const status = statusMap[runData.status] || 'running';

      if (status === 'completed') {
        const output = await this.getRunResults(runData.defaultDatasetId);
        return {
          status: 'completed',
          output: { items: output, runStatus: runData.status },
        };
      }

      if (status === 'failed') {
        return {
          status: 'failed',
          error: `Apify run ${runData.status}: ${runData.statusMessage || 'Unknown error'}`,
        };
      }

      return { status };
    } catch (error) {
      logger.error('Apify getJobStatus failed', { error, jobId });
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/users/me?token=${this.apiToken}`
      );

      if (response.ok) {
        const data = await response.json();
        const username = data.data?.username || 'unknown';
        return { success: true, message: `Connected to Apify as ${username}` };
      }

      if (response.status === 401) {
        return { success: false, message: 'Apify authentication failed: invalid token' };
      }

      return { success: false, message: `Apify connection failed: ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Apify connection failed: ${message}` };
    }
  }

  private async getRunResults(datasetId: string): Promise<unknown[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiToken}&format=json`
      );

      if (!response.ok) {
        logger.error('Apify getRunResults error', { status: response.status, datasetId });
        return [];
      }

      const items = await response.json();
      return Array.isArray(items) ? items : [];
    } catch (error) {
      logger.error('Apify getRunResults failed', { error, datasetId });
      return [];
    }
  }

  private getActorId(type: EnrichmentInput['type']): string | null {
    // Check type-specific actor IDs first
    if (this.config.actorIds) {
      const actorId = this.config.actorIds[type as keyof typeof this.config.actorIds];
      if (actorId) return actorId;
    }

    // Fall back to default actor ID
    if (this.config.defaultActorId) {
      return this.config.defaultActorId;
    }

    // Built-in defaults for common actors
    const defaultActors: Record<string, string> = {
      linkedin_scrape: 'anchor/linkedin-profile-scraper',
      website_scrape: 'apify/website-content-crawler',
      company_info: 'anchor/linkedin-company-scraper',
    };

    return defaultActors[type] || null;
  }

  private buildActorInput(input: EnrichmentInput): Record<string, unknown> {
    const baseInput: Record<string, unknown> = {
      ...input.additionalInput,
    };

    if (input.url) {
      // For LinkedIn scraping
      if (input.type === 'linkedin_scrape' || input.type === 'company_info') {
        baseInput.startUrls = [{ url: input.url }];
      }
      // For website scraping
      if (input.type === 'website_scrape') {
        baseInput.startUrls = [{ url: input.url }];
        baseInput.maxCrawlPages = baseInput.maxCrawlPages || 5;
      }
    }

    return baseInput;
  }
}
