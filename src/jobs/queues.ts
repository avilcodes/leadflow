import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import logger from '@/lib/logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('error', (err) => {
  logger.error('Redis connection error (queues)', { error: err.message });
});

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: {
    count: 100,
    age: 24 * 60 * 60, // 24 hours
  },
  removeOnFail: {
    count: 500,
    age: 7 * 24 * 60 * 60, // 7 days
  },
};

export const leadImportQueue = new Queue('lead-import', {
  connection: redisConnection,
  defaultJobOptions,
});

export const enrichmentQueue = new Queue('enrichment', {
  connection: redisConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5,
    backoff: {
      type: 'exponential' as const,
      delay: 5000,
    },
  },
});

export const aiAnalysisQueue = new Queue('ai-analysis', {
  connection: redisConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 3000,
    },
  },
});

export const emailGenerationQueue = new Queue('email-generation', {
  connection: redisConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
  },
});

export const campaignSendQueue = new Queue('campaign-send', {
  connection: redisConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000,
    },
  },
});

export const webhookProcessQueue = new Queue('webhook-process', {
  connection: redisConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5,
  },
});

export const allQueues = {
  'lead-import': leadImportQueue,
  'enrichment': enrichmentQueue,
  'ai-analysis': aiAnalysisQueue,
  'email-generation': emailGenerationQueue,
  'campaign-send': campaignSendQueue,
  'webhook-process': webhookProcessQueue,
};

export async function closeAllQueues(): Promise<void> {
  for (const [name, queue] of Object.entries(allQueues)) {
    try {
      await queue.close();
      logger.info('Queue closed', { name });
    } catch (error) {
      logger.error('Failed to close queue', { name, error });
    }
  }
  redisConnection.disconnect();
}
